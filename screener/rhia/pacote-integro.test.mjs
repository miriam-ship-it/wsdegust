// =============================================================
// "PACOTE IMPORTADO SEM ALTERAÇÃO" — como propriedade VERIFICÁVEL.
//
// O pacote trouxe dois guardas que estavam no repositório sem nenhum teste a
// usá-los. Aqui eles viram gate:
//
//   1. MANIFESTO-SHA256.txt — recalcula o sha256 dos 11 arquivos do pacote e
//      compara com o manifesto. Qualquer edição no instrumento, no motor, no
//      schema ou nos testes do pacote reprova. (A sanitização do ramo
//      INSUFFICIENT é NOSSA, em `logica.paraPublico`, fora do pacote — é
//      exatamente por isso que este teste continua verde.)
//   2. src/result-contract-v2.schema.json — valida o contrato que a edge grava
//      e o modelo público que o navegador recebe contra o schema declarado.
//
// Validador mínimo próprio: o repositório não ganha dependência nova (regra da
// casa). Cobre o que este schema usa — type, required, const, enum, properties,
// items, minItems/maxItems, minimum/maximum.
// =============================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { instrumento } from "./definicao.mjs";
import { calcularContrato, paraPublico } from "./logica.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PACOTE = path.join(AQUI, "pacote");

// ---------------------------------------------------------------- manifesto

test("MANIFESTO-SHA256: os 11 arquivos do pacote estão byte a byte como vieram", () => {
  const linhas = fs.readFileSync(path.join(PACOTE, "MANIFESTO-SHA256.txt"), "utf8")
    .split("\n").map((l) => l.trim()).filter(Boolean);
  assert.equal(linhas.length, 11, "o manifesto deveria listar 11 arquivos");
  for (const linha of linhas) {
    const m = /^([0-9a-f]{64})\s+(.+)$/.exec(linha);
    assert.ok(m, `linha ilegível no manifesto: ${linha}`);
    const [, esperado, rel] = m;
    const alvo = path.join(PACOTE, rel);
    assert.ok(fs.existsSync(alvo), `arquivo do pacote sumiu: ${rel}`);
    const obtido = createHash("sha256").update(fs.readFileSync(alvo)).digest("hex");
    assert.equal(obtido, esperado, `${rel} foi alterado (o pacote é importado sem alteração)`);
  }
});

test("o instrumento e o motor usados em produção são os arquivos do manifesto", () => {
  // Não basta os arquivos estarem íntegros: é deles que o núcleo lê.
  assert.equal(instrumento.instrument_id, "boomit_rh_ia_maturity_v1");
  assert.equal(instrumento.items.length, 30);
  const src = fs.readFileSync(path.join(AQUI, "logica.mjs"), "utf8");
  assert.ok(src.includes('from "./pacote/src/output-engine-v2.mjs"'), "logica.mjs deve importar o motor do pacote");
});

// ---------------------------------------------------------------- schema

/** Validador mínimo de JSON Schema — só o subconjunto que este schema usa. */
function validar(schema, valor, caminho = "$", erros = []) {
  const tipos = {
    object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    array: Array.isArray,
    string: (v) => typeof v === "string",
    integer: (v) => Number.isInteger(v),
    number: (v) => typeof v === "number",
    boolean: (v) => typeof v === "boolean",
  };
  if (schema.type && tipos[schema.type] && !tipos[schema.type](valor)) {
    erros.push(`${caminho}: esperado ${schema.type}`);
    return erros;
  }
  if ("const" in schema && valor !== schema.const) erros.push(`${caminho}: esperado const ${schema.const}, veio ${valor}`);
  if (schema.enum && !schema.enum.includes(valor)) erros.push(`${caminho}: "${valor}" fora do enum`);
  if (schema.required) {
    for (const k of schema.required) {
      if (!tipos.object(valor) || valor[k] === undefined) erros.push(`${caminho}: falta a chave obrigatória "${k}"`);
    }
  }
  if (schema.properties && tipos.object(valor)) {
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (valor[k] !== undefined) validar(sub, valor[k], `${caminho}.${k}`, erros);
    }
  }
  if (Array.isArray(valor)) {
    if (schema.minItems !== undefined && valor.length < schema.minItems) erros.push(`${caminho}: ${valor.length} < minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && valor.length > schema.maxItems) erros.push(`${caminho}: ${valor.length} > maxItems ${schema.maxItems}`);
    if (schema.items) valor.forEach((v, i) => validar(schema.items, v, `${caminho}[${i}]`, erros));
  }
  if (typeof valor === "number") {
    if (schema.minimum !== undefined && valor < schema.minimum) erros.push(`${caminho}: ${valor} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && valor > schema.maximum) erros.push(`${caminho}: ${valor} > maximum ${schema.maximum}`);
  }
  return erros;
}

const SCHEMA = JSON.parse(fs.readFileSync(path.join(PACOTE, "src", "result-contract-v2.schema.json"), "utf8"));
const CTX = instrumento.items.filter((it) => it.kind === "context");
function respostas(nivel, { over = {}, ctx = [0, 2, 2] } = {}) {
  const out = {};
  CTX.forEach((it, i) => { out[it.id] = it.options[ctx[i]].id; });
  for (const it of instrumento.items) if (it.kind !== "context") out[it.id] = nivel;
  return { ...out, ...over };
}

