// Checksum e projeção pública sanitizada (spec §14.3 / §17.7 / decisões 01-02/09).
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento, checksum, canonicalize, projecaoPublica } from "./definicao.mjs";

test("checksum é estável entre execuções", () => {
  assert.equal(checksum(), checksum());
  assert.match(checksum(), /^[0-9a-f]{64}$/);
});

test("mudança no instrumento altera o checksum (texto e pontuação)", () => {
  const base = checksum();
  const m1 = structuredClone(instrumento);
  m1.items[0].prompt += " (alterado)";
  assert.notEqual(checksum(m1), base);
  const m2 = structuredClone(instrumento);
  m2.items[0].options[0].score_bp = 1;
  assert.notEqual(checksum(m2), base);
});

test("canonicalize é insensível à ordem das chaves", () => {
  assert.equal(canonicalize({ x: 1, y: [{ b: 2, a: 1 }] }), canonicalize({ y: [{ a: 1, b: 2 }], x: 1 }));
});

test("projeção pública: versão, consentimento e 3 blocos na ordem Pessoa→Empresa→IA", () => {
  const p = projecaoPublica();
  assert.equal(p.instrument.version, "1.0.0");
  assert.equal(p.instrument.code, "SCREENER_EMPRESA_IA_V1");
  assert.ok(p.consent.intended_use.length > 0);
  assert.ok(Array.isArray(p.consent.prohibited_uses) && p.consent.prohibited_uses.length > 0);
  assert.deepEqual(p.blocks.map((b) => b.code), ["individual", "organization", "ai"]);
  for (const b of p.blocks) {
    assert.ok(b.name && b.instruction && b.reference_period, `bloco ${b.code} incompleto`);
    assert.equal(b.items.length, 10);
  }
});

test("projeção pública: 30 itens no total, cada opção só {id,text}", () => {
  const p = projecaoPublica();
  const items = p.blocks.flatMap((b) => b.items);
  assert.equal(items.length, 30);
  let opcoes = 0;
  for (const it of items) {
    assert.deepEqual(Object.keys(it).sort(), ["id", "options", "prompt"]);
    assert.equal(it.options.length, 5);
    for (const op of it.options) {
      assert.deepEqual(Object.keys(op).sort(), ["id", "text"]);
      opcoes++;
    }
  }
  assert.equal(opcoes, 150);
});

test("instrução do bloco substitui {assessment_unit_name} quando fornecido; mantém token quando não", () => {
  const semNome = projecaoPublica();
  const org = semNome.blocks.find((b) => b.code === "organization");
  assert.ok(org.instruction.includes("{assessment_unit_name}"));
  const comNome = projecaoPublica(instrumento, { assessmentUnitName: "Comercial" });
  const org2 = comNome.blocks.find((b) => b.code === "organization");
  assert.ok(!org2.instruction.includes("{assessment_unit_name}"));
  assert.ok(org2.instruction.includes("Comercial"));
});

test("ordem das opções é fixa (E1..E4,NA via mapping)", () => {
  const p = projecaoPublica();
  const primeiro = p.blocks[0].items[0];
  const estagios = primeiro.options.map((op) => p.mapping.options[op.id].stage);
  assert.deepEqual(estagios, ["E1", "E2", "E3", "E4", "NA"]);
});

test("embaralhamento produtivo é IMPOSSÍVEL: shuffle=true lança erro", () => {
  assert.throws(() => projecaoPublica(instrumento, { sessionSeed: "s", shuffle: true }), /não é suportado|fixa/i);
});

test("projeção pública NÃO contém chaves privadas (checagem estrutural)", () => {
  const p = projecaoPublica(instrumento, { sessionSeed: "s", assessmentUnitName: "Unidade" });
  const publico = { instrument: p.instrument, consent: p.consent, blocks: p.blocks }; // exclui mapping (edge-only)
  const permitidas = new Set([
    "instrument", "code", "version", "consent", "intended_use", "prohibited_uses",
    "blocks", "name", "instruction", "reference_period", "items", "id", "prompt", "options", "text",
  ]);
  const chaves = new Set();
  (function coletar(v) {
    if (Array.isArray(v)) return v.forEach(coletar);
    if (v && typeof v === "object") for (const k of Object.keys(v)) { chaves.add(k); coletar(v[k]); }
  })(publico);
  const vazadas = [...chaves].filter((k) => !permitidas.has(k));
  assert.deepEqual(vazadas, [], `chaves privadas vazadas: ${vazadas.join(", ")}`);
});

test("projeção pública NÃO vaza pontos, códigos internos, action_library nem códigos de item", () => {
  const p = projecaoPublica(instrumento, { sessionSeed: "s", assessmentUnitName: "Unidade" });
  const blob = JSON.stringify({ instrument: p.instrument, consent: p.consent, blocks: p.blocks });
  for (const token of ["score_bp", "stage_points_bp", "action_library", "matrix_cut_bp", "pair_code"]) {
    assert.ok(!blob.includes(token), `vazou "${token}"`);
  }
  for (const it of instrumento.items) {
    assert.ok(!blob.includes(it.code), `vazou o código interno ${it.code}`);
  }
});

test("mapping (edge-only) traduz id opaco → item/estágio e cobre as 150 opções", () => {
  const p = projecaoPublica(instrumento, { sessionSeed: "s-abc" });
  let total = 0;
  for (const b of p.blocks) {
    for (const it of b.items) {
      assert.ok(p.mapping.items[it.id]);
      for (const op of it.options) {
        const alvo = p.mapping.options[op.id];
        assert.ok(alvo && alvo.item === p.mapping.items[it.id]);
        assert.ok(["E1", "E2", "E3", "E4", "NA"].includes(alvo.stage));
        total++;
      }
    }
  }
  assert.equal(total, 150);
});
