// Lógica rhia: validações, canônico, ponte para o motor e projeção pública.
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento } from "./definicao.mjs";
import {
  ITENS_IDS, validarResposta, validarSubmissao, canonico,
  respostasParaMotor, calcularContrato, paraPublico, metricas,
} from "./logica.mjs";

const scoredIds = instrumento.items.filter((x) => x.kind !== "context").map((x) => x.id);
const respostasEm = (nivel, extra = {}) => ({
  CTX01: "HR_LEADER", CTX02: "AREA", CTX03: "CO_DECIDE",
  ...Object.fromEntries(scoredIds.map((id) => [id, nivel])),
  ...extra,
});

// ---------- ITENS_IDS ----------
test("ITENS_IDS: 30 ids na ordem do instrumento, sem o texto livre", () => {
  assert.equal(ITENS_IDS.length, 30);
  assert.deepEqual([...ITENS_IDS], [...instrumento.items].sort((a, b) => a.order - b.order).map((it) => it.id));
  assert.ok(!ITENS_IDS.includes("CTX01_OTHER_TEXT"));
  assert.ok(Object.isFrozen(ITENS_IDS));
});

// ---------- validarResposta ----------
test("validarResposta: contexto aceita só options[].id", () => {
  assert.equal(validarResposta("CTX01", "OTHER"), true);
  assert.equal(validarResposta("CTX02", "ENTERPRISE"), true);
  assert.throws(() => validarResposta("CTX01", "E1"), /^Error: opcao_invalida$/);
  assert.throws(() => validarResposta("CTX02", "AREA "), /^Error: opcao_invalida$/);
  assert.throws(() => validarResposta("CTX03", 3), /^Error: opcao_invalida$/);
});

test("validarResposta: scored e gate aceitam E1..E4 e NA", () => {
  for (const v of ["E1", "E2", "E3", "E4", "NA"]) {
    assert.equal(validarResposta("EST01", v), true);
    assert.equal(validarResposta("GOV03", v), true);
  }
  assert.throws(() => validarResposta("EST01", "E5"), /^Error: opcao_invalida$/);
  assert.throws(() => validarResposta("GOV01", "HR_LEADER"), /^Error: opcao_invalida$/);
  assert.throws(() => validarResposta("IA04", ""), /^Error: opcao_invalida$/);
  assert.throws(() => validarResposta("IA04", null), /^Error: opcao_invalida$/);
});

test("validarResposta: item fora do instrumento", () => {
  assert.throws(() => validarResposta("XPTO", "E1"), /^Error: item_fora_do_instrumento$/);
  assert.throws(() => validarResposta("ctx01", "OTHER"), /^Error: item_fora_do_instrumento$/);
});

test("validarResposta: texto livre 2–120 após trim, sem caracteres de controle", () => {
  assert.equal(validarResposta("CTX01_OTHER_TEXT", "Gerente de projetos"), true);
  assert.equal(validarResposta("CTX01_OTHER_TEXT", "  ab  "), true);
  assert.equal(validarResposta("CTX01_OTHER_TEXT", "x".repeat(120)), true);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", "a"), /^Error: texto_invalido$/);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", " a "), /^Error: texto_invalido$/);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", "x".repeat(121)), /^Error: texto_invalido$/);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", "ab\ncd"), /^Error: texto_invalido$/);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", "ab\u0000"), /^Error: texto_invalido$/);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", "ab\u007f"), /^Error: texto_invalido$/);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", 42), /^Error: texto_invalido$/);
  assert.throws(() => validarResposta("CTX01_OTHER_TEXT", undefined), /^Error: texto_invalido$/);
});

