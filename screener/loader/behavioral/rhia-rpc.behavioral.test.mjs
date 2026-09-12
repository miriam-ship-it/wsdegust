// Fronteira de segurança do rhia — as 7 funções screener_rhia_op_* em pglite (Postgres real).
// Prova: fluxo start→save(30 itens + texto livre)→finalize→get_result→lead; validações
// contra a definição gravada (opção inválida, item estranho, texto curto/longo/com
// controle); idempotência; imutabilidade; canônico com texto livre idêntico ao da edge;
// gate de lead server-side; credencial de prévia; privilégios (runtime só EXECUTE, zero
// tabela; dono screener_owner; service_role sem execute); execução real como runtime.
//
// Usa o JSON REAL do instrumento (pacote) e o motor real para o snapshot — assim o
// CHECK `result->'public'->>'version' = '2.0.0-pilot'` é provado contra o contrato de verdade.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import instrumento from "../../rhia/pacote/instrumento-rh-ia-v1.json" with { type: "json" };
import { buildResultContractV2 } from "../../rhia/pacote/src/output-engine-v2.mjs";
import { canonico } from "../../rhia/logica.mjs";
import { checksum } from "../../rhia/definicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGR = path.resolve(AQUI, "..", "..", "..", "supabase", "migrations");
const SCHEMA = fs.readFileSync(path.join(MIGR, "20260902143339_screener_tabelas_isoladas.sql"), "utf8");
const RPC = fs.readFileSync(path.join(MIGR, "20260903120000_screener_rpc_e_papeis.sql"), "utf8");
const RHIA = fs.readFileSync(path.join(MIGR, "20260912120000_screener_rhia_tabelas_e_rpc.sql"), "utf8");

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const PREVIEW = "chave-rhia";
const PH = sha(PREVIEW);
const SLUG = "boomit-degustacao-rh-ia";
const CODE = instrumento.instrument_id;       // boomit_rh_ia_maturity_v1
const VERSAO = instrumento.instrument_version; // 1.0.0-rc.1
const ICS = await checksum(instrumento);
const SCORING = "2.0.0-pilot";

const IDS = [...instrumento.items].sort((a, b) => a.order - b.order).map((it) => it.id);
assert.equal(IDS.length, 30, "o instrumento real tem 30 itens");

