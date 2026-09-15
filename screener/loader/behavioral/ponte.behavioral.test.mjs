// A PONTE entre os dois diagnósticos, em Postgres de verdade (pglite).
//
// O que estes testes protegem é a diferença entre ligação CERTA e PROVÁVEL. Um
// documento que junta duas metades da pessoa errada é pior que um documento com
// metade faltando: o primeiro afirma, o segundo admite.
//
// Nota sobre o ambiente: a tabela `respondentes` pertence ao app antigo, cujo
// schema inicial depende de extensões que o pglite não tem. Como a ponte só
// precisa de `id` e `email`, o harness cria uma versão mínima. O que se testa
// aqui é a lógica da ponte, não o schema do app antigo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import instrumento from "../../rhia/pacote/instrumento-rh-ia-v1.json" with { type: "json" };
import { checksum } from "../../rhia/definicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const SCHEMA = rd("20260902143339_screener_tabelas_isoladas.sql");
const RPC = rd("20260903120000_screener_rpc_e_papeis.sql");
const RHIA = rd("20260912120000_screener_rhia_tabelas_e_rpc.sql");
const PONTE = rd("20260915120000_screener_rhia_ponte_com_lideranca.sql");

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const SLUG = "boomit-degustacao-rh-ia";
const CODE = instrumento.instrument_id;
const VERSAO = instrumento.instrument_version;
const ICS = await checksum(instrumento);

