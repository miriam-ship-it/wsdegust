// Motor da liderança: a aritmética que saiu do navegador.
// O teste que mais importa é o da PARIDADE — o servidor tem de reproduzir
// exatamente o número que já foi entregue a clientes, senão a mudança de lugar
// vira mudança de resultado sem ninguém ter decidido isso.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DIMENSOES, agrupar, faltantes, calcularScores, maturidade,
  riscoEstrategico, cdl, calcularResultado, divergencias,
} from "./motor.mjs";

/** Respostas completas, todas com o mesmo valor, no formato da tabela. */
const respostasEm = (valor, extra = []) => [
  ...DIMENSOES.flatMap((d) => [
    { dimensao: d, lente: "pessoa", valor },
    { dimensao: d, lente: "empresa", valor },
  ]),
  ...extra,
];

test("agrupar: lê o formato da tabela e ignora lixo", () => {
  const b = agrupar([
    { dimensao: "D1", lente: "pessoa", valor: 4 },
    { dimensao: "D1", lente: "empresa", valor: 2 },
    { dimensao: "D9", lente: "pessoa", valor: 5 },   // dimensão inexistente
    { dimensao: "D2", lente: "chefe", valor: 5 },     // lente inexistente
    { dimensao: "D2", lente: "pessoa", valor: 9 },    // fora de 1–5
    { dimensao: "D2", lente: "empresa", valor: null },
  ]);
  assert.deepEqual(b.D1, { pessoa: 4, empresa: 2 });
  assert.deepEqual(b.D2, { pessoa: null, empresa: null });
  assert.equal(Object.keys(b).length, 5, "só as cinco dimensões");
});

test("faltantes: aponta exatamente o que impede o cálculo", () => {
  const b = agrupar([{ dimensao: "D1", lente: "pessoa", valor: 3 }]);
  const f = faltantes(b);
  assert.equal(f.length, 9, "10 pares menos o único respondido");
  assert.ok(!f.includes("D1-pessoa"));
  assert.ok(f.includes("D1-empresa"));
});

test("scores: gap, média e geral são os do original", () => {
  const b = agrupar([
    ...DIMENSOES.flatMap((d) => [
      { dimensao: d, lente: "pessoa", valor: 4 },
      { dimensao: d, lente: "empresa", valor: 2 },
    ]),
  ]);
  const { scores, scoreGeral } = calcularScores(b);
  assert.equal(scores.D1.gap, 2, "gap = pessoa − empresa");
  assert.equal(scores.D1.media, 3, "média = (pessoa + empresa) / 2");
  assert.equal(scoreGeral, 3, "geral = média das cinco médias");
});

test("maturidade: as seis faixas, nas bordas", () => {
  assert.equal(maturidade(4.5).letra, "AAA");
  assert.equal(maturidade(4.49).letra, "AA");
  assert.equal(maturidade(4.0).letra, "AA");
  assert.equal(maturidade(3.5).letra, "A");
  assert.equal(maturidade(3.0).letra, "B");
  assert.equal(maturidade(2.5).letra, "C");
  assert.equal(maturidade(2.49).letra, "D");
  assert.equal(maturidade(0).letra, "D");
  assert.equal(maturidade(3.7).score100, 74, "score 0–100 é score × 20");
});

// -------------------------------------------------------------------------
// PARIDADE COM O QUE JÁ FOI ENTREGUE. Os números abaixo vêm de um relatório
// real (porte "até 50 colaboradores", C-Level/Sócio, score 74/100). Se este
// teste cair, o servidor passou a produzir um relatório diferente do que a
// empresa já entregou — e isso não pode acontecer por acidente.
// -------------------------------------------------------------------------
test("paridade: reproduz o relatório entregue (score 74, CDL 62.400–273.000, risco 26%)", () => {
  const scoreGeral = 3.7;
  assert.equal(maturidade(scoreGeral).score100, 74);
  assert.equal(maturidade(scoreGeral).letra, "A");
  assert.equal(riscoEstrategico(scoreGeral), 26);
  const c = cdl({ scoreGeral, tamanho: "S1", persona: "X" });
  assert.equal(c.min, 62400);
  assert.equal(c.max, 273000);
  // a decomposição 50/30/20 do documento
  assert.equal(c.estrategico.min, 31200);
  assert.equal(c.tatico.min, 18720);
  assert.equal(c.operacional.min, 12480);
});

test("cdl: porte e nível desconhecidos caem num padrão, não em NaN", () => {
  const c = cdl({ scoreGeral: 3, tamanho: "S9", persona: "Z" });
  assert.ok(Number.isFinite(c.min) && Number.isFinite(c.max));
  assert.ok(c.max > c.min);
});

test("resultado: incompleto avisa em vez de devolver NaN", () => {
  const r = calcularResultado({
    respostas: [{ dimensao: "D1", lente: "pessoa", valor: 3 }],
    respondente: { tamanho: "S1", persona: "X" },
  });
  assert.equal(r.status, "INCOMPLETO");
  assert.ok(r.faltantes.length > 0);
  assert.equal(r.scoreGeral, undefined, "sem score parcial: NaN viraria 'R$ NaN' no PDF");
});

test("resultado: completo devolve tudo o que o PDF precisa", () => {
  const r = calcularResultado({
    respostas: respostasEm(4),
    respondente: { tamanho: "S2", persona: "G" },
  });
  assert.equal(r.status, "OK");
  assert.equal(r.scoreGeral, 4);
  assert.equal(r.maturidade.letra, "AA");
  assert.equal(r.maturidade.score100, 80);
  assert.equal(r.risco_estrategico, 20);
  assert.ok(r.cdl.min > 0 && r.cdl.max > r.cdl.min);
  for (const d of DIMENSOES) assert.ok(Number.isFinite(r.scores[d].media));
});

// -------------------------------------------------------------------------
// A razão de ser da mudança: o servidor não pode aceitar número do navegador.
// -------------------------------------------------------------------------
test("divergências: número adulterado pelo cliente é detectado, e o servidor vence", () => {
  const servidor = calcularResultado({
    respostas: respostasEm(3),
    respondente: { tamanho: "S1", persona: "A" },
  });
  const adulterado = {
    maturidade_letra: "AAA",
    maturidade_score: 100,
    risco_estrategico: 0,
    cdl_min: 99999999,
    cdl_max: 99999999,
  };
  const d = divergencias(servidor, adulterado);
  const campos = d.map((x) => x.campo).sort();
  assert.deepEqual(campos, ["cdl_max", "cdl_min", "maturidade_letra", "maturidade_score", "risco_estrategico"]);
  // o resultado do servidor não é contaminado pelo que veio de fora
  assert.equal(servidor.maturidade.letra, "B");
  assert.equal(servidor.maturidade.score100, 60);
});

test("divergências: cliente honesto não gera ruído", () => {
  const servidor = calcularResultado({
    respostas: respostasEm(4),
    respondente: { tamanho: "S2", persona: "G" },
  });
  const honesto = {
    maturidade_letra: servidor.maturidade.letra,
    maturidade_score: servidor.maturidade.score100,
    risco_estrategico: servidor.risco_estrategico,
    cdl_min: servidor.cdl.min,
    cdl_max: servidor.cdl.max,
  };
  assert.deepEqual(divergencias(servidor, honesto), []);
  assert.deepEqual(divergencias(servidor, null), [], "sem payload não há divergência a relatar");
});
