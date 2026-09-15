// A PONTE entre os dois diagnósticos, em Postgres de verdade (pglite).
//
// O que estes testes protegem é a diferença entre ligação CERTA e PROVÁVEL. Um
// documento que junta duas metades da pessoa errada é pior que um documento com
// metade faltando: o primeiro afirma, o segundo admite.
//
// SOBRE O DUBLÊ DE `respondentes`, E POR QUE ELE MUDOU.
// A tabela pertence ao app antigo, cujo schema inicial depende de extensões que
// o pglite não tem. A primeira versão destes testes criou um dublê mínimo — id,
// nome, e-mail — e **sem RLS**. Os onze testes ficaram verdes enquanto a ponte
// nascia morta em produção: `respondentes` tem RLS ligada desde a
// `20260526000001`, e as únicas policies de SELECT são para `anon` e
// `authenticated`. `screener_owner` não é dona da tabela e não ignora RLS —
// dentro do SECURITY DEFINER ela enxergaria ZERO linhas, devolvendo
// "respondente_nao_encontrado" e "sem_correspondencia" para todo mundo, sem
// erro e sem log.
//
// O dublê agora tem RLS ligada e as policies que sobreviveram no banco real. A
// regra que isso deixa escrita: **dublê não cobre o que o dublê não tem**.
//
// E O QUE ESTE ARQUIVO AINDA NÃO PROVA, para não prometer demais: no pglite o
// `postgres` é SUPERUSUÁRIO, então os auxiliares escapam da RLS por serem de
// superusuário — e não por serem do DONO da tabela, que é o mecanismo do qual
// produção depende. Um `respondentes` com outro dono, ou em FORCE ROW LEVEL
// SECURITY, passaria por aqui. Quem cobre isso é a guarda 7a da própria
// migration, que compara os donos e aborta; e a 7c, que no apply pergunta a uma
// linha real se ela é vista.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import instrumento from "../../rhia/pacote/instrumento-rh-ia-v1.json" with { type: "json" };
import { checksum } from "../../rhia/definicao.mjs";
import * as HR from "../../edge/handlers-rhia.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const SCHEMA = rd("20260902143339_screener_tabelas_isoladas.sql");
const RPC = rd("20260903120000_screener_rpc_e_papeis.sql");
const RHIA = rd("20260912120000_screener_rhia_tabelas_e_rpc.sql");
// A ponte substitui o corpo da purga (fase 3: convites vencidos), então a purga
// precisa existir antes. O bloco pg_cron só roda no Supabase real.
const PURGA = rd("20260914170000_screener_rhia_purga_por_retencao.sql").split("-- @@@CRON@@@")[0];
const PONTE = rd("20260915120000_screener_rhia_ponte_com_lideranca.sql");

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const SLUG = "boomit-degustacao-rh-ia";
const CODE = instrumento.instrument_id;
const VERSAO = instrumento.instrument_version;
const ICS = await checksum(instrumento);

// O dublê de `respondentes`: as colunas que a ponte toca, com a MESMA postura de
// segurança do banco real — RLS ligada e policies só para `anon` e
// `authenticated`. A policy de `authenticated` aqui é mais permissiva que a real
// (`using (true)` no lugar do filtro por evento) de propósito: se nem assim a
// ponte enxerga nada, a prova de que ela precisa de outro caminho fica mais
// forte, não mais fraca.
const RESPONDENTES_DUBLE = `
create table public.respondentes (
  id            uuid primary key default gen_random_uuid(),
  token_sessao  uuid not null unique default gen_random_uuid(),
  nome          text,
  empresa       text,
  email         text,
  iniciado_em   timestamptz not null default now()
);
alter table public.respondentes enable row level security;
create function public.sessao_do_cabecalho() returns text language sql stable as $f$
  select nullif(current_setting('request.headers', true), '')
$f$;
create policy "respondentes_anon_select_propria_sessao" on public.respondentes
  for select to anon using (token_sessao::text = public.sessao_do_cabecalho());
create policy "respondentes_admin_select_dos_seus" on public.respondentes
  for select to authenticated using (true);
`;

