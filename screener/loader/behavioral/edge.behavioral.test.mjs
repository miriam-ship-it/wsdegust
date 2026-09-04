// Fluxo da edge do screener contra Postgres efêmero (pglite). Sem deploy.
// Cobre os obrigatórios do corte 3 + o endurecimento + a FRONTEIRA DE PRIVILÉGIO:
// papéis screener_owner/screener_runtime e as 6 funções SECURITY DEFINER.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { instrumento, projecaoPublica } from "../../motor/definicao.mjs";
import { sha256Hex } from "../../edge/logica.mjs";
import * as H from "../../edge/handlers.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const SCHEMA = fs.readFileSync(path.join(MIGR, "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const RPC = fs.readFileSync(path.join(MIGR, "20260903120000_screener_rpc_e_papeis.sql"), "utf8");
const HEX64 = "a".repeat(64);
const PREVIEW = "previa-secreta";
const IC = instrumento.instrument.code, IV = instrumento.instrument.version;

async function ambiente(bindingSql) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC); // papéis + propriedade + 6 funções SECURITY DEFINER + grants
  await db.query(
    `insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
     values ($1,$2,$3,$4,'inactive')`, [IC, IV, instrumento, HEX64]); // definição real p/ pertencimento
  await db.exec(bindingSql);
  let now = new Date("2026-09-10T12:00:00Z");
  return {
    q: (sql, params = []) => db.query(sql, params),
    now: () => now,
    previewKeyHash: null,
    _setNow: (d) => (now = d),
    _db: db,
    _comoRuntime: () => db.exec("set role screener_runtime"),
    _comoDono: () => db.exec("reset role"),
  };
}
const bPublic = `insert into public.screener_event_bindings
  (event_slug, instrument_code, instrument_version, is_current, status, session_retention_days, lead_retention_days)
  values ('rh-negocios-ia','${IC}','${IV}', true, 'public_pilot', 180, 365)`;
const bPreview = `insert into public.screener_event_bindings
  (event_slug, instrument_code, instrument_version, is_current, status)
  values ('preview-interno-ia-v1','${IC}','${IV}', true, 'internal_preview')`;

const start = (ctx, opts = {}) =>
  H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true, privacy_notice_version: "v1", ...opts });

async function responderTudo(ctx, token, { naItem, previewKey } = {}) {
  const pub = projecaoPublica(instrumento, { sessionSeed: token });
  const porItemStage = new Map();
  for (const [optId, alvo] of Object.entries(pub.mapping.options)) porItemStage.set(alvo.item + "|" + alvo.stage, optId);
  for (const b of pub.blocks) for (const it of b.items) {
    const code = pub.mapping.items[it.id];
    const stage = (naItem && code === naItem) ? "NA" : "E3";
    const r = await H.putResponse(ctx, { token, item_id: it.id, option_id: porItemStage.get(code + "|" + stage), previewKey });
    assert.equal(r.status, 200, `putResponse ${code}: ${JSON.stringify(r.body)}`);
  }
}

test("token no servidor; banco só o hash; sessão presa ao binding", async () => {
  const ctx = await ambiente(bPublic);
  const r = await start(ctx);
  assert.equal(r.status, 201);
  assert.match(r.body.token, /^[0-9a-f]{64}$/);
  const { rows } = await ctx.q(`select token_hash, binding_id from public.screener_sessions where id=$1`, [r.body.session_id]);
  assert.equal(rows[0].token_hash, await sha256Hex(r.body.token));
  assert.notEqual(rows[0].token_hash, r.body.token);
  const { rows: b } = await ctx.q(`select id from public.screener_event_bindings where event_slug='rh-negocios-ia'`);
  assert.equal(rows[0].binding_id, b[0].id);
});

