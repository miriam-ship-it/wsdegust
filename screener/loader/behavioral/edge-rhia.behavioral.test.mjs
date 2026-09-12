// Fluxo da edge rhia (/rhia/*) contra Postgres efêmero (pglite). Sem deploy.
// Prova o pipeline ponta a ponta E a fronteira: o navegador recebe só o modelo
// PÚBLICO do motor do pacote (sem pontos-base, pesos, códigos de estágio nem
// respostas); o snapshot guarda o contrato inteiro ({public, internal}). Cobre o
// portão de lead server-side (required_before_result) e a execução real como
// screener_runtime.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { instrumento, checksum, canonicalize } from "../../rhia/definicao.mjs";
import { canonico } from "../../rhia/logica.mjs";
import { sha256Hex } from "../../edge/logica.mjs";
import { chaveRate } from "../../edge/ratelimit.mjs";
import * as HR from "../../edge/handlers-rhia.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const SCHEMA = rd("20260902143339_screener_tabelas_isoladas.sql");
const RPC = rd("20260903120000_screener_rpc_e_papeis.sql");
const RL = rd("20260904120000_screener_rate_limit.sql").split("-- @@@CRON@@@")[0]; // pula pg_cron
const RHIA = rd("20260912120000_screener_rhia_tabelas_e_rpc.sql");
const IC = instrumento.instrument_id, IV = instrumento.instrument_version;
const EVENTO = "boomit-degustacao-rh-ia";
const PREVIEW = "previa-secreta";
const SECRET = "segredo-de-teste";
const CHECKSUM = createHash("sha256").update(canonicalize(instrumento), "utf8").digest("hex");

/**
 * Ambiente: schema V1 + papéis/RPC V1 + (opcional) rate + migration rhia.
 * A definição gravada é o JSON REAL do pacote (a RPC save_response valida contra ela).
 */
