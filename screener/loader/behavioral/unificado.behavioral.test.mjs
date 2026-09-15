// O FORMULÁRIO ÚNICO DE PONTA A PONTA, em Postgres de verdade (pglite).
//
// É esta a prova que faltava: uma pessoa abre a sessão, declara o perfil,
// responde as duas metades e recebe o documento — com as duas leituras e a
// relação entre elas —, tudo passando pelas RPC e pelas migrations reais.
//
// E o que ele protege, além do caminho feliz: que o resultado do documento único
// possa ser GUARDADO. Até a 20260916140000 o CHECK do snapshot exigia a versão do
// contrato de IA, e finalizar aqui morreria no banco. Fazer o documento se
// declarar "2.0.0-pilot" para caber teria funcionado — e mentiria no banco para
// quem lesse aquele campo daqui a seis meses.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as HR from "../../edge/handlers-rhia.mjs";
import { definicaoParaBanco, apresentacaoUnificada } from "../../unificado/composicao.mjs";
import { VERSAO_RESULTADO_UNIFICADO, VERSAO_RESULTADO_RHIA } from "../../edge/instrumentos.mjs";
import { documentoImprimivel } from "../../documento/imprimivel.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const MIGRATIONS = [
  rd("20260902143339_screener_tabelas_isoladas.sql"),
  rd("20260903120000_screener_rpc_e_papeis.sql"),
  rd("20260912120000_screener_rhia_tabelas_e_rpc.sql"),
  // o dublê de `respondentes` que a ponte exige
  `create table public.respondentes (
     id uuid primary key default gen_random_uuid(),
     token_sessao uuid not null unique default gen_random_uuid(),
     nome text, empresa text, email text,
     iniciado_em timestamptz not null default now());
   alter table public.respondentes enable row level security;`,
  rd("20260914170000_screener_rhia_purga_por_retencao.sql").split("-- @@@CRON@@@")[0],
  rd("20260915120000_screener_rhia_ponte_com_lideranca.sql"),
  rd("20260916120000_screener_rhia_perfil_do_formulario_unico.sql"),
  rd("20260916140000_screener_rhia_snapshot_aceita_outros_instrumentos.sql"),
];

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const SLUG = "boomit-formulario-unico";
const DEF = definicaoParaBanco();
const PERFIL = { nome: "Ana Souza", empresa: "Boomit", cargo: "Head de RH", nivel: "G", porte: "S3", setor: "V1" };

async function ambiente({ semUltimaMigration = false } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  const lista = semUltimaMigration ? MIGRATIONS.slice(0, -1) : MIGRATIONS;
  for (const m of lista) await db.exec(m);
  await db.query(
    `insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
     values ($1,$2,$3,$4,'inactive')`,
    [DEF.instrument_id, DEF.instrument_version, JSON.stringify(DEF), sha(JSON.stringify(DEF))]);
  await db.query(
    `insert into public.screener_event_bindings
       (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
        session_retention_days, lead_retention_days, preview_credential_hash)
     values ($1,$2,$3, true, 'public_pilot', 'immediate', 'optional_after_submit', 180, 365, null)`,
    [SLUG, DEF.instrument_id, DEF.instrument_version]);
  return {
    db,
    ctx: { q: (sql, params = []) => db.query(sql, params), now: () => new Date(), rate: { ativo: false, secret: null } },
  };
}

/** Uma resposta válida para cada item, tirada da PRÓPRIA apresentação. */
function respostasDaApresentacao(apres = apresentacaoUnificada()) {
  const R = {};
  for (const it of apres.items) {
    // CTX01 = OTHER abriria o campo de texto livre; aqui o assunto é o fluxo.
    const op = it.options.find((o) => o.id !== "OTHER") ?? it.options[0];
    R[it.id] = op.id;
  }
  return R;
}

// -------------------------------------------------------------------------