test("consentimento: sem ciência 400; versão errada 409; servidor grava vigente + horário", async () => {
  const ctx = await ambiente(bPublic);
  assert.equal((await start(ctx, { privacy_ack: false })).status, 400);
  assert.equal((await start(ctx, { privacy_notice_version: "v0" })).status, 409);
  const r = await start(ctx, { privacy_notice_version: "v1" });
  assert.equal(r.status, 201);
  const { rows } = await ctx.q(`select privacy_notice_version, privacy_acknowledged_at from public.screener_sessions where id=$1`, [r.body.session_id]);
  assert.equal(rows[0].privacy_notice_version, "v1");
  assert.ok(rows[0].privacy_acknowledged_at); // horário do servidor
});

test("internal_preview: sem credencial nega TODAS as rotas (slug não concede acesso)", async () => {
  const ctx = await ambiente(bPreview);
  const alvo = "x".repeat(64);
  for (const call of [
    H.getStart(ctx, { event_slug: "preview-interno-ia-v1" }),
    H.postStart(ctx, { event_slug: "preview-interno-ia-v1", privacy_ack: true, privacy_notice_version: "v1" }),
    H.getSession(ctx, { token: alvo }), H.putResponse(ctx, { token: alvo, item_id: "a", option_id: "b" }),
    H.postSubmit(ctx, { token: alvo }), H.getResult(ctx, { token: alvo }),
  ]) assert.equal((await call).status, 404);
});

test("credencial de prévia (colunas dedicadas; edge manda só o hash): correta/errada/ausente/revogada/expirada", async () => {
  const ctx = await ambiente(bPreview);
  const h = await sha256Hex(PREVIEW);
  await ctx.q(`update public.screener_event_bindings set preview_credential_hash=$1 where event_slug='preview-interno-ia-v1'`, [h]);
  assert.equal((await H.getStart(ctx, { event_slug: "preview-interno-ia-v1", previewKey: PREVIEW })).status, 200);
  assert.equal((await H.getStart(ctx, { event_slug: "preview-interno-ia-v1", previewKey: "errada" })).status, 404);
  assert.equal((await H.getStart(ctx, { event_slug: "preview-interno-ia-v1" })).status, 404); // sem chave
  // revogada (data no passado p/ ser determinístico contra now() real)
  await ctx.q(`update public.screener_event_bindings set preview_revoked_at='2020-01-01T00:00:00Z' where event_slug='preview-interno-ia-v1'`);
  assert.equal((await H.getStart(ctx, { event_slug: "preview-interno-ia-v1", previewKey: PREVIEW })).status, 404);
  // expirada
  await ctx.q(`update public.screener_event_bindings set preview_revoked_at=null, preview_expires_at='2020-01-01T00:00:00Z' where event_slug='preview-interno-ia-v1'`);
  assert.equal((await H.getStart(ctx, { event_slug: "preview-interno-ia-v1", previewKey: PREVIEW })).status, 404);
});

test("erro uniforme contra enumeração: inexistente vs prévia sem/errada credencial → resposta idêntica", async () => {
  const ctx = await ambiente(bPreview);
  const h = await sha256Hex(PREVIEW);
  await ctx.q(`update public.screener_event_bindings set preview_credential_hash=$1 where event_slug='preview-interno-ia-v1'`, [h]);
  const inexistente = await H.getStart(ctx, { event_slug: "nao-existe-slug" });
  const semCred = await H.getStart(ctx, { event_slug: "preview-interno-ia-v1" });
  const credErrada = await H.getStart(ctx, { event_slug: "preview-interno-ia-v1", previewKey: "errada" });
  assert.equal(inexistente.status, 404);
  assert.deepEqual(semCred, inexistente, "prévia sem credencial deve ser idêntica a inexistente");
  assert.deepEqual(credErrada, inexistente, "prévia com credencial errada deve ser idêntica a inexistente");
});

test("PUT rejeita option de outra sessão/instrumento", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx);
  const outra = projecaoPublica(instrumento, { sessionSeed: "alheia" });
  const r = await H.putResponse(ctx, { token: s.body.token, item_id: outra.blocks[0].items[0].id, option_id: outra.blocks[0].items[0].options[0].id });
  assert.equal(r.status, 400);
});