async function ambiente({ status = "public_pilot", leadMode = "optional_after_submit", rate = false, cred = null } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC);
  if (rate) await db.exec(RL);
  await db.exec(RHIA);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ($1,$2,$3,$4,'inactive')`, [IC, IV, instrumento, CHECKSUM]);
  await db.query(`insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, lead_capture_mode,
       session_retention_days, lead_retention_days, branding, preview_credential_hash)
      values ($1,$2,$3, true, $4, $5, 180, 365, '{}'::jsonb, $6)`, [EVENTO, IC, IV, status, leadMode, cred]);
  let now = new Date("2026-09-12T12:00:00Z");
  return {
    q: (sql, params = []) => db.query(sql, params),
    now: () => now,
    rate: rate ? { ativo: true, secret: SECRET } : { ativo: false, secret: null },
    _db: db,
    _setNow: (d) => (now = d),
    _comoRuntime: () => db.exec("set role screener_runtime"),
    _comoDono: () => db.exec("reset role"),
  };
}

const start = (ctx, opts = {}) =>
  HR.postStartRhia(ctx, { event_slug: EVENTO, privacy_ack: true, privacy_notice_version: "v1", ...opts });

/** 30 respostas + texto livre: CTX01 = OTHER (o caso que exige CTX01_OTHER_TEXT). */
function respostasCompletas() {
  const R = { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor de RH", CTX02: "AREA", CTX03: "DECIDE_SCOPE" };
  const dims = {
    EST: ["E3", "E3", "E4", "E3"], TAL: ["E2", "E3", "E3", "E2"], DES: ["E3", "E3", "E2", "E3"],
    INF: ["E3", "E4", "E3", "E3"], DAD: ["E2", "E2", "E3", "E2"], IA: ["E2", "E1", "E2", "NA"],
  };
  for (const [d, vs] of Object.entries(dims)) vs.forEach((v, i) => { R[`${d}0${i + 1}`] = v; });
  R.GOV01 = "E3"; R.GOV02 = "E2"; R.GOV03 = "E3";
  return R;
}
const RESP = respostasCompletas();

async function preencher(ctx, token, resp = RESP, extra = {}) {
  for (const [item_id, value] of Object.entries(resp)) {
    const r = await HR.putResponseRhia(ctx, { token, item_id, value, ...extra });
    assert.equal(r.status, 200, `${item_id}: ${JSON.stringify(r.body)}`);
  }
}

// Substrings que NUNCA podem aparecer no que vai ao navegador.
const PROIBIDOS = ["bp", "3333", "6667", "10000", "leadership_bp", "internal", "answers",
  "\"E1\"", "\"E2\"", "\"E3\"", "\"E4\"", "EST01", "GOV01", "CTX01_OTHER_TEXT", "Consultor de RH"];
function semVazamento(body, rotulo) {
  const blob = JSON.stringify(body);
  for (const p of PROIBIDOS) assert.ok(!blob.includes(p), `${rotulo}: vazou "${p}"`);
}

// ---------------------------------------------------------------- apresentação

test("GET /rhia/start: 200 com apresentação pública (30 itens na ordem, sem escala/faceta/pesos)", async () => {
  const ctx = await ambiente();
  const g = await HR.getStartRhia(ctx, { event_slug: EVENTO });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.instrument.id, IC);
  assert.equal(g.body.instrument.version, IV);
  assert.equal(g.body.instrument.estimated_minutes, "8–10");
  assert.equal(g.body.items.length, 30);
  assert.deepEqual(g.body.items.map((it) => it.order), [...Array(30).keys()].map((i) => i + 1));
  assert.deepEqual(g.body.groups.map((x) => x.code), ["contexto", "praticas", "governanca"]);
  assert.equal(g.body.status, "public_pilot");
  assert.deepEqual(g.body.branding, {});
  assert.equal(g.body.privacy_notice_version, "v1");
  // O frontend precisa saber, já na abertura, se há portão antes do resultado.
  // Por isso o rhia tem a sua própria screener_rhia_op_get_binding, que projeta
  // lead_capture_mode (a do V1, em produção, não projeta e não foi alterada).
  assert.equal(g.body.lead_capture_mode, "optional_after_submit");
  // CTX01 leva o campo condicional; NA sempre disponível nos pontuados
  const ctx01 = g.body.items.find((it) => it.id === "CTX01");
  assert.equal(ctx01.conditional_field.id, "CTX01_OTHER_TEXT");
  assert.ok(g.body.items.filter((it) => it.kind !== "context").every((it) => it.options.some((o) => o.id === "NA")));
  // literalidade: enunciados idênticos ao JSON do pacote
  for (const it of g.body.items) {
    const src = instrumento.items.find((s) => s.id === it.id);
    assert.equal(it.prompt, src.prompt);
    assert.deepEqual(it.options.map((o) => o.label), src.options.map((o) => o.label));
  }
  const blob = JSON.stringify(g.body);
  for (const chave of ["\"scale\"", "\"facet\"", "\"scenario\"", "\"weight\"", "\"bp\"", "\"gate\"", "\"required\""])
    assert.ok(!blob.includes(chave), `apresentação vazou ${chave}`);
});

test("GET /rhia/start com rate ativo: preview_authorize traz lead_capture_mode do vínculo", async () => {
  const ctx = await ambiente({ rate: true, leadMode: "required_before_result" });
  const ipHmac = await chaveRate(SECRET, "ip", "", "203.0.113.9");
  const g = await HR.getStartRhia(ctx, { event_slug: EVENTO, ipHmac });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.lead_capture_mode, "required_before_result");
  assert.equal(g.body.items.length, 30);
});

test("GET /rhia/start: slug ausente 400; inexistente 404", async () => {
  const ctx = await ambiente();
  assert.equal((await HR.getStartRhia(ctx, {})).status, 400);
  assert.equal((await HR.getStartRhia(ctx, { event_slug: "nao-existe" })).status, 404);
});

test("binding de instrumento diferente → 409 instrumento_indisponivel", async () => {
  const ctx = await ambiente();
  await ctx.q(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
               values ($1,'9.9.9','{}'::jsonb,$2,'inactive')`, [IC, "a".repeat(64)]);
  await ctx.q(`update public.screener_event_bindings set instrument_version='9.9.9' where event_slug=$1`, [EVENTO]);
  const g = await HR.getStartRhia(ctx, { event_slug: EVENTO });
  assert.equal(g.status, 409);
  assert.equal(g.body.error, "instrumento_indisponivel");
  assert.equal((await start(ctx)).status, 409);
});

// ---------------------------------------------------------------- sessão

