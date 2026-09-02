// Catracas de conteúdo do instrumento (spec §4.1 / §17.1).
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento } from "./definicao.mjs";

const PONTOS_VALIDOS = new Map([
  ["E1", 0],
  ["E2", 3333],
  ["E3", 6667],
  ["E4", 10000],
  ["NA", null],
]);

test("exatamente 30 itens, códigos únicos", () => {
  assert.equal(instrumento.items.length, 30);
  const codes = new Set(instrumento.items.map((i) => i.code));
  assert.equal(codes.size, 30);
  assert.equal(instrumento.instrument.total_items, 30);
});

test("10 itens por bloco", () => {
  const por = {};
  for (const it of instrumento.items) por[it.block] = (por[it.block] || 0) + 1;
  assert.deepEqual(por, { individual: 10, organization: 10, ai: 10 });
});

test("exatamente 5 opções por item, ordem E1,E2,E3,E4,NA", () => {
  for (const it of instrumento.items) {
    assert.equal(it.options.length, 5, `${it.code} não tem 5 opções`);
    const codes = it.options.map((o) => o.code);
    assert.deepEqual(codes, ["E1", "E2", "E3", "E4", "NA"], `${it.code} ordem/códigos errados`);
    assert.equal(it.options[4].code, "NA", `${it.code}: N/A não é a última`);
  }
});

test("pontos válidos apenas em 0, 3333, 6667, 10000, null", () => {
  for (const it of instrumento.items) {
    for (const op of it.options) {
      assert.equal(op.score_bp, PONTOS_VALIDOS.get(op.code), `${it.code}/${op.code} ponto errado`);
    }
    assert.equal(it.options[4].is_na, true, `${it.code}: N/A sem is_na`);
  }
});

test("E1→E4 estritamente crescentes; sem pontos repetidos", () => {
  for (const it of instrumento.items) {
    const pts = it.options.slice(0, 4).map((o) => o.score_bp);
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i] > pts[i - 1], `${it.code}: E1–E4 não crescente`);
    }
    assert.equal(new Set(pts).size, 4, `${it.code}: pontos repetidos`);
  }
});

test("2 itens por dimensão em cada lente aplicável", () => {
  const conta = {};
  for (const it of instrumento.items) {
    const key = `${it.block}/${it.dimension}`;
    conta[key] = (conta[key] || 0) + 1;
  }
  for (const [key, n] of Object.entries(conta)) {
    assert.equal(n, 2, `${key} tem ${n} itens (esperado 2)`);
  }
});

test("pair_code forma par Pessoa × Empresa na mesma dimensão", () => {
  const ind = instrumento.items.filter((i) => i.block === "individual");
  const org = instrumento.items.filter((i) => i.block === "organization");
  for (const i of ind) {
    assert.ok(i.pair_code, `${i.code} sem pair_code`);
    const par = org.filter((o) => o.pair_code === i.pair_code);
    assert.equal(par.length, 1, `${i.pair_code}: par Empresa não é único`);
    assert.equal(par[0].dimension, i.dimension, `${i.pair_code}: dimensões divergentes`);
  }
  for (const a of instrumento.items.filter((i) => i.block === "ai")) {
    assert.equal(a.pair_code, null, `${a.code}: IA não deveria ter pair_code`);
  }
});

test("todos os enunciados e textos de opção são não-vazios", () => {
  for (const it of instrumento.items) {
    assert.ok(it.prompt && it.prompt.trim().length > 0, `${it.code} sem enunciado`);
    for (const op of it.options) {
      assert.ok(op.text && op.text.trim().length > 0, `${it.code}/${op.code} sem texto`);
    }
  }
});