test("ciclo de vida do token: ausente/malformado/inexistente 404; expirado/revogado 410", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx);
  assert.equal((await H.getSession(ctx, { token: undefined })).status, 404);
  assert.equal((await H.getSession(ctx, { token: "nao-hex" })).status, 404);
  assert.equal((await H.getSession(ctx, { token: "b".repeat(64) })).status, 404);
  ctx._setNow(new Date("2026-11-01T00:00:00Z"));
  assert.equal((await H.getSession(ctx, { token: s.body.token })).status, 410);
  ctx._setNow(new Date("2026-09-10T12:00:00Z"));
  await ctx.q(`update public.screener_sessions set revoked_at=now() where id=$1`, [s.body.session_id]);
  assert.equal((await H.getSession(ctx, { token: s.body.token })).status, 410);
});

test("happy path: responde, submete, PublicResultV1 com 0–100 e sem bp/estágio/item; N/A preservado", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx);
  const naItem = instrumento.items.find((i) => i.block === "ai").code;
  await responderTudo(ctx, s.body.token, { naItem });
  const { rows: na } = await ctx.q(`select stage_code from public.screener_responses where session_id=$1 and item_code=$2`, [s.body.session_id, naItem]);
  assert.equal(na[0].stage_code, "NA");

  const sub = await H.postSubmit(ctx, { token: s.body.token });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.equal(sub.body.contract_version, "PublicResultV1");
  assert.equal(typeof sub.body.organization.index_display, "number");
  assert.equal(sub.body.individual.dimensions.length, 5);
  const blob = JSON.stringify(sub.body);
  for (const p of ["score_bp", "provisional_cut_bp", "input_checksum", "\"E1\"", "\"E4\"", "stage_code", "weight"])
    assert.ok(!blob.includes(p), `vazou ${p}`);
  for (const it of instrumento.items) assert.ok(!blob.includes(it.code));
  assert.deepEqual((await H.getResult(ctx, { token: s.body.token })).body, sub.body);
});

test("submissão idempotente: mesmo snapshot (1 linha); resposta após submit é 409", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx);
  await responderTudo(ctx, s.body.token);
  const a = await H.postSubmit(ctx, { token: s.body.token });
  const b = await H.postSubmit(ctx, { token: s.body.token });
  assert.deepEqual(a.body, b.body);
  const { rows } = await ctx.q(`select count(*)::int n from public.screener_result_snapshots where session_id=$1`, [s.body.session_id]);
  assert.equal(rows[0].n, 1);
  assert.equal((await H.putResponse(ctx, { token: s.body.token, item_id: "x", option_id: "y" })).status, 409);
});

test("closed bloqueia escrita mas permite leitura do já submetido", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx);
  await responderTudo(ctx, s.body.token);
  await H.postSubmit(ctx, { token: s.body.token });
  await ctx.q(`update public.screener_event_bindings set status='closed' where event_slug='rh-negocios-ia'`);
  assert.equal((await H.getResult(ctx, { token: s.body.token })).status, 200);
  assert.equal((await start(ctx)).status, 403);
});

test("finalize: respostas mudam entre cálculo e finalização → função rejeita (não grava obsoleto)", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx);
  await responderTudo(ctx, s.body.token);
  const th = await sha256Hex(s.body.token);
  const { rows: rs } = await ctx.q(`select item_code, stage_code from public.screener_responses where session_id=$1`, [s.body.session_id]);
  const parcial = rs.slice(1).sort((a, b) => a.item_code < b.item_code ? -1 : 1).map((r) => r.item_code + ":" + r.stage_code).join("|");
  await assert.rejects(
    ctx.q(`select public.screener_op_finalize($1,$2,'{"contract_version":"ScoreResultV1"}'::jsonb,$3,$3,'1.0.0','1.0.0')`,
      [th, parcial, HEX64]),
    (e) => String(e.message).includes("respostas_mudaram"));
  const { rows: snap } = await ctx.q(`select count(*)::int n from public.screener_result_snapshots where session_id=$1`, [s.body.session_id]);
  assert.equal(snap[0].n, 0);
});

