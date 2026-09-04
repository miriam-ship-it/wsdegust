// Rate limiting (RPC screener_op_rate_check + tabela + GC) contra Postgres efêmero (pglite).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const SCHEMA = fs.readFileSync(path.join(MIGR, "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const RPC = fs.readFileSync(path.join(MIGR, "20260903120000_screener_rpc_e_papeis.sql"), "utf8");
const RL = fs.readFileSync(path.join(MIGR, "20260904120000_screener_rate_limit.sql"), "utf8");
const HEX = (c) => c.repeat(64);

async function ambiente() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC);   // cria screener_owner/screener_runtime
  await db.exec(RL);    // rate limit
  return db;
}
const check = async (db, key, op) => (await db.query("select public.screener_op_rate_check($1,$2) as r", [key, op])).rows[0].r;

test("incrementa e bloqueia no limite (previa_invalida: 5/janela); nunca levanta", async () => {
  const db = await ambiente();
  const k = HEX("a");
  const rem = [];
  for (let i = 0; i < 5; i++) { const r = await check(db, k, "previa_invalida"); assert.equal(r.allowed, true); rem.push(r.remaining); }
  assert.deepEqual(rem, [4, 3, 2, 1, 0]);
  const r6 = await check(db, k, "previa_invalida");
  assert.equal(r6.allowed, false);
  assert.equal(r6.remaining, 0);
  assert.ok(r6.retry_after_seconds > 0 && r6.retry_after_seconds <= 600);
  // continua contando (não levanta) mesmo além do limite
  assert.equal((await check(db, k, "previa_invalida")).allowed, false);
});

test("operação desconhecida e chave malformada → fail-closed (allowed=false)", async () => {
  const db = await ambiente();
  assert.equal((await check(db, HEX("a"), "operacao_inexistente")).allowed, false);
  assert.equal((await check(db, "chave-nao-hex", "submit")).allowed, false);
  assert.equal((await check(db, null, "submit")).allowed, false);
});

test("chaves/operações distintas têm buckets independentes", async () => {
  const db = await ambiente();
  for (let i = 0; i < 10; i++) await check(db, HEX("a"), "submit"); // estoura submit de A (limite 10)
  assert.equal((await check(db, HEX("a"), "submit")).allowed, false);
  assert.equal((await check(db, HEX("b"), "submit")).allowed, true);      // outra chave, ok
  assert.equal((await check(db, HEX("a"), "consulta")).allowed, true);    // outra operação, ok
});

test("tabela guarda só HMAC/operação/janela/contador (sem IP/token)", async () => {
  const db = await ambiente();
  const { rows } = await db.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='screener_rate_limit' order by column_name");
  assert.deepEqual(rows.map((r) => r.column_name).sort(), ["count", "key_hmac", "operation", "window_start"]);
});

test("retenção: GC remove janelas > 48h; limpeza oportunista remove antigas da chave", async () => {
  const db = await ambiente();
  // janela antiga inserida direto (superuser no pglite)
  await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours', 3)", [HEX("c")]);
  const removidas = (await db.query("select public.screener_rate_gc() as n")).rows[0].n;
  assert.ok(removidas >= 1, "GC deveria remover a janela antiga");
  assert.equal((await db.query("select count(*)::int n from public.screener_rate_limit where key_hmac=$1", [HEX("c")])).rows[0].n, 0);
  // oportunista: janela antiga da chave K é removida ao chamar rate_check(K)
  await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours', 7)", [HEX("d")]);
  await check(db, HEX("d"), "submit");
  const { rows } = await db.query("select window_start from public.screener_rate_limit where key_hmac=$1 and operation='submit'", [HEX("d")]);
  assert.equal(rows.length, 1, "só a janela atual deve restar");
  assert.ok(new Date(rows[0].window_start) > new Date(Date.now() - 3600 * 1000));
});

test("privilégios: só screener_runtime executa rate_check; sem tabela; GC e amplos negados", async () => {
  const db = await ambiente();
  assert.equal((await db.query("select has_function_privilege('screener_runtime','public.screener_op_rate_check(text,text)','execute') as ok")).rows[0].ok, true);
  assert.equal((await db.query("select has_function_privilege('screener_runtime','public.screener_rate_gc(interval)','execute') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select has_table_privilege('screener_runtime','public.screener_rate_limit','select') as ok")).rows[0].ok, false);
  for (const p of ["service_role", "anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,'public.screener_op_rate_check(text,text)','execute') as ok", [p])).rows[0].ok, false, `${p} nao executa rate_check`);
    assert.equal((await db.query("select has_table_privilege($1,'public.screener_rate_limit','select') as ok", [p])).rows[0].ok, false, `${p} nao acessa tabela`);
  }
  // dono correto
  assert.equal((await db.query("select o.rolname from pg_class c join pg_roles o on o.oid=c.relowner where c.relname='screener_rate_limit'")).rows[0].rolname, "screener_owner");
});

test("execução real como screener_runtime: só via RPC, sem tabela direta", async () => {
  const db = await ambiente();
  await db.exec("set role screener_runtime");
  try {
    const r = await db.query("select public.screener_op_rate_check($1,'submit') as r", [HEX("e")]);
    assert.equal(r.rows[0].r.allowed, true);
    await assert.rejects(db.query("select * from public.screener_rate_limit"), /permission denied/i);
    await assert.rejects(db.query("select public.screener_rate_gc()"), /permission denied/i);
  } finally { await db.exec("reset role"); }
});
