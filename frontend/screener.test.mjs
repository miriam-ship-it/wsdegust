// Testes dos helpers puros do frontend do screener. node --test.
// Não tocam o DOM (o módulo não arranca sem `document`) nem a rede (transporte
// injetado). Foco no contrato de segurança (credencial/token só no header certo)
// e nos helpers de apresentação da devolutiva.
import test from "node:test";
import assert from "node:assert/strict";
import {
  lerEvento, montarHeaders, progresso, itensDosBlocos, itensFaltantes, primeiraNaoRespondida,
  escapeHtml, rotuloCobertura, pontoExibicao, glosaFaixa, rotuloDirecao, rotuloGovernanca,
  rotuloEscopo, matrizPonto, sinteseExecutiva, planoDeAcao, mensagemErro, chaveArmazenamento,
  guardarSessao, lerSessao, limparSessao, criarCliente, EVENTO_PADRAO,
} from "./screener.mjs";

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const blocos3 = () => [
  { name: "Pessoa", items: [{ id: "a", options: [{ id: "a1" }] }, { id: "b", options: [{ id: "b1" }] }] },
  { name: "Empresa", items: [{ id: "c", options: [{ id: "c1" }] }] },
];

test("lerEvento: usa ?evento; cai no padrão quando ausente/vazio", () => {
  assert.equal(lerEvento("?evento=preview-interno-ia-v1"), "preview-interno-ia-v1");
  assert.equal(lerEvento("?x=1&evento=abc"), "abc");
  assert.equal(lerEvento(""), EVENTO_PADRAO);
  assert.equal(lerEvento("?evento="), EVENTO_PADRAO);
});

test("montarHeaders: credencial só em x-preview-key; token só em x-session-token", () => {
  const h = montarHeaders({ anonKey: "ANON", previewKey: "SEGREDO", token: "TOK", temCorpo: true });
  assert.equal(h.apikey, "ANON");
  assert.equal(h.authorization, "Bearer ANON");
  assert.equal(h["content-type"], "application/json");
  assert.equal(h["x-preview-key"], "SEGREDO");
  assert.equal(h["x-session-token"], "TOK");
  const serial = JSON.stringify({ ...h, "x-preview-key": "", "x-session-token": "" });
  assert.ok(!serial.includes("SEGREDO"), "credencial vazou fora de x-preview-key");
  assert.ok(!serial.includes("TOK"), "token vazou fora de x-session-token");
});

test("montarHeaders: sem corpo/credencial/token omite os headers", () => {
  const h = montarHeaders({ anonKey: "ANON" });
  assert.ok(!("content-type" in h) && !("x-preview-key" in h) && !("x-session-token" in h));
});

test("progresso: clampa e calcula percentual", () => {
  assert.deepEqual(progresso(0, 30), { respondidas: 0, total: 30, restante: 30, pct: 0 });
  assert.deepEqual(progresso(15, 30), { respondidas: 15, total: 30, restante: 15, pct: 50 });
  assert.deepEqual(progresso(99, 30), { respondidas: 30, total: 30, restante: 0, pct: 100 });
});

test("itensDosBlocos / itensFaltantes / primeiraNaoRespondida", () => {
  const b = blocos3();
  assert.deepEqual(itensDosBlocos(b).map((i) => i.id), ["a", "b", "c"]);
  assert.deepEqual(itensFaltantes(b, { a: "a1" }), ["b", "c"]);
  assert.equal(primeiraNaoRespondida(b, { a: "a1" }), 1);
  assert.equal(primeiraNaoRespondida(b, { a: "a1", b: "b1", c: "c1" }), 3); // tudo respondido → total
  assert.equal(primeiraNaoRespondida(b, {}), 0);
});

test("escapeHtml: neutraliza marcação (devolutiva sanitizada)", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml("o'brien"), "o&#39;brien");
  assert.equal(escapeHtml(null), "");
});

test("rotuloCobertura / pontoExibicao", () => {
  assert.equal(rotuloCobertura("alta"), "alta");
  assert.equal(rotuloCobertura("media"), "média");
  assert.equal(rotuloCobertura("insuficiente"), "insuficiente");
  assert.equal(rotuloCobertura(undefined), "—");
  assert.equal(pontoExibicao(72.6), 73);
  assert.equal(pontoExibicao(-5), 0);
  assert.equal(pontoExibicao(140), 100);
  assert.equal(pontoExibicao(null), null);
  assert.equal(pontoExibicao("abc"), null);
});

test("glosaFaixa: genérica por rótulo do servidor; vazio se desconhecido", () => {
  assert.match(glosaFaixa("Informal ou parcial"), /informal ou parcial/);
  assert.match(glosaFaixa("Gerenciado e sustentado"), /gerenciada e sustentada/);
  assert.equal(glosaFaixa(null), "");
  assert.equal(glosaFaixa("faixa inexistente"), "");
});

test("rotuloDirecao: alinhamento nas duas direções + centro", () => {
  assert.deepEqual(rotuloDirecao("individual_ahead"), { label: "Você à frente do contexto", lado: "pessoa" });
  assert.deepEqual(rotuloDirecao("organization_ahead"), { label: "Contexto à frente de você", lado: "empresa" });
  assert.equal(rotuloDirecao("aligned").lado, "centro");
  assert.equal(rotuloDirecao("insufficient").lado, "centro");
});

test("rotuloGovernanca: gate separado", () => {
  assert.equal(rotuloGovernanca("blocked").label, "Bloqueada");
  assert.equal(rotuloGovernanca("conditioned").label, "Condicionada");
  assert.equal(rotuloGovernanca("eligible").label, "Elegível");
  assert.equal(rotuloGovernanca("insufficient").label, "Cobertura insuficiente");
});