async function ambiente({ respondentePrevio = null, mutarPonte = null } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC);
  await db.exec(RHIA);
  await db.exec(RESPONDENTES_DUBLE);
  await db.exec(PURGA);
  // Um respondente que já existia ANTES da ponte é o que faz a guarda 7c da
  // migration ter o que provar: num banco vazio ela se cala de propósito.
  if (respondentePrevio) {
    await db.query("insert into public.respondentes (nome, empresa, email) values ('Ana','Boomit',$1)",
      [respondentePrevio]);
  }
  await db.exec(mutarPonte ? mutarPonte(PONTE) : PONTE);
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
/** Forja a idade da sessão. O CHECK exige expires_at > created_at, então a data
 *  não pode entrar pela abertura: envelhece-se depois, como o tempo faria. */
async function envelhecer(db, th, dias) {
  await db.query(`update public.screener_rhia_sessions
                     set created_at = now() - make_interval(days => $2::int)
                   where token_hash = $1`, [th, dias]);
}
/** Devolve { id, token_sessao } — a emissão do convite usa o TOKEN, não o id. */
async function criarRespondente(db, email, { nome = "Fulano", empresa = "Empresa", em = null } = {}) {
  const { rows } = await db.query(
    `insert into public.respondentes (nome, empresa, email, iniciado_em)
     values ($1,$2,$3, coalesce($4::timestamptz, now())) returning id, token_sessao`,
    [nome, empresa, email, em]);
  return rows[0];
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
// O DUBLÊ — a guarda contra o ponto cego que deixou a primeira versão passar.
// -------------------------------------------------------------------------

test("harness: o dublê de respondentes tem RLS ligada e só policies de anon/authenticated", async () => {
  const db = await ambiente();
  const { rows } = await db.query(`
    select c.relrowsecurity as rls,
           (select array_agg(distinct r.rolname order by r.rolname)
              from pg_policy p, unnest(p.polroles) pr join pg_roles r on r.oid = pr
             where p.polrelid = c.oid) as papeis
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='respondentes'`);
  assert.equal(rows[0].rls, true,
    "sem RLS no dublê, estes testes não cobrem o caminho que existe em produção");
  assert.deepEqual(rows[0].papeis, ["anon", "authenticated"],
    "nenhuma policy alcança screener_owner — é exatamente esta a dificuldade que a ponte resolve");
});

test("migration: com um respondente preexistente, a ponte o enxerga", async () => {
  const db = await ambiente({ respondentePrevio: "ana@boomit.com.br" });
  await db.query("set role screener_owner");
  const { rows } = await db.query("select quantos from public.screener_ponte_respondente_por_email($1)",
    ["ana@boomit.com.br"]);
  await db.query("reset role");
  assert.equal(rows[0].quantos, 1, "a ponte precisa enxergar quem já estava lá");
});

test("migration: a guarda 7c ABORTA o apply se a ponte ficar cega", async () => {
  // O teste acima prova o auxiliar; este prova o BLOCO. Sem ele, a 7c podia ser
  // apagada da migration sem que nada aqui reclamasse — e ela é justamente a
  // guarda que faltava em 15/09, quando a 7a dizia "está tudo estruturalmente
  // certo" e a RLS filtrava cada linha.
  // A mutação cega o auxiliar SEM mexer em dono, security definer ou
  // search_path, para que a 7a passe e só a 7c tenha o que dizer.
  await assert.rejects(
    ambiente({
      respondentePrevio: "ana@boomit.com.br",
      mutarPonte: (sql) => sql.replace(
        "and lower(trim(r.email)) = p_email_normalizado",
        "and false and lower(trim(r.email)) = p_email_normalizado"),
    }),
    /enxerga ZERO linhas de respondentes/);
});

// -------------------------------------------------------------------------
// (c) O CONVITE — ligação certa
// -------------------------------------------------------------------------

test("convite: liga a sessão ao respondente, e a ligação é CERTA", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "pessoa@empresa.com");
  const th = await abrir(db, "tk1");
  assert.equal((await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("conv-1"), 720])).status, "ok");

  const r = await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("conv-1")]);
  assert.equal(r.status, "ok");
  assert.equal(r.confianca, "certa");

  const lido = await call(db, "screener_rhia_op_ler_vinculo", [th]);
  assert.equal(lido.respondente_id, r0.id);
  assert.equal(lido.origem, "convite");
  assert.equal(lido.confianca, "certa");
});

