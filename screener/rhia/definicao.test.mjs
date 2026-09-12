// Definição rhia: apresentação pública sanitizada, literalidade, checksum e
// paridade do canonicalize com o motor V1.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { instrumento, canonicalize, checksum, GRUPOS, apresentacaoPublica } from "./definicao.mjs";
import { canonicalize as canonicalizeMotor } from "../motor/definicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ---------- identidade ----------
test("instrumento: identidade e composição 3 + 24 + 3", () => {
  assert.equal(instrumento.instrument_id, "boomit_rh_ia_maturity_v1");
  assert.equal(instrumento.instrument_version, "1.0.0-rc.1");
  assert.equal(instrumento.items.length, 30);
  assert.equal(instrumento.items.filter((x) => x.kind === "context").length, 3);
  assert.equal(instrumento.items.filter((x) => x.kind === "scored").length, 24);
  assert.equal(instrumento.items.filter((x) => x.kind === "governance_gate").length, 3);
});

// ---------- canonicalize ----------
test("canonicalize local == canonicalize do motor (instrumento inteiro e casos sintéticos)", () => {
  assert.equal(canonicalize(instrumento), canonicalizeMotor(instrumento));
  const casos = [
    null, 1, "a\"b", true, [], {}, [1, [2, { z: 1, a: [null] }]],
    { x: 1, y: [{ b: 2, a: 1 }], "é": "ç", A: 0, a: 0, "1": "n" },
  ];
  for (const c of casos) assert.equal(canonicalize(c), canonicalizeMotor(c));
});

test("canonicalize é insensível à ordem das chaves e sensível ao conteúdo", () => {
  assert.equal(canonicalize({ x: 1, y: [{ b: 2, a: 1 }] }), canonicalize({ y: [{ a: 1, b: 2 }], x: 1 }));
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]));
});

// ---------- checksum ----------
test("checksum: hex64, estável e IGUAL a createHash sha256 sobre canonicalize do motor", async () => {
  const a = await checksum();
  const b = await checksum();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  const esperado = createHash("sha256").update(canonicalizeMotor(instrumento)).digest("hex");
  assert.equal(a, esperado);
});

test("checksum muda quando o instrumento muda (texto e escala)", async () => {
  const base = await checksum();
  const m1 = structuredClone(instrumento);
  m1.items[0].prompt += " (alterado)";
  assert.notEqual(await checksum(m1), base);
  const m2 = structuredClone(instrumento);
  m2.scale.E2 = 1;
  assert.notEqual(await checksum(m2), base);
});

