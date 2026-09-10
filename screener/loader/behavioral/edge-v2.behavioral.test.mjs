// Fluxo da edge V2 (/v2/*) contra Postgres efêmero (pglite). Sem deploy.
// Prova o pipeline ponta a ponta E a fronteira: o navegador recebe só o
// PublicResultIAV2 (sem media/ponderada/itens); o snapshot guarda o interno.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { instrumentoV2, checksumV2 } from "../../edge/definicao-v2.mjs";
import * as HV2 from "../../edge/handlers-v2.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const SCHEMA = fs.readFileSync(path.join(MIGR, "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const RPC = fs.readFileSync(path.join(MIGR, "20260903120000_screener_rpc_e_papeis.sql"), "utf8");
const V2 = fs.readFileSync(path.join(MIGR, "20260906120000_screener_v2_tabelas_e_rpc.sql"), "utf8");
const HEX64 = "a".repeat(64);
const IC = instrumentoV2.code, IV = instrumentoV2.version;

async function ambiente({ status = "public_pilot", leadMode = "optional_after_submit" } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC); await db.exec(V2);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ($1,$2,$3,$4,'active')`, [IC, IV, instrumentoV2, HEX64]);
  await db.query(`insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, lead_capture_mode, session_retention_days, lead_retention_days)
      values ('ev-ia-v2',$1,$2, true, $3, $4, 180, 365)`, [IC, IV, status, leadMode]);
  let now = new Date("2026-09-10T12:00:00Z");
  return { q: (sql, params = []) => db.query(sql, params), now: () => now, _db: db };
}

// Exemplo C do racional: diretoria, técnica incipiente, liderança madura → N3, gap 0, destravar.
const RESP = { Q1: "N2", Q2: "N1", Q3: "NA", Q4: "N3", Q5: "N3", Q6: "N3", Q7: "N4", Q8: "N3" };

async function preencher(ctx, token, sen = "diretoria", resp = RESP) {
  let r = await HV2.putResponseV2(ctx, { token, item_code: "SENIORIDADE", answer_code: sen });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const [item_code, answer_code] of Object.entries(resp)) {
    r = await HV2.putResponseV2(ctx, { token, item_code, answer_code });
    assert.equal(r.status, 200, `${item_code}: ${JSON.stringify(r.body)}`);
  }
}

test("fluxo completo: start → autosave → submit devolve PublicResultIAV2 sanitizado", async () => {
  const ctx = await ambiente();
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  assert.equal(s.status, 201);
  assert.match(s.body.token, /^[0-9a-f]{64}$/);
  assert.equal(s.body.presentation.questions.length, 8);
  assert.equal(s.body.presentation.questions[0].options.some((o) => o.code === "NA"), true);

  await preencher(ctx, s.body.token);
  const sub = await HV2.postSubmitV2(ctx, { token: s.body.token });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  const R = sub.body;
  assert.equal(R.contract_version, "PublicResultIAV2");
  assert.equal(R.nivel.n, 3);
  assert.equal(R.nivel.name, "Estrategista de Escala");
  assert.equal(R.gap.classe, "no");        // efetivo 3, esperado 3 (diretoria)
  assert.equal(R.sinal, "lideranca_a_destravar");

  // FRONTEIRA: o corpo público NÃO carrega internos de cálculo.
  assert.equal("ponderada" in R, false);
  assert.equal("itens" in R, false);
  assert.equal("media" in R.eixos.tecnico, false);
  assert.deepEqual(Object.keys(R.eixos.tecnico).sort(), ["cobertura", "display", "nivel"]);
});

test("o snapshot no banco guarda o resultado INTERNO (com ponderada); o público não", async () => {
  const ctx = await ambiente();
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  await preencher(ctx, s.body.token);
  const sub = await HV2.postSubmitV2(ctx, { token: s.body.token });
  assert.equal("ponderada" in sub.body, false); // público: sem ponderada
  const { rows } = await ctx.q("select result from public.screener_v2_result_snapshots");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].result.contract_version, "ScoreResultIAV2"); // interno
  assert.ok(typeof rows[0].result.ponderada === "number");          // interno guarda a ponderada
});

test("submit idempotente: 2ª chamada devolve o mesmo público; 1 snapshot", async () => {
  const ctx = await ambiente();
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  await preencher(ctx, s.body.token);
  const a = await HV2.postSubmitV2(ctx, { token: s.body.token });
  const b = await HV2.postSubmitV2(ctx, { token: s.body.token });
  assert.deepEqual(a.body, b.body);
  const n = (await ctx.q("select count(*)::int as n from public.screener_v2_result_snapshots")).rows[0].n;
  assert.equal(n, 1);
});

test("submissão incompleta (falta senioridade) → 400", async () => {
  const ctx = await ambiente();
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  for (const [item_code, answer_code] of Object.entries(RESP))
    await HV2.putResponseV2(ctx, { token: s.body.token, item_code, answer_code });
  const sub = await HV2.postSubmitV2(ctx, { token: s.body.token });
  assert.equal(sub.status, 400);
  assert.equal(sub.body.error, "submissao_incompleta");
});

test("resposta inválida (nível fora da escala) → 400 opcao_invalida", async () => {
  const ctx = await ambiente();
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  const r = await HV2.putResponseV2(ctx, { token: s.body.token, item_code: "Q1", answer_code: "N9" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "opcao_invalida");
});

test("get /v2/session retoma respostas e senioridade", async () => {
  const ctx = await ambiente();
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  await preencher(ctx, s.body.token);
  const g = await HV2.getSessionV2(ctx, { token: s.body.token });
  assert.equal(g.status, 200);
  assert.equal(g.body.seniority, "diretoria");
  assert.equal(g.body.progress.answered, 8);
  assert.equal(g.body.answered.Q1, "N2");
});

test("lead V2: após submit, POST /v2/lead grava; get /v2/result devolve sanitizado", async () => {
  const ctx = await ambiente();
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  await preencher(ctx, s.body.token);
  await HV2.postSubmitV2(ctx, { token: s.body.token });
  const lead = await HV2.postLeadV2(ctx, { token: s.body.token, nome: "Ana", email: "ana@x.co", marketing_opt_in: true });
  assert.equal(lead.status, 200);
  const [L] = (await ctx.q("select * from public.screener_v2_leads")).rows;
  assert.equal(L.email_normalized, "ana@x.co");
  const res = await HV2.getResultV2(ctx, { token: s.body.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.contract_version, "PublicResultIAV2");
  assert.equal(res.body.nivel.n, 3);
});

test("binding de instrumento diferente → 409 instrumento_indisponivel", async () => {
  const ctx = await ambiente();
  // outra versão existe no catálogo; o binding aponta para ela → não confere com o instrumento V2 carregado
  await ctx.q(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
               values ($1,'9.9.9','{}'::jsonb,$2,'inactive')`, [IC, HEX64]);
  await ctx.q(`update public.screener_event_bindings set instrument_version='9.9.9' where event_slug='ev-ia-v2'`);
  const g = await HV2.getStartV2(ctx, { event_slug: "ev-ia-v2" });
  assert.equal(g.status, 409);
  assert.equal(g.body.error, "instrumento_indisponivel");
});

