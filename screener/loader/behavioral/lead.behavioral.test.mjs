// screener_op_capturar_lead (7ª função da fronteira) — pglite.
// A tabela screener_leads é a única com PII; a função é o único caminho de escrita.
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
const LEAD = fs.readFileSync(path.join(MIGR, "20260905120000_screener_op_lead.sql"), "utf8");
const HEX = (c) => c.repeat(64);
const PREVIEW = "chave-teste";
const PH = createHash("sha256").update(PREVIEW, "utf8").digest("hex");

async function ambiente({ leadMode = "optional_after_submit", status = "public_pilot", cred = null } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC); await db.exec(LEAD);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ('SCREENER_EMPRESA_IA_V1','1.0.0','{}'::jsonb,$1,'inactive')`, [HEX("a")]);
  await db.query(`insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
       session_retention_days, lead_retention_days, preview_credential_hash)
      values ('ev-degust','SCREENER_EMPRESA_IA_V1','1.0.0', true, $1, 'immediate', $2, 180, 365, $3)`,
    [status, leadMode, cred]);
  return db;
}
async function sessao(db, th, status = "submitted") {
  const bid = (await db.query("select id from public.screener_event_bindings limit 1")).rows[0].id;
  await db.query(`insert into public.screener_sessions (binding_id, token_hash, status, expires_at, submitted_at)
    values ($1,$2,$3, now()+interval '1 day', case when $3='submitted' then now() else null end)`, [bid, th, status]);
}
const lead = async (db, th, ph, nome, email, opt) =>
  (await db.query("select public.screener_op_capturar_lead($1,$2,$3,$4,$5) as r", [th, ph, nome, email, opt])).rows[0].r;
const linhas = async (db) => (await db.query("select * from public.screener_leads")).rows;

test("captura: normaliza e-mail, opt-in coerente, lead_source = slug", async () => {
  const db = await ambiente(); await sessao(db, HEX("1"));
  const r = await lead(db, HEX("1"), null, "  Ana Ribeiro ", " Ana@Empresa.COM ", true);
  assert.deepEqual(r, { status: "ok" });
  const [L] = await linhas(db);
  assert.equal(L.nome, "Ana Ribeiro");
  assert.equal(L.email, "Ana@Empresa.COM");           // preserva o original (trim)
  assert.equal(L.email_normalized, "ana@empresa.com"); // normalizado
  assert.equal(L.marketing_opt_in, true);
  assert.ok(L.marketing_opt_in_at);                     // coerente com opt-in true
  assert.equal(L.lead_source, "ev-degust");
});

test("opt-in false → sem data; nome vazio → null", async () => {
  const db = await ambiente(); await sessao(db, HEX("2"));
  await lead(db, HEX("2"), null, "   ", "x@y.io", false);
  const [L] = await linhas(db);
  assert.equal(L.nome, null);
  assert.equal(L.marketing_opt_in, false);
  assert.equal(L.marketing_opt_in_at, null);
});

test("idempotente: 1 lead por sessão (upsert corrige e-mail)", async () => {
  const db = await ambiente(); await sessao(db, HEX("3"));
  await lead(db, HEX("3"), null, "A", "primeiro@x.com", false);
  await lead(db, HEX("3"), null, "A", "corrigido@x.com", true);
  const rows = await linhas(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "corrigido@x.com");
  assert.equal(rows[0].marketing_opt_in, true);
});

test("lead_capture_mode='none' → recusa (lead_desativado)", async () => {
  const db = await ambiente({ leadMode: "none" }); await sessao(db, HEX("4"));
  await assert.rejects(lead(db, HEX("4"), null, null, "a@b.co", false), /lead_desativado/);
  assert.equal((await linhas(db)).length, 0);
});

test("e-mail inválido → email_invalido; nada gravado", async () => {
  const db = await ambiente(); await sessao(db, HEX("5"));
  for (const bad of ["sem-arroba", "a@b", "a b@c.co", ""])
    await assert.rejects(lead(db, HEX("5"), null, null, bad, false), /email_invalido/);
  assert.equal((await linhas(db)).length, 0);
});

test("sessão não submetida → recusa (sessao_nao_submetida)", async () => {
  const db = await ambiente(); await sessao(db, HEX("6"), "open");
  await assert.rejects(lead(db, HEX("6"), null, null, "a@b.co", false), /sessao_nao_submetida/);
});

test("sessão inexistente → null (edge → 404)", async () => {
  const db = await ambiente();
  assert.equal(await lead(db, HEX("7"), null, null, "a@b.co", false), null);
});

test("internal_preview: sem credencial → null; com credencial → ok", async () => {
  const db = await ambiente({ status: "internal_preview", cred: PH }); await sessao(db, HEX("8"));
  assert.equal(await lead(db, HEX("8"), null, null, "a@b.co", false), null);        // sem hash
  assert.equal(await lead(db, HEX("8"), "errado", null, "a@b.co", false), null);    // hash errado
  assert.deepEqual(await lead(db, HEX("8"), PH, null, "a@b.co", false), { status: "ok" });
});

test("privilégios: runtime executa a função; sem SELECT/INSERT na tabela", async () => {
  const db = await ambiente(); await sessao(db, HEX("9"));
  assert.equal((await db.query(
    "select has_function_privilege('screener_runtime','public.screener_op_capturar_lead(text,text,text,text,boolean)','execute') as ok")).rows[0].ok, true);
  assert.equal((await db.query("select has_table_privilege('screener_runtime','public.screener_leads','select') as ok")).rows[0].ok, false);
  assert.equal((await db.query("select has_table_privilege('screener_runtime','public.screener_leads','insert') as ok")).rows[0].ok, false);
  // dona é screener_owner
  assert.equal((await db.query("select o.rolname from pg_class c join pg_roles o on o.oid=c.relowner where c.relname='screener_leads'")).rows[0].rolname, "screener_owner");
  // service_role sem execute
  assert.equal((await db.query(
    "select has_function_privilege('service_role','public.screener_op_capturar_lead(text,text,text,text,boolean)','execute') as ok")).rows[0].ok, false);
});

test("execução real como screener_runtime: função ok, tabela negada", async () => {
  const db = await ambiente(); await sessao(db, HEX("a"));
  await db.exec("set role screener_runtime");
  try {
    assert.deepEqual((await db.query("select public.screener_op_capturar_lead($1,null,null,$2,false) as r", [HEX("a"), "r@t.co"])).rows[0].r, { status: "ok" });
    await assert.rejects(db.query("select * from public.screener_leads"), /permission denied/i);
  } finally { await db.exec("reset role"); }
});