test("POST /rhia/start: token no servidor; banco só o hash; sessão presa ao vínculo; apresentação junto", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.match(s.body.token, /^[0-9a-f]{64}$/);
  assert.equal(s.body.items.length, 30);
  const { rows } = await ctx.q(`select token_hash, binding_id, privacy_notice_version, privacy_acknowledged_at
                                from public.screener_rhia_sessions where id=$1`, [s.body.session_id]);
  assert.equal(rows[0].token_hash, await sha256Hex(s.body.token));
  assert.equal(rows[0].privacy_notice_version, "v1");
  assert.ok(rows[0].privacy_acknowledged_at);
  const { rows: b } = await ctx.q(`select id from public.screener_event_bindings where event_slug=$1`, [EVENTO]);
  assert.equal(rows[0].binding_id, b[0].id);
});

test("consentimento: sem ciência 400; versão errada 409", async () => {
  const ctx = await ambiente();
  assert.equal((await start(ctx, { privacy_ack: false })).status, 400);
  assert.equal((await start(ctx, { privacy_notice_version: "v0" })).status, 409);
});

test("ciclo de vida do token: ausente/inexistente 404; expirado/revogado 410", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  assert.equal((await HR.getSessionRhia(ctx, { token: undefined })).status, 404);
  assert.equal((await HR.getSessionRhia(ctx, { token: "b".repeat(64) })).status, 404);
  ctx._setNow(new Date("2026-11-01T00:00:00Z"));
  assert.equal((await HR.getSessionRhia(ctx, { token: s.body.token })).status, 410);
  ctx._setNow(new Date("2026-09-12T12:00:00Z"));
  await ctx.q(`update public.screener_rhia_sessions set revoked_at=now() where id=$1`, [s.body.session_id]);
  assert.equal((await HR.getSessionRhia(ctx, { token: s.body.token })).status, 410);
});

test("GET /rhia/session retoma respostas (inclui o texto livre), progresso 30/30 e lead_capture_mode", async () => {
  const ctx = await ambiente({ leadMode: "required_before_result" });
  const s = await start(ctx);
  const vazio = await HR.getSessionRhia(ctx, { token: s.body.token });
  assert.equal(vazio.status, 200);
  assert.deepEqual(vazio.body.answered, {});
  assert.deepEqual(vazio.body.progress, { answered: 0, total: 30 });
  assert.equal(vazio.body.pode_responder, true);
  assert.equal(vazio.body.submitted, false);
  assert.equal(vazio.body.lead_capture_mode, "required_before_result");

  await preencher(ctx, s.body.token);
  const g = await HR.getSessionRhia(ctx, { token: s.body.token });
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.answered, RESP);
  assert.deepEqual(g.body.progress, { answered: 30, total: 30 }); // o texto livre não conta como item
  assert.equal(g.body.items.length, 30);
});

// ---------------------------------------------------------------- respostas

