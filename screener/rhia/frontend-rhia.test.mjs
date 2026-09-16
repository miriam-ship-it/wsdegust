// Testes dos helpers puros do frontend rhia. node --test.
// Não tocam o DOM (o módulo não arranca sem `document`) nem a rede (transporte
// injetado). Foco no contrato de segurança (token/credencial só no header
// certo), na validação local do texto livre, na persistência que degrada com
// elegância, nas rotas por hash e na FRONTEIRA do DOM público: a tela de
// resultado renderizada a partir de um modelo REAL do motor não pode conter
// pontos-base, escala, códigos de estágio, ids de item nem eixos internos.
//
// ONDE ELE VIVE (fronteira de publicação): FORA de `frontend/`. O Netlify
// publica o diretório `frontend/` inteiro, e este teste carrega justamente o
// que a fronteira promete não entregar ao navegador — pontos-base, códigos de
// estágio, eixos internos e o caminho do motor privado. Por isso mora em
// `screener/rhia/` (rodado pelo glob `screener/rhia/*.test.mjs` do `npm test`)
// e importa o app por caminho relativo. Os dois testes de fronteira reprovam
// qualquer arquivo de teste que volte a aparecer dentro do publish dir e
// qualquer arquivo publicado que importe de fora dele.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVENTO_PADRAO, TITULO, ESCADA_PUBLICA, NOTA_QUINTO_DEGRAU, EVENTOS_ANALYTICS, HASH_DA_TELA,
  lerEvento, montarHeaders, progresso, escapeHtml, validarEmail,
  campoCondicional, validarTextoOutro, mensagemTextoOutro, textoAposTrocarOpcao, textoExigido,
  agruparPorGrupo, itensFaltantes, primeiraNaoRespondida, contextoCompleto, submissaoCompleta,
  leadModoEfetivo, rotuloEvidencia, fraseEvidencia, rotuloRestricao, tomGovernanca, escadaComAtual,
  formatarData, mensagemErro, descreverErro,
  chaveArmazenamento, guardarSessao, lerSessao, limparSessao,
  telaDoHash, criarRastreador, criarCliente, renderResultado, renderInsuficiente,
  sinteseExecutiva, convitePresenteNaUrl, urlSemConvite, perfilFaltantes,
  renderUnificado, faixaEmReais, rascunhoLimpo,
} from "../../frontend/rhia.mjs";
import { calcularUnificado } from "../unificado/composicao.mjs";
import itensLideranca from "../unificado/lideranca-itens.json" with { type: "json" };
// SÓ NO TESTE: o motor e o instrumento do pacote (o app nunca os importa).
import { buildResultContractV2 } from "./pacote/src/output-engine-v2.mjs";
import { paraPublico } from "./logica.mjs";
import instrumento from "./pacote/instrumento-rh-ia-v1.json" with { type: "json" };

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(AQUI, "..", "..", "frontend"); // screener/rhia → raiz → frontend

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function storeQueLanca() {
  const boom = () => { throw new Error("SecurityError"); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

// Itens públicos FALSOS (ids inventados) para os helpers de contexto/revisão.
const CF = { id: "X1_TEXT", show_when: { option_id: "OUTRO" }, type: "text", prompt: "Descreva", min_length: 2, max_length: 120 };
const ITENS = [
  { id: "X1", order: 1, kind: "context", group: "contexto", prompt: "p1", options: [{ id: "A", label: "a" }, { id: "OUTRO", label: "outro" }], conditional_field: CF },
  { id: "X2", order: 2, kind: "context", group: "contexto", prompt: "p2", options: [{ id: "B", label: "b" }] },
  { id: "Y1", order: 3, kind: "scored", group: "praticas", dimension_name: "Dim", prompt: "p3", options: [{ id: "o1", label: "1" }, { id: "na", label: "n" }] },
  { id: "Z1", order: 4, kind: "governance_gate", group: "governanca", prompt: "p4", options: [{ id: "o1", label: "1" }, { id: "na", label: "n" }] },
];
const GRUPOS = [{ code: "contexto", name: "Contexto" }, { code: "praticas", name: "Práticas" }, { code: "governanca", name: "Governança" }];

// ---------- básicos ----------

test("lerEvento: usa ?evento; cai no padrão rhia quando ausente/vazio", () => {
  assert.equal(EVENTO_PADRAO, "boomit-degustacao-rh-ia");
  assert.equal(lerEvento("?evento=abc"), "abc");
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
  assert.ok(!serial.includes("SEGREDO") && !serial.includes("TOK"));
  const semNada = montarHeaders({ anonKey: "ANON" });
  assert.ok(!("content-type" in semNada) && !("x-preview-key" in semNada) && !("x-session-token" in semNada));
});

test("progresso: clampa e calcula percentual", () => {
  assert.deepEqual(progresso(0, 30), { respondidas: 0, total: 30, restante: 30, pct: 0 });
  assert.deepEqual(progresso(15, 30), { respondidas: 15, total: 30, restante: 15, pct: 50 });
  assert.deepEqual(progresso(99, 30), { respondidas: 30, total: 30, restante: 0, pct: 100 });
});

test("escapeHtml / validarEmail", () => {
  assert.equal(escapeHtml('<b a="1">'), "&lt;b a=&quot;1&quot;&gt;");
  for (const ok of ["a@b.co", "voce@empresa.com.br", " x@y.io "]) assert.ok(validarEmail(ok), ok);
  for (const bad of ["", "sem-arroba", "a@b", "@b.co", null, 42]) assert.ok(!validarEmail(bad), String(bad));
});

// ---------- texto livre (campo condicional) ----------

test("campoCondicional: lido da apresentação, nunca por id fixo", () => {
  const cf = campoCondicional(ITENS);
  assert.deepEqual(cf, { itemId: "X1", id: "X1_TEXT", opcao: "OUTRO", min: 2, max: 120, prompt: "Descreva" });
  assert.equal(campoCondicional(ITENS.slice(1)), null);
});

test("validarTextoOutro: trim, 2–120, sem caracteres de controle", () => {
  const cf = campoCondicional(ITENS);
  assert.deepEqual(validarTextoOutro("  Gerente de projetos  ", cf), { ok: true, erro: null, valor: "Gerente de projetos" });
  assert.equal(validarTextoOutro("", cf).erro, "vazio");
  assert.equal(validarTextoOutro("   ", cf).erro, "vazio");
  assert.equal(validarTextoOutro("a", cf).erro, "curto");
  assert.equal(validarTextoOutro("ab", cf).ok, true);
  assert.equal(validarTextoOutro("x".repeat(120), cf).ok, true);
  assert.equal(validarTextoOutro("x".repeat(121), cf).erro, "longo");
  assert.equal(validarTextoOutro("ab\tc", cf).erro, "controle");
  assert.equal(validarTextoOutro("ab\u0007c", cf).erro, "controle");
  assert.equal(validarTextoOutro(42, cf).erro, "vazio");
  assert.match(mensagemTextoOutro("curto", cf), /2 caracteres/);
  assert.match(mensagemTextoOutro("longo", cf), /120 caracteres/);
  assert.ok(mensagemTextoOutro("controle", cf).length > 0);
});

test("textoAposTrocarOpcao: ao sair da opção que abre o campo, oculta E limpa", () => {
  const cf = campoCondicional(ITENS);
  assert.equal(textoAposTrocarOpcao("OUTRO", cf, "meu papel"), "meu papel");
  assert.equal(textoAposTrocarOpcao("A", cf, "meu papel"), "");
  assert.equal(textoAposTrocarOpcao("A", null, "x"), "");
  assert.equal(textoExigido({ X1: "OUTRO" }, cf), true);
  assert.equal(textoExigido({ X1: "A" }, cf), false);
});

test("contextoCompleto: exige os itens de contexto e o texto só quando a opção abre o campo", () => {
  const cf = campoCondicional(ITENS);
  const ctx = ITENS.filter((i) => i.group === "contexto");
  assert.deepEqual(contextoCompleto(ctx, {}, "", cf), { ok: false, faltam: ["X1", "X2"], textoErro: null });
  assert.equal(contextoCompleto(ctx, { X1: "A", X2: "B" }, "", cf).ok, true);
  const semTexto = contextoCompleto(ctx, { X1: "OUTRO", X2: "B" }, "", cf);
  assert.equal(semTexto.ok, false); assert.equal(semTexto.textoErro, "vazio");
  assert.equal(contextoCompleto(ctx, { X1: "OUTRO", X2: "B" }, "Diretor", cf).ok, true);
});

test("submissaoCompleta: 30 itens + texto GRAVADO quando exigido", () => {
  const cf = campoCondicional(ITENS);
  assert.equal(submissaoCompleta(ITENS, { X1: "A", X2: "B", Y1: "o1", Z1: "na" }, cf).ok, true);
  const falta = submissaoCompleta(ITENS, { X1: "A", X2: "B", Y1: "o1" }, cf);
  assert.equal(falta.ok, false); assert.deepEqual(falta.faltam, ["Z1"]);
  const semTexto = submissaoCompleta(ITENS, { X1: "OUTRO", X2: "B", Y1: "o1", Z1: "na" }, cf);
  assert.equal(semTexto.ok, false); assert.equal(semTexto.textoFalta, true);
  assert.equal(submissaoCompleta(ITENS, { X1: "OUTRO", X1_TEXT: "Diretor", X2: "B", Y1: "o1", Z1: "na" }, cf).ok, true);
});

// ---------- agrupamento / navegação ----------

test("agruparPorGrupo / itensFaltantes / primeiraNaoRespondida", () => {
  const g = agruparPorGrupo(ITENS, GRUPOS);
  assert.deepEqual(g.map((x) => [x.code, x.items.length]), [["contexto", 2], ["praticas", 1], ["governanca", 1]]);
  assert.deepEqual(itensFaltantes(ITENS, { X1: "A" }), ["X2", "Y1", "Z1"]);
  assert.equal(primeiraNaoRespondida(ITENS, { X1: "A", X2: "B" }), 2);
  assert.equal(primeiraNaoRespondida(ITENS, { X1: "A", X2: "B", Y1: "o1", Z1: "na" }), 4);
});

test("leadModoEfetivo: usa o do vínculo; null/desconhecido → opcional após envio", () => {
  assert.equal(leadModoEfetivo("required_before_result"), "required_before_result");
  assert.equal(leadModoEfetivo("none"), "none");
  assert.equal(leadModoEfetivo(null), "optional_after_submit");
  assert.equal(leadModoEfetivo("lixo"), "optional_after_submit");
});

// ---------- rótulos da devolutiva ----------

test("rotuloEvidencia / fraseEvidencia", () => {
  assert.equal(rotuloEvidencia("BROAD"), "ampla");
  assert.equal(rotuloEvidencia("ADEQUATE"), "adequada");
  assert.equal(rotuloEvidencia("LIMITED"), "limitada");
  assert.equal(rotuloEvidencia("INSUFFICIENT"), "insuficiente");
  assert.equal(rotuloEvidencia(undefined), "não informada");
  assert.match(fraseEvidencia("LIMITED"), /cautela/);
  assert.match(fraseEvidencia("BROAD"), /evidência ampla/);
});

test("rotuloRestricao / tomGovernanca: cor nunca é o único sinal", () => {
  assert.equal(rotuloRestricao("NO_SCALE").label, "Escala bloqueada");
  assert.equal(rotuloRestricao("CONTROLLED_EXPERIMENTS").label, "Somente experimentos controlados");
  assert.equal(rotuloRestricao("NONE").label, "Sem restrição de escala");
  assert.deepEqual(tomGovernanca("CRITICAL"), { tom: "danger", prioridade: true, icone: "aviso" });
  assert.deepEqual(tomGovernanca("INSUFFICIENT"), { tom: "warning", prioridade: true, icone: "info" });
  assert.equal(tomGovernanca("ATTENTION").prioridade, false);
  assert.equal(tomGovernanca("ESTABLISHED").tom, "success");
  assert.equal(tomGovernanca("qualquer").tom, "neutral");
});

test("escadaComAtual: 5 degraus na ordem pública; UM ÚNICO destaque, o atual", () => {
  assert.equal(ESCADA_PUBLICA.length, 5);
  assert.deepEqual([...ESCADA_PUBLICA], ["Operacional Ágil", "Gestor Tático", "Estrategista de Escala", "Arquiteto de Soluções", "Criador de Tecnologia"]);
  const e = escadaComAtual("Estrategista de Escala");
  assert.deepEqual(e.map((d) => d.atual), [false, false, true, false, false]);
  // A referência de atuação NÃO é marcada na escada (PROMPT §5.2: "destacando
  // apenas o degrau atual"); ela é dita em prosa no bloco 3.
  assert.deepEqual(Object.keys(e[0]), ["nome", "posicao", "atual"]);
  assert.equal(escadaComAtual("Gestor Tático").filter((d) => d.atual).length, 1);
  assert.equal(escadaComAtual(null).filter((d) => d.atual).length, 0);
});

test("formatarData: ISO → pt-BR sem Date", () => {
  assert.equal(formatarData("2026-09-12"), "12/09/2026");
  assert.equal(formatarData("2026-09-12T10:00:00Z"), "12/09/2026");
  assert.equal(formatarData(null), "");
});

test("mensagemErro / descreverErro: erros da edge rhia", () => {
  assert.match(mensagemErro(400, { error: "opcao_invalida" }), /não foi aceita/);
  assert.match(mensagemErro(400, { error: "texto_invalido" }), /não foi aceita/);
  assert.match(mensagemErro(400, { error: "submissao_incompleta" }), /faltam respostas/i);
  assert.match(mensagemErro(400, { error: "email_invalido" }), /e-mail válido/);
  assert.match(mensagemErro(403, { error: "lead_required" }), /contato/);
  assert.match(mensagemErro(403, { error: "indisponivel" }), /não está aberto/);
  assert.match(mensagemErro(409, { error: "instrumento_divergente" }), /atualizado/);
  assert.match(mensagemErro(410, {}), /expirou/);
  assert.match(mensagemErro(429, {}), /[Mm]uitas tentativas/);
  assert.equal(descreverErro(410, {}).recuperavel, false);
  assert.equal(descreverErro(409, {}).recuperavel, false);
  assert.equal(descreverErro(429, {}).recuperavel, true);
  assert.equal(descreverErro(500, {}).recuperavel, true);
  assert.equal(descreverErro(0, null).recuperavel, true);
});

// ---------- persistência versionada ----------

test("armazenamento: chave versionada por evento; guarda só o combinado; round-trip", () => {
  const s = memStore();
  assert.equal(chaveArmazenamento("ev1"), "rhia:v1:ev1");
  assert.equal(guardarSessao("ev1", { token: "t", pos: 4, tela: "questoes", respostas: { a: 1 }, segredo: "x" }, s), true);
  const lido = lerSessao("ev1", s);
  assert.deepEqual(lido, { token: "t", pos: 4, tela: "questoes", convite: null, perfil: null });
  assert.ok(!s.getItem("rhia:v1:ev1").includes("segredo"), "guardou mais do que o combinado");
  assert.equal(lerSessao("ev2", s), null);
  limparSessao("ev1", s);
  assert.equal(lerSessao("ev1", s), null);
});

test("armazenamento: o convite sobrevive a um recarregar, e só no formato certo", () => {
  // Sem isto, recarregar a página entre o e-mail e o "Começar" perderia a ponte
  // em silêncio — o convite já foi tirado da barra de endereço.
  const s = memStore();
  const cod = "a".repeat(64);
  guardarSessao("ev1", { token: "t", pos: 0, tela: "abertura", convite: cod }, s);
  assert.equal(lerSessao("ev1", s).convite, cod);

  guardarSessao("ev1", { token: "t", pos: 0, tela: "abertura", convite: "nao-e-codigo" }, s);
  assert.equal(lerSessao("ev1", s).convite, null, "o que não tem a forma de um código não é guardado");

  s.setItem("rhia:v1:ev1", JSON.stringify({ token: "t", pos: 0, tela: null, convite: 42 }));
  assert.equal(lerSessao("ev1", s).convite, null, "registro adulterado não vira tentativa de vínculo");
});

test("convite: lido da URL só no formato certo, e a barra de endereço não o guarda", () => {
  const cod = "b3".repeat(32);
  const base = "https://diagnosticoboomit.netlify.app/rhia.html";
  assert.equal(convitePresenteNaUrl(`${base}?convite=${cod}`), cod);
  assert.equal(convitePresenteNaUrl(base), null);
  assert.equal(convitePresenteNaUrl(`${base}?convite=xyz`), null);
  assert.equal(convitePresenteNaUrl(`${base}?convite=${cod.toUpperCase()}`), null);
  assert.equal(convitePresenteNaUrl("isto nao e uma url"), null);

  assert.equal(urlSemConvite(`${base}?convite=${cod}`), "/rhia.html");
  assert.equal(urlSemConvite(`${base}?convite=${cod}&evento=x`), "/rhia.html?evento=x",
    "tirar o convite não pode tirar o evento junto");
  assert.ok(!urlSemConvite(`${base}?convite=${cod}#contexto`).includes(cod));
  assert.equal(urlSemConvite(`${base}?convite=${cod}#contexto`), "/rhia.html#contexto");
});

test("armazenamento: registro corrompido ou sem token → null", () => {
  const s = memStore();
  s.setItem("rhia:v1:ev1", "{lixo");
  assert.equal(lerSessao("ev1", s), null);
  s.setItem("rhia:v1:ev1", JSON.stringify({ pos: 3 }));
  assert.equal(lerSessao("ev1", s), null);
});

test("armazenamento: store que lança degrada com elegância (false/null, nunca exceção)", () => {
  const s = storeQueLanca();
  assert.equal(guardarSessao("ev1", { token: "t", pos: 0, tela: "contexto" }, s), false);
  assert.equal(lerSessao("ev1", s), null);
  assert.doesNotThrow(() => limparSessao("ev1", s));
});

// ---------- rotas por hash ----------

test("telaDoHash: URL direta só chega onde o estado permite", () => {
  assert.equal(telaDoHash("#resultado", { temSessao: false }), "abertura");
  assert.equal(telaDoHash("#revisao", { temSessao: false }), "abertura");
  assert.equal(telaDoHash("#questoes", { temSessao: false }), "abertura");
  assert.equal(telaDoHash("#questoes", { temSessao: true, contextoOk: false }), "contexto");
  assert.equal(telaDoHash("#questoes", { temSessao: true, contextoOk: true }), "questoes");
  assert.equal(telaDoHash("#revisao", { temSessao: true, contextoOk: true }), "revisao");
  assert.equal(telaDoHash("#resultado", { temSessao: true, contextoOk: true }), "questoes");
  assert.equal(telaDoHash("#abertura", { temSessao: true, contextoOk: true }), "questoes");
  assert.equal(telaDoHash("#erro", { temSessao: true, contextoOk: false }), "contexto");
  assert.equal(telaDoHash("#questoes", { temSessao: true, submitido: true }), "resultado");
  assert.equal(telaDoHash("#revisao", { temSessao: true, submitido: true }), "revisao");
  assert.equal(telaDoHash("", { temSessao: true, submitido: true }), "resultado");
  assert.equal(HASH_DA_TELA.lead_gate, "resultado");
  assert.equal(HASH_DA_TELA.insuficiente, "resultado");
});

// ---------- analytics ----------

test("criarRastreador: no-op sem adaptador; só eventos permitidos; nunca texto livre; engole falhas", () => {
  const cf = campoCondicional(ITENS);
  assert.equal(criarRastreador(undefined, cf)("assessment_started"), false);
  const vistos = [];
  const r = criarRastreador({ track: (e, d) => vistos.push([e, d]) }, cf);
  assert.equal(r("assessment_started"), true);
  assert.equal(r("question_answered", { id: "Y1", option: "o1", texto: "vazou" }), true);
  assert.equal(r("question_answered", { id: "X1_TEXT", option: "Diretor de gente" }), false, "texto livre não pode sair");
  assert.equal(r("evento_inventado"), false);
  assert.deepEqual(vistos, [["assessment_started", undefined], ["question_answered", { id: "Y1", option: "o1" }]]);
  assert.ok(!JSON.stringify(vistos).includes("vazou"));
  const fn = criarRastreador((e) => { if (e) throw new Error("boom"); }, cf);
  assert.equal(fn("result_viewed"), false);
  assert.deepEqual([...EVENTOS_ANALYTICS], ["assessment_started", "context_completed", "question_answered", "assessment_completed", "result_viewed", "pdf_requested", "reassessment_clicked"]);
});

// ---------- cliente HTTP: rotas /rhia/* + token/credencial só no header ----------

function espiao(status = 200, corpo = { ok: true }) {
  const chamadas = [];
  const transporte = async (url, init) => { chamadas.push({ url, init }); return { status, json: async () => corpo }; };
  return { chamadas, cliente: criarCliente({ edgeUrl: "https://x/functions/v1/screener/", anonKey: "ANON", transporte }) };
}

test("cliente.apresentacao: GET /rhia/start?event_slug; credencial no header, não na URL", async () => {
  const { chamadas, cliente } = espiao();
  await cliente.apresentacao("boomit-degustacao-rh-ia", "SEGREDO");
  const c = chamadas[0];
  assert.equal(c.init.method, "GET");
  assert.ok(c.url.includes("/screener/rhia/start?event_slug=boomit-degustacao-rh-ia"), c.url);
  assert.ok(!c.url.includes("SEGREDO"));
  assert.equal(c.init.headers["x-preview-key"], "SEGREDO");
  assert.equal(c.init.body, undefined);
});

test("cliente.iniciar: POST /rhia/start com consentimento no corpo", async () => {
  const { chamadas, cliente } = espiao(201);
  const r = await cliente.iniciar("ev", undefined, "v1");
  const c = chamadas[0];
  assert.equal(c.init.method, "POST");
  assert.ok(c.url.endsWith("/rhia/start"));
  assert.deepEqual(JSON.parse(c.init.body), { event_slug: "ev", privacy_ack: true, privacy_notice_version: "v1" });
  assert.ok(!("x-preview-key" in c.init.headers));
  assert.equal(r.status, 201);
});

test("cliente.salvar: PUT /rhia/response {item_id, value}; token só em header", async () => {
  const { chamadas, cliente } = espiao();
  await cliente.salvar(null, "TOKEN", "Y1", "o1");
  const c = chamadas[0];
  assert.equal(c.init.method, "PUT");
  assert.ok(c.url.endsWith("/rhia/response"));
  assert.deepEqual(JSON.parse(c.init.body), { item_id: "Y1", value: "o1" });
  assert.ok(!c.url.includes("TOKEN"));
  assert.equal(c.init.headers["x-session-token"], "TOKEN");
  assert.ok(!("x-preview-key" in c.init.headers));
});

test("cliente.retomar/enviar/resultado/lead: rotas rhia; token no header, nunca na query", async () => {
  const esperado = { retomar: ["GET", "/rhia/session"], enviar: ["POST", "/rhia/submit"], resultado: ["GET", "/rhia/result"], lead: ["POST", "/rhia/lead"] };
  for (const [nome, [metodo, rota]] of Object.entries(esperado)) {
    const { chamadas, cliente } = espiao();
    await cliente[nome]("SEGREDO", "TOKEN", { nome: "Ana", email: "ana@x.com", marketing_opt_in: true });
    const c = chamadas[0];
    assert.equal(c.init.method, metodo, nome);
    assert.ok(c.url.endsWith(rota), `${nome}: ${c.url}`);
    assert.ok(!c.url.includes("TOKEN") && !c.url.includes("SEGREDO"), `${nome}: vazou na URL`);
    assert.equal(c.init.headers["x-session-token"], "TOKEN");
    assert.equal(c.init.headers["x-preview-key"], "SEGREDO");
  }
});

test("cliente: falha de rede vira status 0 (nunca exceção solta)", async () => {
  const cliente = criarCliente({ edgeUrl: "https://x", anonKey: "A", transporte: async () => { throw new Error("offline"); } });
  assert.deepEqual(await cliente.resultado(null, "T"), { status: 0, body: null });
});

// ---------- DOM público: resultado renderizado a partir de um modelo REAL do motor ----------

const CTX = instrumento.items.filter((it) => it.kind === "context");
const DIMS = instrumento.dimensions.map((d) => d.id);
/**
 * Respostas construídas a partir do JSON (sem ids literais aqui):
 *   porDimensao: {dimId → estágio}; gates: estágio dos 3 gates;
 *   ctx: [índice da opção de papel, de alcance, de autoridade].
 */
function respostas({ porDimensao = {}, gates = "E3", ctx = [0, 2, 2], na = {} } = {}) {
  const out = {};
  CTX.forEach((it, i) => { out[it.id] = it.options[ctx[i]].id; });
  for (const it of instrumento.items) {
    if (it.kind === "scored") out[it.id] = porDimensao[it.dimension] ?? "E3";
    else if (it.kind === "governance_gate") out[it.id] = gates;
  }
  for (const [dim, quantos] of Object.entries(na)) {
    const ids = instrumento.dimensions.find((d) => d.id === dim).items.slice(0, quantos);
    for (const id of ids) out[id] = "NA";
  }
  return out;
}
/**
 * Modelo público como a EDGE o produz. Antes este helper montava
 * `{ ...c.public, emitido_em }` à mão, contornando `paraPublico` — e por isso
 * não exercitava a projeção de verdade: a sanitização do ramo INSUFFICIENT e,
 * agora, as métricas numéricas passavam ao largo do teste. Passa pela projeção
 * real; a data é fixada no contrato para o resultado ser determinístico.
 */
function publico(answers) {
  const c = buildResultContractV2({ instrument: instrumento, answers });
  c.internal.generatedAt = "2026-09-12T12:00:00.000Z";
  return paraPublico(c);
}
const IDS_ITENS = instrumento.items.map((it) => it.id);
// Cada string que NÃO pode aparecer no DOM público (pontos-base, escala,
// estágios internos, eixos internos, ids de item, respostas).
const PROIBIDOS = ["bp", "3333", "6667", "10000", "E1", "E2", "E3", "E4", "P1", "P2", "P3", "P4", "P5", "leadership", "process_bp", "ai_bp", "internal", ...IDS_ITENS, ...DIMS.map((d) => `"${d}"`)];
function assertSemVazamento(html, rotulo) {
  for (const p of PROIBIDOS) assert.ok(!html.includes(p), `${rotulo}: DOM público contém "${p}"`);
  assert.ok(!/\b(E[1-4]|P[1-5])\b/.test(html), `${rotulo}: código de escala/estágio no DOM`);
}

test("renderResultado (perfil rico): anatomia completa na ordem, sem vazamento", () => {
  const pub = publico(respostas({ porDimensao: { [DIMS[0]]: "E4", [DIMS[1]]: "E3", [DIMS[2]]: "E2", [DIMS[3]]: "E3", [DIMS[4]]: "E4", [DIMS[5]]: "E2" }, gates: "E2", ctx: [0, 2, 2] }));
  assert.equal(pub.status, "ORIENTATIVE_HYPOTHESIS");
  assert.equal(pub.supporters.length, 2); assert.equal(pub.limiters.length, 2); assert.equal(pub.tensions.length, 2);
  assert.equal(pub.governance.label, "Atenção necessária");
  const html = renderResultado(pub, { instrumentVersion: "1.0.0-rc.1" });
  assertSemVazamento(html, "perfil rico");
  // ordem das seções
  const ordem = ["Sua leitura orientativa", "Qualidade da evidência", "Lente do seu papel", "rh-escada", pub.positioning.stage, "Referência de atuação e distância", pub.reference.stage, pub.gap.label, "Assinatura de posicionamento", pub.signature.label, "O que sustenta o avanço", "O que limita o avanço", "Tensões relevantes", pub.tensions[0].label, "Governança", pub.governance.label, "Somente experimentos controlados", "NIST AI RMF", "complementares e recorrentes, não estágios", "Plano 30–60–90", "30 dias", "60 dias", "90 dias", "Indicadores para começar", "Perguntas para a conversa executiva", "Reavaliação e limite da leitura", pub.disclaimer, "Imprimir ou salvar PDF", "Rever respostas", "Recomeçar"];
  let cursor = -1;
  for (const marca of ordem) {
    const i = html.indexOf(marca, cursor + 1);
    assert.ok(i > cursor, `fora de ordem ou ausente: "${marca}"`);
    cursor = i;
  }
  // escada: 5 degraus, UM só destaque (o atual), aria-current
  assert.equal((html.match(/rh-escada__degrau/g) || []).length, 5);
  assert.equal((html.match(/is-atual/g) || []).length, 1);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(html.includes("Degrau atual"));
  assert.ok(!html.includes("is-ref") && !html.includes(">Referência<"), "a escada não pode ter um segundo destaque");
  assert.equal((html.match(/rh-escada__tag/g) || []).length, 1, "só o degrau atual leva rótulo");
  // a referência de atuação continua dita em prosa, no bloco 3
  assert.ok(html.includes("Sua referência de atuação aponta para"));
  for (const nome of ESCADA_PUBLICA) assert.ok(html.includes(escapeHtml(nome)), nome);
  // evidência ampla; data; versão; cabeçalho de impressão
  assert.ok(html.includes(">ampla<"));
  assert.ok(html.includes("12/09/2026") && html.includes("Instrumento 1.0.0-rc.1") && html.includes("rh-print-head"));
  // Aqui havia `assert.ok(!/\d+\s*\/\s*100/.test(html), "nota 0–100 no DOM")`.
  // A devolutiva passou a mostrar nota 0–100 por decisão de produto (14/09), e a
  // asserção teria continuado VERDE por acaso — o índice é renderizado como
  // "74" e "de 100" em elementos separados, sem a barra que o padrão procurava.
  // Um teste que passa pelo motivo errado é pior que teste nenhum, então ele foi
  // trocado pelo que de fato continua valendo: a escala é 0–100 e o ponto-base
  // não atravessa.
  assert.ok(/class="rh-indice__v">\d{1,3}</.test(html), "o índice 0–100 aparece");
  const indice = Number((html.match(/class="rh-indice__v">(\d{1,3})</) || [])[1]);
  assert.ok(indice >= 0 && indice <= 100, `índice fora de 0–100: ${indice}`);
  assert.ok(!/\b(3333|6667|10000)\b/.test(html), "ponto-base no DOM");
  assert.ok(!/<progress|radar/i.test(html));
  // plano em tabela com 3 linhas e cabeçalhos de coluna
  assert.equal((html.match(/<tr><th scope="row"/g) || []).length, 3);
  assert.ok(html.includes("Evidência de conclusão"));
  // indicadores ≤ 3 e 3 perguntas
  assert.equal((html.match(/<ul class="rh-bullets">[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length, pub.indicators.length);
  assert.equal((html.match(/<ol class="rh-perguntas">[\s\S]*?<\/ol>/)[0].match(/<li>/g) || []).length, 3);
  // gate: ícone + texto + tom
  assert.ok(html.includes("rh-gate--warning") && html.includes("rh-gate__ic"));
  assert.ok(!html.includes("rh-gate--prioridade"));
});

test("renderResultado (gate crítico): prioridade visual, escala bloqueada, assinatura de governança", () => {
  const pub = publico(respostas({ porDimensao: { [DIMS[0]]: "E4", [DIMS[5]]: "E4" }, gates: "E1" }));
  assert.equal(pub.governance.label, "Condição crítica");
  assert.equal(pub.restriction, "NO_SCALE");
  const html = renderResultado(pub);
  assertSemVazamento(html, "gate crítico");
  assert.ok(html.includes("rh-gate--danger") && html.includes("rh-gate--prioridade"));
  assert.ok(html.includes("condição que domina a decisão"));
  assert.ok(html.includes("Escala bloqueada"));
  assert.ok(html.includes("Potencial limitado por governança"));
  assert.ok(!html.includes("NO_SCALE"), "código da restrição no DOM");
});

test("renderResultado (equilibrado, referência inconclusiva): sem sustentadores/tensões, aviso de inconclusivo", () => {
  const pub = publico(respostas({ ctx: [4, 0, 4], gates: "E4" }));
  assert.equal(pub.reference.status, "UNCERTAIN");
  assert.equal(pub.supporters.length, 0); assert.equal(pub.tensions.length, 0);
  assert.equal(pub.signature.label, "Evolução equilibrada");
  const html = renderResultado(pub);
  assertSemVazamento(html, "equilibrado");
  assert.ok(!html.includes("Tensão relevante") && !html.includes("Tensões relevantes"), "seção de tensões deveria estar oculta");
  assert.ok(html.includes("Referência de posição inconclusiva"));
  assert.ok(html.includes("evolução parece homogênea"));
  assert.ok(html.includes("rh-gate--success") && html.includes("Sem restrição de escala"));
  assert.equal((html.match(/is-ref/g) || []).length, 0, "a escada nunca marca um segundo degrau");
  assert.ok(html.includes("Evolução equilibrada"));
});

test("escada: a ressalva do quinto degrau é exibida SEMPRE, não só a quem cai nele", () => {
  // O nome "Criador de Tecnologia" está na escada para todo mundo; a restrição
  // do PROMPT §3 (não exige tecnologia proprietária, modelo próprio ou agentes)
  // é item do CHECKLIST-DE-ACEITE e por isso acompanha a escada sempre.
  const baixo = publico(respostas({ porDimensao: Object.fromEntries(DIMS.map((d) => [d, "E1"])), gates: "E2" }));
  const htmlBaixo = renderResultado(baixo);
  assert.notEqual(baixo.positioning.stage, "Criador de Tecnologia");
  assert.equal(baixo.positioning.clarification, undefined, "o motor só clarifica no quinto degrau");
  assert.ok(htmlBaixo.includes(escapeHtml(NOTA_QUINTO_DEGRAU)), "ressalva ausente fora do quinto degrau");
  assertSemVazamento(htmlBaixo, "ressalva sempre");

  const alto = publico(respostas({ porDimensao: Object.fromEntries(DIMS.map((d) => [d, "E4"])), gates: "E4" }));
  assert.equal(alto.positioning.stage, "Criador de Tecnologia");
  const htmlAlto = renderResultado(alto);
  assert.ok(htmlAlto.includes(escapeHtml(alto.positioning.clarification)), "no quinto degrau vale a palavra do motor");
  assert.ok(!htmlAlto.includes(escapeHtml(NOTA_QUINTO_DEGRAU)), "sem duplicar a ressalva");
  assertSemVazamento(htmlAlto, "quinto degrau");
});

test("renderResultado (evidência limitada com um NA por dimensão): sintetiza e rotula 'limitada'", () => {
  const na = Object.fromEntries(DIMS.map((d) => [d, 1]));
  const pub = publico(respostas({ na }));
  assert.equal(pub.status, "ORIENTATIVE_HYPOTHESIS");
  assert.equal(pub.evidence.status, "LIMITED");
  const html = renderResultado(pub);
  assertSemVazamento(html, "limitada");
  assert.ok(html.includes(">limitada<") && html.includes("cautela"));
});

test("renderInsuficiente (dois NA na mesma dimensão): mensagem do motor + gate + CTAs, sem vazamento", () => {
  const pub = publico(respostas({ na: { [DIMS[2]]: 2 }, gates: "NA" }));
  assert.equal(pub.status, "INSUFFICIENT");
  const html = renderInsuficiente(pub, { instrumentVersion: "1.0.0-rc.1" });
  assertSemVazamento(html, "insuficiente");
  assert.ok(html.includes(escapeHtml(pub.missingMessage)));
  assert.ok(html.includes("Informação insuficiente") && html.includes("rh-gate--prioridade"));
  assert.ok(html.includes(escapeHtml(pub.disclaimer)));
  assert.ok(html.includes('data-acao="rever"') && html.includes('data-acao="recomecar"'));
  assert.ok(!html.includes("rh-escada"), "sem escada quando não há posicionamento");
});

test("renderResultado: entrada vazia não quebra (tela nunca branca)", () => {
  const html = renderResultado(null);
  assert.ok(html.includes("Sua leitura orientativa") && html.includes("Gate de governança"));
  assertSemVazamento(html, "vazio");
});

// ---------- autocontido / fronteira ----------

test("rhia.mjs não importa nada (autocontido em frontend/) e a página carrega o trio tokens/screener/rhia", () => {
  const src = fs.readFileSync(path.join(FRONT, "rhia.mjs"), "utf8");
  assert.ok(!/^\s*import\s/m.test(src), "rhia.mjs não pode importar de fora de frontend/");
  assert.ok(!/from\s+["']\.\.\//.test(src));
  const html = fs.readFileSync(path.join(FRONT, "rhia.html"), "utf8");
  for (const s of ['href="tokens.css"', 'href="screener.css"', 'href="rhia.css"', 'src="rhia.mjs"', "SCREENER_RHIA_CONFIG", "<noscript>"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes(`<title>${TITULO}</title>`));
  const css = fs.readFileSync(path.join(FRONT, "rhia.css"), "utf8");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "hex solto em rhia.css — use tokens");
  assert.ok(!/font-weight:\s*(700|800|900|bold)/.test(css), "bold não existe na Boomit");
  assert.ok(css.includes("@media print") && css.includes("break-inside: avoid") && css.includes("prefers-reduced-motion"));
});

// -------------------------------------------------------------------------
// SÍNTESE EXECUTIVA — a leitura inteira num parágrafo. Não pode inventar nada:
// cada frase tem de carregar uma palavra que o motor já emitiu.
// -------------------------------------------------------------------------

test("síntese: compõe a partir do contrato, sem inventar e sem vazar", () => {
  const pub = publico(respostas({ porDimensao: { [DIMS[0]]: "E4", [DIMS[1]]: "E3", [DIMS[2]]: "E2", [DIMS[3]]: "E3", [DIMS[4]]: "E4", [DIMS[5]]: "E2" }, gates: "E2", ctx: [0, 2, 2] }));
  const t = sinteseExecutiva(pub);
  const palavras = t.split(/\s+/).filter(Boolean).length;
  assert.ok(palavras >= 80 && palavras <= 175, `síntese com ${palavras} palavras, fora da faixa`);
  // tudo o que ela afirma tem de vir do contrato
  assert.ok(t.includes(pub.positioning.stage), "cita o degrau");
  assert.ok(t.includes(pub.supporters[0].name), "cita o sustentador principal");
  assert.ok(t.includes(pub.limiters[0].name), "cita o limitador principal");
  assert.ok(/governan/i.test(t), "fala de governança");
  assertSemVazamento(t, "síntese");
  assert.ok(!/\d+\s*%|\d+\s*\/\s*100/.test(t), "sem número nem porcentagem");
});

test("síntese: degrada sozinha quando não há tensão nem destaque", () => {
  const pub = publico(respostas({ ctx: [4, 0, 4], gates: "E4" }));
  assert.equal(pub.supporters.length, 0);
  assert.equal(pub.tensions.length, 0);
  const t = sinteseExecutiva(pub);
  assert.ok(t.includes(pub.positioning.stage), "ainda diz o degrau");
  assert.ok(/homogênea/.test(t), "diz que nada se destaca, em vez de omitir");
  assert.ok(!/undefined|null|\[object/.test(t), "sem buraco de template");
});

test("síntese: sem degrau não há síntese (INSUFFICIENT e entrada vazia)", () => {
  assert.equal(sinteseExecutiva(null), "");
  assert.equal(sinteseExecutiva({}), "");
  const pub = publico(respostas({ na: { [DIMS[2]]: 2 }, gates: "NA" }));
  assert.equal(pub.status, "INSUFFICIENT");
  assert.equal(sinteseExecutiva(pub), "", "no ramo insuficiente não se resume o que não existe");
});

test("renderResultado: a síntese entra logo depois da capa e antes do mapa", () => {
  const pub = publico(respostas({ porDimensao: { [DIMS[0]]: "E4", [DIMS[5]]: "E2" }, gates: "E3" }));
  const html = renderResultado(pub);
  const iCapa = html.indexOf("Sua leitura orientativa");
  const iSintese = html.indexOf("A leitura em um parágrafo");
  const iMapa = html.indexOf("O que esta leitura traz");
  assert.ok(iCapa < iSintese && iSintese < iMapa, "ordem: capa, síntese, mapa");
  assertSemVazamento(html, "render com síntese");
});

// -------------------------------------------------------------------------
// O PERFIL — existe só quando o instrumento traz o bloco
// -------------------------------------------------------------------------

const CAMPOS_PERFIL = [
  { id: "nome", tipo: "texto", obrigatorio: true, maximo: 120 },
  { id: "nivel", tipo: "escolha", obrigatorio: true, opcoes: [{ id: "G" }, { id: "X" }] },
  { id: "observacao", tipo: "texto", obrigatorio: false, maximo: 120 },
];

test("perfil: diz o que FALTA, não um sim ou não", () => {
  // "está incompleto" não ajuda ninguém a terminar; a tela precisa apontar o campo.
  assert.deepEqual(perfilFaltantes(CAMPOS_PERFIL, {}), ["nome", "nivel"]);
  assert.deepEqual(perfilFaltantes(CAMPOS_PERFIL, { nome: "Ana", nivel: "G" }), []);
  assert.deepEqual(perfilFaltantes(CAMPOS_PERFIL, { nome: "  ", nivel: "G" }), ["nome"]);
  assert.deepEqual(perfilFaltantes(CAMPOS_PERFIL, { nome: "Ana", nivel: "Z" }), ["nivel"],
    "valor fora da lista é ausência, não escolha");
  assert.deepEqual(perfilFaltantes(CAMPOS_PERFIL, { nome: "A".repeat(200), nivel: "G" }), ["nome"]);
  assert.deepEqual(perfilFaltantes(CAMPOS_PERFIL, { nome: "Ana", nivel: "G", observacao: "" }), [],
    "campo opcional vazio não trava ninguém");
});

test("perfil: SEM bloco no instrumento, não há nada a completar", () => {
  // É assim que o link público anônimo segue igual: a ausência do bloco, e não
  // um `if` escrito em algum lugar do fluxo.
  assert.deepEqual(perfilFaltantes([], { qualquer: "coisa" }), []);
  assert.deepEqual(perfilFaltantes(undefined, null), []);
});

test("rota por hash: o perfil pendente segura a pessoa, e o fluxo anônimo não muda", () => {
  const aberta = { temSessao: true, submitido: false, contextoOk: true };
  // sem perfil declarado, `perfilOk` nasce true — o comportamento de hoje, intacto
  assert.equal(telaDoHash("questoes", aberta), "questoes");
  assert.equal(telaDoHash("contexto", aberta), "contexto");

  // com perfil pendente, qualquer hash cai no perfil
  const pendente = { ...aberta, perfilOk: false };
  for (const h of ["questoes", "contexto", "revisao", "", "resultado"]) {
    assert.equal(telaDoHash(h, pendente), "perfil", `#${h} não podia passar por cima do perfil`);
  }
  // preenchido, o hash do perfil ainda leva ao perfil (dá para voltar e corrigir)
  assert.equal(telaDoHash("perfil", { ...aberta, perfilOk: true }), "perfil");
  // e sem sessão, nada disso importa
  assert.equal(telaDoHash("perfil", { temSessao: false, perfilOk: false }), "abertura");
});

test("rota por hash: sessão submetida não volta para o perfil", () => {
  // Depois do submit o resultado já foi calculado com o porte que havia; deixar
  // voltar ao perfil ali sugeriria que trocá-lo mudaria a conta.
  assert.equal(telaDoHash("perfil", { temSessao: true, submitido: true, perfilOk: false }), "resultado");
});

// -------------------------------------------------------------------------
// O DOCUMENTO ÚNICO — as duas leituras e a relação entre elas
// -------------------------------------------------------------------------

const PERFIL_DOC = { nome: "Ana Souza", empresa: "Boomit", cargo: "Head de RH", nivel: "G", porte: "S3", setor: "V1" };

function respostasDasDuasMetades() {
  const R = { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor de RH", CTX02: "AREA", CTX03: "DECIDE_SCOPE" };
  const dims = {
    EST: ["E3", "E3", "E4", "E3"], TAL: ["E2", "E3", "E3", "E2"], DES: ["E3", "E3", "E2", "E3"],
    INF: ["E3", "E4", "E3", "E3"], DAD: ["E2", "E2", "E3", "E2"], IA: ["E2", "E1", "E2", "NA"],
  };
  for (const [d, vs] of Object.entries(dims)) vs.forEach((v, i) => { R[`${d}0${i + 1}`] = v; });
  R.GOV01 = "E3"; R.GOV02 = "E2"; R.GOV03 = "E3";
  itensLideranca.items.forEach((it, i) => { R[`LID_${it.id}`] = it.options[i % 4].id; });
  return R;
}
const docCompleto = () => calcularUnificado({ perfil: PERFIL_DOC, respostas: respostasDasDuasMetades() });

// A ORDEM DA REFERÊNCIA APROVADA EM 16/09 (diagnostico-de-cenario-standalone).
const ORDEM_DOCUMENTO = [
  "As duas leituras, juntas",
  "Onde as práticas se situam",
  "Liderança em cinco dimensões",
  "RH, desenvolvimento e IA em números",
  "Referência de atuação e distância",
  "Assinatura de posicionamento",
  "Sustentadores e limitadores",
  "Tensões relevantes",
  "Governança",
  "Rota de ação",
  "Plano 30–60–90 dias",
  "Indicadores para começar",
  "Perguntas para a conversa executiva",
  "Reavaliação e limite da leitura",
];

test("documento único: um percurso contínuo, numerado de 01 a 14, na ordem aprovada", () => {
  const html = renderUnificado(docCompleto(), { instrumentVersion: "1.0.0" });
  const titulos = [...html.matchAll(/<h2 class="rh-sec__title"[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
  assert.deepEqual(titulos, ORDEM_DOCUMENTO,
    "a leitura cruzada abre, a escada situa, liderança e números de IA ficam lado a lado");
  const numeros = [...html.matchAll(/<span class="rh-sec__n"[^>]*>(\d+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(numeros, ORDEM_DOCUMENTO.map((_, i) => String(i + 1).padStart(2, "0")),
    "numeração corrida: não existe mais Parte 1 e Parte 2");
});

test("documento único: UMA capa, UM mapa, UMA síntese — a versão anterior repetia os dois no meio", () => {
  const html = renderUnificado(docCompleto(), { instrumentVersion: "1.0.0" });
  // Conta o TÍTULO da capa, com a aspa: `rh-capa__t` sozinho também casa com
  // `rh-capa__textura`, que é o grafismo — foi assim que esta asserção contou 2.
  assert.equal((html.match(/rh-capa__t"/g) || []).length, 1, "duas capas é sinal de dois relatórios grampeados");
  assert.equal((html.match(/class="rh-mapa"/g) || []).length, 1, "o mapa de leitura aparece uma vez");
  assert.equal((html.match(/class="rh-sintese"/g) || []).length, 1, "a síntese aparece uma vez");
  assert.ok(!/Parte [12] ·/.test(html));
  // o mapa vem antes da síntese, e os dois antes da primeira seção
  const iMapa = html.indexOf('class="rh-mapa"'), iSint = html.indexOf('class="rh-sintese"');
  const iPrimeira = html.indexOf("As duas leituras, juntas</h2>");
  assert.ok(iMapa < iSint && iSint < iPrimeira);
  // o mapa lista exatamente as seções que existem
  const doMapa = [...html.matchAll(/<span class="rh-mapa__t">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(doMapa, ORDEM_DOCUMENTO);
});

test("documento único: a capa leva logotipo e grafismo, e quem respondeu", () => {
  const html = renderUnificado(docCompleto(), { instrumentVersion: "1.0.0" });
  const capa = html.slice(html.indexOf('<header class="rh-capa">'), html.indexOf("</header>"));
  assert.match(capa, /class="rh-capa__marca" src="logo-boomit\.png" alt="Boomit"/, "o logotipo tem texto alternativo");
  assert.match(capa, /class="rh-capa__textura" src="grafismo-boomit\.png" alt="" aria-hidden="true"/,
    "o grafismo é textura: sem alt, fora da árvore de acessibilidade");
  assert.ok(capa.includes("Ana Souza · Head de RH · Boomit"));
  assert.ok(!capa.includes("rh-capa__nota"), "a ressalva saiu da capa e vive inteira no limite da leitura");
  assert.ok(html.includes("Limite da leitura."), "e continua no documento");
});

test("documento único: a marca pode vir de outro lugar — é assim que o PDF a embute", () => {
  const html = renderUnificado(docCompleto(), { marca: { logo: "data:image/png;base64,AAA", grafismo: "data:image/png;base64,BBB" } });
  assert.ok(html.includes('src="data:image/png;base64,AAA"'));
  assert.ok(html.includes('src="data:image/png;base64,BBB"'));
  assert.ok(!html.includes("logo-boomit.png"));
});

test("documento único: os dois indicadores-manchete usam o mesmo anel — e o valor existe em texto", () => {
  const r = docCompleto();
  const html = renderUnificado(r, {});
  assert.equal((html.match(/class="rh-anel"/g) || []).length, 2, "um anel por metade, e só dois no documento");
  // o anel é desenho: sem o texto oculto, o índice some para leitor de tela
  assert.ok(html.includes(`<span class="rh-sr">${r.liderancaPublica.maturidade.valor} de 100. </span>`));
  assert.ok(html.includes(`<span class="rh-sr">${r.ia.metricas.indice} de 100. </span>`));
  for (const m of html.matchAll(/<figure class="rh-anel"([^>]*)>/g)) assert.match(m[1], /aria-hidden="true"/);
});

test("documento único: a metade de liderança mostra as duas lentes e a faixa em reais", () => {
  const r = docCompleto();
  const html = renderUnificado(r, {});
  for (const d of r.liderancaPublica.dimensoes) {
    assert.ok(html.includes(escapeHtml(d.nome)), `faltou a dimensão ${d.nome}`);
  }
  // A série é rotulada NA PRÓPRIA LINHA, não numa legenda à parte: legenda
  // separada obriga a ir e voltar com os olhos entre a cor e o nome.
  assert.ok(html.includes("como você atua") && html.includes("o que a empresa sustenta"),
    "sem a segunda lente rotulada, some a distância que é o achado");
  assert.ok(html.includes("is-serie-a") && html.includes("is-serie-b"),
    "as duas séries precisam de cores distintas, na ordem de luminância da marca");
  assert.ok(html.includes(`${r.liderancaPublica.risco.valor}%`));
  // O custo é o número mais pesado do documento: ganha cartão em destaque e linha
  // própria para a cifra, em vez de ir dentro de um título.
  const { min, max } = r.liderancaPublica.cdl;
  const reais = (v) => "R$ " + Math.round(v).toLocaleString("pt-BR");
  assert.match(html, /<div class="rh-card rh-card--destaque">\s*<p class="rh-card__k">Custo da disfuncionalidade<\/p>/);
  assert.ok(html.includes(`<p class="rh-card__cifra">${reais(min)} <span class="rh-card__ate">a</span> ${reais(max)} <span class="rh-card__unid">ao ano</span></p>`));
});

test("documento único: NÃO existe índice combinado nem soma das duas metades", () => {
  const html = renderUnificado(docCompleto(), {});
  for (const proibido of ["índice geral", "indice geral", "nota final", "média das duas", "pontuação total"]) {
    assert.ok(!html.toLowerCase().includes(proibido.toLowerCase()),
      `"${proibido}" seria número novo, sem instrumento que o sustente`);
  }
  // e a ressalva de que são instrumentos distintos viaja JUNTO, não escondida no fim
  assert.ok(html.includes("instrumentos distintos"));
});

test("documento único: nada de ponto-base, código de estágio ou id de item", () => {
  const html = renderUnificado(docCompleto(), {});
  for (const p of ["_bp", "10000", "3333", "6667", '"E1"', '"E2"', '"E3"', "EST01", "GOV01", "LID_q1"]) {
    assert.ok(!html.includes(p), `vazou "${p}" para o documento`);
  }
});

test("documento único: com meia medida, a leitura cruzada ADMITE em vez de afirmar", () => {
  const todas = respostasDasDuasMetades();
  const soIA = Object.fromEntries(Object.entries(todas).filter(([k]) => !k.startsWith("LID_")));
  const html = renderUnificado(calcularUnificado({ perfil: PERFIL_DOC, respostas: soIA }), {});

  assert.match(html, /uma das duas leituras/, "o documento tem de avisar que falta uma metade");
  assert.match(html, /leitura de liderança ainda não fecha/, "diz que a metade não fecha, sem rotular ninguém");
  assert.match(html, /nada foi estimado no lugar do que falta/, "e diz o que NÃO fez");
  assert.ok(!html.includes("Liderança está à frente"), "sem as duas medidas não há distância a declarar");
  assert.ok(html.includes("Onde as práticas se situam") && html.includes("RH, desenvolvimento e IA em números"),
    "a metade que existe continua inteira");
});

test("documento único: o que a pessoa digitou no perfil é escapado", () => {
  const r = docCompleto();
  r.perfil = { ...PERFIL_DOC, empresa: '<img src=x onerror="alert(1)">' };
  const html = renderUnificado(r, {});
  assert.ok(!html.includes("<img src=x"), "nome de empresa é texto, nunca markup");
  assert.ok(html.includes("&lt;img"));
});

test("faixa em reais: sem centavo, e sem faixa quando não há número", () => {
  assert.equal(faixaEmReais(211200, 924000), "R$ 211.200 – R$ 924.000");
  assert.equal(faixaEmReais(null, 10), null);
  assert.equal(faixaEmReais(1.4, 2.6), "R$ 1 – R$ 3");
});

test("a devolutiva de IA do link público continua com a rota nomeada e o número solto", () => {
  // O documento único compõe as MESMAS seções em outra ordem; o link público não
  // muda. A prova byte a byte está em screener/rhia/golden/ — aqui ficam só as
  // duas diferenças que existem de propósito entre os dois documentos.
  const r = docCompleto();
  const publico = renderResultado(r.ia, { instrumentVersion: "1.0.0" });
  assert.ok(publico.includes("Rota de ação — NIST AI RMF"), "no link público o referencial fica no título");
  assert.ok(!publico.includes('class="rh-anel"'), "no link público o índice é o número, sem anel");
  const unico = renderUnificado(r, { instrumentVersion: "1.0.0" });
  assert.ok(unico.includes(">Rota de ação</h2>"), "no documento único o título é só a rota");
});

test("rascunho do perfil: sobrevive a fechar o navegador na PRIMEIRA tela", () => {
  // São 43 respostas sem pausa. Quem digita nome, empresa e cargo e fecha o
  // navegador antes de continuar perderia justamente o trabalho já feito.
  const s = memStore();
  guardarSessao("ev1", { token: "t", pos: 0, tela: "perfil", perfil: { nome: "Ana", empresa: "Boomit" } }, s);
  assert.deepEqual(lerSessao("ev1", s).perfil, { nome: "Ana", empresa: "Boomit" });
});

test("rascunho do perfil: só texto, aparado, e nada quando não há o que guardar", () => {
  assert.equal(rascunhoLimpo(null), null);
  assert.equal(rascunhoLimpo({}), null);
  assert.equal(rascunhoLimpo({ nome: "   " }), null, "espaço não é rascunho");
  assert.deepEqual(rascunhoLimpo({ nome: "Ana", porte: 42, x: null }), { nome: "Ana" },
    "o que não é texto não entra");
  assert.equal(rascunhoLimpo({ nome: "A".repeat(500) }).nome.length, 200, "aparado: é armazenamento local, não banco");
});

test("rascunho do perfil: sai do aparelho assim que o servidor o aceita", () => {
  // Nome, empresa e cargo não ficam no armazenamento local um minuto a mais que
  // o necessário — depois de aceitos, quem manda é o servidor.
  const s = memStore();
  guardarSessao("ev1", { token: "t", pos: 0, tela: "perfil", perfil: { nome: "Ana" } }, s);
  assert.ok(s.getItem("rhia:v1:ev1").includes("Ana"));

  guardarSessao("ev1", { token: "t", pos: 3, tela: "contexto", perfil: null }, s);
  assert.ok(!s.getItem("rhia:v1:ev1").includes("Ana"), "o rascunho tem de sumir do aparelho");
  assert.equal(lerSessao("ev1", s).perfil, null);
});
