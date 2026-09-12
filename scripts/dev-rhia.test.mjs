// O dev server precisa entregar o diagnóstico inteiro numa máquina limpa:
// estático + edge + banco efêmero. Aqui ele sobe numa porta livre e o fluxo
// completo é percorrido por HTTP real, incluindo o portão de lead.
import test from "node:test";
import assert from "node:assert/strict";
import { criarServidor, injetarConfig } from "./dev-rhia.mjs";

const EVENTO = "boomit-degustacao-rh-ia";

async function comServidor(fn) {
  const s = await criarServidor({ porta: 0 });
  try { return await fn(`http://localhost:${s.porta}`); } finally { await s.fechar(); }
}
const json = async (base, rota, { metodo = "GET", corpo, token } = {}) => {
  const h = { origin: base };
  if (corpo) h["content-type"] = "application/json";
  if (token) h["x-session-token"] = token;
  const r = await fetch(base + "/functions/v1/screener" + rota, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

test("injetarConfig põe a configuração de dev antes de </head>, sem tocar o resto", () => {
  const out = injetarConfig("<html><head><title>x</title></head><body>b</body></html>", "http://localhost:1/f");
  assert.match(out, /SCREENER_RHIA_CONFIG/);
  assert.ok(out.indexOf("SCREENER_RHIA_CONFIG") < out.indexOf("</head>"), "config deve vir antes de </head>");
  assert.match(out, /<body>b<\/body>/);
});

test("serve a página e injeta a configuração de desenvolvimento", async () => {
  await comServidor(async (base) => {
    const r = await fetch(base + "/rhia.html");
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /Diagn/);
    assert.match(html, /localhost:\d+\/functions\/v1\/screener/, "EDGE_URL de dev não foi injetada");
    // o módulo e o estilo são servidos
    for (const a of ["/rhia.mjs", "/rhia.css", "/tokens.css"]) {
      assert.equal((await fetch(base + a)).status, 200, `faltou ${a}`);
    }
  });
});

test("a carga do repositório deixa o evento público no ar com as 30 questões", async () => {
  await comServidor(async (base) => {
    const r = await json(base, `/rhia/start?event_slug=${EVENTO}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 30);
    assert.equal(r.body.status, "public_pilot");
    assert.equal(r.body.lead_capture_mode, "required_before_result");
    const bruto = JSON.stringify(r.body);
    for (const proibido of ["3333", "6667", "10000", "score_bp", "weights"]) {
      assert.ok(!bruto.includes(proibido), `apresentação vaza ${proibido}`);
    }
  });
});

test("fluxo completo por HTTP: 30 respostas → portão de lead → resultado", async () => {
  await comServidor(async (base) => {
    const ini = await json(base, "/rhia/start", { metodo: "POST", corpo: { event_slug: EVENTO, privacy_ack: true, privacy_notice_version: "v1" } });
    assert.equal(ini.status, 201);
    const token = ini.body.token;
    assert.match(token, /^[0-9a-f]{64}$/);

    // Responde os 30 itens: contexto com CTX01=OTHER (exige o texto livre).
    const porId = Object.fromEntries(ini.body.items.map((i) => [i.id, i]));
    const contexto = { CTX01: "OTHER", CTX02: "AREA", CTX03: "DECIDE_SCOPE" };
    for (const [id, value] of Object.entries(contexto)) {
      assert.equal((await json(base, "/rhia/response", { metodo: "PUT", corpo: { item_id: id, value }, token })).status, 200, id);
    }
    const cf = porId.CTX01.conditional_field;
    assert.equal((await json(base, "/rhia/response", { metodo: "PUT", corpo: { item_id: cf.id, value: "Consultor de RH" }, token })).status, 200);
    for (const it of ini.body.items.filter((i) => i.kind !== "context")) {
      assert.equal((await json(base, "/rhia/response", { metodo: "PUT", corpo: { item_id: it.id, value: "E3" }, token })).status, 200, it.id);
    }

    // Portão: o submit não devolve o resultado e /result recusa até haver lead.
    const sub = await json(base, "/rhia/submit", { metodo: "POST", corpo: {}, token });
    assert.equal(sub.status, 200);
    assert.equal(sub.body.lead_required, true);
    assert.equal("positioning" in sub.body, false, "o portão vazou o resultado no submit");

    const antes = await json(base, "/rhia/result", { token });
    assert.equal(antes.status, 403);
    assert.equal(antes.body.error, "lead_required");

    assert.equal((await json(base, "/rhia/lead", { metodo: "POST", corpo: { nome: "Ana", email: "ana@empresa.com", marketing_opt_in: true }, token })).status, 200);

    const depois = await json(base, "/rhia/result", { token });
    assert.equal(depois.status, 200);
    assert.equal(depois.body.version, "2.0.0-pilot");
    assert.equal(depois.body.status, "ORIENTATIVE_HYPOTHESIS");
    assert.ok(depois.body.positioning.stage, "faltou o degrau");
    assert.ok(depois.body.emitido_em, "faltou emitido_em");
    const bruto = JSON.stringify(depois.body);
    for (const proibido of ["bp", "3333", "6667", "10000", "internal", "weakestBp"]) {
      assert.ok(!bruto.includes(proibido), `o resultado público vaza ${proibido}`);
    }
  });
});

test("resposta inválida é recusada pelo servidor (400), não pelo navegador", async () => {
  await comServidor(async (base) => {
    const ini = await json(base, "/rhia/start", { metodo: "POST", corpo: { event_slug: EVENTO, privacy_ack: true, privacy_notice_version: "v1" } });
    const token = ini.body.token;
    const r = await json(base, "/rhia/response", { metodo: "PUT", corpo: { item_id: "EST01", value: "E9" }, token });
    assert.equal(r.status, 400);
    const t = await json(base, "/rhia/response", { metodo: "PUT", corpo: { item_id: "CTX01_OTHER_TEXT", value: "x" }, token });
    assert.equal(t.status, 400, "texto de 1 caractere deveria ser recusado");
  });
});