test("PUT /rhia/response: opção inválida, item estranho e texto inválido → 400 antes da RPC", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  const t = s.body.token;
  let r = await HR.putResponseRhia(ctx, { token: t, item_id: "EST01", value: "E9" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "opcao_invalida");
  r = await HR.putResponseRhia(ctx, { token: t, item_id: "CTX02", value: "E3" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "opcao_invalida");
  r = await HR.putResponseRhia(ctx, { token: t, item_id: "ITEM_FALSO", value: "E3" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "opcao_invalida");
  r = await HR.putResponseRhia(ctx, { token: t, item_id: "CTX01_OTHER_TEXT", value: "x" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "texto_invalido");
  r = await HR.putResponseRhia(ctx, { token: t, item_id: "CTX01_OTHER_TEXT", value: "a".repeat(121) });
  assert.equal(r.status, 400); assert.equal(r.body.error, "texto_invalido");
  r = await HR.putResponseRhia(ctx, { token: t, item_id: "CTX01_OTHER_TEXT", value: "comcontrole" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "texto_invalido");
  r = await HR.putResponseRhia(ctx, { token: t, value: "E3" });
  assert.equal(r.status, 400); assert.equal(r.body.error, "campos_obrigatorios");
  assert.equal((await ctx.q(`select count(*)::int n from public.screener_rhia_responses`)).rows[0].n, 0);
  // válido: grava com btrim e devolve o progresso
  r = await HR.putResponseRhia(ctx, { token: t, item_id: "CTX01_OTHER_TEXT", value: "  Consultor de RH  " });
  assert.equal(r.status, 200);
  const { rows } = await ctx.q(`select answer_code from public.screener_rhia_responses where item_code='CTX01_OTHER_TEXT'`);
  assert.equal(rows[0].answer_code, "Consultor de RH");
});

test("PUT /rhia/response: revisão idempotente (1 linha por item) e recusa após submissão (409)", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await HR.putResponseRhia(ctx, { token: s.body.token, item_id: "EST01", value: "E2" });
  const r = await HR.putResponseRhia(ctx, { token: s.body.token, item_id: "EST01", value: "E4" });
  assert.deepEqual(r.body.progress, { answered: 1, total: 30 });
  const { rows } = await ctx.q(`select answer_code, revised_at from public.screener_rhia_responses where item_code='EST01'`);
  assert.equal(rows.length, 1); assert.equal(rows[0].answer_code, "E4"); assert.ok(rows[0].revised_at);
  await preencher(ctx, s.body.token);
  assert.equal((await HR.postSubmitRhia(ctx, { token: s.body.token })).status, 200);
  assert.equal((await HR.putResponseRhia(ctx, { token: s.body.token, item_id: "EST01", value: "E3" })).status, 409);
});

// ---------------------------------------------------------------- submissão

test("fluxo completo (CTX01=OTHER): submit devolve o modelo PÚBLICO do motor, sem internos", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  const sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  const R = sub.body;
  assert.equal(R.version, "2.0.0-pilot");
  assert.equal(R.status, "ORIENTATIVE_HYPOTHESIS");
  assert.equal(R.evidence.status, "ADEQUATE");          // 23 itens válidos (1 NA)
  assert.equal(R.positioning.stage, "Estrategista de Escala");
  assert.equal(R.reference.status, "VALID");
  assert.equal(R.gap.id, "ONE_BELOW");
  assert.equal(R.governance.id, "ATTENTION");
  assert.equal(R.restriction, "CONTROLLED_EXPERIMENTS");
  assert.equal(R.actionPlan.length, 3);
  assert.ok(R.indicators.length <= 3 && R.executiveQuestions.length === 3);
  assert.match(R.emitido_em, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(typeof R.disclaimer === "string" && R.disclaimer.length > 0);
  // FRONTEIRA: nada de internos no corpo público
  semVazamento(R, "submit");
  assert.equal("internal" in R, false);
  assert.equal("public" in R, false);
  assert.deepEqual((await HR.getResultRhia(ctx, { token: s.body.token })).body, R);
});

test("snapshot no banco guarda o contrato inteiro: public.version + internal.answers (sem o texto livre)", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  await HR.postSubmitRhia(ctx, { token: s.body.token });
  const { rows } = await ctx.q(`select result, instrument_checksum, input_checksum, scoring_version, report_version, event_slug
                                from public.screener_rhia_result_snapshots`);
  assert.equal(rows.length, 1);
  const snap = rows[0];
  assert.equal(snap.result.public.version, "2.0.0-pilot");
  assert.equal(snap.result.internal.instrumentVersion, IV);
  assert.equal(snap.result.internal.answers.CTX01, "OTHER");
  assert.equal(Object.keys(snap.result.internal.answers).length, 30);
  assert.equal("CTX01_OTHER_TEXT" in snap.result.internal.answers, false); // não pontua, não entra no motor
  assert.equal(snap.scoring_version, "2.0.0-pilot");
  assert.equal(snap.report_version, "2.0.0-pilot");
  assert.equal(snap.event_slug, EVENTO);
  // checksum do instrumento = o da edge = createHash do canonicalize
  assert.equal(snap.instrument_checksum, await checksum());
  assert.equal(snap.instrument_checksum, CHECKSUM);
  // input_checksum = sha256 do canônico (que INCLUI o texto livre, como o string_agg da função)
  assert.equal(snap.input_checksum, await sha256Hex(canonico(RESP)));
  assert.ok(canonico(RESP).includes("CTX01_OTHER_TEXT\tConsultor de RH"));
  // sessão marcada
  const { rows: sess } = await ctx.q(`select status, submitted_at from public.screener_rhia_sessions where id=$1`, [s.body.session_id]);
  assert.equal(sess[0].status, "submitted"); assert.ok(sess[0].submitted_at);
});

test("submit idempotente: 2ª chamada devolve o mesmo público; 1 snapshot", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  const a = await HR.postSubmitRhia(ctx, { token: s.body.token });
  const b = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(b.status, 200);
  assert.deepEqual(a.body, b.body);
  assert.equal((await ctx.q(`select count(*)::int n from public.screener_rhia_result_snapshots`)).rows[0].n, 1);
});

test("submissão incompleta → 400 (falta item; CTX01=OTHER sem texto)", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  const semGov = { ...RESP }; delete semGov.GOV03;
  await preencher(ctx, s.body.token, semGov);
  let sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(sub.status, 400);
  assert.equal(sub.body.error, "submissao_incompleta");
  assert.match(sub.body.detalhe, /incompleto: falta GOV03/);
  assert.equal((await ctx.q(`select count(*)::int n from public.screener_rhia_result_snapshots`)).rows[0].n, 0);

  const s2 = await start(ctx);
  const semTexto = { ...RESP }; delete semTexto.CTX01_OTHER_TEXT;
  await preencher(ctx, s2.body.token, semTexto);
  sub = await HR.postSubmitRhia(ctx, { token: s2.body.token });
  assert.equal(sub.status, 400);
  assert.equal(sub.body.error, "submissao_incompleta");
  assert.match(sub.body.detalhe, /texto_obrigatorio/);
});

