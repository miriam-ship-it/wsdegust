// Rate limiting v3 (preview_authorize serializado + rate_check + GC) — pglite.
// O bloco pg_cron (após @@@CRON@@@) só roda no Supabase real (branch).
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
const RL = fs.readFileSync(path.join(MIGR, "20260904120000_screener_rate_limit.sql"), "utf8").split("-- @@@CRON@@@")[0];
const HEX = (c) => c.repeat(64);
const hexN = (n) => n.toString(16).padStart(64, "0");
const PREVIEW = "chave-teste";
const PH = createHash("sha256").update(PREVIEW, "utf8").digest("hex");

async function ambiente() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC); await db.exec(RL);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ('SCREENER_EMPRESA_IA_V1','1.0.0','{}'::jsonb,$1,'inactive')`, [HEX("a")]);
  await db.query(`insert into public.screener_event_bindings (event_slug, instrument_code, instrument_version, is_current, status, preview_credential_hash, result_mode, lead_capture_mode, session_retention_days, lead_retention_days)
                  values ('preview-interno-ia-v1','SCREENER_EMPRESA_IA_V1','1.0.0', true, 'internal_preview', $1, 'immediate','optional_after_submit',180,365)`, [PH]);
  await db.query(`insert into public.screener_event_bindings (event_slug, instrument_code, instrument_version, is_current, status, session_retention_days, lead_retention_days)
                  values ('rh-publico','SCREENER_EMPRESA_IA_V1','1.0.0', true, 'published', 180, 365)`);
  return db;
}
const authz = async (db, ip, slug, hash) => (await db.query("select public.screener_op_preview_authorize($1,$2,$3) as r", [ip, slug, hash])).rows[0].r;
const rate = async (db, key, op) => (await db.query("select public.screener_op_rate_check($1,$2) as r", [key, op])).rows[0].r;
const bucket = async (db, ip) => (await db.query("select coalesce(sum(count),0)::int n, count(*)::int linhas from public.screener_rate_limit where key_hmac=$1 and operation='previa_invalida'", [ip])).rows[0];

test("credencial válida → authorized + CONTRATO COMPLETO; sem incremento de bucket", async () => {
  const db = await ambiente();
  const r = await authz(db, HEX("1"), "preview-interno-ia-v1", PH);
  assert.equal(r.status, "authorized");
  assert.deepEqual(Object.keys(r.binding).sort(), ["branding","ends_at","event_slug","id","instrument_code","instrument_version","lead_capture_mode","lead_retention_days","result_mode","session_retention_days","starts_at","status"]);
  assert.equal(r.binding.result_mode, "immediate");
  assert.equal(r.binding.lead_capture_mode, "optional_after_submit");
  assert.equal(r.binding.session_retention_days, 180);
  assert.equal((await bucket(db, HEX("1"))).n, 0);
});

test("slugs variados pelo cliente → um único bucket por IP", async () => {
  const db = await ambiente(); const ip = HEX("2");
  for (const slug of ["a", "b", "c", "d", "e"]) assert.equal((await authz(db, ip, slug, "errado")).status, "invalid");
  const b = await bucket(db, ip);
  assert.equal(b.linhas, 1); assert.equal(b.n, 5);
});

test("6ª tentativa bloqueada MESMO com credencial correta (bucket consultado sob lock antes)", async () => {
  const db = await ambiente(); const ip = HEX("3");
  for (let i = 0; i < 5; i++) assert.equal((await authz(db, ip, "preview-interno-ia-v1", "errado")).status, "invalid");
  assert.equal((await authz(db, ip, "preview-interno-ia-v1", PH)).status, "limited");
  assert.equal((await bucket(db, ip)).n, 5); // a 6ª não incrementou
});

test("evento PÚBLICO no mesmo IP não é bloqueado por falhas anteriores (não toca o bucket)", async () => {
  const db = await ambiente(); const ip = HEX("4");
  for (let i = 0; i < 5; i++) await authz(db, ip, "slug-inexistente-" + i, "errado"); // bucket=5
  assert.equal((await bucket(db, ip)).n, 5);
  const pub = await authz(db, ip, "rh-publico", null);   // published → authorized, sem tocar bucket
  assert.equal(pub.status, "authorized");
  assert.equal(pub.binding.status, "published");
  assert.equal((await bucket(db, ip)).n, 5); // inalterado
  // e a prévia interna correta no MESMO IP continua bloqueada
  assert.equal((await authz(db, ip, "preview-interno-ia-v1", PH)).status, "limited");
});

test("20 inválidas sequenciais → 5 invalid, 15 limited, contador final 5", async () => {
  const db = await ambiente(); const ip = HEX("5");
  let inval = 0, lim = 0;
  for (let i = 0; i < 20; i++) {
    const s = (await authz(db, ip, "x", "errado")).status;
    if (s === "invalid") inval++; else if (s === "limited") lim++;
  }
  assert.equal(inval, 5); assert.equal(lim, 15);
  assert.equal((await bucket(db, ip)).n, 5);
});

test("slug inexistente e credencial inválida têm a MESMA resposta externa (invalid)", async () => {
  const db = await ambiente();
  assert.equal((await authz(db, HEX("6"), "nao-existe", "x")).status, "invalid");
  assert.equal((await authz(db, HEX("7"), "preview-interno-ia-v1", "errado")).status, "invalid");
});

test("ip_hmac malformado → bad_key (edge → 503)", async () => {
  const db = await ambiente();
  assert.equal((await authz(db, "nao-hex", "preview-interno-ia-v1", PH)).status, "bad_key");
});

test("rate_check genérica: limites por operação; previa_invalida não é dela", async () => {
  const db = await ambiente();
  for (let i = 0; i < 10; i++) assert.equal((await rate(db, HEX("8"), "submit")).status, "allowed");
  assert.equal((await rate(db, HEX("8"), "submit")).status, "limited");
  assert.equal((await rate(db, HEX("9"), "consulta")).status, "allowed");
  assert.equal((await rate(db, HEX("a"), "previa_invalida")).status, "unknown_operation");
  assert.equal((await rate(db, "nao-hex", "submit")).status, "bad_key");
});

test("overflow por saturação: count no máximo de int não estoura", async () => {
  const db = await ambiente(); const k = HEX("b");
  const w = (await db.query("select to_timestamp(floor(extract(epoch from now())/3600)*3600) as w")).rows[0].w;
  await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit',$2,2147483647)", [k, w]);
  assert.equal((await rate(db, k, "submit")).status, "limited");
  assert.equal((await db.query("select count from public.screener_rate_limit where key_hmac=$1 and operation='submit'", [k])).rows[0].count, 2147483647);
});

test("CHECK de operação e tabela/RLS", async () => {
  const db = await ambiente();
  await assert.rejects(db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'bogus',now(),1)", [HEX("c")]), /screener_rate_op|violates check/i);
  const { rows: cols } = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='screener_rate_limit'");
  assert.deepEqual(cols.map((r) => r.column_name).sort(), ["count", "key_hmac", "operation", "window_start"]);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='screener_rate_limit'")).rows[0].relrowsecurity, true);
});

test("retenção: GC() remove chaves distintas expiradas; inline drena sem bloquear", async () => {
  const db = await ambiente();
  for (let i = 0; i < 60; i++) await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours',1)", [hexN(i)]);
  assert.equal((await db.query("select public.screener_rate_gc() as n")).rows[0].n, 60);
  assert.equal((await db.query("select count(*)::int n from public.screener_rate_limit")).rows[0].n, 0);
  for (let i = 0; i < 30; i++) await db.query("insert into public.screener_rate_limit(key_hmac,operation,window_start,count) values ($1,'submit', now()-interval '50 hours',1)", [hexN(2000 + i)]);
  assert.equal((await rate(db, HEX("d"), "submit")).status, "allowed");
  assert.equal((await db.query("select count(*)::int n from public.screener_rate_limit where window_start < now()-interval '48 hours'")).rows[0].n, 0);
});

test("privilégios: RPCs só p/ runtime; tabela/GC negados; TRIGGER revogada do PUBLIC", async () => {
  const db = await ambiente();
  for (const fn of ["public.screener_op_preview_authorize(text,text,text)", "public.screener_op_rate_check(text,text)"])
    assert.equal((await db.query("select has_function_privilege('screener_runtime',$1,'execute') as ok", [fn])).rows[0].ok, true, fn);
  assert.equal((await db.query("select has_function_privilege('screener_runtime','public.screener_rate_gc()','execute') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select has_table_privilege('screener_runtime','public.screener_rate_limit','select') as ok")).rows[0].ok, false);
  // trigger de imutabilidade não é mais executável por PUBLIC/runtime
  assert.equal((await db.query("select has_function_privilege('screener_runtime','public.screener_snapshot_impede_update()','execute') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select o.rolname from pg_class c join pg_roles o on o.oid=c.relowner where c.relname='screener_rate_limit'")).rows[0].rolname, "screener_owner");
});

test("execução real como screener_runtime: RPCs ok; tabela e GC negados", async () => {
  const db = await ambiente();
  await db.exec("set role screener_runtime");
  try {
    assert.equal((await db.query("select public.screener_op_preview_authorize($1,'preview-interno-ia-v1',$2) as r", [HEX("e"), PH])).rows[0].r.status, "authorized");
    assert.equal((await db.query("select public.screener_op_rate_check($1,'submit') as r", [HEX("f")])).rows[0].r.status, "allowed");
    await assert.rejects(db.query("select * from public.screener_rate_limit"), /permission denied/i);
    await assert.rejects(db.query("select public.screener_rate_gc()"), /permission denied/i);
  } finally { await db.exec("reset role"); }
});

// Concorrência REAL (multi-conexão) — planejada para o branch (pglite é conexão única):
//  - 5 inválidas confirmadas; depois N chamadas SIMULTÂNEAS com a credencial correta → todas 'limited';
//  - 20 inválidas SIMULTÂNEAS → exatamente 5 'invalid', 15 'limited', contador final 5 (lock FOR UPDATE).
test("concorrência real (FOR UPDATE) — validar no branch", { skip: "requer multi-conexão" }, () => {});