// ---------- validarSubmissao ----------
test("validarSubmissao: completa sem OTHER passa; completa com OTHER + texto passa", () => {
  assert.equal(validarSubmissao(respostasEm("E3")), true);
  assert.equal(validarSubmissao(respostasEm("E3", { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor" })), true);
});

test("validarSubmissao: item ausente → incompleto: falta <id>", () => {
  const r = respostasEm("E3");
  delete r.DAD02;
  assert.throws(() => validarSubmissao(r), /^Error: incompleto: falta DAD02$/);
  const r2 = respostasEm("E3");
  delete r2.CTX03;
  assert.throws(() => validarSubmissao(r2), /^Error: incompleto: falta CTX03$/);
  assert.throws(() => validarSubmissao({}), /^Error: incompleto: falta CTX01$/);
});

test("validarSubmissao: CTX01=OTHER sem texto (ou inválido) → texto_obrigatorio", () => {
  assert.throws(() => validarSubmissao(respostasEm("E3", { CTX01: "OTHER" })), /^Error: texto_obrigatorio$/);
  assert.throws(() => validarSubmissao(respostasEm("E3", { CTX01: "OTHER", CTX01_OTHER_TEXT: "a" })), /^Error: texto_obrigatorio$/);
  assert.throws(() => validarSubmissao(respostasEm("E3", { CTX01: "OTHER", CTX01_OTHER_TEXT: "ab\tcd" })), /^Error: texto_obrigatorio$/);
});

test("validarSubmissao: texto órfão (CTX01 ≠ OTHER) é tolerado", () => {
  assert.equal(validarSubmissao(respostasEm("E3", { CTX01_OTHER_TEXT: "sobrou" })), true);
});

test("validarSubmissao: chave fora do instrumento → itens_estranhos", () => {
  assert.throws(() => validarSubmissao(respostasEm("E3", { XPTO: "E1" })), /^Error: itens_estranhos$/);
});

test("validarSubmissao: valor inválido gravado é rejeitado (defesa em profundidade)", () => {
  assert.throws(() => validarSubmissao(respostasEm("E3", { EST01: "E9" })), /^Error: opcao_invalida$/);
});

// ---------- canonico ----------
test("canonico: determinístico, independente da ordem de inserção, TAB e LF, ordem por code unit", () => {
  const a = { CTX01: "OTHER", EST01: "E1", CTX01_OTHER_TEXT: "Consultor", CTX02: "AREA" };
  const b = { CTX02: "AREA", CTX01_OTHER_TEXT: "Consultor", EST01: "E1", CTX01: "OTHER" };
  assert.equal(canonico(a), canonico(b));
  assert.equal(canonico(a), "CTX01\tOTHER\nCTX01_OTHER_TEXT\tConsultor\nCTX02\tAREA\nEST01\tE1");
  assert.equal(canonico({}), "");
  // "C" collate: "CTX01" < "CTX01_OTHER_TEXT" < "CTX02"; "DAD01" < "DES01"; "GOV03" > "EST01"
  const c = canonico(respostasEm("E2", { CTX01: "OTHER", CTX01_OTHER_TEXT: "x y" }));
  const linhas = c.split("\n");
  assert.equal(linhas.length, 31);
  assert.deepEqual(linhas.map((l) => l.split("\t")[0]), [...linhas.map((l) => l.split("\t")[0])].sort());
});

test("canonico: mudar uma resposta muda a string", () => {
  assert.notEqual(canonico(respostasEm("E2")), canonico(respostasEm("E2", { IA01: "E3" })));
});

// ---------- respostasParaMotor ----------
test("respostasParaMotor remove só CTX01_OTHER_TEXT e não muta a entrada", () => {
  const r = respostasEm("E3", { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor" });
  const m = respostasParaMotor(r);
  assert.ok(!("CTX01_OTHER_TEXT" in m));
  assert.equal(Object.keys(m).length, 30);
  assert.equal(m.CTX01, "OTHER");
  assert.ok("CTX01_OTHER_TEXT" in r);
});

// ---------- calcularContrato ----------
test("calcularContrato: chama o motor do pacote com answers sem texto livre", () => {
  const c = calcularContrato({ instrumento, respostas: respostasEm("E3", { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor" }) });
  assert.equal(c.public.version, "2.0.0-pilot");
  assert.equal(c.public.status, "ORIENTATIVE_HYPOTHESIS");
  assert.equal(c.public.positioning.stage, "Arquiteto de Soluções");
  assert.equal(c.internal.instrumentVersion, "1.0.0-rc.1");
  assert.ok(!("CTX01_OTHER_TEXT" in c.internal.answers));
  assert.equal(Object.keys(c.internal.answers).length, 30);
  assert.match(c.internal.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("calcularContrato: instrumento padrão quando omitido; insuficiente sem forçar posicionamento", () => {
  const c = calcularContrato({ respostas: respostasEm("E3", { EST01: "NA", EST02: "NA" }) });
  assert.equal(c.public.status, "INSUFFICIENT");
  assert.ok(c.public.missingMessage);
  assert.ok(!c.public.positioning);
});

// ---------- paraPublico ----------
test("paraPublico: public + emitido_em, NUNCA internal, sem bp/3333/6667", () => {
  const c = calcularContrato({ instrumento, respostas: respostasEm("E4", { GOV02: "E1", CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor" }) });
  const pub = paraPublico(c);
  assert.equal(pub.emitido_em, c.internal.generatedAt.slice(0, 10));
  assert.match(pub.emitido_em, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!("internal" in pub));
  assert.ok(!("answers" in pub));
  assert.equal(pub.governance.id, "CRITICAL");
  assert.equal(pub.restriction, "NO_SCALE");
  const blob = JSON.stringify(pub);
  for (const token of ["bp", "3333", "6667", "10000", "internal", "answers", "generatedAt", "Consultor", "leadership"]) {
    assert.ok(!blob.includes(token), `público vazou "${token}"`);
  }
});

test("paraPublico: não muta o contrato de origem e tolera generatedAt ausente", () => {
  const c = calcularContrato({ instrumento, respostas: respostasEm("E2") });
  const pub = paraPublico(c);
  pub.positioning.stage = "x";
  assert.notEqual(c.public.positioning.stage, "x");
  assert.equal(paraPublico({ public: { version: "2.0.0-pilot" }, internal: {} }).emitido_em, null);
});

// -------------------------------------------------------------------------
// MÉTRICAS NUMÉRICAS (decisão de 14/09). O valor destes testes não é conferir
// aritmética — é garantir que os números vêm do MOTOR e não de uma segunda
// implementação nossa, que poderia divergir dele em silêncio.
// -------------------------------------------------------------------------

test("métricas: índice, eixos e dimensões saem do motor, na escala 0–100", () => {
  const respostas = respostasEm("E3", { EST01: "E4", EST02: "E4", EST03: "E4", EST04: "E4" });
  const m = metricas({ instrumento, respostas });

  assert.equal(m.porDimensao.length, 6, "as seis dimensões");
  for (const d of m.porDimensao) {
    assert.ok(d.valor >= 0 && d.valor <= 100, `${d.nome} fora de 0–100: ${d.valor}`);
    assert.ok(["Liderança", "Processos", "IA"].includes(d.eixo), `eixo com código interno: ${d.eixo}`);
  }
  // E3 puro = 6667 pontos-base = 67 em cem. Se a conversão mudar, isto quebra.
  const des = m.porDimensao.find((d) => d.nome.startsWith("Desenvolvimento"));
  assert.equal(des.valor, 67, "E3 em toda a dimensão tem de dar 67");

  // O índice é a ponderação declarada, não um número solto.
  const [lid, proc, ia] = m.eixos.map((e) => e.valor);
  assert.deepEqual(m.eixos.map((e) => e.peso), [35, 35, 30]);
  const esperado = Math.round(0.35 * lid + 0.35 * proc + 0.30 * ia);
  assert.ok(Math.abs(m.indice - esperado) <= 1,
    `índice ${m.indice} não bate com a ponderação dos eixos (${esperado})`);
});

test("métricas: o degrau e a faixa são coerentes com o índice", () => {
  const m = metricas({ instrumento, respostas: respostasEm("E3") });
  assert.ok(m.degrau && m.degrau.posicao >= 1 && m.degrau.posicao <= 5);
  assert.ok(m.indice >= m.faixa.de && m.indice <= m.faixa.ate,
    `índice ${m.indice} fora da faixa do próprio degrau ${JSON.stringify(m.faixa)}`);
  assert.equal(m.degraus.length, 5, "os cinco degraus, com suas faixas");
  assert.deepEqual(m.degraus.map((d) => d.posicao), [1, 2, 3, 4, 5]);
  // as faixas cobrem 0–100 sem buraco
  assert.equal(m.degraus[0].de, 0);
  assert.equal(m.degraus[4].ate, 100);
});

test("métricas: dimensão sem evidência vira null, e sem as seis não há índice", () => {
  // dois NA na mesma dimensão invalidam-na (o motor exige 3 de 4)
  const m = metricas({ instrumento, respostas: respostasEm("E3", { DES01: "NA", DES02: "NA" }) });
  const des = m.porDimensao.find((d) => d.nome.startsWith("Desenvolvimento"));
  assert.equal(des.valor, null, "ausência de evidência não pode virar zero");
  assert.equal(m.indice, null, "sem as seis dimensões não se publica índice");
  assert.equal(m.eixos, null);
});

test("paraPublico: leva as métricas, e nenhum ponto-base junto", () => {
  const c = calcularContrato({ instrumento, respostas: respostasEm("E3") });
  const pub = paraPublico(c);
  assert.ok(pub.metricas, "a projeção pública leva as métricas");
  assert.ok(pub.metricas.indice >= 0 && pub.metricas.indice <= 100);
  const blob = JSON.stringify(pub.metricas);
  for (const t of ["bp", "3333", "6667", "10000", "leadership", "process_", "ai_bp"]) {
    assert.ok(!blob.includes(t), `métrica vazou interno: "${t}"`);
  }
});

test("paraPublico: no ramo insuficiente NÃO existe número", () => {
  const c = calcularContrato({ instrumento, respostas: respostasEm("E3", { DES01: "NA", DES02: "NA" }) });
  const pub = paraPublico(c);
  assert.equal(pub.status, "INSUFFICIENT");
  assert.equal(pub.metricas, undefined, "sem evidência não se publica número nenhum");
});
