// TESTES ESTÁTICOS DO GERADOR V2 (não executam SQL).
// Provam: geração determinística (sem drift com o arquivo commitado), checksum
// coerente com o que a edge computa (checksumV2), e presença das guardas.
// O COMPORTAMENTO do PL/pgSQL é provado em behavioral/carga-v2.behavioral.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { canonicalize } from "../motor/definicao.mjs";
import { instrumentoV2, checksumV2 } from "../edge/definicao-v2.mjs";
import { gerarCargaV2SQL } from "./gerar-carga-v2.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const SQL_GERADO = path.join(RAIZ, "supabase/migrations/20260907120000_screener_v2_carga_inativa.sql");

test("[estático] sem drift: o SQL commitado é idêntico ao regenerado da fonte", () => {
  const atual = fs.readFileSync(SQL_GERADO, "utf8").replace(/\r\n/g, "\n");
  const fresco = gerarCargaV2SQL().replace(/\r\n/g, "\n");
  assert.equal(atual, fresco, "carga v2 gerada divergiu do arquivo commitado — regenere");
});

test("[estático] checksum embutido = checksumV2 da edge (mesmo canonicalize)", async () => {
  const sql = gerarCargaV2SQL();
  const sum = await checksumV2();
  assert.ok(sql.includes(sum), "checksum da edge (checksumV2) ausente no SQL");
  const partes = sql.split("$def$");
  assert.equal(partes.length, 3, "delimitadores $def$ inesperados");
  const recanon = canonicalize(JSON.parse(partes[1]));
  assert.equal(recanon, canonicalize(instrumentoV2), "JSON embutido não re-canonicaliza igual à fonte");
  assert.equal(createHash("sha256").update(recanon).digest("hex"), sum);
});

test("[estático] a definição embutida traz questoes e senioridade com code (o que as RPC leem)", () => {
  const sql = gerarCargaV2SQL();
  const def = JSON.parse(sql.split("$def$")[1]);
  assert.equal(def.questoes.length, 8);
  assert.ok(def.questoes.every((q) => typeof q.code === "string"));
  assert.ok(def.senioridade.every((s) => typeof s.code === "string"));
});

test("[estático] não usa ON CONFLICT (idempotência é explícita)", () => {
  assert.ok(!gerarCargaV2SQL().toLowerCase().includes("on conflict"));
});

test("[estático] guardas de instrumento e vínculo presentes", () => {
  const sql = gerarCargaV2SQL();
  assert.ok(/do \$\$/.test(sql), "não é bloco transacional DO");
  assert.ok(sql.includes("'inactive'"), "instrumento deve entrar inativo");
  assert.ok(sql.includes("checksum divergente"));
  assert.ok(sql.includes("definição divergente"));
  assert.ok(sql.includes("preview-interno-ia-v2"), "slug do vínculo V2 ausente");
  assert.ok(sql.includes("'internal_preview'"), "vínculo deve nascer em internal_preview");
  assert.ok(sql.includes("outro vínculo corrente"));
  assert.ok(sql.includes("configuração divergente"));
});

test("[estático] não referencia tabelas legadas nem as do V1 de resposta", () => {
  const sql = gerarCargaV2SQL();
  for (const legado of ["respondentes", "eventos", "relatorios", "screener_responses", "screener_sessions"]) {
    assert.ok(!new RegExp("\\b" + legado + "\\b").test(sql), `carga v2 referencia tabela indevida: ${legado}`);
  }
});
