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
const hexN = (n) => n.toString(16).padStart(64, "0"); // chave hex distinta por número

async function ambiente() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC);
  await db.exec(RL);
  return db;
}
const check = async (db, key, op) => (await db.query("select public.screener_op_rate_check($1,$2) as r", [key, op])).rows[0].r;

test("contrato de status: allowed até o limite, depois limited (previa_invalida 5); nunca levanta", async () => {
  const db = await ambiente();
  const k = HEX("a");
  const rem = [];
  for (let i = 0; i < 5; i++) { const r = await check(db, k, "previa_invalida"); assert.equal(r.status, "allowed"); rem.push(r.remaining); }
  assert.deepEqual(rem, [4, 3, 2, 1, 0]);
  const r6 = await check(db, k, "previa_invalida");
  assert.equal(r6.status, "limited");
  assert.equal(r6.remaining, 0);
  assert.ok(r6.retry_after_seconds > 0 && r6.retry_after_seconds <= 600);
  assert.equal((await check(db, k, "previa_invalida")).status, "limited"); // segue limited, sem levantar
});

test("status de erro distinto de limite: unknown_operation, bad_key (→ 503 na edge)", async () => {
  const db = await ambiente();
  assert.equal((await check(db, HEX("a"), "operacao_x")).status, "unknown_operation");
  assert.equal((await check(db, "nao-hex", "submit")).status, "bad_key");
  assert.equal((await check(db, null, "submit")).status, "bad_key");
});

test("buckets independentes por chave e por operação", async () => {
  const db = await ambiente();
  for (let i = 0; i < 10; i++) await check(db, HEX("a"), "submit");
  assert.equal((await check(db, HEX("a"), "submit")).status, "limited");
  assert.equal((await check(db, HEX("b"), "submit")).status, "allowed");
  assert.equal((await check(db, HEX("a"), "consulta")).status, "allowed");
});

test("incremento atômico: contagem exata em chamadas sequenciais rápidas", async () => {
  const db = await ambiente();
  const k = HEX("f");
  for (let i = 0; i < 60; i++) await check(db, k, "autosave"); // limite 120
  const { rows } = await db.query("select count from public.screener_rate_limit where key_hmac=$1 and operation='autosave'", [k]);
  assert.equal(rows[0].count, 60); // sem perda de incremento
});

test("tabela guarda só HMAC/operação/janela/contador; RLS ligada", async () => {
  const db = await ambiente();
  const { rows: cols } = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='screener_rate_limit'");
  assert.deepEqual(cols.map((r) => r.column_name).sort(), ["count", "key_hmac", "operation", "window_start"]);
  const { rows: rls } = await db.query("select relrowsecurity from pg_class where relname='screener_rate_limit'");
  assert.equal(rls[0].relrowsecurity, true, "RLS deve estar ligada");
});

test("crescimento por chaves DISTINTAS: GC global remove todas as janelas expiradas", async () => {
  const db = await ambiente();
  // 60 chaves distintas, todas em janela antiga (simula ataque de chaves aleatórias já expiradas)
  for (let i = 0; i < 60; i++)
    await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours',1)", [hexN(i)]);
  assert.equal((await db.query("select count(*)::int n from public.screener_rate_limit")).rows[0].n, 60);
  const removidas = (await db.query("select public.screener_rate_gc() as n")).rows[0].n;
  assert.equal(removidas, 60);
  assert.equal((await db.query("select count(*)::int n from public.screener_rate_limit")).rows[0].n, 0);
});

test("varredura inline amortizada drena janelas expiradas ao longo de chamadas, sem bloquear a autorização", async () => {
  const db = await ambiente();
  for (let i = 0; i < 40; i++)
    await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours',1)", [hexN(1000 + i)]);
  // cada rate_check remove até 50 expiradas (bloco guardado) e ainda devolve veredito
  const r = await check(db, HEX("e"), "submit");
  assert.equal(r.status, "allowed"); // autorização normal não é bloqueada pela limpeza
  const { rows } = await db.query("select count(*)::int n from public.screener_rate_limit where window_start < now()-interval '48 hours'");
  assert.equal(rows[0].n, 0, "expiradas drenadas pela varredura inline");
});

test("privilégios: só screener_runtime executa rate_check; sem tabela; GC/amplos negados a runtime", async () => {
  const db = await ambiente();
  assert.equal((await db.query("select has_function_privilege('screener_runtime','public.screener_op_rate_check(text,text)','execute') as ok")).rows[0].ok, true);
  assert.equal((await db.query("select has_function_privilege('screener_runtime','public.screener_rate_gc(interval)','execute') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select has_table_privilege('screener_runtime','public.screener_rate_limit','select') as ok")).rows[0].ok, false);
  for (const p of ["service_role", "anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,'public.screener_op_rate_check(text,text)','execute') as ok", [p])).rows[0].ok, false);
    assert.equal((await db.query("select has_table_privilege($1,'public.screener_rate_limit','select') as ok", [p])).rows[0].ok, false);
  }
  assert.equal((await db.query("select o.rolname from pg_class c join pg_roles o on o.oid=c.relowner where c.relname='screener_rate_limit'")).rows[0].rolname, "screener_owner");
});

test("execução real como screener_runtime: rate_check via RPC ok; tabela e GC negados", async () => {
  const db = await ambiente();
  await db.exec("set role screener_runtime");
  try {
    assert.equal((await db.query("select public.screener_op_rate_check($1,'submit') as r", [HEX("e")])).rows[0].r.status, "allowed");
    await assert.rejects(db.query("select * from public.screener_rate_limit"), /permission denied/i);
    await assert.rejects(db.query("select public.screener_rate_gc()"), /permission denied/i);
  } finally { await db.exec("reset role"); }
});

test("migration idempotente: aplicar duas vezes não falha", async () => {
  const db = await ambiente();
  await db.exec(RL); // segunda aplicação
  assert.equal((await check(db, HEX("a"), "submit")).status, "allowed");
});