test("convite: a emissão parte do TOKEN da sessão de liderança, não de um id escolhido", async () => {
  const db = await ambiente();
  await criarRespondente(db, "a@b.com");
  // Um token que não existe não emite nada. O id do respondente nunca entra pela
  // porta: quem chama precisa conhecer o segredo da sessão de liderança, e é a
  // edge que o lê do cabeçalho `x-sessao` — nunca do corpo da requisição.
  const r = await call(db, "screener_rhia_op_emitir_convite",
    ["00000000-0000-0000-0000-000000000000", sha("c"), 720]);
  assert.equal(r.status, "sessao_de_lideranca_nao_encontrada");
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_convites");
  assert.equal(rows[0].n, 0);
});

test("convite: é de USO ÚNICO", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("c"), 720]);
  const th1 = await abrir(db, "tk1"), th2 = await abrir(db, "tk2");

  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th1, sha("c")])).status, "ok");
  const r2 = await call(db, "screener_rhia_op_vincular_por_convite", [th2, sha("c")]);
  assert.equal(r2.status, "convite_ja_usado", "um convite não pode ligar duas pessoas");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th2])).status, "sem_vinculo");
});

test("convite: emitir o mesmo código duas vezes não cria dois convites", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  const p = [r0.token_sessao, sha("c"), 720];
  const um = await call(db, "screener_rhia_op_emitir_convite", p);
  const dois = await call(db, "screener_rhia_op_emitir_convite", p);
  assert.equal(dois.status, "ok");
  assert.equal(dois.convite_id, um.convite_id, "reenvio do mesmo e-mail não pode duplicar o convite");
  assert.equal(dois.ja_existia, true);
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_convites");
  assert.equal(rows[0].n, 1);

  // o mesmo código para OUTRA pessoa é conflito, não reemissão
  const outro = await criarRespondente(db, "c@d.com");
  assert.equal((await call(db, "screener_rhia_op_emitir_convite", [outro.token_sessao, sha("c"), 720])).status,
    "codigo_em_uso");
});

test("convite: expirado e inexistente são recusados", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  const th = await abrir(db, "tk1");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("velho"), 1]);
  // O CHECK exige expira_em > criado_em, então recuar só a expiração é rejeitado:
  // envelhecemos o convite inteiro, que é o que o tempo faria.
  await db.query(`update public.screener_rhia_convites
                     set criado_em = now() - interval '2 hours', expira_em = now() - interval '1 hour'`);
  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("velho")])).status, "convite_expirado");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("nunca-existiu")])).status, "convite_invalido");
});

test("convite: o código NUNCA é gravado cru", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("segredo-do-link"), 720]);
  const { rows } = await db.query("select codigo_hash from public.screener_rhia_convites");
  assert.equal(rows[0].codigo_hash, sha("segredo-do-link"));
  assert.ok(!rows[0].codigo_hash.includes("segredo"), "o código cru não pode estar no banco");
  // e um código fora do formato é recusado na emissão
  assert.equal((await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, "nao-e-hash", 720])).status, "codigo_invalido");
});

// -------------------------------------------------------------------------
// (a) A REDE POR E-MAIL — ligação provável
// -------------------------------------------------------------------------

test("e-mail: reconcilia quem chegou pelos dois lados, como PROVÁVEL", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "Pessoa@Empresa.COM");
  const th = await abrir(db, "tk1");
  await darContato(db, th, "pessoa@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ok");
  assert.equal(r.confianca, "provavel", "casamento por e-mail supõe, não sabe");
  const lido = await call(db, "screener_rhia_op_ler_vinculo", [th]);
  assert.equal(lido.respondente_id, r0.id);
  assert.equal(lido.origem, "email");
});

// A regra de ambiguidade (decisão da dona do produto, 15/09): duas linhas com o
// mesmo e-mail quase sempre são a MESMA pessoa em dois eventos — 108
// respondentes num fluxo por evento recorrente. Contar linhas chamaria isso de
// ambiguidade e recusaria justamente quem a rede existe para pegar. O que de
// fato indica duas pessoas atrás de uma caixa compartilhada é nome ou empresa
// DIVERGENTES.