/** Conjunto completo de respostas, com CTX01 = OTHER + texto livre (31 linhas). */
function respostasCompletas() {
  const r = { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultora de pessoas", CTX02: "AREA", CTX03: "CO_DECIDE" };
  const ciclo = ["E2", "E3", "E3", "E2", "NA"];
  let i = 0;
  for (const id of IDS) if (!(id in r)) r[id] = ciclo[i++ % ciclo.length];
  return r;
}
/** Contrato real do motor (o texto livre não entra: o motor só lê ids do instrumento). */
function contrato(respostas) {
  const { CTX01_OTHER_TEXT, ...answers } = respostas;
  return buildResultContractV2({ instrument: instrumento, answers });
}

async function ambiente({ status = "public_pilot", cred = null, leadMode = "required_before_result" } = {}) {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(SCHEMA); await db.exec(RPC); await db.exec(RHIA);
  await db.query(`insert into public.screener_instrument_versions (instrument_code, instrument_version, definition, checksum, status)
                  values ($1,$2,$3,$4,'inactive')`, [CODE, VERSAO, JSON.stringify(instrumento), ICS]);
  await db.query(`insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
       session_retention_days, lead_retention_days, preview_credential_hash)
      values ($1,$2,$3, true, $4, 'immediate', $5, 180, 365, $6)`,
    [SLUG, CODE, VERSAO, status, leadMode, cred]);
  return db;
}
const call = async (db, fn, params) =>
  (await db.query(`select public.${fn}(${params.map((_, i) => "$" + (i + 1)).join(",")}) as r`, params)).rows[0].r;

async function abrir(db, token, ph = null) {
  const now = new Date(), exp = new Date(now.getTime() + 864e5).toISOString();
  await call(db, "screener_rhia_op_start", [SLUG, sha(token), "v1", now.toISOString(), exp, ph]);
  return sha(token);
}
async function responderTudo(db, th, respostas, ph = null) {
  let ultimo;
  for (const [item, ans] of Object.entries(respostas))
    ultimo = await call(db, "screener_rhia_op_save_response", [th, item, ans, ph]);
  return ultimo;
}
async function finalizar(db, th, respostas, ph = null) {
  const canon = canonico(respostas);
  return call(db, "screener_rhia_op_finalize",
    [th, canon, contrato(respostas), ICS, sha(canon), SCORING, SCORING, ph]);
}
const canonicoSql = async (db, th) => (await db.query(
  `select coalesce(string_agg(r.item_code || E'\t' || r.answer_code, E'\n' order by r.item_code collate "C"), '') as c
     from public.screener_rhia_responses r join public.screener_rhia_sessions s on s.id = r.session_id
    where s.token_hash = $1`, [th])).rows[0].c;

test("fluxo completo: start → 30 itens (CTX01=OTHER + texto) → finalize → lead → get_result", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk1");
  const resp = respostasCompletas();
  const salvo = await responderTudo(db, th, resp);
  assert.equal(salvo.answered, 31, "30 itens + o texto livre");

  const resumo = await call(db, "screener_rhia_op_resume", [th, null]);
  assert.equal(resumo.session.status, "open");
  assert.equal(resumo.binding.lead_capture_mode, "required_before_result");
  assert.equal(resumo.binding.instrument_code, CODE);
  assert.equal(resumo.binding.instrument_version, VERSAO);
  assert.equal(resumo.responses.length, 31);
  const mapa = Object.fromEntries(resumo.responses.map((r) => [r.item_code, r.answer_code]));
  assert.deepEqual(mapa, resp);

  const fin = await finalizar(db, th, resp);
  assert.equal(fin.status, "finalizada");
  assert.equal(fin.result.public.version, "2.0.0-pilot");
  assert.ok(fin.result.internal.answers, "o snapshot guarda o contrato inteiro (internal incluso)");
  assert.equal(fin.result.internal.answers.CTX01_OTHER_TEXT, undefined, "texto livre nunca vai ao motor");

  // sessão marcada como submetida
  const sess = (await db.query("select status, submitted_at from public.screener_rhia_sessions")).rows[0];
  assert.equal(sess.status, "submitted");
  assert.ok(sess.submitted_at);

  // gate: sem lead, retém
  let got = await call(db, "screener_rhia_op_get_result", [th, null]);
  assert.equal(got.result, null);
  assert.equal(got.lead_required, true);
  assert.equal(got.binding.lead_capture_mode, "required_before_result");
  // lead → libera
  assert.deepEqual(await call(db, "screener_rhia_op_capturar_lead", [th, null, "Ana", "ana@empresa.com", true]), { status: "ok" });
  got = await call(db, "screener_rhia_op_get_result", [th, null]);
  assert.equal(got.lead_required, false);
  assert.equal(got.result.public.version, "2.0.0-pilot");
  assert.equal(got.session.status, "submitted");
});

test("canônico com texto livre: SQL da RPC == canonico() da edge, independente da ordem de gravação", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk2");
  const resp = respostasCompletas();
  // grava em ordem embaralhada (texto primeiro, depois do fim para o começo)
  const entradas = Object.entries(resp).reverse();
  for (const [item, ans] of entradas) await call(db, "screener_rhia_op_save_response", [th, item, ans, null]);
  const sql = await canonicoSql(db, th);
  assert.equal(sql, canonico(resp));
  assert.ok(sql.includes("CTX01_OTHER_TEXT\tConsultora de pessoas"));
  // e a RPC aceita exatamente esse canônico
  assert.equal((await finalizar(db, th, resp)).status, "finalizada");
});

test("canônico vazio é '' (sessão sem respostas) e bate com a edge", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk2b");
  assert.equal(await canonicoSql(db, th), "");
  assert.equal(canonico({}), "");
});

test("respostas_mudaram: canônico lido antes de uma revisão é recusado; nada gravado", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk3");
  const resp = respostasCompletas();
  await responderTudo(db, th, resp);
  const canonAntigo = canonico(resp);
  await call(db, "screener_rhia_op_save_response", [th, "EST01", "E4", null]); // revisão após a leitura
  await assert.rejects(
    call(db, "screener_rhia_op_finalize", [th, canonAntigo, contrato(resp), ICS, sha(canonAntigo), SCORING, SCORING, null]),
    /respostas_mudaram/);
  assert.equal((await db.query("select count(*)::int as n from public.screener_rhia_result_snapshots")).rows[0].n, 0);
  assert.equal((await db.query("select status from public.screener_rhia_sessions")).rows[0].status, "open");
  // revisão registra revised_at
  const r = (await db.query("select revised_at from public.screener_rhia_responses where item_code='EST01'")).rows[0];
  assert.ok(r.revised_at);
});