// ---------------- FRONTEIRA DE PRIVILÉGIO (screener_runtime) ----------------

test("papel restrito: screener_runtime executa AS 6 OPERAÇÕES só via funções", async () => {
  const ctx = await ambiente(bPublic);
  await ctx._comoRuntime();
  try {
    const s = await start(ctx);                                   // iniciar
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await H.getStart(ctx, { event_slug: "rh-negocios-ia" })).status, 200); // apresentação
    assert.equal((await H.getSession(ctx, { token: s.body.token })).status, 200);        // retomar
    await responderTudo(ctx, s.body.token);                                              // salvar
    assert.equal((await H.postSubmit(ctx, { token: s.body.token })).status, 200);        // finalizar
    assert.equal((await H.getResult(ctx, { token: s.body.token })).status, 200);         // resultado
  } finally { await ctx._comoDono(); }
});

test("papel restrito: NENHUM privilégio direto em tabelas screener_* (SELECT/INSERT/UPDATE/DELETE)", async () => {
  const ctx = await ambiente(bPublic);
  for (const t of ["screener_sessions", "screener_responses", "screener_result_snapshots",
                   "screener_event_bindings", "screener_instrument_versions", "screener_leads"]) {
    for (const priv of ["select", "insert", "update", "delete"]) {
      const { rows } = await ctx.q(`select has_table_privilege('screener_runtime', $1, $2) as ok`, [`public.${t}`, priv]);
      assert.equal(rows[0].ok, false, `screener_runtime tem ${priv} direto em ${t}`);
    }
  }
  // enforcement real: leitura direta como runtime é negada
  await ctx._comoRuntime();
  try { await assert.rejects(ctx.q(`select * from public.screener_sessions limit 1`), /permission denied/i); }
  finally { await ctx._comoDono(); }
});

test("papel restrito: NÃO acessa tabelas legadas (eventos/respondentes/respostas/relatorios)", async () => {
  const ctx = await ambiente(bPublic);
  await ctx._db.exec(`create table public.eventos(id int); create table public.respondentes(id int);
                      create table public.respostas(id int); create table public.relatorios(id int);`);
  await ctx._comoRuntime();
  try {
    for (const t of ["eventos", "respondentes", "respostas", "relatorios"])
      await assert.rejects(ctx.q(`select * from public.${t}`), /permission denied/i, `legado ${t}`);
  } finally { await ctx._comoDono(); }
});

test("papel restrito: executa AS funções concedidas mas NÃO uma função administrativa", async () => {
  const ctx = await ambiente(bPublic);
  await ctx._db.exec(`create function public.admin_fn() returns int language sql as 'select 1';
                      revoke all on function public.admin_fn() from public;`);
  await ctx._comoRuntime();
  try {
    await assert.rejects(ctx.q(`select public.admin_fn()`), /permission denied/i, "não pode chamar admin_fn");
    const r = await ctx.q(`select public.screener_op_get_binding('rh-negocios-ia') as r`); // concedida
    assert.ok(r.rows[0].r && r.rows[0].r.event_slug === "rh-negocios-ia");
  } finally { await ctx._comoDono(); }
});

test("papel restrito: não atravessa sessão/vínculo alheios por leitura direta", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx); // sessão criada como dono
  await ctx._comoRuntime();
  try {
    // não consegue ler a tabela de sessões para descobrir token_hash de terceiros
    await assert.rejects(ctx.q(`select token_hash from public.screener_sessions`), /permission denied/i);
    // e um token que não conhece devolve vazio pela função (sem vazamento)
    const r = await ctx.q(`select public.screener_op_resume($1) as r`, ["c".repeat(64)]);
    assert.equal(r.rows[0].r, null);
  } finally { await ctx._comoDono(); }
  // sanidade: a sessão real existe (vista pelo dono)
  const { rows } = await ctx.q(`select 1 from public.screener_sessions where id=$1`, [s.body.session_id]);
  assert.equal(rows.length, 1);
});