test("e-mail: mesma pessoa em dois eventos liga à mais RECENTE, como provável", async () => {
  const db = await ambiente();
  const velho = await criarRespondente(db, "ana@empresa.com",
    { nome: "Ana Souza", empresa: "Empresa", em: "2025-03-01T10:00:00Z" });
  const novo = await criarRespondente(db, "ana@empresa.com",
    { nome: "ana souza", empresa: "  EMPRESA ", em: "2026-08-01T10:00:00Z" });
  const th = await abrir(db, "tk1");
  await darContato(db, th, "ana@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ok", "mesma pessoa duas vezes não é ambiguidade");
  assert.equal(r.confianca, "provavel");
  const lido = await call(db, "screener_rhia_op_ler_vinculo", [th]);
  assert.equal(lido.respondente_id, novo.id, "a metade mais recente é a que descreve a pessoa hoje");
  assert.notEqual(lido.respondente_id, velho.id);
});

test("e-mail: nomes divergentes no mesmo e-mail continuam AMBÍGUOS", async () => {
  const db = await ambiente();
  await criarRespondente(db, "contato@empresa.com", { nome: "Ana Souza", empresa: "Empresa" });
  await criarRespondente(db, "contato@empresa.com", { nome: "Bruno Lima", empresa: "Empresa" });
  const th = await abrir(db, "tk1");
  await darContato(db, th, "contato@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ambiguo", "caixa compartilhada: duas pessoas de verdade no mesmo endereço");
  assert.equal(r.candidatos, 2);
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).status, "sem_vinculo",
    "juntar a metade da pessoa errada é pior que ficar sem a metade");
});

test("e-mail: espaço interno a mais não faz duas empresas", async () => {
  // Sem a normalização de espaços internos, "Boomit  Brasil" e "Boomit Brasil"
  // contariam como divergência e recusariam a mesma pessoa. `trim()` sozinho
  // não pega isto — é o que o `regexp_replace` existe para resolver.
  const db = await ambiente();
  await criarRespondente(db, "ana@empresa.com",
    { nome: "Ana  Souza", empresa: "Boomit  Brasil", em: "2025-01-01T10:00:00Z" });
  const novo = await criarRespondente(db, "ana@empresa.com",
    { nome: "Ana Souza", empresa: "Boomit Brasil", em: "2026-01-01T10:00:00Z" });
  const th = await abrir(db, "tk1");
  await darContato(db, th, "ana@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ok");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).respondente_id, novo.id);
});

test("e-mail: empresas divergentes também são ambiguidade", async () => {
  const db = await ambiente();
  await criarRespondente(db, "ana@gmail.com", { nome: "Ana", empresa: "Boomit" });
  await criarRespondente(db, "ana@gmail.com", { nome: "Ana", empresa: "Outra Empresa" });
  const th = await abrir(db, "tk1");
  await darContato(db, th, "ana@gmail.com");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_email", [th])).status, "ambiguo");
});

test("e-mail: campo em branco é silêncio, não divergência", async () => {
  const db = await ambiente();
  await criarRespondente(db, "ana@empresa.com",
    { nome: "Ana", empresa: null, em: "2025-01-01T10:00:00Z" });
  const novo = await criarRespondente(db, "ana@empresa.com",
    { nome: null, empresa: "  ", em: "2026-01-01T10:00:00Z" });
  const th = await abrir(db, "tk1");
  await darContato(db, th, "ana@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ok", "ausência de dado não contradiz dado nenhum");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).respondente_id, novo.id);
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

  await call(db, "screener_rhia_op_emitir_convite", [certo.token_sessao, sha("c"), 720]);
  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c")])).confianca, "certa");
  const lido = await call(db, "screener_rhia_op_ler_vinculo", [th]);
  assert.equal(lido.respondente_id, certo.id, "o convite sabe quem é; o e-mail apenas supunha");
  assert.notEqual(lido.respondente_id, parecido.id);
});

test("hierarquia: o e-mail NUNCA rebaixa uma ligação certa", async () => {
  const db = await ambiente();
  const certo = await criarRespondente(db, "certo@empresa.com");
  await criarRespondente(db, "outro@empresa.com");
  const th = await abrir(db, "tk1");
  await call(db, "screener_rhia_op_emitir_convite", [certo.token_sessao, sha("c"), 720]);
  await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c")]);
  await darContato(db, th, "outro@empresa.com");

  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ja_vinculado");
  assert.equal(r.confianca, "certa");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).respondente_id, certo.id);
});