// ---------- apresentação pública ----------
test("apresentação: instrumento, 3 grupos na ordem, 30 itens ordenados por order", () => {
  const p = apresentacaoPublica();
  assert.deepEqual(p.instrument, {
    id: "boomit_rh_ia_maturity_v1",
    version: "1.0.0-rc.1",
    title: instrumento.title,
    purpose: instrumento.purpose,
    disclaimer: instrumento.disclaimer,
    estimated_minutes: "8–10",
  });
  assert.deepEqual(p.groups, [
    { code: "contexto", name: "Contexto" },
    { code: "praticas", name: "Práticas" },
    { code: "governanca", name: "Governança" },
  ]);
  assert.deepEqual(GRUPOS.map((g) => g.code), ["contexto", "praticas", "governanca"]);
  assert.equal(p.items.length, 30);
  assert.deepEqual(p.items.map((it) => it.order), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.deepEqual(p.items.slice(0, 3).map((it) => it.group), ["contexto", "contexto", "contexto"]);
  assert.deepEqual(p.items.slice(27).map((it) => it.group), ["governanca", "governanca", "governanca"]);
  assert.ok(p.items.slice(3, 27).every((it) => it.group === "praticas"));
});

test("apresentação: ordem é do campo order mesmo com JSON embaralhado", () => {
  const def = structuredClone(instrumento);
  def.items.reverse();
  const p = apresentacaoPublica(def);
  assert.deepEqual(p.items.map((it) => it.id), instrumento.items.map((it) => it.id));
});

test("apresentação: literalidade — prompt e labels idênticos ao JSON, NA sempre presente onde definido", () => {
  const p = apresentacaoPublica();
  for (const it of instrumento.items) {
    const pub = p.items.find((x) => x.id === it.id);
    assert.ok(pub, `item ${it.id} ausente`);
    assert.equal(pub.prompt, it.prompt);
    assert.equal(pub.kind, it.kind);
    assert.deepEqual(pub.options, it.options.map((op) => ({ id: op.id, label: op.label })));
    if (it.kind !== "context") assert.equal(pub.options.at(-1).id, "NA");
  }
});

test("apresentação: dimension_name humano só em scored; conditional_field copiado em CTX01", () => {
  const p = apresentacaoPublica();
  const nomes = new Set(instrumento.dimensions.map((d) => d.name));
  for (const it of p.items) {
    if (it.kind === "scored") {
      assert.ok(nomes.has(it.dimension_name), `dimension_name inválido em ${it.id}`);
    } else {
      assert.ok(!("dimension_name" in it), `dimension_name vazou em ${it.id}`);
    }
  }
  const ctx01 = p.items.find((it) => it.id === "CTX01");
  assert.deepEqual(ctx01.conditional_field, instrumento.items.find((it) => it.id === "CTX01").conditional_field);
  assert.equal(ctx01.conditional_field.id, "CTX01_OTHER_TEXT");
  assert.equal(p.items.filter((it) => it.conditional_field).length, 1);
});

test("apresentação NÃO contém chaves privadas (checagem estrutural)", () => {
  const p = apresentacaoPublica();
  const permitidas = new Set([
    "instrument", "id", "version", "title", "purpose", "disclaimer", "estimated_minutes",
    "groups", "code", "name",
    "items", "order", "kind", "group", "dimension_name", "prompt", "options", "label",
    // conditional_field, verbatim do JSON
    "conditional_field", "show_when", "option_id", "type", "required_when_visible", "trim",
    "min_length", "max_length", "clear_when_hidden", "scored",
  ]);
  const chaves = new Set();
  (function coletar(v) {
    if (Array.isArray(v)) return v.forEach(coletar);
    if (v && typeof v === "object") for (const k of Object.keys(v)) { chaves.add(k); coletar(v[k]); }
  })(p);
  const vazadas = [...chaves].filter((k) => !permitidas.has(k));
  assert.deepEqual(vazadas, [], `chaves privadas vazadas: ${vazadas.join(", ")}`);
  for (const proibida of ["scale", "facet", "scenario", "dimension", "gate", "weights", "bp", "required", "assessment_unit", "validation_status"]) {
    assert.ok(!chaves.has(proibida), `chave proibida na apresentação: ${proibida}`);
  }
});

test("apresentação NÃO vaza pontos, facetas nem códigos de dimensão como valores", () => {
  const blob = JSON.stringify(apresentacaoPublica());
  for (const token of ["3333", "6667", "10000", "strategy_translation", "DATA_PRIVACY", "\"EST\"", "\"TAL\"", "\"IA\""]) {
    assert.ok(!blob.includes(token), `vazou "${token}"`);
  }
});

test("apresentação é uma cópia: mutar a saída não altera o instrumento", () => {
  const p = apresentacaoPublica();
  p.items[0].options[0].label = "x";
  p.items[0].conditional_field.id = "y";
  assert.notEqual(instrumento.items[0].options[0].label, "x");
  assert.equal(instrumento.items[0].conditional_field.id, "CTX01_OTHER_TEXT");
});

// ---------- runtime-agnóstico ----------
test("definicao.mjs, logica.mjs e o motor do pacote NÃO importam nada de node:", () => {
  const arquivos = [
    "definicao.mjs",
    "logica.mjs",
    "pacote/src/output-engine-v2.mjs",
    "pacote/src/output-definition-v2.mjs",
  ];
  for (const f of arquivos) {
    const src = fs.readFileSync(path.join(AQUI, f), "utf8");
    assert.ok(!/from\s+["']node:/.test(src), `${f} importa de node:`);
    assert.ok(!/import\s*\(\s*["']node:/.test(src), `${f} importa dinamicamente de node:`);
    assert.ok(!/require\s*\(/.test(src), `${f} usa require()`);
  }
});
