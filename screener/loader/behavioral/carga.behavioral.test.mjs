// TESTES DE COMPORTAMENTO (executam SQL real).
// Rodam o schema screener_* e a carga contra um Postgres EFÊMERO (pglite/WASM),
// sem tocar o Supabase. Provam o que o teste estático não prova:
//   sintaxe válida · 1ª execução · 2ª execução no-op · conflito de checksum ·
//   conflito de definição · vínculo corrente conflitante · rollback integral.
//
// Requer dependência local: `npm install` nesta pasta (isolada do repo).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..", "..");
const MIGR = path.join(RAIZ, "supabase", "migrations");
const SCHEMA_SQL = fs.readFileSync(path.join(MIGR, "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const CARGA_SQL = fs.readFileSync(path.join(MIGR, "20260902150000_screener_carga_inativa_v1.sql"), "utf8");

const HEX64_A = "a".repeat(64);

async function dbComSchema() {
  const db = new PGlite();
  // papéis que o Supabase provê e o schema referencia nos REVOKE
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA_SQL); // prova de sintaxe do schema
  return db;
}
async function contaInstrumento(db, version = "1.0.0") {
  const r = await db.query("select status from public.screener_instrument_versions where instrument_version = $1", [version]);
  return r.rows;
}
async function contaVinculo(db, version = "1.0.0") {
  const r = await db.query(
    "select status, is_current from public.screener_event_bindings where event_slug = 'preview-interno-ia-v1' and instrument_version = $1",
    [version],
  );
  return r.rows;
}
async function esperaFalha(fn, trecho) {
  await assert.rejects(fn, (e) => {
    assert.ok(String(e.message).includes(trecho), `esperava erro com "${trecho}", veio: ${e.message}`);
    return true;
  });
}

test("schema + carga têm sintaxe válida e a 1ª execução cria instrumento inativo + vínculo internal_preview", async () => {
  const db = await dbComSchema();
  await db.exec(CARGA_SQL);
  const inst = await contaInstrumento(db);
  assert.equal(inst.length, 1);
  assert.equal(inst[0].status, "inactive");
  const vinc = await contaVinculo(db);
  assert.equal(vinc.length, 1);
  assert.equal(vinc[0].status, "internal_preview");
  assert.equal(vinc[0].is_current, true);
  await db.close();
});

test("2ª execução é no-op: não duplica nem falha", async () => {
  const db = await dbComSchema();
  await db.exec(CARGA_SQL);
  await db.exec(CARGA_SQL); // não pode lançar
  assert.equal((await contaInstrumento(db)).length, 1);
  assert.equal((await contaVinculo(db)).length, 1);
  await db.close();
});

test("conflito de checksum: mesma versão com checksum diferente FALHA", async () => {
  const db = await dbComSchema();
  await db.exec(CARGA_SQL);
  await db.query(
    "update public.screener_instrument_versions set checksum = $1 where instrument_version = '1.0.0'",
    [HEX64_A],
  );
  await esperaFalha(() => db.exec(CARGA_SQL), "checksum divergente");
  await db.close();
});

test("conflito de definição: checksum igual mas definição diferente FALHA", async () => {
  const db = await dbComSchema();
  // extrai o checksum do repo a partir do próprio SQL de carga
  const sum = CARGA_SQL.match(/v_checksum\s+text\s+:=\s+'([0-9a-f]{64})'/)[1];
  await db.query(
    `insert into public.screener_instrument_versions
       (instrument_code, instrument_version, definition, checksum, status)
       values ('SCREENER_EMPRESA_IA_V1', '1.0.0', '{"outra":"coisa"}'::jsonb, $1, 'inactive')`,
    [sum],
  );
  await esperaFalha(() => db.exec(CARGA_SQL), "definição divergente");
  await db.close();
});

test("vínculo corrente conflitante FALHA e faz rollback integral (instrumento não persiste)", async () => {
  const db = await dbComSchema();
  // estado: existe uma versão 0.9.0 e um vínculo CORRENTE para o mesmo slug
  await db.query(
    `insert into public.screener_instrument_versions
       (instrument_code, instrument_version, definition, checksum, status)
       values ('SCREENER_EMPRESA_IA_V1', '0.9.0', '{}'::jsonb, $1, 'inactive')`,
    [HEX64_A],
  );
  await db.query(
    `insert into public.screener_event_bindings
       (event_slug, instrument_code, instrument_version, is_current, status)
       values ('preview-interno-ia-v1', 'SCREENER_EMPRESA_IA_V1', '0.9.0', true, 'internal_preview')`,
  );
  // a carga (alvo 1.0.0): insere instrumento 1.0.0, depois o vínculo FALHA
  await esperaFalha(() => db.exec(CARGA_SQL), "outro vínculo corrente");
  // rollback integral: o instrumento 1.0.0 NÃO pode ter persistido
  assert.equal((await contaInstrumento(db, "1.0.0")).length, 0, "rollback falhou: instrumento 1.0.0 persistiu");
  await db.close();
});
