// TESTES ESTÁTICOS DO GERADOR (não executam SQL).
// Provam: geração determinística (sem drift), checksum coerente com o motor e
// presença das guardas no texto. O COMPORTAMENTO do PL/pgSQL (execução, no-op,
// conflitos, rollback) é provado à parte, contra um Postgres efêmero, em
// screener/loader/behavioral/carga.behavioral.test.mjs.
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
const SQL_GERADO = path.join(RAIZ, "supabase/migrations/20260902150000_screener_carga_inativa_v1.sql");

test("[estático] sem drift: o SQL commitado é idêntico ao regenerado do JSON", () => {
  const atual = fs.readFileSync(SQL_GERADO, "utf8").replace(/\r\n/g, "\n");
  const fresco = gerarCargaSQL().replace(/\r\n/g, "\n");
  assert.equal(atual, fresco, "carga gerada divergiu do arquivo commitado — regenere");
});

test("[estático] checksum embutido = sha256(canonicalize(definição)) do motor", () => {
  const sql = gerarCargaSQL();
  assert.ok(sql.includes(checksum()), "checksum do motor ausente no SQL");
  const partes = sql.split("$def$");
  assert.equal(partes.length, 3, "delimitadores $def$ inesperados");
  const recanon = canonicalize(JSON.parse(partes[1]));
  assert.equal(recanon, canonicalize(instrumento), "JSON embutido não re-canonicaliza igual");
  assert.equal(createHash("sha256").update(recanon).digest("hex"), checksum());
});

test("[estático] não usa ON CONFLICT (idempotência é explícita)", () => {
  const sql = gerarCargaSQL().toLowerCase();
  assert.ok(!sql.includes("on conflict"), "ON CONFLICT não é permitido nesta carga");
});

test("[estático] guardas de instrumento: insere, no-op, falha por checksum E por definição", () => {
  const sql = gerarCargaSQL();
  assert.ok(/do \$\$/.test(sql), "não é bloco transacional DO");
  assert.ok(sql.includes("'inactive'"), "instrumento deve entrar inativo");
  assert.ok(sql.includes("checksum divergente"), "falta falha por checksum divergente");
  assert.ok(sql.includes("definição divergente"), "falta falha por definição divergente (checksum igual)");
  assert.ok(sql.includes("no-op"), "falta caminho no-op");
});

test("[estático] guardas de vínculo: conflito de corrente, divergência e no-op", () => {
  const sql = gerarCargaSQL();
  assert.ok(sql.includes("preview-interno-ia-v1"), "slug do vínculo técnico ausente");
  assert.ok(sql.includes("'internal_preview'"), "vínculo deve nascer em internal_preview");
  assert.ok(sql.includes("outro vínculo corrente"), "falta falha por vínculo corrente conflitante");
  assert.ok(sql.includes("configuração divergente"), "falta falha por configuração divergente");
});

test("[estático] não referencia tabelas legadas", () => {
  const sql = gerarCargaSQL();
  for (const legado of ["respondentes", "eventos", "respostas", "relatorios"]) {
    assert.ok(!new RegExp("\\b" + legado + "\\b").test(sql), `carga referencia tabela legada: ${legado}`);
  }
});