test("rotuloEscopo", () => {
  assert.equal(rotuloEscopo("individual"), "Desenvolvimento individual");
  assert.equal(rotuloEscopo("organization"), "Contexto organizacional");
  assert.equal(rotuloEscopo("ai"), "IA e governança");
});

test("matrizPonto: clampa 0–100", () => {
  assert.deepEqual(matrizPonto(57, 43), { x: 57, y: 43 });
  assert.deepEqual(matrizPonto(null, 200), { x: 0, y: 100 });
});

test("sinteseExecutiva: explicita percepção individual; usa índices; sem nota geral", () => {
  const s = sinteseExecutiva({ organization: { index_display: 57, band_label: "Definido e repetível" }, ai: { index_display: 43, band_label: "Informal ou parcial" } });
  assert.match(s, /percepção de uma pessoa/);
  assert.match(s, /57\/100/);
  assert.match(s, /43\/100/);
  assert.match(s, /sem uma nota geral/i);
  // sem índices → fala de cobertura, não inventa número
  assert.match(sinteseExecutiva({}), /cobertura/i);
});

test("planoDeAcao: uma ação por escopo (dedup)", () => {
  const p = planoDeAcao([
    { scope: "individual", dimension_name: "Visão", action: "A" },
    { scope: "organization", dimension_name: "Dados", action: "B" },
    { scope: "individual", dimension_name: "Outra", action: "C" },
    { scope: "ai", dimension_name: "Gov", action: "D" },
  ]);
  assert.deepEqual(p.map((x) => x.scope), ["individual", "organization", "ai"]);
  assert.equal(p[0].action, "A");
});

test("mensagemErro: 404 credencial, 403, 410, incompleta, 429", () => {
  assert.match(mensagemErro(404, { error: "nao_encontrado" }), /[Cc]ódigo/);
  assert.match(mensagemErro(403, { error: "indisponivel" }), /não está aberto/);
  assert.match(mensagemErro(410, {}), /expirou/);
  assert.match(mensagemErro(400, { error: "submissao_incompleta" }), /faltam respostas/i);
  assert.match(mensagemErro(429, {}), /[Mm]uitas tentativas/);
});

test("armazenamento: isolado por evento; round-trip; limpar", () => {
  const s = memStore();
  assert.equal(chaveArmazenamento("ev1"), "screener:ev1");
  guardarSessao("ev1", { previewKey: "k", token: "t", pos: 4 }, s);
  assert.deepEqual(lerSessao("ev1", s), { previewKey: "k", token: "t", pos: 4 });
  assert.equal(lerSessao("ev2", s), null);
  limparSessao("ev1", s);
  assert.equal(lerSessao("ev1", s), null);
});

// --- cliente HTTP: rotas + credencial/token só no header ---
function espiao() {
  const chamadas = [];
  const transporte = async (url, init) => { chamadas.push({ url, init }); return { status: 200, json: async () => ({ ok: true }) }; };
  return { chamadas, cliente: criarCliente({ edgeUrl: "https://x/functions/v1/screener", anonKey: "ANON", transporte }) };
}

test("cliente.apresentacao: GET /start?event_slug; credencial no header, não na URL", async () => {
  const { chamadas, cliente } = espiao();
  await cliente.apresentacao("preview-interno-ia-v1", "SEGREDO");
  const c = chamadas[0];
  assert.equal(c.init.method, "GET");
  assert.ok(c.url.includes("/screener/start?event_slug=preview-interno-ia-v1"));
  assert.ok(!c.url.includes("SEGREDO"));
  assert.equal(c.init.headers["x-preview-key"], "SEGREDO");
});

test("cliente.iniciar: POST /start com consentimento no corpo; sem credencial no corpo/URL", async () => {
  const { chamadas, cliente } = espiao();
  await cliente.iniciar("preview-interno-ia-v1", "SEGREDO", "v1");
  const c = chamadas[0];
  assert.equal(c.init.method, "POST");
  assert.deepEqual(JSON.parse(c.init.body), { event_slug: "preview-interno-ia-v1", privacy_ack: true, privacy_notice_version: "v1" });
  assert.ok(!c.init.body.includes("SEGREDO") && !c.url.includes("SEGREDO"));
  assert.equal(c.init.headers["x-preview-key"], "SEGREDO");
});

test("cliente.salvar: PUT /response com ids opacos; token/credencial só em header", async () => {
  const { chamadas, cliente } = espiao();
  await cliente.salvar("SEGREDO", "TOKEN", "item123", "opt456");
  const c = chamadas[0];
  assert.equal(c.init.method, "PUT");
  assert.deepEqual(JSON.parse(c.init.body), { item_id: "item123", option_id: "opt456" });
  assert.ok(!c.url.includes("TOKEN") && !c.url.includes("SEGREDO"));
  assert.equal(c.init.headers["x-session-token"], "TOKEN");
  assert.equal(c.init.headers["x-preview-key"], "SEGREDO");
});

test("cliente.retomar/enviar/resultado: token no header, nunca na query", async () => {
  for (const nome of ["retomar", "enviar", "resultado"]) {
    const { chamadas, cliente } = espiao();
    await cliente[nome]("SEGREDO", "TOKEN");
    const c = chamadas[0];
    assert.ok(!c.url.includes("TOKEN") && !c.url.includes("SEGREDO"), `${nome}: vazou na URL`);
    assert.equal(c.init.headers["x-session-token"], "TOKEN");
  }
});
