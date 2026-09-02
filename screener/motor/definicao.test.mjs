// Checksum e projeção pública sanitizada (spec §14.3 / §17.7 / decisões 01-02/09).
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento, checksum, canonicalize, projecaoPublica } from "./definicao.mjs";

test("checksum é estável entre execuções", () => {
  assert.equal(checksum(), checksum());
  assert.match(checksum(), /^[0-9a-f]{64}$/);
});

test("mudança no instrumento altera o checksum", () => {
  const base = checksum();
  const mutado = structuredClone(instrumento);
  mutado.items[0].prompt = mutado.items[0].prompt + " (alterado)";
  assert.notEqual(checksum(mutado), base);
});

test("mudança de pontuação altera o checksum", () => {
  const base = checksum();
  const mutado = structuredClone(instrumento);
  mutado.items[0].options[0].score_bp = 1;
  assert.notEqual(checksum(mutado), base);
});

test("canonicalize é insensível à ordem das chaves", () => {
  const a = canonicalize({ x: 1, y: [{ b: 2, a: 1 }] });
  const b = canonicalize({ y: [{ a: 1, b: 2 }], x: 1 });
  assert.equal(a, b);
});

test("projeção pública tem 30 itens, cada um com id, prompt e 5 opções {id,text}", () => {
  const { items } = projecaoPublica();
  assert.equal(items.length, 30);
  for (const it of items) {
    assert.deepEqual(Object.keys(it).sort(), ["id", "options", "prompt"]);
    assert.equal(typeof it.id, "string");
    assert.equal(typeof it.prompt, "string");
    assert.equal(it.options.length, 5);
    for (const op of it.options) {
      // ESTRUTURAL: cada opção só pode ter id e text — nada de código, ponto, estágio.
      assert.deepEqual(Object.keys(op).sort(), ["id", "text"]);
    }
  }
});

test("projeção pública NÃO vaza pontos, estágios, pesos, dimensões, resposta ideal nem regras", () => {
  const { items } = projecaoPublica();
  const blob = JSON.stringify(items);
  for (const proibido of [
    "score_bp", "stage", "E1", "E2", "E3", "E4",
    "dimension", "pair_code", "lens", "block",
    "weight", "peso", "is_na", "scoring", "band", "matrix",
  ]) {
    assert.ok(!blob.includes(proibido), `projeção pública vazou "${proibido}"`);
  }
  // e não expõe os códigos internos dos itens (que revelam dimensão)
  for (const it of instrumento.items) {
    assert.ok(!blob.includes(it.code), `projeção pública vazou o código ${it.code}`);
  }
});

test("mapping (edge-only) traduz id opaco → item/estágio e cobre todas as opções", () => {
  const { items, mapping } = projecaoPublica(instrumento, { sessionSeed: "s-abc" });
  let totalOpcoes = 0;
  for (const it of items) {
    assert.ok(mapping.items[it.id], "item sem mapping");
    for (const op of it.options) {
      const alvo = mapping.options[op.id];
      assert.ok(alvo, "opção sem mapping");
      assert.equal(alvo.item, mapping.items[it.id]);
      assert.ok(["E1", "E2", "E3", "E4", "NA"].includes(alvo.stage));
      totalOpcoes++;
    }
  }
  assert.equal(totalOpcoes, 150); // 30 itens × 5
});

test("ordem fixa por default: opções seguem E1..E4,NA (via mapping)", () => {
  const { items, mapping } = projecaoPublica(); // shuffle desligado
  const primeiro = items[0];
  const estagios = primeiro.options.map((op) => mapping.options[op.id].stage);
  assert.deepEqual(estagios, ["E1", "E2", "E3", "E4", "NA"]);
});

test("embaralhamento é determinístico por semente e é uma permutação", () => {
  const a = projecaoPublica(instrumento, { sessionSeed: "sem-1", shuffle: true });
  const b = projecaoPublica(instrumento, { sessionSeed: "sem-1", shuffle: true });
  // determinístico: mesma semente → ids e ordem idênticos
  assert.deepEqual(a.items, b.items);
  // permutação: mesmo conjunto de estágios, possivelmente outra ordem
  for (const it of a.items) {
    const estagios = it.options.map((op) => a.mapping.options[op.id].stage).sort();
    assert.deepEqual(estagios, ["E1", "E2", "E3", "E4", "NA"]);
  }
  // sementes diferentes tendem a produzir ao menos uma ordem diferente
  const c = projecaoPublica(instrumento, { sessionSeed: "sem-2", shuffle: true });
  const ordemA = a.items.map((it) => it.options.map((op) => a.mapping.options[op.id].stage).join(""));
  const ordemC = c.items.map((it) => it.options.map((op) => c.mapping.options[op.id].stage).join(""));
  assert.notDeepEqual(ordemA, ordemC);
});
