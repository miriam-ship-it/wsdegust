// Comportamento da carga RHIA (PL/pgSQL) contra Postgres efêmero (pglite). Sem deploy.
// Prova: cria instrumento inativo + vínculo PÚBLICO (lead obrigatório, retenção);
// idempotência (no-op); guarda de checksum; guarda de vínculo (corrente
// conflitante com rollback integral; configuração divergente); a membership do
// dono é fechada no fim; e integração — o vínculo criado dirige a edge rhia SEM
// credencial (link público): GET /rhia/start → 200 com as 30 questões.
//
// A integração depende de screener/edge/handlers-rhia.mjs e da migration
// 20260912120000 (escritos por outra frente). Se ainda não existirem, o teste
// aguarda (poll a cada 20 s, por até 12 min) antes de rodar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { instrumento, checksum } from "../../rhia/definicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..", "..");
const MIGR = path.join(RAIZ, "supabase", "migrations");
const rd = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");
const SCHEMA = rd("20260902143339_screener_tabelas_isoladas.sql");
const RPC = rd("20260903120000_screener_rpc_e_papeis.sql");
const CARGA = rd("20260913120000_screener_rhia_carga_publica.sql");
const ARQ_RHIA_MIGR = path.join(MIGR, "20260912120000_screener_rhia_tabelas_e_rpc.sql");
const ARQ_HANDLERS = path.join(RAIZ, "screener", "edge", "handlers-rhia.mjs");

const IC = instrumento.instrument_id;   // boomit_rh_ia_maturity_v1
const IV = instrumento.instrument_version; // 1.0.0-rc.1
const SLUG = "boomit-degustacao-rh-ia";

async function base() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA);
  await db.exec(RPC); // papéis + propriedade screener_owner + RLS: a carga roda DEPOIS disso
  return db;
}
const iv = (db) => db.query("select * from public.screener_instrument_versions where instrument_code=$1", [IC]);
const bind = (db) => db.query("select * from public.screener_event_bindings where event_slug=$1", [SLUG]);
async function esperaFalha(fn, trecho) {
  await assert.rejects(fn, (e) => {
    assert.ok(String(e.message).includes(trecho), `esperava erro com "${trecho}", veio: ${e.message}`);
    return true;
  });
}

test("carga cria o instrumento INATIVO (JSON verbatim, checksum da edge) e o vínculo PÚBLICO", async () => {
  const db = await base();
  await db.exec(CARGA);
  const { rows: ivs } = await iv(db);
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].instrument_version, IV);
  assert.equal(ivs[0].status, "inactive");
  assert.equal(ivs[0].checksum, await checksum(), "checksum gravado difere do checksum() da edge");
  assert.deepEqual(ivs[0].definition, instrumento, "definição gravada não é o JSON do pacote verbatim");
  assert.equal(ivs[0].definition.items.length, 30);
  const { rows: bs } = await bind(db);
  assert.equal(bs.length, 1);
  assert.equal(bs[0].instrument_code, IC);
  assert.equal(bs[0].instrument_version, IV);
  assert.equal(bs[0].status, "public_pilot");
  assert.equal(bs[0].lead_capture_mode, "required_before_result");
  assert.equal(bs[0].result_mode, "immediate");
  assert.equal(bs[0].is_current, true);
  assert.equal(bs[0].session_retention_days, 180);
  assert.equal(bs[0].lead_retention_days, 365);
  assert.deepEqual(bs[0].branding, {});
  assert.equal(bs[0].preview_credential_hash, null); // link público: sem credencial
  await db.close();
});

test("idempotente: aplicar a carga 2x é no-op (sem erro, sem duplicar)", async () => {
  const db = await base();
  await db.exec(CARGA);
  await db.exec(CARGA); // não deve lançar
  assert.equal((await iv(db)).rows.length, 1);
  assert.equal((await bind(db)).rows.length, 1);
  await db.close();
});

test("guarda de checksum: mesma versão com checksum diferente → recusa", async () => {
  const db = await base();
  await db.exec(CARGA);
  await db.query("update public.screener_instrument_versions set checksum=$1 where instrument_code=$2", ["b".repeat(64), IC]);
  await esperaFalha(() => db.exec(CARGA), "checksum divergente");
  await db.close();
});

test("guarda de definição: checksum igual mas definição diferente → recusa", async () => {
  const db = await base();
  await db.query(
    `insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
     values ($1, $2, '{"outra":"coisa"}'::jsonb, $3, 'inactive')`,
    [IC, IV, await checksum()],
  );
  await esperaFalha(() => db.exec(CARGA), "definição divergente");
  await db.close();
});

