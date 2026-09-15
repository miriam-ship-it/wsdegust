// O PERFIL DO FORMULÁRIO ÚNICO, em Postgres de verdade (pglite).
//
// O que estes testes protegem: PII declarada ANTES do portão. `nome`, `empresa`
// e `cargo` chegam no começo, ao contrário de tudo que o rhia coletava até aqui.
// A tabela não pode ser alcançável por papel nenhum, os valores de `nivel`,
// `porte` e `setor` têm de ser conferidos contra a definição guardada (nunca
// contra lista cravada no banco), e o perfil tem de sumir no prazo da SESSÃO —
// ele é insumo da avaliação, não contato.
//
// E uma recusa que vale por si: instrumento SEM bloco de perfil não aceita
// perfil. É isso que impede o link público anônimo de ganhar PII por descuido.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import instrumentoIA from "../../rhia/pacote/instrumento-rh-ia-v1.json" with { type: "json" };
import { checksum } from "../../rhia/definicao.mjs";
import { definicaoParaBanco, CODIGO_UNIFICADO } from "../../unificado/composicao.mjs";
import * as HR from "../../edge/handlers-rhia.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const SCHEMA = rd("20260902143339_screener_tabelas_isoladas.sql");
const RPC = rd("20260903120000_screener_rpc_e_papeis.sql");
const RHIA = rd("20260912120000_screener_rhia_tabelas_e_rpc.sql");
const PURGA = rd("20260914170000_screener_rhia_purga_por_retencao.sql").split("-- @@@CRON@@@")[0];
// A purga em vigor é a da ponte (fase 3); esta migration emenda aquele corpo.
const PONTE = rd("20260915120000_screener_rhia_ponte_com_lideranca.sql");
const PERFIL = rd("20260916120000_screener_rhia_perfil_do_formulario_unico.sql");

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const SLUG = "boomit-formulario-unico";
const DEF = definicaoParaBanco();

// O dublê de `respondentes` que a ponte exige (ver ponte.behavioral.test.mjs).
const RESPONDENTES_DUBLE = `
create table public.respondentes (
  id uuid primary key default gen_random_uuid(),
  token_sessao uuid not null unique default gen_random_uuid(),
  nome text, empresa text, email text,
  iniciado_em timestamptz not null default now()
);
alter table public.respondentes enable row level security;`;

/**
 * @param {object} [o]
 * @param {object} [o.definicao]  a definição guardada (padrão: a do formulário único)
 */
async function ambiente({ definicao = DEF, vinculo = {} } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC);
  await db.exec(RHIA);
  await db.exec(RESPONDENTES_DUBLE);
  await db.exec(PURGA);
  await db.exec(PONTE);
  await db.exec(PERFIL);
  await db.query(
    `insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
     values ($1,$2,$3,$4,'inactive')`,
    [definicao.instrument_id, definicao.instrument_version, JSON.stringify(definicao),
     sha(JSON.stringify(definicao))]);
  await db.query(
    `insert into public.screener_event_bindings
       (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
        session_retention_days, lead_retention_days, preview_credential_hash, starts_at, ends_at)
     values ($1,$2,$3, true, $4, 'immediate', 'required_before_result', $5, 365, null, $6, $7)`,
    [SLUG, definicao.instrument_id, definicao.instrument_version,
     vinculo.status ?? "public_pilot", vinculo.retencaoSessao === undefined ? 180 : vinculo.retencaoSessao,
     vinculo.startsAt ?? null, vinculo.endsAt ?? null]);
  return db;
}

const call = async (db, fn, params) =>
  (await db.query(`select public.${fn}(${params.map((_, i) => "$" + (i + 1)).join(",")}) as r`, params)).rows[0].r;

async function abrir(db, token = "tk1") {
  const now = new Date(), exp = new Date(now.getTime() + 864e5).toISOString();
  await call(db, "screener_rhia_op_start", [SLUG, sha(token), "v1", now.toISOString(), exp, null]);
  return sha(token);
}
const PERFIL_OK = ["Ana Souza", "Boomit", "Head de RH", "G", "S3", "V1"];
const salvar = (db, th, campos = PERFIL_OK, previa = null) =>
  call(db, "screener_rhia_op_salvar_perfil", [th, previa, ...campos]);