test("finalize é idempotente: 2ª chamada devolve o mesmo snapshot (ja_submetida); 1 linha", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk4");
  const resp = respostasCompletas();
  await responderTudo(db, th, resp);
  const a = await finalizar(db, th, resp);
  const b = await finalizar(db, th, resp);
  assert.equal(a.status, "finalizada");
  assert.equal(b.status, "ja_submetida");
  assert.deepEqual(b.result, a.result);
  assert.equal((await db.query("select count(*)::int as n from public.screener_rhia_result_snapshots")).rows[0].n, 1);
  // sessão submetida não aceita mais respostas
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", "E1", null]), /sessao_nao_aberta/);
});

test("validação contra a definição gravada: opção inválida por tipo de item", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk5");
  // contexto: só options[].id do próprio item
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "CTX01", "E1", null]), /opcao_invalida/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "CTX02", "HR_LEADER", null]), /opcao_invalida/);
  // prática e governança: E1–E4/NA
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", "E5", null]), /opcao_invalida/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "GOV01", "SELF", null]), /opcao_invalida/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", null, null]), /opcao_invalida/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", "", null]), /opcao_invalida/);
  // válidas
  assert.deepEqual(await call(db, "screener_rhia_op_save_response", [th, "CTX01", "HR_LEADER", null]), { answered: 1 });
  assert.deepEqual(await call(db, "screener_rhia_op_save_response", [th, "GOV03", "NA", null]), { answered: 2 });
  assert.equal((await db.query("select count(*)::int as n from public.screener_rhia_responses")).rows[0].n, 2);
});

test("item fora do instrumento: id desconhecido, id de outro instrumento e id do V1", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk6");
  for (const estranho of ["Q99", "SENIORIDADE", "X01", "ctx01", "CTX01_OTHER", ""])
    await assert.rejects(call(db, "screener_rhia_op_save_response", [th, estranho, "E1", null]), /item_fora_do_instrumento/, estranho);
  assert.equal((await db.query("select count(*)::int as n from public.screener_rhia_responses")).rows[0].n, 0);
});

test("texto livre (CTX01_OTHER_TEXT): curto, longo e com caractere de controle são recusados; válido grava aparado", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk7");
  const T = "CTX01_OTHER_TEXT";
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "a", null]), /texto_invalido/);         // 1 char
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "   a   ", null]), /texto_invalido/);   // 1 char após trim
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "", null]), /texto_invalido/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, null, null]), /texto_invalido/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "x".repeat(121), null]), /texto_invalido/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "papel\tcom tab", null]), /texto_invalido/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "papel\ncom quebra", null]), /texto_invalido/);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "papelsoh", null]), /texto_invalido/);   // controle C0
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, T, "papeldel", null]), /texto_invalido/);   // DEL
  // limites inclusivos e trim
  assert.deepEqual(await call(db, "screener_rhia_op_save_response", [th, T, "  ab  ", null]), { answered: 1 });
  assert.equal((await db.query("select answer_code from public.screener_rhia_responses where item_code=$1", [T])).rows[0].answer_code, "ab");
  assert.deepEqual(await call(db, "screener_rhia_op_save_response", [th, T, "y".repeat(120), null]), { answered: 1 }); // revisão, mesma linha
  assert.equal((await db.query("select char_length(answer_code) as n from public.screener_rhia_responses where item_code=$1", [T])).rows[0].n, 120);
  // acento e pontuação são texto normal
  await call(db, "screener_rhia_op_save_response", [th, T, "Gerente de operações — pessoas & cultura", null]);
});

test("texto livre gravado antes de CTX01: não depende da opção (a coerência é decidida na submissão pela edge)", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk7b");
  assert.deepEqual(await call(db, "screener_rhia_op_save_response", [th, "CTX01_OTHER_TEXT", "Analista", null]), { answered: 1 });
  assert.deepEqual(await call(db, "screener_rhia_op_save_response", [th, "CTX01", "CEO_OWNER", null]), { answered: 2 });
  // texto órfão fica na tabela e no canônico; o motor nunca o lê (a edge o descarta)
  assert.ok((await canonicoSql(db, th)).includes("CTX01_OTHER_TEXT\tAnalista"));
});