test("contornar a edge (runtime direto): sessão inexistente, item fora, estágio inválido, após submit", async () => {
  const ctx = await ambiente(bPublic);
  const aberta = await start(ctx);                  // aberta, sem respostas
  const thAberta = await sha256Hex(aberta.body.token);
  const submetida = await start(ctx);
  await responderTudo(ctx, submetida.body.token);
  await H.postSubmit(ctx, { token: submetida.body.token });
  const thSub = await sha256Hex(submetida.body.token);
  const itemReal = instrumento.items[0].code;

  await ctx._comoRuntime();
  try {
    // sessão inexistente/alheia: resume vazio; save levanta
    assert.equal((await ctx.q(`select public.screener_op_resume($1,null) as r`, ["d".repeat(64)])).rows[0].r, null);
    await assert.rejects(ctx.q(`select public.screener_op_save_response($1,$2,'E3',null) as r`, ["d".repeat(64), itemReal]), /sessao_inexistente/);
    // estágio inválido e item fora do instrumento
    await assert.rejects(ctx.q(`select public.screener_op_save_response($1,$2,'E9',null) as r`, [thAberta, itemReal]), /estagio_invalido/);
    await assert.rejects(ctx.q(`select public.screener_op_save_response($1,'ITEM_FALSO','E3',null) as r`, [thAberta]), /item_fora_do_instrumento/);
    // resposta após submissão
    await assert.rejects(ctx.q(`select public.screener_op_save_response($1,$2,'E3',null) as r`, [thSub, itemReal]), /sessao_nao_aberta/);
  } finally { await ctx._comoDono(); }
});

test("contornar a edge (runtime direto): prévia sem autorização e vínculo fechado", async () => {
  const ctx = await ambiente(bPreview);
  const h = await sha256Hex(PREVIEW); // a função recebe o HASH, nunca a chave crua
  await ctx.q(`update public.screener_event_bindings set preview_credential_hash=$1 where event_slug='preview-interno-ia-v1'`, [h]);
  await ctx._comoRuntime();
  try {
    // start sem hash / hash errado → previa_nao_autorizada; get_binding sem hash → null
    await assert.rejects(ctx.q(`select public.screener_op_start('preview-interno-ia-v1',$1,'v1',now(),now()+interval '1 day',null) as r`, ["e".repeat(64)]), /previa_nao_autorizada/);
    await assert.rejects(ctx.q(`select public.screener_op_start('preview-interno-ia-v1',$1,'v1',now(),now()+interval '1 day',$2) as r`, ["e".repeat(64), "b".repeat(64)]), /previa_nao_autorizada/);
    assert.equal((await ctx.q(`select public.screener_op_get_binding('preview-interno-ia-v1',null) as r`)).rows[0].r, null);
    // com o HASH certo → cria
    const ok = await ctx.q(`select public.screener_op_start('preview-interno-ia-v1',$1,'v1',now(),now()+interval '1 day',$2) as r`, ["f".repeat(64), h]);
    assert.ok(ok.rows[0].r.session_id);
  } finally { await ctx._comoDono(); }
  // vínculo fechado bloqueia início (mesmo com credencial)
  await ctx.q(`update public.screener_event_bindings set status='closed' where event_slug='preview-interno-ia-v1'`);
  await ctx._comoRuntime();
  try {
    await assert.rejects(ctx.q(`select public.screener_op_start('preview-interno-ia-v1',$1,'v1',now(),now()+interval '1 day',$2) as r`, ["a".repeat(64), h]), /indisponivel/);
  } finally { await ctx._comoDono(); }
});

