// Fluxo da edge do screener contra Postgres efêmero (pglite). Sem deploy.
// Cobre os testes obrigatórios do corte 3.
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
const SCHEMA = fs.readFileSync(path.resolve(AQUI, "..", "..", "..", "supabase", "migrations", "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const HEX64 = "a".repeat(64);
const PREVIEW = "previa-secreta";

async function ambiente(bindingSql) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.query(
    `insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
     values ($1,$2,'{}'::jsonb,$3,'inactive')`,
    [instrumento.instrument.code, instrumento.instrument.version, HEX64]);
  await db.exec(bindingSql);
  let now = new Date("2026-09-10T12:00:00Z");
  const ctx = {
    q: (sql, params = []) => db.query(sql, params),
    tx: (fn) => db.transaction((tx) => fn((s, p = []) => tx.query(s, p))),
    now: () => now,
    previewKeyHash: null,
    _setNow: (d) => (now = d),
    _db: db,
  };
  return ctx;
}
const bindingPublic = `insert into public.screener_event_bindings
  (event_slug, instrument_code, instrument_version, is_current, status, session_retention_days, lead_retention_days)
  values ('rh-negocios-ia', '${instrumento.instrument.code}', '${instrumento.instrument.version}', true, 'public_pilot', 180, 365)`;
const bindingPreview = `insert into public.screener_event_bindings
  (event_slug, instrument_code, instrument_version, is_current, status)
  values ('preview-interno-ia-v1', '${instrumento.instrument.code}', '${instrumento.instrument.version}', true, 'internal_preview')`;

async function responderTudo(ctx, token, { naItem } = {}) {
  const pub = projecaoPublica(instrumento, { sessionSeed: token });
  const porItemStage = new Map();
  for (const [optId, alvo] of Object.entries(pub.mapping.options)) porItemStage.set(alvo.item + "|" + alvo.stage, optId);
  for (const b of pub.blocks) {
    for (const it of b.items) {
      const code = pub.mapping.items[it.id];
      const stage = (naItem && code === naItem) ? "NA" : "E3";
      const optId = porItemStage.get(code + "|" + stage);
      const r = await H.putResponse(ctx, { token, item_id: it.id, option_id: optId });
      assert.equal(r.status, 200, `putResponse ${code}: ${JSON.stringify(r.body)}`);
    }
  }
}

test("token gerado no servidor; banco guarda só o hash; sessão presa ao binding", async () => {
  const ctx = await ambiente(bindingPublic);
  const r = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true });
  assert.equal(r.status, 201);
  assert.match(r.body.token, /^[0-9a-f]{64}$/);
  const { rows } = await ctx.q(`select token_hash, binding_id, status from public.screener_sessions where id=$1`, [r.body.session_id]);
  assert.equal(rows[0].token_hash, await sha256Hex(r.body.token)); // só o hash
  assert.notEqual(rows[0].token_hash, r.body.token);               // nunca o token cru
  const { rows: b } = await ctx.q(`select id from public.screener_event_bindings where event_slug='rh-negocios-ia'`);
  assert.equal(rows[0].binding_id, b[0].id);                       // escopada ao binding
});

test("privacidade obrigatória no POST /start", async () => {
  const ctx = await ambiente(bindingPublic);
  const r = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: false });
  assert.equal(r.status, 400);
});

test("internal_preview: sem credencial nega TODAS as rotas; slug não concede acesso", async () => {
  const ctx = await ambiente(bindingPreview);
  for (const call of [
    H.getStart(ctx, { event_slug: "preview-interno-ia-v1" }),
    H.postStart(ctx, { event_slug: "preview-interno-ia-v1", privacy_ack: true }),
    H.getSession(ctx, { token: "x".repeat(64) }),
    H.putResponse(ctx, { token: "x".repeat(64), item_id: "a", option_id: "b" }),
    H.postSubmit(ctx, { token: "x".repeat(64) }),
    H.getResult(ctx, { token: "x".repeat(64) }),
  ]) {
    const r = await call;
    assert.equal(r.status, 404, `esperado 404 sem credencial: ${JSON.stringify(r.body)}`);
  }
});

test("internal_preview: com credencial correta, inicia", async () => {
  const ctx = await ambiente(bindingPreview);
  ctx.previewKeyHash = await sha256Hex(PREVIEW);
  const semCred = await H.getStart(ctx, { event_slug: "preview-interno-ia-v1" });
  assert.equal(semCred.status, 404);
  const comCred = await H.getStart(ctx, { event_slug: "preview-interno-ia-v1", previewKey: PREVIEW });
  assert.equal(comCred.status, 200);
  const start = await H.postStart(ctx, { event_slug: "preview-interno-ia-v1", privacy_ack: true, previewKey: PREVIEW });
  assert.equal(start.status, 201);
});