test("snapshot é imutável (UPDATE bloqueado por trigger) e exige contrato do motor (public.version)", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tk8");
  const resp = respostasCompletas();
  await responderTudo(db, th, resp);
  await finalizar(db, th, resp);
  await assert.rejects(db.query("update public.screener_rhia_result_snapshots set event_slug='x'"), /imutavel/);
  await assert.rejects(db.query("update public.screener_rhia_result_snapshots set result='{}'::jsonb"), /imutavel/);
  // CHECK do contrato: resultado sem public.version = '2.0.0-pilot' não entra
  const th2 = await abrir(db, "tk8b");
  await responderTudo(db, th2, resp);
  const canon = canonico(resp);
  await assert.rejects(
    call(db, "screener_rhia_op_finalize", [th2, canon, { contract_version: "ScoreResultV1" }, ICS, sha(canon), SCORING, SCORING, null]),
    /screener_rhia_snap_contract/);
  await assert.rejects(
    call(db, "screener_rhia_op_finalize", [th2, canon, { public: { version: "1.0.0" } }, ICS, sha(canon), SCORING, SCORING, null]),
    /screener_rhia_snap_contract/);
  // e a sessão continua aberta (a transação da RPC foi desfeita)
  assert.equal((await db.query("select status from public.screener_rhia_sessions where token_hash=$1", [th2])).rows[0].status, "open");
});

test("gate de lead na RPC: required_before_result retém; optional_after_submit devolve direto", async () => {
  const req = await ambiente({ leadMode: "required_before_result" });
  const th = await abrir(req, "tkg");
  const resp = respostasCompletas();
  await responderTudo(req, th, resp);
  await finalizar(req, th, resp);
  let got = await call(req, "screener_rhia_op_get_result", [th, null]);
  assert.equal(got.result, null);
  assert.equal(got.lead_required, true);
  // lead inválido não libera
  await assert.rejects(call(req, "screener_rhia_op_capturar_lead", [th, null, "Ana", "sem-arroba", false]), /email_invalido/);
  got = await call(req, "screener_rhia_op_get_result", [th, null]);
  assert.equal(got.result, null);
  await call(req, "screener_rhia_op_capturar_lead", [th, null, "Ana", "a@b.co", false]);
  got = await call(req, "screener_rhia_op_get_result", [th, null]);
  assert.equal(got.lead_required, false);
  assert.equal(got.result.public.version, "2.0.0-pilot");

  const opt = await ambiente({ leadMode: "optional_after_submit" });
  const th2 = await abrir(opt, "tko");
  await responderTudo(opt, th2, resp);
  await finalizar(opt, th2, resp);
  got = await call(opt, "screener_rhia_op_get_result", [th2, null]);
  assert.equal(got.lead_required, false);
  assert.equal(got.result.public.version, "2.0.0-pilot");
});

test("get_result: sessão inexistente → null; sessão aberta sem snapshot → result null e SEM portão", async () => {
  // O portão só existe sobre um resultado existente. Numa sessão ainda aberta
  // não há nada a reter — inclusive na configuração de PRODUÇÃO
  // (required_before_result), senão a edge nunca chegaria ao 404 sem_resultado.
  for (const leadMode of ["optional_after_submit", "required_before_result"]) {
    const db = await ambiente({ leadMode });
    assert.equal(await call(db, "screener_rhia_op_get_result", [sha("nao-existe"), null]), null);
    const th = await abrir(db, "tkr");
    const got = await call(db, "screener_rhia_op_get_result", [th, null]);
    assert.equal(got.session.status, "open", leadMode);
    assert.equal(got.result, null, leadMode);
    assert.equal(got.lead_required, false, leadMode);
  }
});

test("lead rhia: exige sessão submetida; normaliza e-mail; opt-in coerente; lead_source = slug; upsert", async () => {
  const db = await ambiente();
  const th = await abrir(db, "tkl");
  await assert.rejects(call(db, "screener_rhia_op_capturar_lead", [th, null, "Ana", "a@b.co", false]), /sessao_nao_submetida/);
  const resp = respostasCompletas();
  await responderTudo(db, th, resp);
  await finalizar(db, th, resp);
  assert.deepEqual(await call(db, "screener_rhia_op_capturar_lead", [th, null, "  Ana Ribeiro ", " Ana@Empresa.COM ", true]), { status: "ok" });
  let [L] = (await db.query("select * from public.screener_rhia_leads")).rows;
  assert.equal(L.nome, "Ana Ribeiro");
  assert.equal(L.email, "Ana@Empresa.COM");
  assert.equal(L.email_normalized, "ana@empresa.com");
  assert.equal(L.marketing_opt_in, true);
  assert.ok(L.marketing_opt_in_at);
  assert.equal(L.lead_source, SLUG);
  // upsert corrige e desliga o opt-in
  await call(db, "screener_rhia_op_capturar_lead", [th, null, "   ", "corrigido@x.com", false]);
  const rows = (await db.query("select * from public.screener_rhia_leads")).rows;
  assert.equal(rows.length, 1);
  [L] = rows;
  assert.equal(L.nome, null);
  assert.equal(L.email, "corrigido@x.com");
  assert.equal(L.marketing_opt_in, false);
  assert.equal(L.marketing_opt_in_at, null);
  // sessão inexistente → null (edge → 404)
  assert.equal(await call(db, "screener_rhia_op_capturar_lead", [sha("zzz"), null, null, "a@b.co", false]), null);
});