test("PORTÃO: submit não devolve o resultado; getResult 403 até o lead; libera depois", async () => {
  const ctx = await ambiente({ leadMode: "required_before_result" });
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  await preencher(ctx, s.body.token);
  // submit retém o resultado — corpo só sinaliza lead_required, sem nível/eixos
  const sub = await HV2.postSubmitV2(ctx, { token: s.body.token });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.lead_required, true);
  assert.equal("nivel" in sub.body, false);
  assert.equal("ponderada" in sub.body, false);
  assert.equal("eixos" in sub.body, false);
  // getResult antes do lead → 403
  const r1 = await HV2.getResultV2(ctx, { token: s.body.token });
  assert.equal(r1.status, 403);
  assert.equal(r1.body.error, "lead_required");
  // captura o lead → getResult libera o resultado
  const lead = await HV2.postLeadV2(ctx, { token: s.body.token, nome: "Ana", email: "ana@x.co", marketing_opt_in: false });
  assert.equal(lead.status, 200);
  const r2 = await HV2.getResultV2(ctx, { token: s.body.token });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.contract_version, "PublicResultIAV2");
  assert.equal(r2.body.nivel.n, 3);
  // snapshot no banco existe desde o submit (o gate é só na entrega)
  assert.equal((await ctx.q("select count(*)::int n from public.screener_v2_result_snapshots")).rows[0].n, 1);
});

test("PORTÃO idempotente: re-submit após o lead devolve o resultado", async () => {
  const ctx = await ambiente({ leadMode: "required_before_result" });
  const s = await HV2.postStartV2(ctx, { event_slug: "ev-ia-v2", privacy_ack: true, privacy_notice_version: "v1" });
  await preencher(ctx, s.body.token);
  await HV2.postSubmitV2(ctx, { token: s.body.token });
  await HV2.postLeadV2(ctx, { token: s.body.token, email: "ana@x.co" });
  const re = await HV2.postSubmitV2(ctx, { token: s.body.token }); // já submetida + com lead
  assert.equal(re.status, 200);
  assert.equal(re.body.nivel.n, 3);
});

test("checksumV2 é estável (hex64)", async () => {
  const a = await checksumV2();
  const b = await checksumV2();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
});