test("texto órfão (CTX01 ≠ OTHER com texto gravado) não impede a submissão nem entra no motor", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token, { ...RESP, CTX01: "HR_LEADER" }); // texto continua gravado
  const sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  semVazamento(sub.body, "submit com texto órfão");
  const { rows } = await ctx.q(`select result from public.screener_rhia_result_snapshots`);
  assert.equal(rows[0].result.internal.answers.CTX01, "HR_LEADER");
  assert.equal("CTX01_OTHER_TEXT" in rows[0].result.internal.answers, false);
});

/** Respostas com 3 dimensões abaixo de 3 itens válidos → evidência insuficiente. */
function respostasInsuficientes() {
  const R = { ...RESP };
  for (const id of ["EST01", "EST02", "TAL01", "TAL02", "DES01", "DES02"]) R[id] = "NA"; // EST/TAL/DES ficam com 2 válidos
  return R;
}

test("evidência insuficiente (muitos NA) → status INSUFFICIENT com missingMessage; sem posicionamento", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token, respostasInsuficientes());
  const sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.equal(sub.body.status, "INSUFFICIENT");
  assert.equal(sub.body.version, "2.0.0-pilot");
  assert.ok(sub.body.missingMessage);
  assert.equal(sub.body.evidence.status, "INSUFFICIENT");
  assert.equal(sub.body.governance.id, "ATTENTION");
  assert.equal("positioning" in sub.body, false);
  assert.equal("internal" in sub.body, false);
  semVazamento(sub.body, "insuficiente");
});

test("INSUFFICIENT não vaza pontos-base (paraPublico normaliza governance/evidence)", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token, respostasInsuficientes());
  const sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(sub.status, 200);
  assert.equal("weakestBp" in sub.body.governance, false, "governance.weakestBp vaza pontos-base");
  semVazamento(sub.body, "insuficiente estrito");
});

test("finalize: respostas mudam entre cálculo e finalização → função rejeita (não grava obsoleto)", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  const th = await sha256Hex(s.body.token);
  const parcial = { ...RESP }; delete parcial.GOV01;
  await assert.rejects(
    ctx.q(`select public.screener_rhia_op_finalize($1,$2,'{"public":{"version":"2.0.0-pilot"},"internal":{}}'::jsonb,$3,$3,'2.0.0-pilot','2.0.0-pilot',null)`,
      [th, canonico(parcial), "a".repeat(64)]),
    (e) => String(e.message).includes("respostas_mudaram"));
  assert.equal((await ctx.q(`select count(*)::int n from public.screener_rhia_result_snapshots`)).rows[0].n, 0);
});

test("closed bloqueia escrita/início mas permite leitura do já submetido", async () => {
  const ctx = await ambiente();
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  await HR.postSubmitRhia(ctx, { token: s.body.token });
  await ctx.q(`update public.screener_event_bindings set status='closed' where event_slug=$1`, [EVENTO]);
  assert.equal((await HR.getResultRhia(ctx, { token: s.body.token })).status, 200);
  assert.equal((await start(ctx)).status, 403);
  assert.equal((await HR.getStartRhia(ctx, { event_slug: EVENTO })).status, 403);
});