test("lead_capture_mode='none' → lead_desativado; nada gravado", async () => {
  const db = await ambiente({ leadMode: "none" });
  const th = await abrir(db, "tkn");
  const resp = respostasCompletas();
  await responderTudo(db, th, resp);
  await finalizar(db, th, resp);
  await assert.rejects(call(db, "screener_rhia_op_capturar_lead", [th, null, null, "a@b.co", false]), /lead_desativado/);
  assert.equal((await db.query("select count(*)::int as n from public.screener_rhia_leads")).rows[0].n, 0);
});

test("start: vínculo inexistente, indisponível (closed/inactive) e fora de vigência", async () => {
  const db = await ambiente();
  const now = new Date().toISOString(), exp = new Date(Date.now() + 864e5).toISOString();
  await assert.rejects(call(db, "screener_rhia_op_start", ["outro-evento", sha("a"), "v1", now, exp, null]), /vinculo_inexistente/);
  await db.query("update public.screener_event_bindings set status='closed'");
  await assert.rejects(call(db, "screener_rhia_op_start", [SLUG, sha("b"), "v1", now, exp, null]), /indisponivel/);
  await db.query("update public.screener_event_bindings set status='public_pilot', ends_at = now() - interval '1 hour'");
  await assert.rejects(call(db, "screener_rhia_op_start", [SLUG, sha("c"), "v1", now, exp, null]), /fora_de_vigencia/);
  await db.query("update public.screener_event_bindings set ends_at = null, starts_at = now() + interval '1 hour'");
  await assert.rejects(call(db, "screener_rhia_op_start", [SLUG, sha("d"), "v1", now, exp, null]), /fora_de_vigencia/);
  assert.equal((await db.query("select count(*)::int as n from public.screener_rhia_sessions")).rows[0].n, 0);
});

test("save_response: sessão inexistente, expirada/revogada, vínculo fechado depois de aberta a sessão", async () => {
  const db = await ambiente();
  await assert.rejects(call(db, "screener_rhia_op_save_response", [sha("nada"), "EST01", "E1", null]), /sessao_inexistente/);
  const th = await abrir(db, "tks");
  await db.query("update public.screener_rhia_sessions set revoked_at = now()");
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", "E1", null]), /sessao_invalida/);
  await db.query("update public.screener_rhia_sessions set revoked_at = null");
  await db.query("update public.screener_event_bindings set status='closed'");
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", "E1", null]), /indisponivel/);
  await db.query("update public.screener_event_bindings set status='public_pilot', ends_at = now() - interval '1 hour'");
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", "E1", null]), /fora_de_vigencia/);
});

test("credencial de prévia (internal_preview): sem hash falha/oculta; com hash abre em todas as 6", async () => {
  const db = await ambiente({ status: "internal_preview", cred: PH });
  await assert.rejects(abrir(db, "tkp", null), /previa_nao_autorizada/);
  await assert.rejects(abrir(db, "tkp", sha("errada")), /previa_nao_autorizada/);
  const th = await abrir(db, "tkp", PH);
  assert.equal(await call(db, "screener_rhia_op_resume", [th, null]), null);
  assert.ok((await call(db, "screener_rhia_op_resume", [th, PH])).session);
  await assert.rejects(call(db, "screener_rhia_op_save_response", [th, "EST01", "E1", null]), /previa_nao_autorizada/);
  const resp = respostasCompletas();
  await responderTudo(db, th, resp, PH);
  const canon = canonico(resp);
  await assert.rejects(
    call(db, "screener_rhia_op_finalize", [th, canon, contrato(resp), ICS, sha(canon), SCORING, SCORING, null]),
    /previa_nao_autorizada/);
  assert.equal((await finalizar(db, th, resp, PH)).status, "finalizada");
  assert.equal(await call(db, "screener_rhia_op_get_result", [th, null]), null);
  assert.equal(await call(db, "screener_rhia_op_capturar_lead", [th, null, null, "a@b.co", false]), null);
  assert.deepEqual(await call(db, "screener_rhia_op_capturar_lead", [th, PH, null, "a@b.co", false]), { status: "ok" });
  assert.equal((await call(db, "screener_rhia_op_get_result", [th, PH])).result.public.version, "2.0.0-pilot");
});

