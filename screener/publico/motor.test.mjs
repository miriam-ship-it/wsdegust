// Catracas do MOTOR. Cobrem os critérios de aceite 17 a 20 no cálculo, e as
// regras metodológicas aprovadas (N/A, gate, duas lentes, IA01).

import test from "node:test";
import assert from "node:assert/strict";
import { definicao, itensAtivos } from "./definicao.mjs";
import { calcular, publicar, cobertura, gateDeGovernanca, prioridades, geralProvisorio } from "./motor.mjs";
import { montarDevolutiva } from "./devolutiva.mjs";

const def = definicao();
const PONTUAVEIS = itensAtivos(def).filter((i) => i.pontua).map((i) => i.codigo);

/** Respondente sintético: todo item pontuável no mesmo degrau. */
function todos(degrau, extra = {}) {
  const r = { CTX01: "P3", CTX02: "N3", CTX03: "N4", GOV01: "G3", GOV02: "G3", GOV03: "G3" };
  for (const c of PONTUAVEIS) r[c] = degrau;
  return { ...r, ...extra };
}

test("aceite 17 — CTX não entra no cálculo", () => {
  const a = calcular(todos("E3"));
  const b = calcular(todos("E3", { CTX01: "P1", CTX02: "N1", CTX03: "N1" }));
  assert.equal(a.geral.pontos_provisorios, b.geral.pontos_provisorios);
  for (const [i, bl] of a.blocos.entries()) {
    assert.deepEqual(bl.cobertura.distribuicao, b.blocos[i].cobertura.distribuicao);
  }
  // e o perfil continua sendo lido, sem virar ponto
  assert.equal(a.perfil.CTX01.opcao, "P3");
  assert.equal(b.perfil.CTX01.opcao, "P1");
});

test("aceite 18 — N/A sai do numerador E do denominador", () => {
  const base = calcular(todos("E3"));
  // trocar dois itens de EST por N/A não pode mexer nos pontos do bloco
  const comNA = calcular(todos("E3", { EST01: "NA", EST02: "NA" }));
  const est = (r) => r.blocos.find((b) => b.id === "EST");
  assert.equal(est(base).pontos_provisorios, est(comNA).pontos_provisorios);
  assert.equal(est(comNA).cobertura.na, 2);
  assert.equal(est(comNA).cobertura.considerados, 4);
  // e não pode ser tratado como E1: o resultado com N/A não é pior que o base
  assert.ok(est(comNA).pontos_provisorios >= est(base).pontos_provisorios);
});

test("N/A na maioria do bloco tira a nota do bloco, sem zerá-la", () => {
  const r = calcular(todos("E4", { EST01: "NA", EST02: "NA", EST03: "NA", EST04: "NA" }));
  const est = r.blocos.find((b) => b.id === "EST");
  assert.equal(est.suficiente, false);
  assert.equal(est.pontos_provisorios, null, "bloco sem cobertura não recebe 0 — recebe null");
  assert.ok(r.geral.blocos_sem_nota.includes("EST"));
  // e o bloco sem cobertura sai da média, em vez de puxá-la para baixo
  assert.equal(r.geral.pontos_provisorios, 100);
});

test("a nota geral é média ponderada com 20% por bloco", () => {
  const blocos = [
    { id: "EST", peso: 0.2, pontos_provisorios: 100 },
    { id: "LID", peso: 0.2, pontos_provisorios: 0 },
    { id: "PRO", peso: 0.2, pontos_provisorios: 50 },
    { id: "IA", peso: 0.2, pontos_provisorios: 50 },
    { id: "FUT", peso: 0.2, pontos_provisorios: 50 },
  ];
  assert.equal(geralProvisorio(blocos).pontos_provisorios, 50);
});