test("guarda de vínculo: outro vínculo corrente no slug → recusa e faz rollback integral", async () => {
  const db = await base();
  // estado: existe uma versão anterior do instrumento e um vínculo CORRENTE para o mesmo slug
  await db.query(
    `insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
     values ($1, '0.9.0', '{}'::jsonb, $2, 'inactive')`,
    [IC, "a".repeat(64)],
  );
  await db.query(
    `insert into public.screener_event_bindings
       (event_slug, instrument_code, instrument_version, is_current, status, session_retention_days, lead_retention_days)
       values ($1, $2, '0.9.0', true, 'public_pilot', 180, 365)`,
    [SLUG, IC],
  );
  await esperaFalha(() => db.exec(CARGA), "outro vínculo corrente");
  // rollback integral: o instrumento 1.0.0-rc.1 NÃO pode ter persistido
  const { rows } = await iv(db);
  assert.equal(rows.filter((r) => r.instrument_version === IV).length, 0, "rollback falhou: instrumento persistiu");
  await db.close();
});

test("guarda de vínculo: configuração divergente (status alterado) → recusa, sem sobrescrever", async () => {
  const db = await base();
  await db.exec(CARGA);
  await db.query("update public.screener_event_bindings set status='closed' where event_slug=$1", [SLUG]);
  await esperaFalha(() => db.exec(CARGA), "configuração divergente");
  const { rows } = await bind(db);
  assert.equal(rows[0].status, "closed", "a carga não pode sobrescrever o vínculo existente");
  await db.close();
});

test("fronteira: a membership temporária do dono é fechada; dono e RLS das tabelas seguem intactos", async () => {
  const db = await base();
  await db.exec(CARGA);
  const { rows: m } = await db.query(
    `select 1 from pg_auth_members am
       join pg_roles r on r.oid = am.roleid
       join pg_roles u on u.oid = am.member
      where r.rolname = 'screener_owner' and u.rolname = current_user`,
  );
  assert.equal(m.length, 0, "membership screener_owner → executor ficou aberta após a carga");
  const { rows: t } = await db.query(
    `select c.relname, pg_get_userbyid(c.relowner) as dono, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('screener_instrument_versions','screener_event_bindings')`,
  );
  assert.equal(t.length, 2);
  for (const r of t) {
    assert.equal(r.dono, "screener_owner", `${r.relname}: dono mudou`);
    assert.equal(r.rls, true, `${r.relname}: RLS desligada`);
  }
  await db.close();
});

// ---------- integração com a edge rhia (depende de outra frente) ----------
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
async function aguardarDependencias({ intervaloMs = 20_000, maximoMs = 12 * 60_000 } = {}) {
  const inicio = Date.now();
  for (;;) {
    const faltam = [ARQ_RHIA_MIGR, ARQ_HANDLERS].filter((p) => !fs.existsSync(p));
    if (faltam.length === 0) return;
    if (Date.now() - inicio >= maximoMs) {
      throw new Error("dependências da integração ausentes após a espera: " + faltam.map((p) => path.relative(RAIZ, p)).join(", "));
    }
    await dorme(intervaloMs);
  }
}

test("integração: o vínculo público dirige a edge rhia SEM credencial — GET /rhia/start → 200 com 30 questões", async () => {
  await aguardarDependencias();
  const RHIA = fs.readFileSync(ARQ_RHIA_MIGR, "utf8");
  const HR = await import(pathToFileURL(ARQ_HANDLERS).href);
  const db = await base();
  await db.exec(RHIA);  // tabelas + 7 RPC rhia (na ordem do ledger: antes da carga)
  await db.exec(CARGA); // carga pública
  const ctx = { q: (sql, params = []) => db.query(sql, params), now: () => new Date("2026-09-15T12:00:00Z"), previewKeyHash: null };

  const g = await HR.getStartRhia(ctx, { event_slug: SLUG });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.status, "public_pilot");
  assert.equal(g.body.instrument.id, IC);
  assert.equal(g.body.instrument.version, IV);
  assert.equal(g.body.items.length, 30);
  assert.deepEqual(g.body.items.map((it) => it.id), [...instrumento.items].sort((a, b) => a.order - b.order).map((it) => it.id));
  assert.ok([null, "required_before_result"].includes(g.body.lead_capture_mode), "lead_capture_mode inesperado no GET /rhia/start");
  // fronteira: a apresentação pública não carrega escala, faceta, cenário nem pesos
  const texto = JSON.stringify(g.body);
  for (const proibido of ['"scale"', '"facet"', '"scenario"', '"weights"', '"bp"', "3333", "6667"]) {
    assert.ok(!texto.includes(proibido), `GET /rhia/start vazou ${proibido}`);
  }

  // o mesmo vínculo abre sessão (RPC rhia lê a definição gravada pela carga)
  const s = await HR.postStartRhia(ctx, { event_slug: SLUG, privacy_ack: true, privacy_notice_version: g.body.privacy_notice_version ?? "v1" });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.match(s.body.token, /^[0-9a-f]{64}$/);
  assert.equal(s.body.items.length, 30);
  await db.close();
});