test("privilégios: runtime só EXECUTE nas 7 funções; zero privilégio nas tabelas rhia; dono screener_owner", async () => {
  const db = await ambiente();
  const fns = [
    "screener_rhia_op_start(text,text,text,timestamptz,timestamptz,text)",
    "screener_rhia_op_resume(text,text)",
    "screener_rhia_op_save_response(text,text,text,text)",
    "screener_rhia_op_finalize(text,text,jsonb,text,text,text,text,text)",
    "screener_rhia_op_get_result(text,text)",
    "screener_rhia_op_capturar_lead(text,text,text,text,boolean)",
    // a 7ª: serve o caminho SEM rate limit (o padrão da degustação pública)
    "screener_rhia_op_get_binding(text,text)",
  ];
  for (const f of fns) {
    assert.equal((await db.query(`select has_function_privilege('screener_runtime','public.${f}','execute') as ok`)).rows[0].ok, true, `runtime execute ${f}`);
    for (const papel of ["service_role", "anon", "authenticated"])
      assert.equal((await db.query(`select has_function_privilege('${papel}','public.${f}','execute') as ok`)).rows[0].ok, false, `${papel} sem execute ${f}`);
    const dono = (await db.query(`select o.rolname from pg_proc p join pg_roles o on o.oid=p.proowner where p.oid = 'public.${f}'::regprocedure`)).rows[0].rolname;
    assert.equal(dono, "screener_owner", `dono ${f}`);
    const def = (await db.query(`select p.prosecdef, p.proconfig from pg_proc p where p.oid = 'public.${f}'::regprocedure`)).rows[0];
    assert.equal(def.prosecdef, true, `security definer ${f}`);
    assert.ok((def.proconfig ?? []).some((c) => /^search_path=/.test(c)), `search_path fixo ${f}`);
  }
  for (const t of ["screener_rhia_sessions", "screener_rhia_responses", "screener_rhia_result_snapshots", "screener_rhia_leads"]) {
    for (const papel of ["screener_runtime", "service_role", "anon", "authenticated"])
      for (const priv of ["select", "insert", "update", "delete"])
        assert.equal((await db.query(`select has_table_privilege('${papel}','public.${t}','${priv}') as ok`)).rows[0].ok, false, `${papel} sem ${priv} em ${t}`);
    assert.equal((await db.query(`select o.rolname from pg_class c join pg_roles o on o.oid=c.relowner where c.relname='${t}'`)).rows[0].rolname, "screener_owner", `dono ${t}`);
    assert.equal((await db.query(`select relrowsecurity from pg_class where relname='${t}'`)).rows[0].relrowsecurity, true, `RLS ligada em ${t}`);
  }
  assert.equal((await db.query("select has_sequence_privilege('screener_runtime','public.screener_rhia_responses_id_seq','usage') as ok")).rows[0].ok, false);
});

test("execução real como screener_runtime: fluxo inteiro pelas funções; tabelas negadas", async () => {
  const db = await ambiente();
  await db.exec("set role screener_runtime");
  try {
    const th = await abrir(db, "tkx");
    const resp = respostasCompletas();
    await responderTudo(db, th, resp);
    assert.equal((await finalizar(db, th, resp)).status, "finalizada");
    assert.equal((await call(db, "screener_rhia_op_get_result", [th, null])).lead_required, true);
    assert.deepEqual(await call(db, "screener_rhia_op_capturar_lead", [th, null, "Ana", "r@t.co", false]), { status: "ok" });
    assert.equal((await call(db, "screener_rhia_op_get_result", [th, null])).result.public.version, "2.0.0-pilot");
    for (const t of ["screener_rhia_sessions", "screener_rhia_responses", "screener_rhia_result_snapshots", "screener_rhia_leads", "screener_instrument_versions"])
      await assert.rejects(db.query(`select * from public.${t}`), /permission denied/i, t);
    await assert.rejects(db.query("insert into public.screener_rhia_leads (session_id, email, email_normalized) values (gen_random_uuid(),'x@y.co','x@y.co')"), /permission denied/i);
  } finally { await db.exec("reset role"); }
});
