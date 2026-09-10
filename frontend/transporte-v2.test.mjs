// Transporte de produção do V2 (frontend → edge). fetch mockado; sem rede.
import test from "node:test";
import assert from "node:assert/strict";
import { criarTransporteV2, ErroTransporteV2 } from "./transporte-v2.mjs";

function fetchFalso(rotas) {
  const chamadas = [];
  const f = async (url, opts = {}) => {
    chamadas.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : undefined });
    const rota = new URL(url).pathname.replace(/.*\/screener/, "");
    const r = rotas[rota];
    const resposta = typeof r === "function" ? r(chamadas.at(-1)) : r;
    return { ok: resposta.ok !== false, status: resposta.status || 200, json: async () => resposta.body || {} };
  };
  return { f, chamadas };
}
const BASE = "https://x.supabase.co/functions/v1/screener";
const RESP = { Q1: 2, Q2: 1, Q3: "na", Q4: 3, Q5: 3, Q6: 3, Q7: 4, Q8: 3 };
const PUBLICO = { contract_version: "PublicResultIAV2", nivel: { n: 3, name: "Estrategista de Escala" } };

const rotasOk = {
  "/v2/start": { body: { token: "tok-abc", session_id: "s1" } },
  "/v2/response": { body: { ok: true } },
  "/v2/submit": { body: PUBLICO },
};

test("fluxo: start → senioridade + 8 respostas → submit; devolve o público", async () => {
  const { f, chamadas } = fetchFalso(rotasOk);
  const transporte = criarTransporteV2({ baseUrl: BASE, eventSlug: "ev-ia-v2", fetchImpl: f });
  const out = await transporte(RESP, "diretoria");
  assert.deepEqual(out.resultado, PUBLICO);
  assert.equal(typeof out.capturarLead, "function");

  const rotas = chamadas.map((c) => c.method + " " + new URL(c.url).pathname.replace(/.*\/screener/, ""));
  assert.equal(rotas[0], "POST /v2/start");
  assert.equal(rotas[1], "PUT /v2/response");   // senioridade primeiro
  assert.equal(chamadas[1].body.item_code, "SENIORIDADE");
  assert.equal(chamadas[1].body.answer_code, "diretoria");
  assert.equal(rotas.filter((r) => r === "PUT /v2/response").length, 9); // senioridade + 8
  assert.equal(rotas.at(-1), "POST /v2/submit");
});

test("conversão de código: número → N#, 'na' → NA", async () => {
  const { f, chamadas } = fetchFalso(rotasOk);
  await criarTransporteV2({ baseUrl: BASE, eventSlug: "ev", fetchImpl: f })(RESP, "analista");
  const porItem = Object.fromEntries(chamadas.filter((c) => c.body && c.body.item_code && c.body.item_code !== "SENIORIDADE").map((c) => [c.body.item_code, c.body.answer_code]));
  assert.equal(porItem.Q1, "N2");
  assert.equal(porItem.Q3, "NA");
  assert.equal(porItem.Q7, "N4");
});

test("segurança: credencial em x-preview-key e token em x-session-token; nunca na URL", async () => {
  const { f, chamadas } = fetchFalso(rotasOk);
  await criarTransporteV2({ baseUrl: BASE, eventSlug: "ev", previewKey: "chave-secreta", fetchImpl: f })(RESP, "gerencia");
  for (const c of chamadas) {
    assert.equal(c.headers["x-preview-key"], "chave-secreta");          // credencial sempre no header
    assert.equal(c.url.includes("chave-secreta"), false);               // nunca na URL
    assert.equal(c.url.includes("tok-abc"), false);                     // token nunca na URL
    assert.equal(c.url.includes("?"), false);                           // sem query string
  }
  // token só aparece a partir da 2ª chamada (após o start), no header
  assert.equal(chamadas[0].headers["x-session-token"], undefined);
  assert.equal(chamadas[1].headers["x-session-token"], "tok-abc");
});

test("sem previewKey: nenhum header de credencial", async () => {
  const { f, chamadas } = fetchFalso(rotasOk);
  await criarTransporteV2({ baseUrl: BASE, eventSlug: "ev", fetchImpl: f })(RESP, "analista");
  assert.equal("x-preview-key" in chamadas[0].headers, false);
});

test("erro do servidor no submit → ErroTransporteV2 com status", async () => {
  const { f } = fetchFalso({ ...rotasOk, "/v2/submit": { ok: false, status: 409, body: { error: "respostas_instaveis" } } });
  const transporte = criarTransporteV2({ baseUrl: BASE, eventSlug: "ev", fetchImpl: f });
  await assert.rejects(transporte(RESP, "diretoria"), (e) => {
    assert.ok(e instanceof ErroTransporteV2);
    assert.equal(e.status, 409);
    assert.equal(e.corpo.error, "respostas_instaveis");
    return true;
  });
});

test("start sem token → erro", async () => {
  const { f } = fetchFalso({ ...rotasOk, "/v2/start": { body: { session_id: "s1" } } });
  await assert.rejects(criarTransporteV2({ baseUrl: BASE, eventSlug: "ev", fetchImpl: f })(RESP, "analista"), /sem_token/);
});

test("portão: submit sem resultado → resultado null; obterResultado busca /v2/result após o lead", async () => {
  const rotas = {
    ...rotasOk,
    "/v2/submit": { body: { submitted: true, lead_required: true } }, // portão retém
    "/v2/lead": { body: { ok: true } },
    "/v2/result": { body: PUBLICO },
  };
  const { f, chamadas } = fetchFalso(rotas);
  const t = await criarTransporteV2({ baseUrl: BASE, eventSlug: "ev", fetchImpl: f })(RESP, "diretoria");
  assert.equal(t.resultado, null); // não vem no submit
  await t.capturarLead({ email: "ana@x.co" });
  const r = await t.obterResultado();
  assert.deepEqual(r, PUBLICO);
  const rotasChamadas = chamadas.map((c) => c.method + " " + new URL(c.url).pathname.replace(/.*\/screener/, ""));
  assert.deepEqual(rotasChamadas.slice(-2), ["POST /v2/lead", "GET /v2/result"]);
  assert.equal(chamadas.at(-1).headers["x-session-token"], "tok-abc"); // token no header também no /result
});

test("capturarLead: POST /v2/lead com o token da sessão no header (nunca na URL)", async () => {
  const { f, chamadas } = fetchFalso({ ...rotasOk, "/v2/lead": { body: { ok: true } } });
  const { capturarLead } = await criarTransporteV2({ baseUrl: BASE, eventSlug: "ev", fetchImpl: f })(RESP, "diretoria");
  const r = await capturarLead({ nome: "Ana", email: "ana@x.co", marketing_opt_in: true });
  assert.deepEqual(r, { ok: true });
  const lead = chamadas.at(-1);
  assert.equal(new URL(lead.url).pathname.replace(/.*\/screener/, ""), "/v2/lead");
  assert.equal(lead.method, "POST");
  assert.equal(lead.headers["x-session-token"], "tok-abc"); // token no header
  assert.equal(lead.url.includes("tok-abc"), false);          // nunca na URL
  assert.deepEqual(lead.body, { nome: "Ana", email: "ana@x.co", marketing_opt_in: true });
});

test("baseUrl com barra final é normalizada", async () => {
  const { f, chamadas } = fetchFalso(rotasOk);
  await criarTransporteV2({ baseUrl: BASE + "/", eventSlug: "ev", fetchImpl: f })(RESP, "analista");
  assert.equal(chamadas[0].url, BASE + "/v2/start");
});