test("branding REJEITA campos de credencial (CHECK); colunas dedicadas aceitam", async () => {
  const ctx = await ambiente(bPreview);
  for (const chave of ["preview_credential_sha256", "preview_credential_hash", "preview_expires_at", "preview_revoked_at"]) {
    await assert.rejects(
      ctx.q(`update public.screener_event_bindings set branding=jsonb_build_object($1::text,'x') where event_slug='preview-interno-ia-v1'`, [chave]),
      /screener_bind_branding_sem_credencial|violates check/i, `branding aceitou ${chave}`);
  }
  // hash inválido (não-hex) rejeitado; hash válido aceito
  await assert.rejects(ctx.q(`update public.screener_event_bindings set preview_credential_hash='xyz' where event_slug='preview-interno-ia-v1'`), /screener_bind_previa_hash_hex|violates check/i);
  await ctx.q(`update public.screener_event_bindings set preview_credential_hash=$1 where event_slug='preview-interno-ia-v1'`, ["a".repeat(64)]); // ok
});

test("não vazamento: nenhuma resposta pública contém hash/expiração/revogação da prévia", async () => {
  const ctx = await ambiente(bPreview);
  const h = await sha256Hex(PREVIEW);
  await ctx.q(`update public.screener_event_bindings set preview_credential_hash=$1, preview_expires_at='2099-01-01' where event_slug='preview-interno-ia-v1'`, [h]);
  const pk = { event_slug: "preview-interno-ia-v1", previewKey: PREVIEW };
  const gs = await H.getStart(ctx, pk);
  const st = await H.postStart(ctx, { ...pk, privacy_ack: true, privacy_notice_version: "v1" });
  await responderTudo(ctx, st.body.token, { previewKey: PREVIEW }); // preview exige credencial na escrita
  const sub = await H.postSubmit(ctx, { token: st.body.token, previewKey: PREVIEW });
  const rr = await H.getResult(ctx, { token: st.body.token, previewKey: PREVIEW });
  const alvos = [h, "preview_credential", "preview_expires_at", "preview_revoked_at"];
  for (const r of [gs.body, st.body, sub.body, rr.body]) {
    const blob = JSON.stringify(r);
    for (const a of alvos) assert.ok(!blob.includes(a), `vazou "${a}" em ${JSON.stringify(r).slice(0,60)}`);
  }
});

test("não vazamento: a CHAVE CRUA não chega ao adaptador SQL (só o hash)", async () => {
  const ctx = await ambiente(bPreview);
  const h = await sha256Hex(PREVIEW);
  await ctx.q(`update public.screener_event_bindings set preview_credential_hash=$1 where event_slug='preview-interno-ia-v1'`, [h]);
  const capturados = [];
  const qOrig = ctx.q;
  ctx.q = (sql, params = []) => { capturados.push(...params.map((p) => String(p))); return qOrig(sql, params); };
  const st = await H.postStart(ctx, { event_slug: "preview-interno-ia-v1", previewKey: PREVIEW, privacy_ack: true, privacy_notice_version: "v1" });
  await H.getSession(ctx, { token: st.body.token, previewKey: PREVIEW });
  ctx.q = qOrig;
  assert.ok(!capturados.includes(PREVIEW), "a chave crua apareceu como parâmetro SQL");
  assert.ok(capturados.includes(h), "o hash da prévia deveria ter sido enviado");
});

test("service_role: não executa as 6 operações nem acessa tabelas do screener", async () => {
  const ctx = await ambiente(bPublic);
  // sem privilégio direto
  for (const p of ["select", "insert", "update", "delete"]) {
    const { rows } = await ctx.q(`select has_table_privilege('service_role','public.screener_sessions',$1) as ok`, [p]);
    assert.equal(rows[0].ok, false, `service_role tem ${p} em screener_sessions`);
  }
  // sem EXECUTE nas operações
  const { rows: ex } = await ctx.q(`select has_function_privilege('service_role','public.screener_op_get_binding(text,text)','execute') as ok`);
  assert.equal(ex[0].ok, false, "service_role executa screener_op_get_binding");
  // enforcement real
  await ctx._db.exec("set role service_role");
  try {
    await assert.rejects(ctx.q(`select * from public.screener_sessions limit 1`), /permission denied/i);
    await assert.rejects(ctx.q(`select public.screener_op_get_binding('rh-negocios-ia',null)`), /permission denied/i);
  } finally { await ctx._db.exec("reset role"); }
});