// ---------------------------------------------------------------- portão de lead

test("PORTÃO: submit não devolve o resultado; getResult 403 até o lead; libera depois", async () => {
  const ctx = await ambiente({ leadMode: "required_before_result" });
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  // submit retém o resultado — corpo só sinaliza lead_required
  const sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.deepEqual(sub.body, { submitted: true, lead_required: true });
  // getResult antes do lead → 403; session já mostra submitted
  const r1 = await HR.getResultRhia(ctx, { token: s.body.token });
  assert.equal(r1.status, 403);
  assert.equal(r1.body.error, "lead_required");
  const g = await HR.getSessionRhia(ctx, { token: s.body.token });
  assert.equal(g.body.submitted, true);
  assert.equal(g.body.pode_responder, false);
  // captura o lead → getResult libera o resultado
  const lead = await HR.postLeadRhia(ctx, { token: s.body.token, nome: "Ana", email: "Ana@Exemplo.co", marketing_opt_in: true });
  assert.equal(lead.status, 200, JSON.stringify(lead.body));
  const [L] = (await ctx.q(`select nome, email, email_normalized, marketing_opt_in, marketing_opt_in_at, lead_source
                             from public.screener_rhia_leads`)).rows;
  assert.equal(L.nome, "Ana"); assert.equal(L.email_normalized, "ana@exemplo.co");
  assert.equal(L.marketing_opt_in, true); assert.ok(L.marketing_opt_in_at);
  assert.equal(L.lead_source, EVENTO);
  const r2 = await HR.getResultRhia(ctx, { token: s.body.token });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.version, "2.0.0-pilot");
  assert.equal(r2.body.positioning.stage, "Estrategista de Escala");
  semVazamento(r2.body, "result após lead");
  // snapshot existe desde o submit (o gate é só na entrega)
  assert.equal((await ctx.q(`select count(*)::int n from public.screener_rhia_result_snapshots`)).rows[0].n, 1);
});

test("PORTÃO idempotente: re-submit antes do lead espelha o gate; depois do lead devolve o resultado", async () => {
  const ctx = await ambiente({ leadMode: "required_before_result" });
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  await HR.postSubmitRhia(ctx, { token: s.body.token });
  const antes = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.deepEqual(antes.body, { submitted: true, lead_required: true });
  await HR.postLeadRhia(ctx, { token: s.body.token, email: "ana@x.co" });
  const re = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(re.status, 200);
  assert.equal(re.body.positioning.stage, "Estrategista de Escala");
  assert.equal((await ctx.q(`select count(*)::int n from public.screener_rhia_result_snapshots`)).rows[0].n, 1);
});

test("modo optional_after_submit: resultado sai no submit; lead é opcional e upsert por sessão", async () => {
  const ctx = await ambiente({ leadMode: "optional_after_submit" });
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  const sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
  assert.equal(sub.body.version, "2.0.0-pilot");
  assert.equal((await HR.getResultRhia(ctx, { token: s.body.token })).status, 200);
  assert.equal((await HR.postLeadRhia(ctx, { token: s.body.token, email: "a@x.co" })).status, 200);
  assert.equal((await HR.postLeadRhia(ctx, { token: s.body.token, email: "b@x.co", nome: "B" })).status, 200);
  const { rows } = await ctx.q(`select email_normalized from public.screener_rhia_leads`);
  assert.equal(rows.length, 1); assert.equal(rows[0].email_normalized, "b@x.co");
});

test("lead: e-mail inválido 400; sessão não submetida 409; modo none 409; token inexistente 404", async () => {
  const ctx = await ambiente({ leadMode: "optional_after_submit" });
  const s = await start(ctx);
  assert.equal((await HR.postLeadRhia(ctx, { token: s.body.token, email: "a@x.co" })).body.error, "sessao_nao_submetida");
  await preencher(ctx, s.body.token);
  await HR.postSubmitRhia(ctx, { token: s.body.token });
  const inv = await HR.postLeadRhia(ctx, { token: s.body.token, email: "sem-arroba" });
  assert.equal(inv.status, 400); assert.equal(inv.body.error, "email_invalido");
  assert.equal((await HR.postLeadRhia(ctx, { token: "c".repeat(64), email: "a@x.co" })).status, 404);
  await ctx.q(`update public.screener_event_bindings set lead_capture_mode='none' where event_slug=$1`, [EVENTO]);
  const off = await HR.postLeadRhia(ctx, { token: s.body.token, email: "a@x.co" });
  assert.equal(off.status, 409); assert.equal(off.body.error, "lead_desativado");
});

