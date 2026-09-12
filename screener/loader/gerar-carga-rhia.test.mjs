// TESTES ESTÁTICOS DO GERADOR RHIA (não executam SQL).
// Provam: geração determinística (sem drift com o arquivo commitado), checksum
// coerente com o que a edge computa (checksum() Web Crypto de screener/rhia) E
// com o createHash do motor (node), definição embutida VERBATIM (as 30 questões
// literais do pacote), ausência de ON CONFLICT e presença das guardas.
// O COMPORTAMENTO do PL/pgSQL é provado em behavioral/carga-rhia.behavioral.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { canonicalize } from "../motor/definicao.mjs";
import { instrumento, checksum, canonicalize as canonicalizeEdge } from "../rhia/definicao.mjs";
import { gerarCargaRhiaSQL, SLUG_PUBLICO_RHIA } from "./gerar-carga-rhia.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const SQL_GERADO = path.join(RAIZ, "supabase/migrations/20260913120000_screener_rhia_carga_publica.sql");
const JSON_FONTE = path.join(RAIZ, "screener/rhia/pacote/instrumento-rh-ia-v1.json");

test("[estático] sem drift: o SQL commitado é idêntico ao regenerado da fonte", () => {
  const atual = fs.readFileSync(SQL_GERADO, "utf8").replace(/\r\n/g, "\n");
  const fresco = gerarCargaRhiaSQL().replace(/\r\n/g, "\n");
  assert.equal(atual, fresco, "carga rhia gerada divergiu do arquivo commitado — regenere");
});

test("[estático] o arquivo gerado tem fim de linha LF e sem BOM", () => {
  const bruto = fs.readFileSync(SQL_GERADO);
  assert.notEqual(bruto[0], 0xef, "BOM UTF-8 no início do arquivo");
  assert.ok(!bruto.includes("\r"), "CR encontrado: o arquivo deve ser LF");
});

test("[estático] checksum embutido = checksum() da edge (Web Crypto) = createHash do motor (node)", async () => {
  const sql = gerarCargaRhiaSQL();
  const daEdge = await checksum();
  assert.match(daEdge, /^[0-9a-f]{64}$/);
  assert.ok(sql.includes(daEdge), "checksum da edge ausente no SQL");
  const doMotor = createHash("sha256").update(canonicalize(instrumento)).digest("hex");
  assert.equal(daEdge, doMotor, "checksum da edge diverge do createHash sobre o canonicalize do motor");
  assert.equal(canonicalizeEdge(instrumento), canonicalize(instrumento), "canonicalize da edge diverge do motor");
  // o checksum aparece nas duas posições: cabeçalho e v_checksum
  assert.match(sql, new RegExp("v_checksum\\s+text\\s+:=\\s+'" + daEdge + "'"));
});

test("[estático] a definição embutida é o JSON do pacote VERBATIM (re-canonicaliza igual)", () => {
  const sql = gerarCargaRhiaSQL();
  const partes = sql.split("$def$");
  assert.equal(partes.length, 3, "delimitadores $def$ inesperados");
  const embutida = JSON.parse(partes[1]);
  const fonte = JSON.parse(fs.readFileSync(JSON_FONTE, "utf8"));
  assert.equal(canonicalize(embutida), canonicalize(fonte), "JSON embutido não re-canonicaliza igual à fonte");
  assert.deepEqual(embutida, fonte, "definição embutida difere do JSON do pacote");
  assert.equal(embutida.instrument_id, "boomit_rh_ia_maturity_v1");
  assert.equal(embutida.instrument_version, "1.0.0-rc.1");
  assert.equal(embutida.items.length, 30);
  // literalidade: cada enunciado do pacote está no SQL (o JSON entra sem reescrita)
  for (const it of fonte.items) {
    assert.ok(partes[1].includes(JSON.stringify(it.prompt)), `prompt de ${it.id} não está literal na carga`);
    assert.ok(it.options.every((op) => typeof op.id === "string"), `${it.id}: opções sem id (as RPC leem options[].id)`);
  }
  // o campo condicional (CTX01_OTHER_TEXT) chega ao banco: a RPC valida o texto por ele
  const ctx01 = embutida.items.find((it) => it.id === "CTX01");
  assert.ok(ctx01 && ctx01.conditional_field && ctx01.conditional_field.id === "CTX01_OTHER_TEXT");
});

