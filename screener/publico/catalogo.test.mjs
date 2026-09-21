// Catracas de CONTEÚDO: o instrumento tem que ser o documento aprovado, e não
// uma versão parecida. Estes testes cobrem os critérios de aceite 15 a 21.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { definicao, itensAtivos, item, projecaoPublica, notaPublicavel } from "./definicao.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const fonte = JSON.parse(readFileSync(join(AQUI, "fonte", "blueprint-40-final.json"), "utf8"));
const def = definicao();

test("aceite 15 — são exatamente 40 questões, todas ativas", () => {
  assert.equal(def.itens.length, 40);
  assert.equal(itensAtivos(def).length, 40);
  assert.equal(new Set(def.itens.map((i) => i.codigo)).size, 40);
});

test("os blocos têm a contagem aprovada", () => {
  const conta = {};
  for (const i of def.itens) conta[i.bloco] = (conta[i.bloco] || 0) + 1;
  assert.deepEqual(conta, { CTX: 3, EST: 6, LID: 10, PRO: 6, IA: 6, FUT: 6, GOV: 3 });
});

test("os cinco blocos pontuados somam 100% e pesam 20% cada", () => {
  const pont = def.blocos.filter((b) => b.tipo === "pontuado");
  assert.equal(pont.length, 5);
  for (const b of pont) assert.equal(b.peso, 0.2);
  assert.equal(Math.round(pont.reduce((s, b) => s + b.peso, 0) * 100), 100);
});

test("aceite 16 — alternativas literais, associadas ao código correto", () => {
  // Toda alternativa do blueprint tem que estar, verbatim, no item de mesmo
  // código. FUT04 é a exceção rastreada (ver correcoes_rastreadas).
  const porCodigo = {};
  for (const a of fonte.alternativas) (porCodigo[a.codigo] ||= []).push(a);
  for (const [codigo, alts] of Object.entries(porCodigo)) {
    if (codigo === "FUT04") continue;
    const it = item(codigo, def);
    assert.ok(it, `item ${codigo} ausente`);
    assert.deepEqual(
      it.opcoes.map((o) => [o.codigo, o.texto]),
      alts.map((a) => [a.opcao, a.texto]),
      `alternativas de ${codigo} divergem do blueprint`
    );
  }
});

test("os enunciados são literais ao blueprint (EST06 pela aba Documento aprovado)", () => {
  for (const r of fonte.questoes_bruto) {
    const it = item(r[1], def);
    if (r[1] === "EST06") {
      assert.equal(r[4], "", "EST06 deixou de estar vazio no blueprint — revisar a correção rastreada");
      assert.match(it.pergunta, /^Como a área responsável por gente e gestão prepara as lideranças/);
      continue;
    }
    assert.equal(it.pergunta, r[4], `enunciado de ${r[1]} divergente`);
  }
});

test("as duas correções do blueprint estão registradas com origem", () => {
  const cods = def.correcoes_rastreadas.map((c) => c.codigo).sort();
  assert.deepEqual(cods, ["EST06", "FUT04"]);
  for (const c of def.correcoes_rastreadas) {
    assert.ok(c.motivo && c.origem, `correção de ${c.codigo} sem motivo/origem`);
  }
});

test("aceite 21 — FUT04 e FUT05 deixaram de compartilhar o mesmo conjunto", () => {
  const a = item("FUT04", def).opcoes.map((o) => o.texto);
  const b = item("FUT05", def).opcoes.map((o) => o.texto);
  assert.notDeepEqual(a, b);
  // FUT05 permanece com o conjunto do blueprint (tempo liberado).
  assert.match(b[0], /percentual automatizado/);
  // FUT04 recebeu o conjunto que corresponde ao próprio enunciado.
  assert.match(a[0], /A preparação começa quando a nova demanda/);
  assert.equal(a.length, 5);
  assert.equal(a.at(-1), "Não tenho exposição suficiente para responder.");
});

test("aceite 17 — CTX não pontua e não tem N/A", () => {
  for (const i of def.itens.filter((x) => x.bloco === "CTX")) {
    assert.equal(i.pontua, false);
    assert.equal(i.gate, false);
    for (const o of i.opcoes) {
      assert.equal(o.tratamento, "Não pontua");
      assert.notEqual(o.codigo, "NA");
    }
  }
});

test("todo item pontuável tem E1–E4 e exatamente um N/A", () => {
  for (const i of def.itens.filter((x) => x.pontua)) {
    const cods = i.opcoes.map((o) => o.codigo);
    assert.deepEqual(cods, ["E1", "E2", "E3", "E4", "NA"], `opções de ${i.codigo}`);
    assert.equal(i.opcoes.at(-1).texto, "Não tenho exposição suficiente para responder.");
    assert.match(i.opcoes.at(-1).tratamento, /Fora do cálculo/);
  }
});

test("aceite 19 — governança é gate, com G1–G3 e sem N/A", () => {
  const gov = def.itens.filter((x) => x.gate);
  assert.equal(gov.length, 3);
  for (const i of gov) {
    assert.equal(i.pontua, false, `${i.codigo} não pode entrar na nota`);
    assert.deepEqual(i.opcoes.map((o) => o.codigo), ["G1", "G2", "G3"]);
    for (const o of i.opcoes) assert.match(o.tratamento, /Gate de governança/);
  }
});

test("liderança mantém as duas lentes, cinco itens cada", () => {
  const lid = def.itens.filter((i) => i.bloco === "LID");
  assert.equal(lid.filter((i) => i.codigo.endsWith("P")).length, 5);
  assert.equal(lid.filter((i) => i.codigo.endsWith("O")).length, 5);
});

test("aceite 20 — E1–E4 segue sem confirmação e a nota não é publicável", () => {
  assert.equal(def.pontuacao.e1_e4_confirmado, false);
  assert.equal(notaPublicavel(def), false);
  assert.match(def.pontuacao.aviso, /PROVISÓRIO/);
});

test("a projeção pública é uma lista branca de chaves — nada de gabarito", () => {
  // Por CHAVE, não por substring: "regras de retenção" é texto legítimo de uma
  // alternativa de governança, e um teste por substring reprovaria o conteúdo
  // aprovado em vez do vazamento.
  const p = projecaoPublica(def);
  assert.deepEqual(Object.keys(p).sort(), ["blocos", "id", "itens", "nome", "versao_questionario"]);
  for (const i of p.itens) {
    assert.deepEqual(Object.keys(i).sort(), ["bloco", "codigo", "lente", "opcoes", "ordem", "pergunta"]);
    for (const o of i.opcoes) assert.deepEqual(Object.keys(o).sort(), ["codigo", "texto"]);
  }
  for (const b of p.blocos) assert.deepEqual(Object.keys(b).sort(), ["id", "nome"]);
  // e continua entregando os 40 itens com todas as alternativas
  assert.equal(p.itens.length, 40);
  assert.equal(p.itens.reduce((s, i) => s + i.opcoes.length, 0), 196);
});

test("o objetivo analítico de todo item existe e fica fora da tela", () => {
  for (const i of def.itens) assert.ok(i.objetivo_interno.length > 3, i.codigo);
});

test("a fonte aprovada está congelada por sha256", () => {
  assert.equal(def.fonte_aprovada.blueprint_sha256, fonte._fonte.sha256);
  assert.equal(def.fonte_aprovada.blueprint_sha256.length, 64);
});