test("GET /rhia/result sem submissão → 404 sem_resultado (inclusive na configuração de produção)", async () => {
  // required_before_result é o modo do vínculo público: o portão não pode
  // responder 403 lead_required a quem sequer submeteu — não há o que reter.
  for (const leadMode of ["optional_after_submit", "required_before_result"]) {
    const ctx = await ambiente({ leadMode });
    const s = await start(ctx);
    const r = await HR.getResultRhia(ctx, { token: s.body.token });
    assert.equal(r.status, 404, leadMode); assert.equal(r.body.error, "sem_resultado", leadMode);
  }
});

test("POST /rhia/lead: caractere de controle é aparado no nome e recusa e-mail; erro do Postgres não vaza", async () => {
  const ctx = await ambiente({ leadMode: "required_before_result" });
  const s = await start(ctx);
  await preencher(ctx, s.body.token);
  await HR.postSubmitRhia(ctx, { token: s.body.token });
  // NUL no e-mail: 400 email_invalido (nunca o texto cru "invalid byte sequence…")
  const mail = await HR.postLeadRhia(ctx, { token: s.body.token, email: "a\u0000b@x.co" });
  assert.equal(mail.status, 400); assert.equal(mail.body.error, "email_invalido");
  assert.deepEqual(Object.keys(mail.body), ["error"], "resposta não carrega detalhe do banco");
  // NUL no nome: aceito, aparado antes do banco
  const ok = await HR.postLeadRhia(ctx, { token: s.body.token, nome: "a\u0000b", email: "a@x.co" });
  assert.equal(ok.status, 200);
  const { rows } = await ctx.q(`select nome from public.screener_rhia_leads order by created_at desc limit 1`);
  assert.equal(rows[0].nome, "a b");
});

// ---------------------------------------------------------------- prévia interna

test("internal_preview: sem credencial nega TODAS as rotas; com credencial funciona (só o hash vai ao banco)", async () => {
  const h = await sha256Hex(PREVIEW);
  const ctx = await ambiente({ status: "internal_preview", cred: h });
  const alvo = "x".repeat(64);
  for (const call of [
    HR.getStartRhia(ctx, { event_slug: EVENTO }),
    start(ctx),
    HR.getSessionRhia(ctx, { token: alvo }),
    HR.putResponseRhia(ctx, { token: alvo, item_id: "EST01", value: "E3" }),
    HR.postSubmitRhia(ctx, { token: alvo }),
    HR.getResultRhia(ctx, { token: alvo }),
    HR.postLeadRhia(ctx, { token: alvo, email: "a@x.co" }),
  ]) assert.equal((await call).status, 404);
  assert.equal((await HR.getStartRhia(ctx, { event_slug: EVENTO, previewKey: "errada" })).status, 404);

  const capturados = [];
  const qOrig = ctx.q;
  ctx.q = (sql, params = []) => { capturados.push(...params.map((p) => String(p))); return qOrig(sql, params); };
  const s = await start(ctx, { previewKey: PREVIEW });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  await preencher(ctx, s.body.token, RESP, { previewKey: PREVIEW });
  const sub = await HR.postSubmitRhia(ctx, { token: s.body.token, previewKey: PREVIEW });
  assert.equal(sub.status, 200);
  const rr = await HR.getResultRhia(ctx, { token: s.body.token, previewKey: PREVIEW });
  assert.equal(rr.status, 200);
  ctx.q = qOrig;
  assert.ok(!capturados.includes(PREVIEW), "a chave crua apareceu como parâmetro SQL");
  assert.ok(capturados.includes(h), "o hash da prévia deveria ter sido enviado");
  for (const body of [s.body, sub.body, rr.body]) {
    const blob = JSON.stringify(body);
    for (const a of [h, PREVIEW, "preview_credential", "preview_expires_at", "preview_revoked_at"])
      assert.ok(!blob.includes(a), `vazou "${a}"`);
  }
});