test("hierarquia: uma CERTA não é sobreposta por outra CERTA de pessoa diferente", async () => {
  const db = await ambiente();
  const primeiro = await criarRespondente(db, "um@empresa.com");
  const segundo = await criarRespondente(db, "dois@empresa.com");
  const th = await abrir(db, "tk1");
  await call(db, "screener_rhia_op_emitir_convite", [primeiro.token_sessao, sha("c1"), 720]);
  await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c1")]);

  await call(db, "screener_rhia_op_emitir_convite", [segundo.token_sessao, sha("c2"), 720]);
  const r = await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c2")]);
  assert.equal(r.status, "conflito_de_vinculo",
    "duas certezas que se contradizem não podem ser resolvidas por ordem de chegada");
  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).respondente_id, primeiro.id);
  // e o convite recusado continua de pé, para a sessão certa
  const { rows } = await db.query("select usado_em from public.screener_rhia_convites where codigo_hash=$1", [sha("c2")]);
  assert.equal(rows[0].usado_em, null, "convite recusado não pode ser queimado");
});

test("e-mail: quando já havia vínculo, a resposta diz o que DE FATO ficou gravado", async () => {
  const db = await ambiente();
  const primeiro = await criarRespondente(db, "um@empresa.com");
  const segundo = await criarRespondente(db, "dois@empresa.com");
  const th = await abrir(db, "tk1");
  await darContato(db, th, "um@empresa.com");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_email", [th])).status, "ok");

  // o contato muda; a segunda tentativa não grava nada, e não pode dizer "ok"
  await db.query("update public.screener_rhia_leads set email_normalized = $1", ["dois@empresa.com"]);
  const r = await call(db, "screener_rhia_op_vincular_por_email", [th]);
  assert.equal(r.status, "ja_vinculado");
  assert.equal(r.respondente_id, primeiro.id, "a resposta tem de descrever o banco, não a intenção");
  assert.notEqual(r.respondente_id, segundo.id);
});

// -------------------------------------------------------------------------
// A ponte convive com a purga que já está em produção.
// -------------------------------------------------------------------------

test("purga: sessão vencida com convite CONSUMIDO não derruba o lote", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  const th = await abrir(db, "tk1");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("c"), 720]);
  await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c")]);
  await envelhecer(db, th, 200);

  // `usado_por` é `on delete set null`: apagar a sessão zera o ponteiro. Se o
  // CHECK exigir que os dois campos de uso andem juntos, a purga inteira aborta
  // — e como é uma transação só, NADA é apagado, todo dia, em silêncio.
  const r = await db.query("select public.screener_rhia_purga() as r");
  assert.equal(r.rows[0].r.sessoes_sem_contato, 1, "a sessão vencida tinha de sair");

  const { rows } = await db.query("select usado_em, usado_por from public.screener_rhia_convites");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].usado_em !== null, "o convite continua consumido: uso único sobrevive à purga");
  assert.equal(rows[0].usado_por, null, "o ponteiro para a sessão apagada some, que é o desenho");
});

test("purga: convite vencido some, e com ele o ponteiro para a pessoa", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("vivo"), 720]);
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("velho"), 1]);
  await db.query(`update public.screener_rhia_convites
                     set criado_em = now() - interval '2 hours', expira_em = now() - interval '1 hour'
                   where codigo_hash = $1`, [sha("velho")]);

  const r = await db.query("select public.screener_rhia_purga() as r");
  assert.equal(r.rows[0].r.convites_vencidos, 1);
  const { rows } = await db.query("select codigo_hash from public.screener_rhia_convites");
  assert.deepEqual(rows.map((x) => x.codigo_hash), [sha("vivo")],
    "o convite declara o próprio prazo; passado ele, guardar um ponteiro para PII não serve a nada");
});