test("[estático] identidade do instrumento e do vínculo público", () => {
  const sql = gerarCargaRhiaSQL();
  assert.ok(sql.includes("'boomit_rh_ia_maturity_v1'"), "instrument_code ausente");
  assert.ok(sql.includes("'1.0.0-rc.1'"), "instrument_version ausente");
  assert.equal(SLUG_PUBLICO_RHIA, "boomit-degustacao-rh-ia");
  assert.ok(sql.includes("'boomit-degustacao-rh-ia'"), "slug do vínculo público ausente");
  assert.ok(sql.includes("'public_pilot'"), "vínculo deve nascer público (public_pilot)");
  assert.ok(sql.includes("'required_before_result'"), "captura de lead deve ser obrigatória (portão)");
  assert.match(sql, /v_session_ret\s+integer\s+:=\s+180;/, "retenção de sessão 180 dias");
  assert.match(sql, /v_lead_ret\s+integer\s+:=\s+365;/, "retenção de lead 365 dias");
  assert.match(sql, /v_branding\s+jsonb\s+:=\s+'\{\}'::jsonb;/, "branding vazio");
});

test("[estático] não usa ON CONFLICT (idempotência é explícita)", () => {
  assert.ok(!gerarCargaRhiaSQL().toLowerCase().includes("on conflict"), "ON CONFLICT não é permitido nesta carga");
});

test("[estático] guardas de instrumento e vínculo presentes", () => {
  const sql = gerarCargaRhiaSQL();
  assert.ok(/do \$\$/.test(sql), "não é bloco transacional DO");
  assert.ok(sql.includes("'inactive'"), "instrumento deve entrar inativo");
  assert.ok(sql.includes("checksum divergente"), "falta falha por checksum divergente");
  assert.ok(sql.includes("definição divergente"), "falta falha por definição divergente (checksum igual)");
  assert.ok(sql.includes("outro vínculo corrente"), "falta falha por vínculo corrente conflitante");
  assert.ok(sql.includes("configuração divergente"), "falta falha por configuração divergente");
  assert.ok(sql.includes("no-op"), "falta caminho no-op");
});

test("[estático] cabeçalho: marcada como não aplicada; membership do dono aberta e fechada", () => {
  const sql = gerarCargaRhiaSQL();
  assert.ok(sql.includes("NÃO APLICADA À PRODUÇÃO"));
  assert.ok(sql.includes("NÃO editar à mão"));
  assert.ok(sql.includes("grant screener_owner to current_user;"), "sem membership temporária do dono");
  assert.ok(sql.trimEnd().endsWith("revoke screener_owner from current_user;"), "membership do dono não é revogada no fim");
});

test("[estático] vínculo público não usa credencial de prévia", () => {
  const sql = gerarCargaRhiaSQL();
  assert.ok(!sql.includes("preview_credential"), "carga pública não deve semear credencial");
  assert.ok(!sql.includes("internal_preview"), "não deve nascer em internal_preview");
});

test("[estático] só toca catálogo (instrument_versions + event_bindings): nada de tabelas V1 de resposta nem legadas", () => {
  // o JSON embutido é prosa (as questões falam de "eventos", "respostas" etc.); a
  // verificação vale para o SQL FORA do payload $def$
  const partes = gerarCargaRhiaSQL().split("$def$");
  const sql = partes[0] + partes[2];
  for (const indevida of [
    "respondentes", "eventos", "respostas", "relatorios",
    "screener_sessions", "screener_responses", "screener_result_snapshots", "screener_leads",
    "screener_rhia_sessions", "screener_rhia_responses", "screener_rhia_result_snapshots", "screener_rhia_leads",
  ]) {
    assert.ok(!new RegExp("\\b" + indevida + "\\b").test(sql), `carga rhia referencia tabela indevida: ${indevida}`);
  }
  assert.ok(sql.includes("public.screener_instrument_versions"));
  assert.ok(sql.includes("public.screener_event_bindings"));
});

test("[estático] parâmetros: slug/status/lead/retenção são configuráveis; fonte errada é recusada", () => {
  const sql = gerarCargaRhiaSQL(instrumento, { slug: "outro-evento", status: "closed", leadMode: "none", sessionRetentionDays: 7, leadRetentionDays: 9 });
  assert.ok(sql.includes("'outro-evento'"));
  assert.ok(sql.includes("'closed'"));
  assert.ok(sql.includes("'none'"));
  assert.match(sql, /v_session_ret\s+integer\s+:=\s+7;/);
  assert.match(sql, /v_lead_ret\s+integer\s+:=\s+9;/);
  assert.throws(() => gerarCargaRhiaSQL({ instrument: { code: "x", version: "1" } }), /instrument_id/);
});