// ---------------------------------------------------------------- fronteira de privilégio

test("papel restrito: screener_runtime executa o fluxo inteiro (7 rotas) só via funções", async () => {
  const ctx = await ambiente({ leadMode: "required_before_result" });
  await ctx._comoRuntime();
  try {
    assert.equal((await HR.getStartRhia(ctx, { event_slug: EVENTO })).status, 200);
    const s = await start(ctx);
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await HR.getSessionRhia(ctx, { token: s.body.token })).status, 200);
    await preencher(ctx, s.body.token);
    const sub = await HR.postSubmitRhia(ctx, { token: s.body.token });
    assert.deepEqual(sub.body, { submitted: true, lead_required: true });
    assert.equal((await HR.getResultRhia(ctx, { token: s.body.token })).status, 403);
    assert.equal((await HR.postLeadRhia(ctx, { token: s.body.token, email: "ana@x.co" })).status, 200);
    const r = await HR.getResultRhia(ctx, { token: s.body.token });
    assert.equal(r.status, 200);
    semVazamento(r.body, "runtime result");
  } finally { await ctx._comoDono(); }
});

test("papel restrito: NENHUM privilégio direto nas tabelas screener_rhia_*; service_role sem EXECUTE", async () => {
  const ctx = await ambiente();
  const tabelas = ["screener_rhia_sessions", "screener_rhia_responses", "screener_rhia_result_snapshots", "screener_rhia_leads"];
  for (const t of tabelas) for (const priv of ["select", "insert", "update", "delete"]) {
    for (const papel of ["screener_runtime", "service_role", "anon", "authenticated"]) {
      const { rows } = await ctx.q(`select has_table_privilege($1, $2, $3) as ok`, [papel, `public.${t}`, priv]);
      assert.equal(rows[0].ok, false, `${papel} tem ${priv} direto em ${t}`);
    }
  }
  const { rows: ex } = await ctx.q(`select has_function_privilege('service_role','public.screener_rhia_op_resume(text,text)','execute') as ok`);
  assert.equal(ex[0].ok, false, "service_role executa screener_rhia_op_resume");
  await ctx._comoRuntime();
  try { await assert.rejects(ctx.q(`select * from public.screener_rhia_sessions limit 1`), /permission denied/i); }
  finally { await ctx._comoDono(); }
});

test("nenhuma tabela legada nem SQL direto nos handlers rhia (estático); rotas registradas", () => {
  const src = fs.readFileSync(path.resolve(AQUI, "..", "..", "edge", "handlers-rhia.mjs"), "utf8");
  for (const legado of ["public.respondentes", "public.eventos", "public.respostas", "public.relatorios"])
    assert.ok(!src.includes(legado), `handlers tocam legado: ${legado}`);
  assert.ok(!/from\s+public\.screener_/i.test(src), "handler faz SELECT direto em tabela screener_");
  assert.ok(!/insert\s+into\s+public\.screener_/i.test(src), "handler faz INSERT direto");
  assert.ok(!/update\s+public\.screener_(?!.*op_)/i.test(src), "handler faz UPDATE direto");
  assert.ok(!/console\.(log|error|warn)/.test(src), "handler loga (risco de vazar token/credencial)");
  assert.ok(!src.includes("../motor/"), "handlers rhia não importam o motor V1");
  const http = fs.readFileSync(path.resolve(AQUI, "..", "..", "edge", "http.mjs"), "utf8");
  for (const rota of ["/rhia/start", "/rhia/session", "/rhia/response", "/rhia/submit", "/rhia/result", "/rhia/lead"])
    assert.ok(http.includes(`"${rota}"`), `rota ${rota} ausente em http.mjs`);
  const index = fs.readFileSync(path.resolve(AQUI, "..", "..", "..", "supabase", "functions", "screener", "index.ts"), "utf8");
  assert.ok(index.includes("handlers-rhia.mjs"));
  for (const fn of ["getStartRhia", "postStartRhia", "getSessionRhia", "putResponseRhia", "postSubmitRhia", "getResultRhia", "postLeadRhia"])
    assert.ok(index.includes(`HR.${fn}(`), `index.ts não roteia ${fn}`);
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(src + index), "chave hardcoded");
});
