// A VOLTA DE 17/09: aplicar as tres migrations da sessao de 15-16/09 e depois a
// 20260917120000 tem de deixar o catalogo IDENTICO ao de um banco que nunca as
// teve. E, com qualquer dado nas tabelas da sessao, a volta tem de abortar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const require = createRequire(path.join(RAIZ, "screener", "loader", "behavioral", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const rd = (f) => fs.readFileSync(path.join(RAIZ, "supabase", "migrations", f), "utf8");
const BASE = [
  rd("20260902143339_screener_tabelas_isoladas.sql"),
  rd("20260903120000_screener_rpc_e_papeis.sql"),
  rd("20260912120000_screener_rhia_tabelas_e_rpc.sql"),
  `create table public.respondentes (id uuid primary key default gen_random_uuid(), token_sessao uuid not null unique default gen_random_uuid(), nome text, empresa text, email text, iniciado_em timestamptz not null default now()); alter table public.respondentes enable row level security;`,
  rd("20260914170000_screener_rhia_purga_por_retencao.sql").split("-- @@@CRON@@@")[0],
];
const SESSAO = ["20260915120000_screener_rhia_ponte_com_lideranca.sql", "20260916120000_screener_rhia_perfil_do_formulario_unico.sql", "20260916140000_screener_rhia_snapshot_aceita_outros_instrumentos.sql"].map(rd);
const VOLTA = rd("20260917120000_screener_rhia_volta_ao_estado_de_14_09.sql");
const FOTO = `select json_build_object(
  'tabelas', (select json_agg(c.relname || ':' || pg_get_userbyid(c.relowner) || ':' || c.relrowsecurity || ':' || coalesce(c.relacl::text,'') order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
  'funcoes', (select json_agg(p.oid::regprocedure::text || ':' || pg_get_userbyid(p.proowner) || ':' || coalesce(p.proacl::text,'') || ':' || md5(pg_get_functiondef(p.oid)) order by 1) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'checks', (select json_agg(conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid) order by 1) from pg_constraint where connamespace='public'::regnamespace),
  'comentarios', (select json_agg(md5(coalesce(obj_description(p.oid,'pg_proc'),'')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'membros_dona', (select count(*) from pg_auth_members where roleid='screener_owner'::regrole),
  'create_schema', has_schema_privilege('screener_owner','public','create')) as f`;
async function banco(passos) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  for (const p of passos) await db.exec(p);
  return db;
}
test("a volta deixa o banco igual ao de quem nunca teve a sessao", async () => {
  const fNunca = (await (await banco(BASE)).query(FOTO)).rows[0].f;
  const ida = await banco([...BASE, ...SESSAO]);
  await ida.exec(VOLTA);
  const fVolta = (await ida.query(FOTO)).rows[0].f;
  for (const k of Object.keys(fNunca)) assert.deepEqual(fVolta[k], fNunca[k], 'diferenca em ' + k);
});

test("com dado nas tabelas da sessao, a volta aborta em vez de apagar", async () => {
  const db = await banco([...BASE, ...SESSAO]);
  await db.exec("with r as (insert into public.respondentes default values returning id) insert into public.screener_rhia_convites (codigo_hash, respondente_id, expira_em) select repeat('a',64), id, now() + interval '1 day' from r");
  await assert.rejects(db.exec(VOLTA), /a volta apagaria dado real/);
});
