// Rate limiting (preview_authorize + rate_check + GC) contra Postgres efêmero (pglite).
// O bloco pg_cron da migration é aplicado só no Supabase real (branch); aqui usamos
// tudo antes do marcador @@@CRON@@@ e validamos a lógica de dados/RPC/retenção.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const SCHEMA = fs.readFileSync(path.join(MIGR, "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const RPC = fs.readFileSync(path.join(MIGR, "20260903120000_screener_rpc_e_papeis.sql"), "utf8");
const RL_FULL = fs.readFileSync(path.join(MIGR, "20260904120000_screener_rate_limit.sql"), "utf8");
const RL = RL_FULL.split("-- @@@CRON@@@")[0]; // sem o bloco pg_cron (indisponível no pglite)
const HEX = (c) => c.repeat(64);
const hexN = (n) => n.toString(16).padStart(64, "0");
const PREVIEW = "chave-teste";
const PREVIEW_HASH = createHash("sha256").update(PREVIEW, "utf8").digest("hex");

async function ambiente() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC);
  await db.exec(RL);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ('SCREENER_EMPRESA_IA_V1','1.0.0','{}'::jsonb,$1,'inactive')`, [HEX("a")]);
  await db.query(`insert into public.screener_event_bindings (event_slug, instrument_code, instrument_version, is_current, status, preview_credential_hash)
                  values ('preview-interno-ia-v1','SCREENER_EMPRESA_IA_V1','1.0.0', true, 'internal_preview', $1)`, [PREVIEW_HASH]);
  return db;
}
const authorize = async (db, ip, slug, hash) => (await db.query("select public.screener_op_preview_authorize($1,$2,$3) as r", [ip, slug, hash])).rows[0].r;
const rate = async (db, key, op) => (await db.query("select public.screener_op_rate_check($1,$2) as r", [key, op])).rows[0].r;

test("preview_authorize: credencial válida → authorized + vínculo; NÃO incrementa bucket", async () => {
  const db = await ambiente();
  const r = await authorize(db, HEX("1"), "preview-interno-ia-v1", PREVIEW_HASH);
  assert.equal(r.status, "authorized");
  assert.equal(r.binding.event_slug, "preview-interno-ia-v1");
  const { rows } = await db.query("select count(*)::int n from public.screener_rate_limit");
  assert.equal(rows[0].n, 0, "credencial válida não cria linha de rate");
});

test("SLUGS VARIADOS pelo cliente caem no MESMO bucket (chave por IP, sem slug)", async () => {
  const db = await ambiente();
  const ip = HEX("2");
  for (const slug of ["a", "b", "c", "d", "e"]) {           // 5 slugs distintos, todos inválidos
    const r = await authorize(db, ip, slug, "hash-errado");
    assert.equal(r.status, "invalid");
  }
  const { rows } = await db.query("select key_hmac, count from public.screener_rate_limit where operation='previa_invalida'");
  assert.equal(rows.length, 1, "um único bucket para o IP, independentemente do slug");
  assert.equal(rows[0].count, 5);
});

test("6ª tentativa é bloqueada MESMO com credencial correta (bucket consultado antes)", async () => {
  const db = await ambiente();
  const ip = HEX("3");
  for (let i = 0; i < 5; i++) assert.equal((await authorize(db, ip, "preview-interno-ia-v1", "errado")).status, "invalid");
  // 6ª com a credencial CERTA → limited (o bucket já está em 5, consultado antes da credencial)
  const r6 = await authorize(db, ip, "preview-interno-ia-v1", PREVIEW_HASH);
  assert.equal(r6.status, "limited");
  assert.ok(r6.retry_after_seconds > 0 && r6.retry_after_seconds <= 600);
  // e o incremento NÃO passou de 5 (a 6ª não incrementou; ela nem testou credencial)
  assert.equal((await db.query("select count from public.screener_rate_limit where key_hmac=$1 and operation='previa_invalida'", [ip])).rows[0].count, 5);
});

test("preview_authorize: ip_hmac malformado → bad_key (edge → 503)", async () => {
  const db = await ambiente();
  assert.equal((await authorize(db, "nao-hex", "preview-interno-ia-v1", PREVIEW_HASH)).status, "bad_key");
});

test("rate_check genérica: limites por operação; previa_invalida NÃO é dela (unknown_operation)", async () => {
  const db = await ambiente();
  for (let i = 0; i < 10; i++) assert.equal((await rate(db, HEX("4"), "submit")).status, "allowed");
  assert.equal((await rate(db, HEX("4"), "submit")).status, "limited");
  assert.equal((await rate(db, HEX("5"), "consulta")).status, "allowed");   // bucket independente
  assert.equal((await rate(db, HEX("6"), "previa_invalida")).status, "unknown_operation"); // só via authorize
  assert.equal((await rate(db, HEX("6"), "xpto")).status, "unknown_operation");
  assert.equal((await rate(db, "nao-hex", "submit")).status, "bad_key");
});

test("overflow por SATURAÇÃO: count no máximo de int não estoura", async () => {
  const db = await ambiente();
  const k = HEX("7");
  const w = (await db.query("select to_timestamp(floor(extract(epoch from now())/3600)*3600) as w")).rows[0].w;
  await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit',$2,2147483647)", [k, w]);
  const r = await rate(db, k, "submit"); // mesma janela → saturar, sem erro
  assert.equal(r.status, "limited");
  assert.equal((await db.query("select count from public.screener_rate_limit where key_hmac=$1 and operation='submit'", [k])).rows[0].count, 2147483647);
});

test("CHECK de operação canônica rejeita valor fora do conjunto", async () => {
  const db = await ambiente();
  await assert.rejects(
    db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'bogus',now(),1)", [HEX("8")]),
    /screener_rate_op|violates check/i);
});

test("tabela: só 4 colunas; RLS ligada", async () => {
  const db = await ambiente();
  const { rows: cols } = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='screener_rate_limit'");
  assert.deepEqual(cols.map((r) => r.column_name).sort(), ["count", "key_hmac", "operation", "window_start"]);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='screener_rate_limit'")).rows[0].relrowsecurity, true);
});

test("retenção: GC() (fixo 48h) remove chaves distintas expiradas; varredura inline drena sem bloquear", async () => {
  const db = await ambiente();
  for (let i = 0; i < 60; i++)
    await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours',1)", [hexN(i)]);
  assert.equal((await db.query("select public.screener_rate_gc() as n")).rows[0].n, 60);
  assert.equal((await db.query("select count(*)::int n from public.screener_rate_limit")).rows[0].n, 0);
  // inline: cria expiradas e prova que rate_check drena e ainda autoriza
  for (let i = 0; i < 30; i++)
    await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours',1)", [hexN(2000 + i)]);
  assert.equal((await rate(db, HEX("9"), "submit")).status, "allowed");
  assert.equal((await db.query("select count(*)::int n from public.screener_rate_limit where window_start < now()-interval '48 hours'")).rows[0].n, 0);
});

test("privilégios: só screener_runtime executa as RPCs; sem tabela; GC/amplos negados", async () => {
  const db = await ambiente();
  for (const fn of ["public.screener_op_preview_authorize(text,text,text)", "public.screener_op_rate_check(text,text)"])
    assert.equal((await db.query("select has_function_privilege('screener_runtime',$1,'execute') as ok", [fn])).rows[0].ok, true, fn);
  assert.equal((await db.query("select has_function_privilege('screener_runtime','public.screener_rate_gc()','execute') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select has_table_privilege('screener_runtime','public.screener_rate_limit','select') as ok")).rows[0].ok, false);
  for (const p of ["service_role", "anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,'public.screener_op_rate_check(text,text)','execute') as ok", [p])).rows[0].ok, false);
    assert.equal((await db.query("select has_table_privilege($1,'public.screener_rate_limit','select') as ok", [p])).rows[0].ok, false);
  }
  assert.equal((await db.query("select o.rolname from pg_class c join pg_roles o on o.oid=c.relowner where c.relname='screener_rate_limit'")).rows[0].rolname, "screener_owner");
});

test("execução real como screener_runtime: RPCs ok; tabela e GC negados", async () => {
  const db = await ambiente();
  await db.exec("set role screener_runtime");
  try {
    assert.equal((await db.query("select public.screener_op_preview_authorize($1,'preview-interno-ia-v1',$2) as r", [HEX("a"), PREVIEW_HASH])).rows[0].r.status, "authorized");
    assert.equal((await db.query("select public.screener_op_rate_check($1,'submit') as r", [HEX("b")])).rows[0].r.status, "allowed");
    await assert.rejects(db.query("select * from public.screener_rate_limit"), /permission denied/i);
    await assert.rejects(db.query("select public.screener_rate_gc()"), /permission denied/i);
  } finally { await db.exec("reset role"); }
});

// Concorrência real (multi-conexão) — PLANEJADA PARA O BRANCH (pglite é conexão única):
// N clientes simultâneos com o MESMO IP e credencial inválida devem produzir
// exatamente 5 'invalid' e o restante 'limited', num ÚNICO bucket (upsert atômico),
// e um POST /submit concorrente idempotente. Rodar contra o Supabase real.
test("concorrência real: contagem exata sob N conexões simultâneas", { skip: "requer multi-conexão; validar no branch" }, () => {});