// -------------------------------------------------------------------------
// Gravar e ler
// -------------------------------------------------------------------------

test("perfil: grava e lê de volta o que foi declarado", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  assert.equal((await salvar(db, th)).status, "ok");

  const r = await call(db, "screener_rhia_op_ler_perfil", [th, null]);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.perfil, {
    nome: "Ana Souza", empresa: "Boomit", cargo: "Head de RH",
    nivel: "G", porte: "S3", setor: "V1",
  });
});

test("perfil: sessão sem perfil diz que não tem, em vez de inventar", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  assert.equal((await call(db, "screener_rhia_op_ler_perfil", [th, null])).status, "sem_perfil");
  assert.equal((await call(db, "screener_rhia_op_ler_perfil", [sha("nunca"), null])).status, "sessao_nao_encontrada");
});

test("perfil: responder de novo corrige, não duplica", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await salvar(db, th);
  await salvar(db, th, ["Ana Souza", "Outra Empresa", "Diretora", "X", "S4", "V2"]);

  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_perfis");
  assert.equal(rows[0].n, 1, "uma linha por sessão — quem volta e corrige não vira dois perfis");
  const r = await call(db, "screener_rhia_op_ler_perfil", [th, null]);
  assert.equal(r.perfil.porte, "S4");
  assert.equal(r.perfil.nivel, "X");
});

// -------------------------------------------------------------------------
// A validação vem da DEFINIÇÃO, não de lista cravada no banco
// -------------------------------------------------------------------------

test("perfil: valor fora da definição é recusado, e a resposta diz qual campo", async () => {
  const db = await ambiente();
  const th = await abrir(db);

  const nivel = await salvar(db, th, ["Ana", "Boomit", "Head", "Z", "S3", "V1"]);
  assert.equal(nivel.status, "valor_invalido");
  assert.equal(nivel.campo, "nivel");

  assert.equal((await salvar(db, th, ["Ana", "Boomit", "Head", "G", "S9", "V1"])).campo, "porte");
  assert.equal((await salvar(db, th, ["Ana", "Boomit", "Head", "G", "S3", "V99"])).campo, "setor");

  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_perfis");
  assert.equal(rows[0].n, 0, "recusa não pode gravar meio perfil");
});

test("perfil: um nível NOVO na definição passa a valer sem migration nenhuma", async () => {
  // É esta a diferença para a tabela do V1, onde `stage_code in ('E1'..'E4','NA')`
  // transformou "acrescentar um degrau" em migration de tabela compartilhada.
  const comNivelNovo = JSON.parse(JSON.stringify(DEF));
  comNivelNovo.perfil.find((c) => c.id === "nivel").opcoes.push({ id: "F", rotulo: "Fundador" });
  const db = await ambiente({ definicao: comNivelNovo });
  const th = await abrir(db);

  assert.equal((await salvar(db, th, ["Ana", "Boomit", "Fundadora", "F", "S1", "V1"])).status, "ok");
  assert.equal((await call(db, "screener_rhia_op_ler_perfil", [th, null])).perfil.nivel, "F");
});

test("perfil: instrumento SEM bloco de perfil não aceita perfil", async () => {
  // O link público do rhia é anônimo e tem de continuar sendo: a única coisa que
  // separa "anônimo" de "com nome e empresa" é o instrumento não ter o bloco.
  const db = await ambiente({ definicao: instrumentoIA });
  const th = await abrir(db);
  assert.equal((await salvar(db, th)).status, "instrumento_sem_perfil");
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_perfis");
  assert.equal(rows[0].n, 0);
});

// -------------------------------------------------------------------------
// Estado da sessão e higiene do texto
// -------------------------------------------------------------------------

test("perfil: sessão submetida não muda mais o perfil", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await salvar(db, th);
  await db.query("update public.screener_rhia_sessions set status='submitted', submitted_at=now()");

  const r = await salvar(db, th, ["Ana", "Boomit", "Head", "A", "S1", "V1"]);
  assert.equal(r.status, "sessao_nao_aberta",
    "trocar o porte depois do submit mudaria a conta por baixo de um resultado já entregue");
  assert.equal((await call(db, "screener_rhia_op_ler_perfil", [th, null])).perfil.porte, "S3");
});