async function ambiente() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC);
  await db.exec(RHIA);
  // Versão mínima da tabela do app antigo — ver a nota no topo do arquivo.
  await db.exec(`create table public.respondentes (
    id uuid primary key default gen_random_uuid(),
    nome text, email text);`);
  await db.exec(PONTE);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ($1,$2,$3,$4,'inactive')`, [CODE, VERSAO, JSON.stringify(instrumento), ICS]);
  await db.query(`insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
       session_retention_days, lead_retention_days, preview_credential_hash)
      values ($1,$2,$3, true, 'public_pilot', 'immediate', 'required_before_result', 180, 365, null)`,
    [SLUG, CODE, VERSAO]);
  return db;
}
const call = async (db, fn, params) =>
  (await db.query(`select public.${fn}(${params.map((_, i) => "$" + (i + 1)).join(",")}) as r`, params)).rows[0].r;

/** Abre uma sessão rhia e devolve o hash do token. */
async function abrir(db, token) {
  const now = new Date(), exp = new Date(now.getTime() + 864e5).toISOString();
  await call(db, "screener_rhia_op_start", [SLUG, sha(token), "v1", now.toISOString(), exp, null]);
  return sha(token);
}
async function criarRespondente(db, email) {
  const { rows } = await db.query("insert into public.respondentes (nome, email) values ('Fulano', $1) returning id", [email]);
  return rows[0].id;
}
/**
 * Grava o contato da sessão, que é o que a rede por e-mail usa.
 * Insere direto em vez de chamar `screener_rhia_op_capturar_lead`: aquela RPC
 * exige sessão submetida, porque é o portão do resultado. Submeter exigiria
 * responder as 30 e finalizar, e o portão já é testado em rhia-rpc — aqui o
 * assunto é a ponte.
 */
async function darContato(db, th, email) {
  await db.query(
    `insert into public.screener_rhia_leads (session_id, email, email_normalized)
     select s.id, $2, lower(trim($2)) from public.screener_rhia_sessions s where s.token_hash = $1`,
    [th, email]);
}

// -------------------------------------------------------------------------
// (c) O CONVITE — ligação certa
// -------------------------------------------------------------------------

test("convite: liga a sessão ao respondente, e a ligação é CERTA", async () => {
  const db = await ambiente();
  const rid = await criarRespondente(db, "pessoa@empresa.com");
  const th = await abrir(db, "tk1");
  assert.equal((await call(db, "screener_rhia_op_emitir_convite", [rid, sha("conv-1"), 720])).status, "ok");

  const r = await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("conv-1")]);
  assert.equal(r.status, "ok");
  assert.equal(r.confianca, "certa");

  const lido = await call(db, "screener_rhia_op_ler_vinculo", [th]);
  assert.equal(lido.respondente_id, rid);
  assert.equal(lido.origem, "convite");
  assert.equal(lido.confianca, "certa");
});

test("convite: é de USO ÚNICO", async () => {
  const db = await ambiente();
  const rid = await criarRespondente(db, "a@b.com");
  await call(db, "screener_rhia_op_emitir_convite", [rid, sha("c"), 720]);
  const th1 = await abrir(db, "tk1"), th2 = await abrir(db, "tk2");

  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th1, sha("c")])).status, "ok");
  const r2 = await call(db, "screener_rhia_op_vincular_por_convite", [th2, sha("c")]);
  assert.equal(r2.status, "convite_ja_usado", "um convite não pode ligar duas pessoas");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th2])).status, "sem_vinculo");
});

test("convite: expirado e inexistente são recusados", async () => {
  const db = await ambiente();
  const rid = await criarRespondente(db, "a@b.com");
  const th = await abrir(db, "tk1");
  await call(db, "screener_rhia_op_emitir_convite", [rid, sha("velho"), 1]);
  // O CHECK exige expira_em > criado_em, então recuar só a expiração é rejeitado:
  // envelhecemos o convite inteiro, que é o que o tempo faria.
  await db.query(`update public.screener_rhia_convites
                     set criado_em = now() - interval '2 hours', expira_em = now() - interval '1 hour'`);
  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("velho")])).status, "convite_expirado");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("nunca-existiu")])).status, "convite_invalido");
});

test("convite: o código NUNCA é gravado cru", async () => {
  const db = await ambiente();
  const rid = await criarRespondente(db, "a@b.com");
  await call(db, "screener_rhia_op_emitir_convite", [rid, sha("segredo-do-link"), 720]);
  const { rows } = await db.query("select codigo_hash from public.screener_rhia_convites");
  assert.equal(rows[0].codigo_hash, sha("segredo-do-link"));
  assert.ok(!rows[0].codigo_hash.includes("segredo"), "o código cru não pode estar no banco");
  // e um código fora do formato é recusado na emissão
  assert.equal((await call(db, "screener_rhia_op_emitir_convite", [rid, "nao-e-hash", 720])).status, "codigo_invalido");
});

// -------------------------------------------------------------------------
// (a) A REDE POR E-MAIL — ligação provável
// -------------------------------------------------------------------------

test("e-mail: reconcilia quem chegou pelos dois lados, como PROVÁVEL", async () => {
  const db = await ambiente();
  const rid = await criarRespondente(db, "Pessoa@Empresa.COM");
  const th = await abrir(db, "tk1");
  await darContato(db, th, "pessoa@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ok");
  assert.equal(r.confianca, "provavel", "casamento por e-mail supõe, não sabe");
  const lido = await call(db, "screener_rhia_op_ler_vinculo", [th]);
  assert.equal(lido.respondente_id, rid);
  assert.equal(lido.origem, "email");
});

test("e-mail: AMBIGUIDADE não vira palpite", async () => {
  const db = await ambiente();
  await criarRespondente(db, "mesmo@empresa.com");
  await criarRespondente(db, "mesmo@empresa.com");
  const th = await abrir(db, "tk1");
  await darContato(db, th, "mesmo@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ambiguo");
  assert.equal(r.candidatos, 2);
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).status, "sem_vinculo",
    "juntar a metade da pessoa errada é pior que ficar sem a metade");
});

test("e-mail: sem contato e sem correspondência não inventam vínculo", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk1");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_email", [th])).status, "sem_contato");
  await darContato(db, th, "ninguem@lugar.com");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_email", [th])).status, "sem_correspondencia");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).status, "sem_vinculo");
});

// -------------------------------------------------------------------------
// A hierarquia entre as duas: certa sobrepõe provável, nunca o contrário.
// -------------------------------------------------------------------------

test("hierarquia: o convite SOBREPÕE um casamento por e-mail anterior", async () => {
  const db = await ambiente();
  const certo = await criarRespondente(db, "certo@empresa.com");
  const parecido = await criarRespondente(db, "parecido@empresa.com");
  const th = await abrir(db, "tk1");
  await darContato(db, th, "parecido@empresa.com");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_email", [th])).confianca, "provavel");

  await call(db, "screener_rhia_op_emitir_convite", [certo, sha("c"), 720]);
  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c")])).confianca, "certa");
  const lido = await call(db, "screener_rhia_op_ler_vinculo", [th]);
  assert.equal(lido.respondente_id, certo, "o convite sabe quem é; o e-mail apenas supunha");
  assert.notEqual(lido.respondente_id, parecido);
});

test("hierarquia: o e-mail NUNCA rebaixa uma ligação certa", async () => {
  const db = await ambiente();
  const certo = await criarRespondente(db, "certo@empresa.com");
  const outro = await criarRespondente(db, "outro@empresa.com");
  const th = await abrir(db, "tk1");
  await call(db, "screener_rhia_op_emitir_convite", [certo, sha("c"), 720]);
  await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c")]);
  await darContato(db, th, "outro@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ja_vinculado");
  assert.equal(r.confianca, "certa");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).respondente_id, certo);
});

// -------------------------------------------------------------------------
// Fronteira: a ponte obedece às mesmas regras das outras sete RPC.
// -------------------------------------------------------------------------

test("fronteira: nenhum papel público alcança a ponte", async () => {
  const db = await ambiente();
  for (const f of [
    "public.screener_rhia_op_emitir_convite(uuid,text,int)",
    "public.screener_rhia_op_vincular_por_convite(text,text)",
    "public.screener_rhia_op_vincular_por_email(text)",
    "public.screener_rhia_op_ler_vinculo(text)",
  ]) {
    for (const papel of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query("select has_function_privilege($1, $2, 'execute') as pode", [papel, f]);
      assert.equal(rows[0].pode, false, `${papel} alcança ${f}`);
    }
    const { rows } = await db.query("select has_function_privilege('screener_runtime', $1, 'execute') as pode", [f]);
    assert.equal(rows[0].pode, true, `o runtime precisa alcançar ${f}`);
  }
  // e zero privilégio de tabela
  const { rows } = await db.query(`select count(*)::int n from information_schema.role_table_grants
     where grantee = 'screener_runtime' and table_name in ('screener_rhia_convites','screener_rhia_vinculos')`);
  assert.equal(rows[0].n, 0, "o runtime só alcança as RPC, nunca as tabelas");
});

test("fronteira: as tabelas da ponte são do screener_owner, com RLS e sem policy", async () => {
  const db = await ambiente();
  const { rows } = await db.query(`
    select c.relname, pg_get_userbyid(c.relowner) as dono, c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname in ('screener_rhia_convites','screener_rhia_vinculos')
     order by 1`);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.dono, "screener_owner", `${r.relname} com dono errado`);
    assert.equal(r.rls, true, `${r.relname} sem RLS`);
    assert.equal(r.policies, 0, "RLS sem policy é negação total, que é o desenho");
  }
});