test("fluxo completo: perfil, as duas metades, e o documento com a relação entre elas", async () => {
  const { db, ctx } = await ambiente();

  // 1. abre a sessão — e já recebe o formulário inteiro, com o bloco de perfil
  const inicio = await HR.postStartRhia(ctx, {
    event_slug: SLUG, privacy_ack: true, privacy_notice_version: "v1",
  });
  assert.equal(inicio.status, 201, JSON.stringify(inicio.body));
  const token = inicio.body.token;
  assert.ok(Array.isArray(inicio.body.perfil) && inicio.body.perfil.length === 6,
    "sem o bloco de perfil o front não mostra a primeira tela");
  assert.equal(inicio.body.items.length, 40);
  assert.ok(!JSON.stringify(inicio.body).includes('"score"'), "o ponto de liderança não pode cruzar");

  // 2. declara o perfil
  assert.equal((await HR.postPerfilRhia(ctx, { token, ...PERFIL })).status, 200);

  // 3. responde as duas metades
  const respostas = respostasDaApresentacao();
  for (const [item_id, value] of Object.entries(respostas)) {
    const r = await HR.putResponseRhia(ctx, { token, item_id, value });
    assert.equal(r.status, 200, `${item_id}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.progress.total, 40, "o total tem de ser o DESTE instrumento, não os 30 do pacote");
  }

  // 4. envia
  const fim = await HR.postSubmitRhia(ctx, { token });
  assert.equal(fim.status, 200, JSON.stringify(fim.body));
  const doc = fim.body;

  assert.equal(doc.version, VERSAO_RESULTADO_UNIFICADO);
  assert.ok(doc.liderancaPublica && doc.liderancaPublica.status === "OK", "a metade de liderança saiu");
  assert.ok(doc.ia && doc.ia.positioning, "a metade de IA saiu");
  assert.ok(doc.cruzamento, "e a relação entre as duas, que é o que justifica o documento");
  assert.equal(doc.perfil.nome, "Ana Souza", "a capa precisa de quem respondeu");

  // 5. e o documento imprimível monta a partir disso, sem mais nada
  const html = documentoImprimivel(doc, { instrumentVersion: DEF.instrument_version });
  assert.ok(html.includes("Ana Souza") && html.includes("Parte 1 · Liderança") && html.includes("Parte 2 · RH"));

  await db.close?.();
});

test("o snapshot guarda o contrato inteiro, e o público não leva resposta nenhuma", async () => {
  const { db, ctx } = await ambiente();
  const inicio = await HR.postStartRhia(ctx, { event_slug: SLUG, privacy_ack: true, privacy_notice_version: "v1" });
  const token = inicio.body.token;
  await HR.postPerfilRhia(ctx, { token, ...PERFIL });
  for (const [item_id, value] of Object.entries(respostasDaApresentacao())) {
    await HR.putResponseRhia(ctx, { token, item_id, value });
  }
  await HR.postSubmitRhia(ctx, { token });

  const { rows } = await db.query("select result, report_version, scoring_version from public.screener_rhia_result_snapshots");
  assert.equal(rows.length, 1);
  const { result, report_version } = rows[0];

  assert.equal(report_version, VERSAO_RESULTADO_UNIFICADO);
  assert.equal(result.public.version, report_version, "o contrato não pode mentir sobre a própria versão");
  assert.notEqual(report_version, VERSAO_RESULTADO_RHIA, "não é o contrato de IA, e não se declara como tal");

  // as respostas ficam no INTERNO, nunca no público
  assert.ok(result.internal.answers && Object.keys(result.internal.answers).length === 40);
  assert.deepEqual(result.internal.perfil, PERFIL);
  const publico = JSON.stringify(result.public);
  assert.ok(!publico.includes("LID_q1"), "id de item não é resultado");
  assert.ok(!publico.includes('"O1"'), "alternativa escolhida não é resultado");
  // e a metade CRUA de liderança (escala 1–5, a régua interna) não é publicada
  assert.equal(result.public.lideranca, undefined);

  await db.close?.();
});

test("SEM a migration do snapshot, finalizar morreria no banco — e é por isso que ela existe", async () => {
  // Este teste é a razão de a migration existir, escrita como reprodução. Se
  // alguém reverter a 20260916140000 achando que ela é cosmética, ele acusa.
  const { db, ctx } = await ambiente({ semUltimaMigration: true });
  const inicio = await HR.postStartRhia(ctx, { event_slug: SLUG, privacy_ack: true, privacy_notice_version: "v1" });
  const token = inicio.body.token;
  await HR.postPerfilRhia(ctx, { token, ...PERFIL });
  for (const [item_id, value] of Object.entries(respostasDaApresentacao())) {
    await HR.putResponseRhia(ctx, { token, item_id, value });
  }

  const fim = await HR.postSubmitRhia(ctx, { token });
  // Crivo apertado de propósito: `notEqual(200)` passaria também com
  // `instrumento_indisponivel` ou `resultado_nao_suportado` — ou seja,
  // continuaria verde afirmando outra coisa se alguém desligasse `podeFinalizar`.
  // O que se quer provar é que o BANCO recusou.
  assert.equal(fim.status, 409);
  assert.deepEqual(fim.body, { error: "conflito" });
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_result_snapshots");
  assert.equal(rows[0].n, 0, "recusa do CHECK não pode deixar meio snapshot");

  await db.close?.();
});

test("COM a migration, a restrição RECUSA um contrato que mente sobre a própria versão", async () => {
  // A metade que faltava: nenhum teste provava a recusa, que é a justificativa da
  // migration. Sem isto, a restrição poderia estar frouxa e tudo continuaria verde.
  const { db } = await ambiente();
  const { rows: b } = await db.query("select id from public.screener_event_bindings limit 1");
  await db.exec("set role screener_owner");
  const sess = await db.query(
    `insert into public.screener_rhia_sessions (binding_id, token_hash, status, created_at, expires_at, submitted_at)
     values ($1, $2, 'submitted', now(), now() + interval '1 day', now()) returning id`,
    [b[0].id, "b".repeat(64)]);

  const inserir = (reportVersion, versaoNoJson) => db.query(
    `insert into public.screener_rhia_result_snapshots
       (session_id, event_slug, instrument_code, instrument_version, scoring_version, report_version,
        instrument_checksum, input_checksum, result)
     values ($1, $2, $3, '1.0.0', $4, $4, $5, $6, $7)`,
    [sess.rows[0].id, SLUG, DEF.instrument_id, reportVersion, "c".repeat(64), "d".repeat(64),
     JSON.stringify({ public: { version: versaoNoJson }, internal: {} })]);

  await assert.rejects(inserir("unificado-1.0.0", "2.0.0-pilot"), /screener_rhia_snap_contract/);
  await assert.rejects(inserir("unificado-1.0.0", null), /screener_rhia_snap_contract/);
  await assert.rejects(inserir("", ""), /screener_rhia_snap_(report_version|contract)/);
  // e o que NÃO mente passa
  await inserir("unificado-1.0.0", "unificado-1.0.0");
  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_result_snapshots");
  assert.equal(rows[0].n, 1);

  await db.exec("set role postgres");
  await db.close?.();
});

test("submeter com o perfil faltando não guarda nada, e diz o que falta", async () => {
  const { db, ctx } = await ambiente();
  const inicio = await HR.postStartRhia(ctx, { event_slug: SLUG, privacy_ack: true, privacy_notice_version: "v1" });
  const token = inicio.body.token;
  for (const [item_id, value] of Object.entries(respostasDaApresentacao())) {
    await HR.putResponseRhia(ctx, { token, item_id, value });
  }

  const fim = await HR.postSubmitRhia(ctx, { token });
  assert.equal(fim.status, 400);
  assert.equal(fim.body.error, "submissao_incompleta");
  assert.match(fim.body.detalhe, /perfil_incompleto/, "sem porte e nível não existe faixa de CDL");

  const { rows } = await db.query("select count(*)::int n from public.screener_rhia_result_snapshots");
  assert.equal(rows[0].n, 0, "submissão recusada não pode deixar meio snapshot");

  await db.close?.();
});

test("submeter com metade das perguntas não inventa a metade que falta", async () => {
  const { db, ctx } = await ambiente();
  const inicio = await HR.postStartRhia(ctx, { event_slug: SLUG, privacy_ack: true, privacy_notice_version: "v1" });
  const token = inicio.body.token;
  await HR.postPerfilRhia(ctx, { token, ...PERFIL });

  // só a metade de IA e o contexto
  const todas = respostasDaApresentacao();
  for (const [item_id, value] of Object.entries(todas)) {
    if (!item_id.startsWith("LID_")) await HR.putResponseRhia(ctx, { token, item_id, value });
  }

  const fim = await HR.postSubmitRhia(ctx, { token });
  assert.equal(fim.status, 400);
  assert.match(fim.body.detalhe, /lideranca_incompleta/);

  await db.close?.();
});