test("perfil: sessão expirada ou revogada não grava", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await db.query(`update public.screener_rhia_sessions
                     set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'`);
  assert.equal((await salvar(db, th)).status, "sessao_invalida");

  await db.query(`update public.screener_rhia_sessions
                     set expires_at = now() + interval '1 day', revoked_at = now()`);
  assert.equal((await salvar(db, th)).status, "sessao_invalida");
});

test("perfil: campo obrigatório vazio é recusado; só espaço também", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  assert.equal((await salvar(db, th, ["", "Boomit", "Head", "G", "S3", "V1"])).status, "campo_obrigatorio");
  assert.equal((await salvar(db, th, ["   ", "Boomit", "Head", "G", "S3", "V1"])).status, "campo_obrigatorio");
  assert.equal((await salvar(db, th, ["Ana", null, "Head", "G", "S3", "V1"])).status, "campo_obrigatorio");
});

test("perfil: caractere de controle é limpo, não derruba a transação", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  assert.equal((await salvar(db, th, ["Ana", " Boomit ", "Head", "G", "S3", "V1"])).status, "ok");
  const r = await call(db, "screener_rhia_op_ler_perfil", [th, null]);
  assert.equal(r.perfil.nome, "Ana");
  assert.equal(r.perfil.empresa, "Boomit", "o trim também vale");
  assert.equal(r.perfil.cargo, "Head");
});

test("perfil: o NUL nem chega à função — é a EDGE que tem de tirá-lo", async () => {
  // Este teste começou como "o NUL é limpo pela RPC" e reprovou: o Postgres
  // recusa o byte no protocolo, antes de qualquer função. Fica escrito aqui para
  // que ninguém confie na limpeza do banco para esse caractere — quem limpa é a
  // edge, como `postLeadRhia` já faz para o lead.
  const db = await ambiente();
  const th = await abrir(db);
  await assert.rejects(
    salvar(db, th, ["An a", "Boomit", "Head", "G", "S3", "V1"]),
    /invalid byte sequence/);
});

test("perfil: texto longo demais é recusado com motivo, não truncado em silêncio", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  assert.equal((await salvar(db, th, ["A".repeat(121), "Boomit", "Head", "G", "S3", "V1"])).status,
    "campo_longo_demais");
});

// -------------------------------------------------------------------------
// Retenção: o perfil é insumo da avaliação
// -------------------------------------------------------------------------

test("purga: o perfil sai no prazo da SESSÃO, mesmo quando a sessão sobrevive pelo contato", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await salvar(db, th);
  await db.query(
    `insert into public.screener_rhia_leads (session_id, email, email_normalized)
     select s.id, 'a@b.com', 'a@b.com' from public.screener_rhia_sessions s where s.token_hash=$1`, [th]);
  await db.query(`update public.screener_rhia_sessions set created_at = now() - interval '200 days'`);

  const r = (await db.query("select public.screener_rhia_purga() as r")).rows[0].r;
  assert.equal(r.perfis, 1, "a purga tem de contar o que apagou");

  const { rows: p } = await db.query("select count(*)::int n from public.screener_rhia_perfis");
  assert.equal(p[0].n, 0, "nome, empresa e cargo não ficam até os 365 dias do contato");
  const { rows: s } = await db.query("select count(*)::int n from public.screener_rhia_sessions");
  assert.equal(s[0].n, 1, "a linha de sessão sobrevive porque o contato ainda vale — e é o desenho");
});

test("purga: perfil dentro do prazo não é tocado", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await salvar(db, th);
  const r = (await db.query("select public.screener_rhia_purga() as r")).rows[0].r;
  assert.equal(r.perfis, 0);
  assert.equal((await call(db, "screener_rhia_op_ler_perfil", [th, null])).status, "ok");
});

test("apagar a sessão apaga o perfil junto — rede de segurança, não política", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await salvar(db, th);
  await db.query("delete from public.screener_rhia_sessions where token_hash=$1", [th]);
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_perfis");
  assert.equal(rows[0].n, 0);
});

