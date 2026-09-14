// Wiring do rate limiting na edge (handlers → preview_authorize/rate_check) — pglite.
// Flag: ctx.rate.ativo. As FUNÇÕES já têm testes próprios; aqui provamos o WIRING:
// os handlers chamam as RPCs certas, mapeiam 429/503 e o caminho legado segue igual.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { instrumento } from "../../motor/definicao.mjs";
import { chaveRate } from "../../edge/ratelimit.mjs";
import * as H from "../../edge/handlers.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const SCHEMA = rd("20260902143339_screener_tabelas_isoladas.sql");
const RPC = rd("20260903120000_screener_rpc_e_papeis.sql");
const RL = rd("20260904120000_screener_rate_limit.sql").split("-- @@@CRON@@@")[0]; // pula pg_cron
const LEAD = rd("20260905120000_screener_op_lead.sql");
const RL_PUBLICO = rd("20260914150000_screener_rate_limite_para_link_publico.sql");
const IC = instrumento.instrument.code, IV = instrumento.instrument.version;
import { createHash } from "node:crypto";
const SECRET = "segredo-de-teste";

async function ambiente({ ativo = true, status = "public_pilot", cred = null } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC); await db.exec(RL); await db.exec(LEAD); await db.exec(RL_PUBLICO);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ($1,$2,$3,$4,'inactive')`, [IC, IV, instrumento, "a".repeat(64)]);
  await db.query(`insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, session_retention_days, lead_retention_days, preview_credential_hash)
      values ('ev','${IC}','${IV}', true, $1, 180, 365, $2)`, [status, cred]);
  const ctx = { q: (sql, p = []) => db.query(sql, p), now: () => new Date(), rate: { ativo, secret: SECRET }, _db: db };
  return ctx;
}
const ipHmac = (ip) => chaveRate(SECRET, "ip", "", ip);
const postStart = (ctx, ipk, opts = {}) => H.postStart(ctx, { event_slug: "ev", privacy_ack: true, privacy_notice_version: "v1", ipHmac: ipk, ...opts });

// O limite de criação de sessão é chaveado por IP, e IP é COMPARTILHADO: o wifi
// do workshop, a rede do Ibmec, o NAT da operadora no celular. O limite antigo
// (10/h) bloqueava a 11ª pessoa da MESMA SALA — aconteceu em produção, no
// primeiro uso real. A 20260914150000 subiu o teto; ele continua existindo, só
// deixou de confundir plateia com ataque.
test("uma sala inteira atrás do MESMO IP não é bloqueada", async () => {
  const ctx = await ambiente(); const ipk = await ipHmac("203.0.113.9");
  for (let i = 0; i < 40; i++) {
    const r = await postStart(ctx, ipk);
    assert.equal(r.status, 201, `pessoa ${i + 1} da mesma rede: ${JSON.stringify(r.body)}`);
  }
  // outro IP segue independente
  assert.equal((await postStart(ctx, await ipHmac("198.51.100.2"))).status, 201);
});

test("wiring INATIVO: caminho legado (get_binding), sem limite", async () => {
  const ctx = await ambiente({ ativo: false });
  for (let i = 0; i < 12; i++) assert.equal((await postStart(ctx, null)).status, 201);
});

test("wiring ativo: prévia por IP — internal_preview sem credencial → 404; 6ª tentativa → 429", async () => {
  const PH = createHash("sha256").update("chave", "utf8").digest("hex");
  const ctx = await ambiente({ status: "internal_preview", cred: PH }); const ipk = await ipHmac("203.0.113.50");
  // 5 tentativas sem credencial → invalid → 404 (edge)
  for (let i = 0; i < 5; i++) assert.equal((await H.getStart(ctx, { event_slug: "ev", ipHmac: ipk })).status, 404);
  // 6ª → limited → 429
  assert.equal((await H.getStart(ctx, { event_slug: "ev", ipHmac: ipk })).status, 429);
  // credencial correta em IP novo → 200
  assert.equal((await H.getStart(ctx, { event_slug: "ev", previewKey: "chave", ipHmac: await ipHmac("9.9.9.9") })).status, 200);
});

test("wiring ativo: limite por token (autosave) — bucket cheio → 429 antes de validar", async () => {
  const ctx = await ambiente(); const ipk = await ipHmac("203.0.113.7");
  const r = await postStart(ctx, ipk); assert.equal(r.status, 201);
  const token = r.body.token;
  // satura o bucket de autosave desse token na janela atual (limite 120)
  const key = await chaveRate(SECRET, "autosave", "", token);
  await ctx.q(`insert into public.screener_rate_limit (key_hmac, operation, window_start, count)
    values ($1,'autosave', to_timestamp(floor(extract(epoch from now())/3600)*3600), 120)`, [key]);
  const rr = await H.putResponse(ctx, { token, item_id: "x", option_id: "y" });
  assert.equal(rr.status, 429);
  assert.equal(rr.body.error, "muitas_requisicoes");
});

test("wiring ativo: fail-closed — RPC de rate indisponível → 503", async () => {
  // ctx cujo q lança ao chamar rate_check/preview_authorize (simula função ausente)
  const ctx = {
    q: (sql) => { if (/preview_authorize|rate_check/.test(sql)) throw new Error("função ausente"); return { rows: [] }; },
    now: () => new Date(), rate: { ativo: true, secret: SECRET },
  };
  const r = await postStart(ctx, await ipHmac("1.2.3.4"));
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "indisponivel_temporario");
});