test("o validador mínimo sabe reprovar (senão não prova nada)", () => {
  assert.deepEqual(validar({ type: "object", required: ["a"] }, {}), ['$: falta a chave obrigatória "a"']);
  assert.equal(validar({ const: "2.0.0-pilot" }, "outra").length, 1);
  assert.equal(validar({ enum: ["A", "B"] }, "C").length, 1);
  assert.equal(validar({ type: "array", maxItems: 2 }, [1, 2, 3]).length, 1);
  assert.equal(validar({ type: "object", properties: { n: { type: "integer", maximum: 24 } } }, { n: 25 }).length, 1);
  assert.deepEqual(validar({ type: "object", required: ["a"] }, { a: 1 }), []);
});

test("o contrato do motor obedece ao result-contract-v2.schema.json em todos os ramos", () => {
  const casos = {
    "E1 uniforme": respostas("E1"),
    "E3 uniforme": respostas("E3"),
    "E4 uniforme": respostas("E4"),
    "CTX01 = texto livre": respostas("E2", { ctx: [4, 1, 1], over: { CTX01_OTHER_TEXT: "Consultora de pessoas" } }),
  };
  for (const [rotulo, resp] of Object.entries(casos)) {
    const contrato = calcularContrato({ respostas: resp });
    assert.deepEqual(validar(SCHEMA, contrato), [], `${rotulo}: contrato fora do schema`);
  }
});

test("o ramo INSUFFICIENT também obedece ao schema — é o que a sanitização de paraPublico garante", () => {
  // Dois NA na mesma dimensão: o motor não sintetiza. É aqui que o modelo cru
  // trazia weakestBp/rank em governance/evidence; `paraPublico` normaliza na
  // NOSSA fronteira, e o resultado tem de continuar cabendo no schema do pacote.
  const dim = instrumento.dimensions[2];
  const over = Object.fromEntries(dim.items.slice(0, 2).map((id) => [id, "NA"]));
  const contrato = calcularContrato({ respostas: respostas("E3", { over }) });
  assert.equal(contrato.public.status, "INSUFFICIENT");
  assert.deepEqual(validar(SCHEMA, contrato), [], "contrato INSUFFICIENT fora do schema");

  const pub = paraPublico(contrato);
  assert.deepEqual(validar(SCHEMA.properties.public, pub), [], "modelo público INSUFFICIENT fora do schema");
  // e a sanitização entrega exatamente o que o schema declara — nada de interno
  assert.deepEqual(Object.keys(pub.governance).sort(), ["id", "label", "text"]);
  assert.deepEqual(Object.keys(pub.evidence).sort(), ["status", "validItems"]);
  assert.ok(!JSON.stringify(pub).includes("Bp"), "pontos-base no modelo público");
});

test("o modelo público do ramo normal também cabe no schema (sem internal)", () => {
  const pub = paraPublico(calcularContrato({ respostas: respostas("E3") }));
  assert.deepEqual(validar(SCHEMA.properties.public, pub), []);
  assert.equal(pub.internal, undefined);
  assert.match(pub.emitido_em, /^\d{4}-\d{2}-\d{2}$/);
});

/** Perfil desigual: estratégia e influência no topo, desenvolvimento e IA atrás. */
function respostasDesiguais() {
  const porDimensao = { EST: "E4", INF: "E4", TAL: "E3", DAD: "E3", DES: "E2", IA: "E2" };
  const out = {};
  CTX.forEach((it, i) => { out[it.id] = it.options[[0, 2, 2][i]].id; });
  for (const it of instrumento.items) {
    if (it.kind === "scored") out[it.id] = porDimensao[it.dimension];
    if (it.kind === "governance_gate") out[it.id] = "E3";
  }
  return out;
}

test("perfil desigual exercita os arrays de verdade: maxItems 2 e os sub-schemas", () => {
  // Os outros casos do schema são uniformes, e neles supporters/limiters/tensions
  // vêm SEMPRE vazios — o `maxItems: 2` do contrato nunca era checado de fato.
  const contrato = calcularContrato({ respostas: respostasDesiguais() });
  const pub = paraPublico(contrato);

  assert.equal(pub.status, "ORIENTATIVE_HYPOTHESIS");
  assert.equal(pub.supporters.length, 2, "o perfil precisa gerar dois sustentadores");
  assert.equal(pub.limiters.length, 2, "o perfil precisa gerar dois limitadores");
  assert.equal(pub.tensions.length, 2, "o perfil precisa gerar duas tensões");

  assert.deepEqual(validar(SCHEMA, contrato), [], "contrato desigual fora do schema");
  assert.deepEqual(validar(SCHEMA.properties.public, pub), [], "modelo público desigual fora do schema");

  // Forma de cada item — o schema declara os arrays, mas não o conteúdo.
  for (const s of pub.supporters) assert.deepEqual(Object.keys(s).sort(), ["evidence", "name"]);
  for (const l of pub.limiters) assert.deepEqual(Object.keys(l).sort(), ["action", "name", "risk"]);
  for (const t of pub.tensions) assert.deepEqual(Object.keys(t).sort(), ["label", "text"]);

  // O motor tinha três candidatas a tensão neste perfil; o corte em duas é regra
  // do método (ARQUITETURA §7), não acaso do caso escolhido.
  assert.ok(!JSON.stringify(pub).includes("Bp"), "pontos-base no modelo público");
});