test("purga: as fases que já existiam continuam inteiras depois do replace", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await db.query(
    `insert into public.screener_rhia_responses (session_id, item_code, answer_code)
     select s.id, 'EST01', 'E3' from public.screener_rhia_sessions s where s.token_hash=$1`, [th]);
  await db.query(`update public.screener_rhia_sessions set created_at = now() - interval '200 days'`);

  const r = (await db.query("select public.screener_rhia_purga() as r")).rows[0].r;
  assert.equal(r.respostas, 1, "a fase 1 não pode ter se perdido na reescrita");
  assert.equal(r.sessoes_sem_contato, 1);
  for (const chave of ["snapshots", "respostas", "perfis", "sessoes_sem_contato",
    "sessoes_liberadas_pelo_contato", "contatos", "convites_vencidos"]) {
    assert.ok(Object.hasOwn(r, chave), `a purga deixou de relatar ${chave}`);
  }
});

// -------------------------------------------------------------------------
// Fronteira — a tabela guarda PII
// -------------------------------------------------------------------------

test("fronteira: nenhum papel alcança a tabela de perfil", async () => {
  const db = await ambiente();
  for (const papel of ["anon", "authenticated", "service_role", "screener_runtime"]) {
    const { rows } = await db.query(
      `select has_table_privilege($1, 'public.screener_rhia_perfis',
         'select,insert,update,delete,truncate,references,trigger') as pode`, [papel]);
    assert.equal(rows[0].pode, false, `${papel} alcança nome, empresa e cargo`);
  }
  const { rows } = await db.query(`
    select c.relrowsecurity as rls, pg_get_userbyid(c.relowner) as dono,
           (select count(*) from pg_policy p where p.polrelid=c.oid)::int as policies
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname='screener_rhia_perfis'`);
  assert.equal(rows[0].rls, true);
  assert.equal(rows[0].dono, "screener_owner");
  assert.equal(rows[0].policies, 0, "RLS sem policy é negação total, que é o desenho");
});

test("fronteira: as RPC de perfil são só do runtime; a auxiliar não é RPC", async () => {
  const db = await ambiente();
  const rpcs = [
    "public.screener_rhia_op_salvar_perfil(text,text,text,text,text,text,text,text)",
    "public.screener_rhia_op_ler_perfil(text,text)",
  ];
  for (const f of rpcs) {
    for (const papel of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query("select has_function_privilege($1,$2,'execute') as pode", [papel, f]);
      assert.equal(rows[0].pode, false, `${papel} alcança ${f}`);
    }
    const { rows } = await db.query("select has_function_privilege('screener_runtime',$1,'execute') as pode", [f]);
    assert.equal(rows[0].pode, true);
  }
  const aux = "public.screener_priv_perfil_opcao_ok(jsonb,text,text)";
  for (const papel of ["anon", "authenticated", "service_role", "screener_runtime"]) {
    const { rows } = await db.query("select has_function_privilege($1,$2,'execute') as pode", [papel, aux]);
    assert.equal(rows[0].pode, false, `${papel} não tem o que fazer com a auxiliar`);
  }
});

test("fronteira: a migration devolve o papel e fecha o CREATE que abriu", async () => {
  const db = await ambiente();
  const { rows } = await db.query(`
    select has_schema_privilege('screener_owner','public','create') as create_aberto,
           current_setting('boomit.papel_da_migration', true) as papel_guardado`);
  assert.equal(rows[0].create_aberto, false, "o CREATE em public era transitório");
  assert.ok(!rows[0].papel_guardado, "a variável de papel não pode sobreviver à migration");
});

test("o instrumento unificado que vai ao banco tem o bloco de perfil e os itens planos", async () => {
  assert.equal(DEF.instrument_id, CODIGO_UNIFICADO);
  assert.ok(Array.isArray(DEF.perfil) && DEF.perfil.length > 0);
  assert.ok(DEF.items.every((i) => typeof i.id === "string"));
  // É contra ISTO que a save_response (que está em produção e não se mexe) valida
  const lid = DEF.items.find((i) => i.id.startsWith("LID_"));
  assert.ok(lid.options.every((o) => typeof o.id === "string"));
});

// -------------------------------------------------------------------------
// AS QUATRO FRESTAS QUE A REVISÃO ACHOU — e que os 20 primeiros testes não viam,
// porque o ambiente deles só montava vínculo público, vigente, com retenção
// declarada e definição bem formada.
// -------------------------------------------------------------------------