test("aceite 19 — a PIOR condição de governança governa o gate", () => {
  assert.equal(gateDeGovernanca({ GOV01: "G3", GOV02: "G3", GOV03: "G1" }).gate, "G1");
  assert.equal(gateDeGovernanca({ GOV01: "G2", GOV02: "G3", GOV03: "G3" }).gate, "G2");
  assert.equal(gateDeGovernanca({ GOV01: "G3", GOV02: "G3", GOV03: "G3" }).gate, "G3");
  assert.equal(gateDeGovernanca({}).gate, null);
});

test("aceite 19 — governança não compõe a nota e não é compensada", () => {
  const bom = calcular(todos("E4", { GOV01: "G3", GOV02: "G3", GOV03: "G3" }));
  const ruim = calcular(todos("E4", { GOV01: "G1", GOV02: "G3", GOV03: "G3" }));
  assert.equal(bom.geral.pontos_provisorios, ruim.geral.pontos_provisorios,
    "o gate não pode mexer na nota");
  assert.equal(ruim.governanca.gate, "G1");
  assert.equal(ruim.governanca.item_determinante, "GOV01");
  // nota alta não apaga o gate
  assert.equal(ruim.geral.pontos_provisorios, 100);
  assert.match(ruim.governanca.leitura, /ampliar o uso/);
});

test("liderança continua em duas lentes e o desalinhamento aparece", () => {
  const r = calcular(todos("E4", {
    LID01P: "E1", LID02P: "E1", LID03P: "E1", LID04P: "E1", LID05P: "E1",
  }));
  assert.equal(r.lideranca.pessoa.pontos_provisorios, 0);
  assert.equal(r.lideranca.organizacao.pontos_provisorios, 100);
  assert.equal(r.lideranca.direcao, "organizacao_a_frente");
  // e o bloco não colapsa as duas numa média que esconda isso
  const lid = r.blocos.find((b) => b.id === "LID");
  assert.notEqual(lid.pontos_provisorios, null);
  assert.equal(r.lideranca.pessoa.pontos_provisorios !== r.lideranca.organizacao.pontos_provisorios, true);
});

test("IA01 — não adoção justificada é E2, e E2 não é inação", () => {
  const it = def.itens.find((i) => i.codigo === "IA01");
  const e1 = it.opcoes.find((o) => o.codigo === "E1").texto;
  const e2 = it.opcoes.find((o) => o.codigo === "E2").texto;
  assert.match(e1, /não há decisão, responsável ou ação definida/);
  assert.match(e2, /decidiu não aplicar IA após analisar processos, riscos e benefícios/);
  assert.match(e2, /condição para revisar/);
  // e os três itens de IA continuam separados
  assert.ok(def.itens.find((i) => i.codigo === "IA02"));
  assert.ok(def.itens.find((i) => i.codigo === "IA03"));
});

test("aceite 20 — a projeção pública não publica nota enquanto E1–E4 não for confirmado", () => {
  const pub = publicar(calcular(todos("E4")));
  assert.equal(pub.nota_publicavel, false);
  assert.equal(pub.geral.pontos, null);
  for (const b of pub.blocos) assert.equal(b.pontos, null);
  assert.equal(pub.lideranca.pessoa.pontos, null);
  assert.equal(pub.lideranca.organizacao.pontos, null);
  assert.match(pub.aviso_pontuacao, /em validação/);
  // nenhum número de maturidade sobra no JSON servido
  assert.doesNotMatch(JSON.stringify(pub), /pontos_provisorios/);
});

test("o gate e as prioridades continuam sendo publicados — são regra aprovada", () => {
  const pub = publicar(calcular(todos("E1", { GOV01: "G2", GOV02: "G3", GOV03: "G3" })));
  assert.equal(pub.governanca.gate, "G2");
  assert.ok(pub.prioridades.length > 0);
  assert.ok(pub.blocos.every((b) => b.distribuicao.E1 > 0), "a distribuição relatada permanece");
});