test("convite: o prazo tem TETO, senão um convite nunca venceria e nunca seria purgado", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  assert.equal((await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("c"), 2000000000])).status, "ok");
  const { rows } = await db.query(
    "select expira_em <= criado_em + interval '2160 hours' as dentro from public.screener_rhia_convites");
  assert.equal(rows[0].dentro, true,
    "sem teto, a FASE 3 da purga nunca alcançaria o convite e o ponteiro para PII ficaria para sempre");

  // O teto da RPC conta HORAS; o CHECK precisa contar a mesma coisa. Se ele
  // dissesse `interval '90 days'`, num fuso com horário de verão 90 dias
  // valeriam 2159 horas de relógio e a emissão no limite estouraria o CHECK —
  // erro cru de banco, 500 na edge, em vez de status. O fuso padrão do pglite
  // tem offset fixo e não pegaria isso.
  await db.exec("set time zone 'Australia/Sydney'");
  const outro = await criarRespondente(db, "b@c.com");
  assert.equal((await call(db, "screener_rhia_op_emitir_convite", [outro.token_sessao, sha("limite"), 2160])).status,
    "ok", "emitir no limite exato do teto não pode virar violação de CHECK");
  await db.exec("set time zone 'UTC'");

  // e a regra vale para qualquer escritor, não só para a RPC
  await assert.rejects(
    db.query(`insert into public.screener_rhia_convites (codigo_hash, respondente_id, expira_em)
              values ($1, $2, now() + interval '400 days')`, [sha("eterno"), r0.id]),
    /screener_rhia_convite_prazo_maximo/);
});

test("convite: sessão rhia expirada não QUEIMA o convite", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  const th = await abrir(db, "tk1");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha("c"), 720]);
  // o CHECK exige expires_at > created_at: envelhece-se a sessão inteira, que é
  // o que o tempo faria numa aba deixada aberta de ontem
  await db.query(`update public.screener_rhia_sessions
                     set created_at = now() - interval '2 hours',
                         expires_at = now() - interval '1 hour'`);

  assert.equal((await call(db, "screener_rhia_op_vincular_por_convite", [th, sha("c")])).status, "sessao_invalida");
  const { rows } = await db.query("select usado_em from public.screener_rhia_convites");
  assert.equal(rows[0].usado_em, null,
    "queimar o convite numa aba velha deixaria a pessoa sem ponte para sempre");

  // e a rede por e-mail também não trabalha sobre sessão morta
  await darContato(db, th, "a@b.com");
  assert.equal((await call(db, "screener_rhia_op_vincular_por_email", [th])).status, "sessao_invalida");
});

test("purga: o `create or replace` da ponte não afrouxa dono nem alcance", async () => {
  // A 20260914170000 usou `create function` justamente porque função nova nasce
  // com EXECUTE para PUBLIC. Num banco sem aquela migration, o `or replace`
  // desta aqui CRIA a função — e ela nasceria alcançável por anon.
  const db = await ambiente();
  const { rows: d } = await db.query(`
    select pg_get_userbyid(p.proowner) as dono
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='screener_rhia_purga'`);
  assert.equal(d[0].dono, "screener_owner", "SECURITY DEFINER com dono errado não alcança as tabelas");
  for (const papel of ["anon", "authenticated", "service_role", "screener_runtime"]) {
    const { rows } = await db.query(
      "select has_function_privilege($1, 'public.screener_rhia_purga()', 'execute') as pode", [papel]);
    assert.equal(rows[0].pode, false, `${papel} não pode apagar PII`);
  }
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
  // e zero privilégio de tabela. `has_table_privilege` pergunta ao próprio
  // Postgres o que o papel PODE; `information_schema.role_table_grants` mostra
  // só as concessões visíveis a quem consulta, e pode calar uma que exista.
  for (const t of ["public.screener_rhia_convites", "public.screener_rhia_vinculos"]) {
    const { rows } = await db.query(
      `select has_table_privilege('screener_runtime', $1,
         'select,insert,update,delete,truncate,references,trigger') as pode`, [t]);
    assert.equal(rows[0].pode, false, `o runtime só alcança as RPC, nunca ${t}`);
  }
});

test("fronteira: os auxiliares que leem respondentes são só do screener_owner", async () => {
  const db = await ambiente();
  for (const f of [
    "public.screener_ponte_respondente_por_token(uuid)",
    "public.screener_ponte_respondente_por_email(text)",
  ]) {
    for (const papel of ["anon", "authenticated", "service_role", "screener_runtime"]) {
      const { rows } = await db.query("select has_function_privilege($1, $2, 'execute') as pode", [papel, f]);
      assert.equal(rows[0].pode, false, `${papel} não pode ler respondentes por ${f}`);
    }
    const { rows } = await db.query("select has_function_privilege('screener_owner', $1, 'execute') as pode", [f]);
    assert.equal(rows[0].pode, true, "a ponte precisa do auxiliar");
  }
});