// A sessão é aberta com o evento vivo e SÓ DEPOIS o vínculo muda — é este o
// cenário: `screener_rhia_op_start` já recusa evento fechado, então a sessão
// nasce legítima e o evento é desligado com ela aberta.
const mudarVinculo = (db, campos) =>
  db.query(`update public.screener_event_bindings set ${Object.keys(campos)
    .map((c, i) => `${c} = $${i + 1}`).join(", ")}`, Object.values(campos));

test("perfil: evento FECHADO depois da sessão aberta não aceita mais nome, empresa e cargo", async () => {
  // Desligar o evento é o botão de emergência. Sem esta checagem, ele parava as
  // RESPOSTAS e deixava passar justamente o que carrega PII.
  const db = await ambiente();
  const th = await abrir(db);
  await mudarVinculo(db, { status: "closed" });

  assert.equal((await salvar(db, th)).status, "indisponivel");
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_perfis");
  assert.equal(rows[0].n, 0);
});

test("perfil: janela do evento encerrada depois da sessão aberta não aceita perfil", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await mudarVinculo(db, { ends_at: new Date(Date.now() - 864e5).toISOString() });
  assert.equal((await salvar(db, th)).status, "fora_de_vigencia");

  await mudarVinculo(db, { ends_at: null, starts_at: new Date(Date.now() + 864e5).toISOString() });
  assert.equal((await salvar(db, th)).status, "fora_de_vigencia");
});

test("perfil: vínculo SEM prazo de retenção não coleta PII", async () => {
  // O CHECK do schema só exige retenção em public_pilot/published. Em prévia ela
  // pode faltar — e a purga não toca vínculo sem prazo. Seria nome, empresa e
  // cargo guardados para sempre, e é em prévia que este formulário vai ser
  // testado, com gente de verdade.
  // Prévia exige credencial, e a checagem dela vem ANTES: sem isto a RPC
  // devolveria `sessao_nao_encontrada` e o teste passaria pelo motivo errado.
  const db = await ambiente();
  const th = await abrir(db);
  const previa = sha("previa-secreta");
  await mudarVinculo(db, {
    status: "internal_preview", session_retention_days: null, preview_credential_hash: previa,
  });

  assert.equal((await salvar(db, th, PERFIL_OK, previa)).status, "retencao_nao_declarada");
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_perfis");
  assert.equal(rows[0].n, 0, "PII sem plano de apagamento não entra");
});

test("perfil: definição malformada vira recusa, não erro 500", async () => {
  // `jsonb_array_elements` sobre coisa que não é array ESTOURA. Os campos de
  // texto do perfil não têm `opcoes` nenhuma, e hoje só não quebram porque chave
  // ausente vira NULL. Escrever `opcoes: null` num deles — coisa natural de se
  // fazer ao mexer no perfil — derrubaria o primeiro passo do formulário.
  const quebrada = JSON.parse(JSON.stringify(DEF));
  quebrada.perfil.find((c) => c.id === "nome").opcoes = null;
  quebrada.perfil.find((c) => c.id === "porte").opcoes = "isto nao e um array";
  const db = await ambiente({ definicao: quebrada });
  const th = await abrir(db);

  const r = await salvar(db, th);
  assert.equal(r.status, "valor_invalido", "o pior caso é uma recusa que a edge já trata");
  assert.equal(r.campo, "porte");
});

test("perfil: sessão revogada não devolve mais nome, empresa e cargo", async () => {
  // Revogar é o mecanismo de "este link morreu". `salvar_perfil` já respeitava;
  // `ler_perfil` devolvia a PII assim mesmo.
  const db = await ambiente();
  const th = await abrir(db);
  await salvar(db, th);
  assert.equal((await call(db, "screener_rhia_op_ler_perfil", [th, null])).status, "ok");

  await db.query("update public.screener_rhia_sessions set revoked_at = now()");
  const r = await call(db, "screener_rhia_op_ler_perfil", [th, null]);
  assert.equal(r.status, "sessao_invalida");
  assert.equal(r.perfil, undefined, "nem um pedaço do perfil pode sair por sessão morta");
});