test("papéis: atributos exatos e sem memberships inesperadas", async () => {
  const ctx = await ambiente(bPublic);
  const { rows } = await ctx.q(`select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit
    from pg_roles where rolname in ('screener_owner','screener_runtime') order by rolname`);
  const byName = Object.fromEntries(rows.map((r) => [r.rolname, r]));
  const owner = byName.screener_owner, runtime = byName.screener_runtime;
  assert.deepEqual([owner.rolcanlogin, owner.rolsuper, owner.rolcreatedb, owner.rolcreaterole, owner.rolreplication, owner.rolbypassrls, owner.rolinherit],
    [false, false, false, false, false, false, false], "atributos de screener_owner");
  assert.deepEqual([runtime.rolcanlogin, runtime.rolsuper, runtime.rolcreatedb, runtime.rolcreaterole, runtime.rolreplication, runtime.rolbypassrls, runtime.rolinherit],
    [true, false, false, false, false, false, false], "atributos de screener_runtime");
  const { rows: mem } = await ctx.q(`select r.rolname as member, g.rolname as granted
    from pg_auth_members m join pg_roles r on r.oid=m.member join pg_roles g on g.oid=m.roleid
    where r.rolname in ('screener_owner','screener_runtime') or g.rolname in ('screener_owner','screener_runtime')`);
  assert.equal(mem.length, 0, `membership inesperada: ${JSON.stringify(mem)}`);
});

test("inventário de ownership: tabelas, sequence, trigger e funções são de screener_owner", async () => {
  const ctx = await ambiente(bPublic);
  const { rows: rel } = await ctx.q(`select c.relname obj, o.rolname owner, c.relkind
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles o on o.oid=c.relowner
    where n.nspname='public' and c.relname like 'screener\\_%' and c.relkind in ('r','S') order by 1`);
  assert.ok(rel.length >= 7, `esperado >=7 tabelas/sequences, veio ${rel.length}`);
  for (const r of rel) assert.equal(r.owner, "screener_owner", `${r.obj} (${r.relkind})`);
  const { rows: fns } = await ctx.q(`select p.proname obj, o.rolname owner
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles o on o.oid=p.proowner
    where n.nspname='public' and p.proname like 'screener\\_%' order by 1`);
  assert.ok(fns.some((f) => f.obj === "screener_snapshot_impede_update"), "trigger fn presente");
  assert.equal(fns.filter((f) => f.obj.startsWith("screener_op_")).length, 6, "6 funções op");
  for (const f of fns) assert.equal(f.owner, "screener_owner", f.obj);
});

test("nenhuma tabela legada nem SQL direto nos handlers (estático)", () => {
  const src = fs.readFileSync(path.resolve(AQUI, "..", "..", "edge", "handlers.mjs"), "utf8");
  for (const legado of ["public.respondentes", "public.eventos", "public.respostas", "public.relatorios"])
    assert.ok(!src.includes(legado), `handlers tocam legado: ${legado}`);
  // todo acesso é via funções screener_op_*; sem SELECT/INSERT/UPDATE direto em tabela
  assert.ok(!/from\s+public\.screener_/i.test(src), "handler faz SELECT direto em tabela screener_");
  assert.ok(!/insert\s+into\s+public\.screener_/i.test(src), "handler faz INSERT direto");
  assert.ok(!/update\s+public\.screener_(?!op)/i.test(src), "handler faz UPDATE direto");
});

test("service_role fora dos payloads públicos e sem chave hardcoded na lógica/cola", async () => {
  const ctx = await ambiente(bPublic);
  const s = await start(ctx);
  await responderTudo(ctx, s.body.token);
  const res = await H.getResult(ctx, { token: s.body.token });
  for (const body of [s.body, res.body]) assert.ok(!JSON.stringify(body).toLowerCase().includes("service_role"));
  for (const f of ["../../edge/logica.mjs", "../../edge/handlers.mjs", "../../../supabase/functions/screener/index.ts"]) {
    const src = fs.readFileSync(path.resolve(AQUI, f), "utf8");
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(src), `chave hardcoded em ${f}`);
  }
});
