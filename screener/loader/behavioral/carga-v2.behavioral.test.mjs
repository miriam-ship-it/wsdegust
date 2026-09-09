// Comportamento da carga V2 (PL/pgSQL) contra Postgres efêmero (pglite). Sem deploy.
// Prova: cria instrumento inativo + vínculo interno; idempotência (no-op); guarda
// de checksum; e integração — o vínculo criado dirige a edge V2 (com credencial).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as HV2 from "../../edge/handlers-v2.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const SCHEMA = rd("20260902143339_screener_tabelas_isoladas.sql");
const RPC = rd("20260903120000_screener_rpc_e_papeis.sql");
const V2 = rd("20260906120000_screener_v2_tabelas_e_rpc.sql");
const CARGA = rd("20260907120000_screener_v2_carga_inativa.sql");

async function base() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC); await db.exec(V2);
  return db;
}
const iv = (db) => db.query("select * from public.screener_instrument_versions where instrument_code='SCREENER_IA_V2'");
const bind = (db) => db.query("select * from public.screener_event_bindings where event_slug='preview-interno-ia-v2'");

test("carga cria o instrumento INATIVO e o vínculo interno (internal_preview, lead none)", async () => {
  const db = await base();
  await db.exec(CARGA);
  const { rows: ivs } = await iv(db);
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].instrument_version, "2.0.0");
  assert.equal(ivs[0].status, "inactive");
  assert.match(ivs[0].checksum, /^[0-9a-f]{64}$/);
  const { rows: bs } = await bind(db);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].status, "internal_preview");
  assert.equal(bs[0].lead_capture_mode, "none");
  assert.equal(bs[0].is_current, true);
  assert.equal(bs[0].preview_credential_hash, null); // inerte até semear o hash fora da migration
});

test("idempotente: aplicar a carga 2x é no-op (sem erro, sem duplicar)", async () => {
  const db = await base();
  await db.exec(CARGA);
  await db.exec(CARGA); // não deve lançar
  assert.equal((await iv(db)).rows.length, 1);
  assert.equal((await bind(db)).rows.length, 1);
});

test("guarda de checksum: definição adulterada com checksum antigo → recusa", async () => {
  const db = await base();
  await db.exec(CARGA);
  await db.query("update public.screener_instrument_versions set checksum=$1 where instrument_code='SCREENER_IA_V2'", ["b".repeat(64)]);
  await assert.rejects(db.exec(CARGA), /checksum divergente/);
});

test("guarda de vínculo: outro vínculo corrente no mesmo slug → recusa", async () => {
  const db = await base();
  await db.exec(CARGA);
  // simula divergência: muda o status do vínculo existente e re-aplica
  await db.query("update public.screener_event_bindings set status='closed' where event_slug='preview-interno-ia-v2'");
  await assert.rejects(db.exec(CARGA), /configuração divergente/);
});

test("integração: o vínculo carregado dirige a edge V2 (com credencial semeada)", async () => {
  const db = await base();
  await db.exec(CARGA);
  // semeia o hash da credencial FORA da migration (como em produção)
  const chave = "chave-homolog-v2";
  const hash = createHash("sha256").update(chave, "utf8").digest("hex");
  await db.query("update public.screener_event_bindings set preview_credential_hash=$1 where event_slug='preview-interno-ia-v2'", [hash]);

  const ctx = { q: (sql, params = []) => db.query(sql, params), now: () => new Date() };
  // sem credencial → 404 (internal_preview protegido)
  const semCred = await HV2.getStartV2(ctx, { event_slug: "preview-interno-ia-v2" });
  assert.equal(semCred.status, 404);
  // com credencial → 200 e a apresentação das 8 questões
  const comCred = await HV2.getStartV2(ctx, { event_slug: "preview-interno-ia-v2", previewKey: chave });
  assert.equal(comCred.status, 200);
  assert.equal(comCred.body.presentation.questions.length, 8);
  assert.equal(comCred.body.status, "internal_preview");
});