test("perfil: sessão expirada também não devolve o perfil", async () => {
  const db = await ambiente();
  const th = await abrir(db);
  await salvar(db, th);
  await db.query(`update public.screener_rhia_sessions
                     set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'`);
  assert.equal((await call(db, "screener_rhia_op_ler_perfil", [th, null])).status, "sessao_invalida");
});

// -------------------------------------------------------------------------
// As rotas que o front usa: POST e GET /rhia/perfil.
// -------------------------------------------------------------------------

const contexto = (db) => ({ q: (sql, params = []) => db.query(sql, params), now: () => new Date(), rate: { ativo: false, secret: null } });
const CAMPOS = { nome: "Ana Souza", empresa: "Boomit", cargo: "Head de RH", nivel: "G", porte: "S3", setor: "V1" };

test("rota: grava o perfil e devolve o que foi declarado", async () => {
  const db = await ambiente();
  const ctx = contexto(db);
  await abrir(db, "tk1");

  const r = await HR.postPerfilRhia(ctx, { token: "tk1", ...CAMPOS });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });

  const lido = await HR.getPerfilRhia(ctx, { token: "tk1" });
  assert.equal(lido.status, 200);
  assert.deepEqual(lido.body.perfil, CAMPOS);
});

test("rota: sessão sem perfil devolve 200 com nulo, não 404", async () => {
  // O front usa isto ao RETOMAR para saber se ainda falta preencher. Um 404 aqui
  // seria confundido com "sessão não existe" e mandaria a pessoa para a abertura.
  const db = await ambiente();
  const r = await HR.getPerfilRhia(contexto(db), { token: await abrir(db, "tk1") && "tk1" });
  assert.equal(r.status, 200);
  assert.equal(r.body.perfil, null);
});

test("rota: o NUL é limpo pela EDGE, antes de chegar ao banco", async () => {
  // O Postgres recusa o byte no protocolo, abortando a transação com um erro de
  // encoding. Se a edge não limpar, a pessoa vê um 500 sem explicação.
  const db = await ambiente();
  const ctx = contexto(db);
  await abrir(db, "tk1");
  const r = await HR.postPerfilRhia(ctx, { token: "tk1", ...CAMPOS, nome: "An a Souza" });
  assert.equal(r.status, 200);
  assert.equal((await HR.getPerfilRhia(ctx, { token: "tk1" })).body.perfil.nome, "Ana Souza");
});

test("rota: instrumento anônimo recusa perfil, e o motivo é de CONFIGURAÇÃO", async () => {
  const db = await ambiente({ definicao: instrumentoIA });
  await abrir(db, "tk1");
  const r = await HR.postPerfilRhia(contexto(db), { token: "tk1", ...CAMPOS });
  assert.equal(r.status, 409, "não é culpa de quem responde: é vínculo apontando para o instrumento errado");
  assert.equal(r.body.error, "instrumento_sem_perfil");
});

test("rota: valor fora da definição vira 400 dizendo o campo", async () => {
  const db = await ambiente();
  await abrir(db, "tk1");
  const r = await HR.postPerfilRhia(contexto(db), { token: "tk1", ...CAMPOS, porte: "S9" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "valor_invalido");
  assert.equal(r.body.campo, "porte", "a tela precisa saber qual campo pôr em evidência");
});

test("rota: campo obrigatório vazio e sessão morta têm respostas distintas", async () => {
  const db = await ambiente();
  const ctx = contexto(db);
  await abrir(db, "tk1");
  assert.equal((await HR.postPerfilRhia(ctx, { token: "tk1", ...CAMPOS, nome: "  " })).body.error, "campo_obrigatorio");

  await db.query(`update public.screener_rhia_sessions
                     set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'`);
  assert.equal((await HR.postPerfilRhia(ctx, { token: "tk1", ...CAMPOS })).status, 403);
  assert.equal((await HR.getPerfilRhia(ctx, { token: "tk1" })).status, 403,
    "ler também recusa: é nome, empresa e cargo");
});

test("rota: sessão que não existe não vaza a diferença", async () => {
  const db = await ambiente();
  const ctx = contexto(db);
  assert.equal((await HR.postPerfilRhia(ctx, { token: "nao-existe", ...CAMPOS })).status, 404);
  assert.equal((await HR.getPerfilRhia(ctx, { token: "nao-existe" })).status, 404);
});
