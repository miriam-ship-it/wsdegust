// Fronteira de segurança do V2 — as 6 funções screener_v2_op_* em pglite (Postgres real).
// Prova: fluxo start→save(senioridade+itens)→finalize→get_result→lead; validações
// (nível/senioridade/item fora do instrumento); imutabilidade; canônico com senioridade;
// credencial de prévia; e privilégios (runtime só EXECUTE, zero tabela).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const SCHEMA = fs.readFileSync(path.join(MIGR, "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const RPC = fs.readFileSync(path.join(MIGR, "20260903120000_screener_rpc_e_papeis.sql"), "utf8");
const V2 = fs.readFileSync(path.join(MIGR, "20260906120000_screener_v2_tabelas_e_rpc.sql"), "utf8");

const HEX = (c) => c.repeat(64);
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const PREVIEW = "chave-v2";
const PH = sha(PREVIEW);

const DEF = {
  code: "SCREENER_IA_V2", version: "2.0.0",
  questoes: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"].map((code) => ({ code })),
  senioridade: [{ code: "analista" }, { code: "especialista" }, { code: "gerencia" }, { code: "diretoria" }],
};
const RESULTADO = { contract_version: "ScoreResultIAV2", nivel: { n: 3 }, ponderada: 2.6 };

async function ambiente({ status = "public_pilot", cred = null, leadMode = "optional_after_submit" } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC); await db.exec(V2);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ('SCREENER_IA_V2','2.0.0',$1,$2,'active')`, [JSON.stringify(DEF), HEX("a")]);
  await db.query(`insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
       session_retention_days, lead_retention_days, preview_credential_hash)
      values ('ev-ia-v2','SCREENER_IA_V2','2.0.0', true, $1, 'immediate', $2, 180, 365, $3)`,
    [status, leadMode, cred]);
  return db;
}
const call = async (db, fn, params) =>
  (await db.query(`select public.${fn}(${params.map((_, i) => "$" + (i + 1)).join(",")}) as r`, params)).rows[0].r;

async function abrir(db, token, ph = null) {
  const now = new Date(), exp = new Date(now.getTime() + 864e5).toISOString();
  await call(db, "screener_v2_op_start", ["ev-ia-v2", sha(token), "v1", now.toISOString(), exp, ph]);
  return sha(token);
}
// canônico idêntico ao da função: '@sen:' + senioridade + '|' + item:answer (ordenado)
function canonico(sen, resp) {
  const corpo = Object.keys(resp).sort().map((k) => `${k}:${resp[k]}`).join("|");
  return `@sen:${sen || ""}|${corpo}`;
}

test("fluxo completo: start → senioridade + 8 níveis → finalize → get_result", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk1");
  await call(db, "screener_v2_op_save_response", [th, "SENIORIDADE", "diretoria", null]);
  const resp = { Q1: "N2", Q2: "N1", Q3: "NA", Q4: "N3", Q5: "N3", Q6: "N3", Q7: "N4", Q8: "N3" };
  for (const [item, ans] of Object.entries(resp))
    await call(db, "screener_v2_op_save_response", [th, item, ans, null]);

  const resumo = await call(db, "screener_v2_op_resume", [th, null]);
  assert.equal(resumo.session.seniority_code, "diretoria");
  assert.equal(resumo.responses.length, 8);

  const canon = canonico("diretoria", resp);
  const fin = await call(db, "screener_v2_op_finalize",
    [th, canon, RESULTADO, HEX("a"), sha(canon), "2.0.0", "2.0.0", null]);
  assert.equal(fin.status, "finalizada");
  assert.equal(fin.result.contract_version, "ScoreResultIAV2");

  const got = await call(db, "screener_v2_op_get_result", [th, null]);
  assert.equal(got.session.status, "submitted");
  assert.equal(got.result.nivel.n, 3);
});

test("canônico inclui senioridade: mudar a senioridade após ler invalida (respostas_mudaram)", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk2");
  await call(db, "screener_v2_op_save_response", [th, "SENIORIDADE", "gerencia", null]);
  await call(db, "screener_v2_op_save_response", [th, "Q1", "N2", null]);
  const canonAntigo = canonico("analista", { Q1: "N2" }); // finaliza esperando senioridade errada
  await assert.rejects(
    call(db, "screener_v2_op_finalize", [th, canonAntigo, RESULTADO, HEX("a"), sha(canonAntigo), "2.0.0", "2.0.0", null]),
    /respostas_mudaram/);
});

test("finalize é idempotente: 2ª chamada devolve o mesmo snapshot (ja_submetida)", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk3");
  await call(db, "screener_v2_op_save_response", [th, "SENIORIDADE", "analista", null]);
  await call(db, "screener_v2_op_save_response", [th, "Q1", "N1", null]);
  const canon = canonico("analista", { Q1: "N1" });
  const a = await call(db, "screener_v2_op_finalize", [th, canon, RESULTADO, HEX("a"), sha(canon), "2.0.0", "2.0.0", null]);
  const b = await call(db, "screener_v2_op_finalize", [th, canon, RESULTADO, HEX("a"), sha(canon), "2.0.0", "2.0.0", null]);
  assert.equal(a.status, "finalizada");
  assert.equal(b.status, "ja_submetida");
  const n = (await db.query("select count(*)::int as n from public.screener_v2_result_snapshots")).rows[0].n;
  assert.equal(n, 1);
});

test("validações: nível inválido, senioridade inválida, item fora do instrumento", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk4");
  await assert.rejects(call(db, "screener_v2_op_save_response", [th, "Q1", "N9", null]), /nivel_invalido/);
  await assert.rejects(call(db, "screener_v2_op_save_response", [th, "SENIORIDADE", "estagiario", null]), /senioridade_invalida/);
  await assert.rejects(call(db, "screener_v2_op_save_response", [th, "Q99", "N1", null]), /item_fora_do_instrumento/);
});

test("snapshot é imutável (UPDATE bloqueado por trigger)", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk5");
  await call(db, "screener_v2_op_save_response", [th, "Q1", "N1", null]);
  const canon = canonico(null, { Q1: "N1" });
  await call(db, "screener_v2_op_finalize", [th, canon, RESULTADO, HEX("a"), sha(canon), "2.0.0", "2.0.0", null]);
  await assert.rejects(db.query("update public.screener_v2_result_snapshots set event_slug='x'"), /imutavel/);
});

test("lead V2: exige sessão submetida; grava PII; idempotente por sessão", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk6");
  await assert.rejects(call(db, "screener_v2_op_capturar_lead", [th, null, "Ana", "a@b.co", false]), /sessao_nao_submetida/);
  await call(db, "screener_v2_op_save_response", [th, "Q1", "N1", null]);
  const canon = canonico(null, { Q1: "N1" });
  await call(db, "screener_v2_op_finalize", [th, canon, RESULTADO, HEX("a"), sha(canon), "2.0.0", "2.0.0", null]);
  assert.deepEqual(await call(db, "screener_v2_op_capturar_lead", [th, null, "  Ana ", " Ana@X.CO ", true]), { status: "ok" });
  const [L] = (await db.query("select * from public.screener_v2_leads")).rows;
  assert.equal(L.email_normalized, "ana@x.co");
  assert.ok(L.marketing_opt_in_at);
});

test("credencial de prévia (internal_preview): sem hash o start falha; com hash abre", async () => {
  const db = await ambiente({ status: "internal_preview", cred: PH });
  await assert.rejects(abrir(db, "tk7", null), /previa_nao_autorizada/);
  const th = await abrir(db, "tk7", PH);
  assert.ok((await call(db, "screener_v2_op_resume", [th, PH])).session);
  assert.equal(await call(db, "screener_v2_op_resume", [th, null]), null); // resume sem credencial → null
});

test("gate de lead na RPC: required_before_result retém o resultado até haver lead", async () => {
  const db = await ambiente({ leadMode: "required_before_result" });
  const th = await abrir(db, "tkg");
  await call(db, "screener_v2_op_save_response", [th, "Q1", "N2", null]);
  const canon = canonico(null, { Q1: "N2" });
  await call(db, "screener_v2_op_finalize", [th, canon, RESULTADO, HEX("a"), sha(canon), "2.0.0", "2.0.0", null]);
  // sem lead: a própria RPC retém o resultado (nem a edge consegue lê-lo)
  let got = await call(db, "screener_v2_op_get_result", [th, null]);
  assert.equal(got.result, null);
  assert.equal(got.lead_required, true);
  // captura o lead → RPC libera
  await call(db, "screener_v2_op_capturar_lead", [th, null, "Ana", "a@b.co", false]);
  got = await call(db, "screener_v2_op_get_result", [th, null]);
  assert.equal(got.lead_required, false);
  assert.equal(got.result.contract_version, "ScoreResultIAV2");
});

test("privilégios: runtime só EXECUTE nas 6 funções; zero privilégio nas tabelas V2", async () => {
  const db = await ambiente();
  const fns = [
    "screener_v2_op_start(text,text,text,timestamptz,timestamptz,text)",
    "screener_v2_op_resume(text,text)",
    "screener_v2_op_save_response(text,text,text,text)",
    "screener_v2_op_finalize(text,text,jsonb,text,text,text,text,text)",
    "screener_v2_op_get_result(text,text)",
    "screener_v2_op_capturar_lead(text,text,text,text,boolean)",
  ];
  for (const f of fns) {
    assert.equal((await db.query(`select has_function_privilege('screener_runtime','public.${f}','execute') as ok`)).rows[0].ok, true, `runtime execute ${f}`);
    assert.equal((await db.query(`select has_function_privilege('service_role','public.${f}','execute') as ok`)).rows[0].ok, false, `service_role sem execute ${f}`);
  }
  for (const t of ["screener_v2_sessions", "screener_v2_responses", "screener_v2_result_snapshots", "screener_v2_leads"]) {
    for (const priv of ["select", "insert", "update", "delete"])
      assert.equal((await db.query(`select has_table_privilege('screener_runtime','public.${t}','${priv}') as ok`)).rows[0].ok, false, `runtime sem ${priv} em ${t}`);
    assert.equal((await db.query(`select o.rolname from pg_class c join pg_roles o on o.oid=c.relowner where c.relname='${t}'`)).rows[0].rolname, "screener_owner", `dono ${t}`);
  }
});

test("execução real como screener_runtime: funções ok, tabelas negadas", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk8");
  await db.exec("set role screener_runtime");
  try {
    await db.query("select public.screener_v2_op_save_response($1,'Q1','N2',null)", [th]);
    await assert.rejects(db.query("select * from public.screener_v2_responses"), /permission denied/i);
    await assert.rejects(db.query("select * from public.screener_v2_sessions"), /permission denied/i);
  } finally { await db.exec("reset role"); }
});