test("prioridades: no máximo três, só E1/E2, uma por bloco, E1 antes de E2", () => {
  const p = prioridades(todos("E4", { EST01: "E2", LID01P: "E1", PRO01: "E1", IA01: "E2", FUT01: "E2" }));
  assert.equal(p.length, 3);
  assert.equal(new Set(p.map((x) => x.bloco)).size, 3);
  assert.deepEqual(p.slice(0, 2).map((x) => x.degrau), ["E1", "E1"]);
  for (const x of p) assert.ok(["E1", "E2"].includes(x.degrau));
  // quem responde tudo no topo não recebe prioridade fabricada
  assert.equal(prioridades(todos("E4")).length, 0);
});

test("cobertura conta N/A e sem-resposta em campos separados", () => {
  const cov = cobertura(["A", "B", "C", "D"], { A: "E3", B: "NA", C: "E1" });
  assert.equal(cov.considerados, 2);
  assert.equal(cov.na, 1);
  assert.equal(cov.sem_resposta, 1);
  assert.equal(cov.total, 4);
});

test("a devolutiva monta sete páginas e não fabrica cenário sem sinal", () => {
  const respostas = todos("E4");
  const d = montarDevolutiva(publicar(calcular(respostas)), respostas, {}, def);
  assert.equal(d.paginas.length, 7);
  assert.deepEqual(d.paginas.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7]);
  const p6 = d.paginas.find((p) => p.n === 6);
  assert.equal(p6.cenarios.length, 0, "sem prioridade não se oferece cenário");
  assert.equal(d.paginas.find((p) => p.n === 7).vazio, true);
});

test("cada cenário Boomit cita a resposta literal que o sustenta", () => {
  const respostas = todos("E4", { EST01: "E1", PRO01: "E1", IA01: "E1" });
  const d = montarDevolutiva(publicar(calcular(respostas)), respostas, {}, def);
  const p6 = d.paginas.find((p) => p.n === 6);
  assert.ok(p6.cenarios.length >= 1 && p6.cenarios.length <= 3);
  for (const c of p6.cenarios) {
    assert.ok(c.especialidade.nome, "cenário sem especialidade nomeada");
    assert.ok(c.sinais.length >= 1);
    for (const s of c.sinais) {
      const it = def.itens.find((i) => i.codigo === s.codigo);
      const textos = it.opcoes.map((o) => o.texto);
      assert.ok(textos.includes(s.resposta_literal), `${s.codigo}: evidência não é literal`);
    }
    assert.ok(c.evidencia_que_decide.length >= 1);
  }
  // e a prioridade segue a sequência aprovada
  for (const p of p6.prioridades) {
    assert.ok(p.evidencia.resposta_literal && p.hipotese && p.consequencia && p.verificacao);
  }
});

test("a devolutiva usa linguagem condicional e não trata percepção como fato", () => {
  const respostas = todos("E1");
  const d = montarDevolutiva(publicar(calcular(respostas)), respostas, {}, def);
  const p6 = d.paginas.find((p) => p.n === 6);
  for (const p of p6.prioridades) {
    assert.match(p.hipotese, /pode indicar|cenário possível|pode ser lido/i, `${p.codigo}: hipótese sem linguagem condicional`);
    assert.match(p.verificacao, /vale verificar/i, `${p.codigo}: verificação sem convite a verificar`);
  }
  assert.match(d.paginas[0].aviso_de_interpretacao, /percepção situada/);
});

test("todo item pontuável tem leitura autoral — nenhum cai em prioridade sem conteúdo", () => {
  for (const c of PONTUAVEIS) {
    const respostas = todos("E4", { [c]: "E1" });
    const d = montarDevolutiva(publicar(calcular(respostas)), respostas, {}, def);
    const p6 = d.paginas.find((p) => p.n === 6);
    assert.equal(p6.prioridades.length, 1, `${c} não virou prioridade`);
    assert.equal(p6.prioridades[0].codigo, c);
  }
});
