// Loader: sem drift, checksum coerente, idempotência e guardas presentes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { instrumento, canonicalize, checksum } from "../motor/definicao.mjs";
import { gerarCargaSQL } from "./gerar-carga.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const SQL_GERADO = path.join(RAIZ, "supabase/migrations/20260902130000_screener_carga_inativa_v1.sql");

test("sem drift: o SQL commitado é idêntico ao regenerado a partir do JSON", () => {
  const atual = fs.readFileSync(SQL_GERADO, "utf8").replace(/\r\n/g, "\n");
  const fresco = gerarCargaSQL().replace(/\r\n/g, "\n");
  assert.equal(atual, fresco, "carga gerada divergiu do arquivo commitado — regenere");
});

test("o checksum embutido é sha256(canonicalize(definição)) — mesmo do motor", () => {
  const sql = gerarCargaSQL();
  assert.ok(sql.includes(checksum()), "checksum do motor ausente no SQL");
  // e o JSON embutido reproduz o checksum
  const partes = sql.split("$def$");
  assert.equal(partes.length, 3, "delimitadores $def$ inesperados");
  const jsonEmbutido = partes[1];
  const recanon = canonicalize(JSON.parse(jsonEmbutido));
  assert.equal(recanon, canonicalize(instrumento), "JSON embutido não re-canonicaliza igual");
  assert.equal(createHash("sha256").update(recanon).digest("hex"), checksum());
});

test("guardas de idempotência e falha estão presentes no SQL", () => {
  const sql = gerarCargaSQL();
  assert.ok(/do \$\$/.test(sql), "não é um bloco transacional DO");
  assert.ok(sql.includes("no-op"), "falta o caminho no-op (mesmo checksum)");
  assert.ok(sql.includes("raise exception"), "falta a falha por checksum divergente");
  assert.ok(sql.includes("'inactive'"), "instrumento deve entrar inativo");
  assert.ok(sql.includes("on conflict"), "vínculo deve ser idempotente");
  assert.ok(sql.includes("'internal_preview'"), "vínculo técnico deve nascer em internal_preview");
  assert.ok(sql.includes("preview-interno-ia-v1"), "slug do vínculo técnico ausente");
});

test("o SQL não altera dado legado (só toca tabelas screener_*)", () => {
  const sql = gerarCargaSQL();
  for (const legado of ["respondentes", "eventos", "respostas", "relatorios"]) {
    assert.ok(!new RegExp("\\b" + legado + "\\b").test(sql), `carga referencia tabela legada: ${legado}`);
  }
});