test("PUT rejeita option de outra sessão/instrumento", async () => {
  const ctx = await ambiente(bindingPublic);
  const s = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true });
  const outra = projecaoPublica(instrumento, { sessionSeed: "sessao-alheia" });
  const itemAlheio = outra.blocks[0].items[0].id;
  const opAlheia = outra.blocks[0].items[0].options[0].id;
  const r = await H.putResponse(ctx, { token: s.body.token, item_id: itemAlheio, option_id: opAlheia });
  assert.equal(r.status, 400);
});

test("happy path: responde, submete, lê PublicResultV1 sem vazamento; N/A preservado", async () => {
  const ctx = await ambiente(bindingPublic);
  const s = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true });
  const naItem = instrumento.items.find((i) => i.block === "ai").code;
  await responderTudo(ctx, s.body.token, { naItem });
  // N/A preservado no banco
  const { rows: na } = await ctx.q(`select stage_code from public.screener_responses r join public.screener_sessions se on se.id=r.session_id where se.id=$1 and r.item_code=$2`, [s.body.session_id, naItem]);
  assert.equal(na[0].stage_code, "NA");

  const sub = await H.postSubmit(ctx, { token: s.body.token });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.contract_version, "PublicResultV1");
  const blob = JSON.stringify(sub.body);
  for (const p of ["score_bp", "display_score", "provisional_cut_bp", "input_checksum", "\"E1\"", "\"E4\"", "stage_code", "weight"]) {
    assert.ok(!blob.includes(p), `PublicResultV1 vazou ${p}`);
  }
  for (const it of instrumento.items) assert.ok(!blob.includes(it.code));
  // /result devolve o mesmo público
  const res = await H.getResult(ctx, { token: s.body.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, sub.body);
});

test("submissão idempotente: repetir devolve o mesmo snapshot (1 linha); resposta após submit é 409", async () => {
  const ctx = await ambiente(bindingPublic);
  const s = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true });
  await responderTudo(ctx, s.body.token);
  const a = await H.postSubmit(ctx, { token: s.body.token });
  const b = await H.postSubmit(ctx, { token: s.body.token });
  assert.deepEqual(a.body, b.body);
  const { rows } = await ctx.q(`select count(*)::int n from public.screener_result_snapshots where session_id=$1`, [s.body.session_id]);
  assert.equal(rows[0].n, 1); // não duplicou
  const put = await H.putResponse(ctx, { token: s.body.token, item_id: "x", option_id: "y" });
  assert.equal(put.status, 409); // resposta impossível após submissão
});

test("status/vigência revalidados: closed bloqueia escrita mas permite leitura do já submetido", async () => {
  const ctx = await ambiente(bindingPublic);
  const s = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true });
  await responderTudo(ctx, s.body.token);
  await H.postSubmit(ctx, { token: s.body.token });
  await ctx.q(`update public.screener_event_bindings set status='closed' where event_slug='rh-negocios-ia'`);
  const res = await H.getResult(ctx, { token: s.body.token });
  assert.equal(res.status, 200); // leitura permitida
  // nova sessão não pode iniciar
  const novo = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true });
  assert.equal(novo.status, 403);
});

test("nenhuma tabela legada é tocada pelos handlers (checagem estática)", () => {
  const src = fs.readFileSync(path.resolve(AQUI, "..", "..", "edge", "handlers.mjs"), "utf8");
  for (const legado of ["public.respondentes", "public.eventos", "public.respostas", "public.relatorios"]) {
    assert.ok(!src.includes(legado), `handlers referenciam legado: ${legado}`);
  }
});

test("service_role ausente dos payloads públicos e do código-fonte da lógica pública", async () => {
  const ctx = await ambiente(bindingPublic);
  const start = await H.postStart(ctx, { event_slug: "rh-negocios-ia", privacy_ack: true });
  await responderTudo(ctx, start.body.token);
  const res = await H.getResult(ctx, { token: start.body.token });
  for (const body of [start.body, res.body]) {
    assert.ok(!JSON.stringify(body).toLowerCase().includes("service_role"));
  }
  const logica = fs.readFileSync(path.resolve(AQUI, "..", "..", "edge", "logica.mjs"), "utf8");
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(logica), "chave hardcoded na lógica");
});