test("fronteira: o auxiliar por e-mail não devolve PII — só id e formato do conjunto", async () => {
  const db = await ambiente();
  await criarRespondente(db, "ana@empresa.com", { nome: "Ana Souza", empresa: "Boomit" });
  const { fields } = await db.query("select * from public.screener_ponte_respondente_por_email($1)", ["ana@empresa.com"]);
  assert.deepEqual(fields.map((f) => f.name).sort(),
    ["empresas_distintas", "nomes_distintos", "quantos", "respondente_id"],
    "nome e empresa saem como CONTAGEM; o texto nunca cruza a fronteira");
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

// -------------------------------------------------------------------------
// A rota que o navegador usa: POST /rhia/vincular.
// -------------------------------------------------------------------------

/** O `ctx` que os handlers da edge esperam, ligado a este banco. */
const contexto = (db) => ({ q: (sql, params = []) => db.query(sql, params), now: () => new Date(), rate: { ativo: false, secret: null } });

test("rota: o convite vira vínculo, e a resposta NÃO devolve o respondente", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  const th = await abrir(db, "tk1");
  const codigo = sha("codigo-do-link");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha(codigo), 720]);

  const r = await HR.postVincularRhia(contexto(db), { token: "tk1", convite: codigo });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
  const blob = JSON.stringify(r.body);
  assert.ok(!blob.includes(r0.id), "o id do respondente é para montar o documento, não para o navegador");
  assert.ok(!blob.includes("certa"), "nem a confiança precisa cruzar: o que a pessoa precisa saber é se funcionou");

  assert.equal((await call(db, "screener_rhia_op_ler_vinculo", [th])).respondente_id, r0.id);
});

test("rota: código fora do formato nem chega ao banco, e responde como código inexistente", async () => {
  const db = await ambiente();
  let bateu = 0;
  const ctx = { q: (sql, params = []) => { bateu++; return db.query(sql, params); }, now: () => new Date(), rate: { ativo: false, secret: null } };
  await abrir(db, "tk1");

  for (const convite of ["nao-e-codigo", "", null, undefined, 42, sha("x").toUpperCase()]) {
    const r = await HR.postVincularRhia(ctx, { token: "tk1", convite });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "convite_invalido",
      "quem tenta adivinhar não aprende nada com a diferença entre malformado e inexistente");
  }
  assert.equal(bateu, 0, "formato conferido antes do banco");
});

test("rota: convite já usado, expirado e sessão morta têm respostas distintas", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  const ctx = contexto(db);
  await abrir(db, "tk1"); await abrir(db, "tk2");
  const cod = sha("c");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha(cod), 720]);

  assert.equal((await HR.postVincularRhia(ctx, { token: "tk1", convite: cod })).status, 200);
  const usado = await HR.postVincularRhia(ctx, { token: "tk2", convite: cod });
  assert.equal(usado.status, 409);
  assert.equal(usado.body.error, "convite_ja_usado");

  const inexistente = await HR.postVincularRhia(ctx, { token: "tk2", convite: sha("nunca") });
  assert.equal(inexistente.status, 404);

  // sessão expirada: o convite não pode ser queimado por uma aba velha
  const cod2 = sha("c2");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha(cod2), 720]);
  await db.query(`update public.screener_rhia_sessions
                     set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
                   where token_hash = $1`, [sha("tk2")]);
  const morta = await HR.postVincularRhia(ctx, { token: "tk2", convite: cod2 });
  assert.equal(morta.status, 403);
  assert.equal(morta.body.error, "sessao_invalida");
  const { rows } = await db.query("select usado_em from public.screener_rhia_convites where codigo_hash=$1", [sha(cod2)]);
  assert.equal(rows[0].usado_em, null);
});

test("rota: sessão que não existe não vira vínculo", async () => {
  const db = await ambiente();
  const r0 = await criarRespondente(db, "a@b.com");
  const cod = sha("c");
  await call(db, "screener_rhia_op_emitir_convite", [r0.token_sessao, sha(cod), 720]);
  const r = await HR.postVincularRhia(contexto(db), { token: "sessao-que-nao-existe", convite: cod });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "sessao_nao_encontrada");
});
