// Handlers das 6 rotas da edge. Sem HTTP e sem cliente concreto: recebem um
// `ctx` injetável (q/tx/now/previewKeyHash). Testável com pglite; no Deno,
// o index.ts liga `ctx` a um Postgres com service_role. Runtime-agnóstico.

import { instrumento, checksum, projecaoPublica } from "../motor/definicao.mjs";
import { calcular } from "../motor/motor.mjs";
import { gerarToken, hashToken, sha256Hex, capacidades, resolverOpcao, validarSubmissao, paraPublico } from "./logica.mjs";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const resp = (status, body) => ({ status, body });

function unidadeNome(binding) {
  return (binding.branding && binding.branding.assessment_unit_name) || "sua empresa";
}
async function temCredencialPrevia(previewKey, binding, ctx) {
  if (!previewKey) return false;
  const esperado = (binding.branding && binding.branding.preview_credential_sha256) || ctx.previewKeyHash || null;
  if (!esperado) return false;
  return (await sha256Hex(previewKey)) === esperado;
}
async function carregarPorToken(ctx, token) {
  const th = await hashToken(token);
  const { rows } = await ctx.q(
    `select s.id sid, s.status sstatus, s.expires_at, s.revoked_at, s.submitted_at,
            s.binding_id, b.event_slug, b.status bstatus, b.starts_at, b.ends_at,
            b.branding, b.instrument_code, b.instrument_version
       from public.screener_sessions s
       join public.screener_event_bindings b on b.id = s.binding_id
      where s.token_hash = $1`, [th]);
  return rows[0] || null;
}
function bindingDe(row) {
  return { event_slug: row.event_slug, status: row.bstatus, starts_at: row.starts_at, ends_at: row.ends_at,
           branding: row.branding, instrument_code: row.instrument_code, instrument_version: row.instrument_version };
}
function sessaoValida(row, now) {
  if (row.revoked_at) return false;
  if (row.expires_at && new Date(row.expires_at) <= now) return false;
  return true;
}
function instrumentoConfere(binding) {
  return binding.instrument_code === instrumento.instrument.code &&
         binding.instrument_version === instrumento.instrument.version;
}

// ---------- GET /start ----------
export async function getStart(ctx, { event_slug, previewKey }) {
  const { rows } = await ctx.q(
    `select id, event_slug, status, starts_at, ends_at, branding, instrument_code, instrument_version
       from public.screener_event_bindings where event_slug=$1 and is_current`, [event_slug]);
  const binding = rows[0];
  if (!binding) return resp(404, { error: "nao_encontrado" });
  const cap = capacidades(binding, ctx.now(), await temCredencialPrevia(previewKey, binding, ctx));
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" }); // slug não concede acesso
  if (!cap.podeIniciar) return resp(403, { error: "indisponivel", motivo: cap.motivo });
  if (!instrumentoConfere(binding)) return resp(409, { error: "instrumento_indisponivel" });

  const pub = projecaoPublica(instrumento, { assessmentUnitName: unidadeNome(binding) });
  return resp(200, {
    instrument: pub.instrument,
    consent: pub.consent,
    blocks: pub.blocks.map((b) => ({ code: b.code, name: b.name, instruction: b.instruction, reference_period: b.reference_period })),
    branding: binding.branding || {},
    status: binding.status,
  });
}

// ---------- POST /start ----------
export async function postStart(ctx, { event_slug, previewKey, privacy_ack }) {
  const { rows } = await ctx.q(
    `select id, event_slug, status, starts_at, ends_at, branding, instrument_code, instrument_version
       from public.screener_event_bindings where event_slug=$1 and is_current`, [event_slug]);
  const binding = rows[0];
  if (!binding) return resp(404, { error: "nao_encontrado" });
  const cap = capacidades(binding, ctx.now(), await temCredencialPrevia(previewKey, binding, ctx));
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" });
  if (!cap.podeIniciar) return resp(403, { error: "indisponivel", motivo: cap.motivo });
  if (!instrumentoConfere(binding)) return resp(409, { error: "instrumento_indisponivel" });
  if (privacy_ack !== true) return resp(400, { error: "aviso_de_privacidade_obrigatorio" });

  const token = gerarToken();                    // servidor
  const token_hash = await hashToken(token);     // só o hash vai ao banco
  const notice = (binding.branding && binding.branding.privacy_notice_version) || "v1";
  const now = ctx.now();
  const expires = new Date(now.getTime() + TTL_MS).toISOString();
  const { rows: ins } = await ctx.q(
    `insert into public.screener_sessions
       (binding_id, token_hash, status, privacy_notice_version, privacy_acknowledged_at, expires_at)
       values ($1,$2,'open',$3,$4,$5) returning id`,
    [binding.id, token_hash, notice, now.toISOString(), expires]);

  const pub = projecaoPublica(instrumento, { sessionSeed: token, assessmentUnitName: unidadeNome(binding) });
  return resp(201, {
    session_id: ins[0].id,
    token, // devolvido UMA vez; o banco só tem o hash
    instrument: pub.instrument,
    blocks: pub.blocks, // itens com ids opacos; SEM mapping
  });
}

// ---------- GET /session (retoma) ----------
export async function getSession(ctx, { token, previewKey }) {
  const row = await carregarPorToken(ctx, token);
  if (!row) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = bindingDe(row);
  const cap = capacidades(binding, ctx.now(), await temCredencialPrevia(previewKey, binding, ctx));
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!sessaoValida(row, ctx.now())) return resp(410, { error: "sessao_expirada" });

  const { rows: respostas } = await ctx.q(
    `select item_code, stage_code from public.screener_responses where session_id=$1`, [row.sid]);
  const pub = projecaoPublica(instrumento, { sessionSeed: token, assessmentUnitName: unidadeNome(binding) });
  // traduz respostas salvas de volta para ids opacos (sem expor stage)
  const porItemStage = new Map();
  for (const [optId, alvo] of Object.entries(pub.mapping.options)) porItemStage.set(alvo.item + "|" + alvo.stage, optId);
  const answered = {};
  for (const r of respostas) {
    const itemId = Object.keys(pub.mapping.items).find((k) => pub.mapping.items[k] === r.item_code);
    const optId = porItemStage.get(r.item_code + "|" + r.stage_code);
    if (itemId && optId) answered[itemId] = optId;
  }
  return resp(200, {
    instrument: pub.instrument,
    blocks: pub.blocks,
    answered,
    progress: { answered: respostas.length, total: instrumento.items.length },
    pode_responder: cap.podeEscrever && row.sstatus === "open",
    submitted: row.sstatus === "submitted",
  });
}

// ---------- PUT /response ----------
export async function putResponse(ctx, { token, item_id, option_id, previewKey }) {
  const row = await carregarPorToken(ctx, token);
  if (!row) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = bindingDe(row);
  const cap = capacidades(binding, ctx.now(), await temCredencialPrevia(previewKey, binding, ctx));
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (row.sstatus === "submitted") return resp(409, { error: "resposta_impossivel_apos_submissao" });
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(row, ctx.now())) return resp(410, { error: "sessao_expirada" });

  const pub = projecaoPublica(instrumento, { sessionSeed: token, assessmentUnitName: unidadeNome(binding) });
  let alvo;
  try { alvo = resolverOpcao(pub.mapping, item_id, option_id); } // só ids opacos; stage vem do mapping
  catch { return resp(400, { error: "opcao_invalida" }); }

  await ctx.q(
    `insert into public.screener_responses (session_id, item_code, stage_code, answered_at)
       values ($1,$2,$3, now())
     on conflict (session_id, item_code) do update set stage_code=excluded.stage_code, revised_at=now()`,
    [row.sid, alvo.item_code, alvo.stage_code]);
  const { rows: cnt } = await ctx.q(`select count(*)::int n from public.screener_responses where session_id=$1`, [row.sid]);
  return resp(200, { ok: true, progress: { answered: cnt[0].n, total: instrumento.items.length } });
}

// ---------- POST /submit ----------
export async function postSubmit(ctx, { token, previewKey }) {
  const row = await carregarPorToken(ctx, token);
  if (!row) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = bindingDe(row);
  const cap = capacidades(binding, ctx.now(), await temCredencialPrevia(previewKey, binding, ctx));
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });

  // já submetida → idempotente: devolve o MESMO snapshot
  if (row.sstatus === "submitted") {
    const { rows } = await ctx.q(
      `select result from public.screener_result_snapshots where session_id=$1 order by created_at desc limit 1`, [row.sid]);
    if (!rows[0]) return resp(409, { error: "submetida_sem_snapshot" });
    return resp(200, paraPublico(rows[0].result));
  }
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(row, ctx.now())) return resp(410, { error: "sessao_expirada" });

  const { rows: rs } = await ctx.q(`select item_code, stage_code from public.screener_responses where session_id=$1`, [row.sid]);
  const respostas = {};
  for (const r of rs) respostas[r.item_code] = r.stage_code;
  try { validarSubmissao(respostas); } catch (e) { return resp(400, { error: "submissao_incompleta", detalhe: String(e.message) }); }

  const resultado = calcular({ respostas, assessment_unit: { id: binding.event_slug, name: unidadeNome(binding) }, assessment_id: row.sid });
  const canonRespostas = Object.keys(respostas).sort().map((k) => k + ":" + respostas[k]).join("|");
  const input_checksum = await sha256Hex(canonRespostas);
  const instrument_checksum = checksum();

  await ctx.tx(async (q) => {
    await q(
      `insert into public.screener_result_snapshots
         (session_id, event_slug, instrument_code, instrument_version, scoring_version, report_version, instrument_checksum, input_checksum, result)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (session_id, instrument_checksum, input_checksum, scoring_version, report_version) do nothing`,
      [row.sid, binding.event_slug, instrumento.instrument.code, instrumento.instrument.version,
       resultado.scoring_version, resultado.report_version, instrument_checksum, input_checksum, resultado]);
    await q(`update public.screener_sessions set status='submitted', submitted_at=now() where id=$1 and status='open'`, [row.sid]);
  });

  const { rows: snap } = await ctx.q(
    `select result from public.screener_result_snapshots where session_id=$1 order by created_at desc limit 1`, [row.sid]);
  return resp(200, paraPublico(snap[0].result));
}

// ---------- GET /result ----------
export async function getResult(ctx, { token, previewKey }) {
  const row = await carregarPorToken(ctx, token);
  if (!row) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = bindingDe(row);
  const cap = capacidades(binding, ctx.now(), await temCredencialPrevia(previewKey, binding, ctx));
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!cap.podeLerResultado) return resp(403, { error: "leitura_indisponivel" });
  if (!sessaoValida(row, ctx.now())) return resp(410, { error: "sessao_expirada" });

  const { rows } = await ctx.q(
    `select result from public.screener_result_snapshots where session_id=$1 order by created_at desc limit 1`, [row.sid]);
  if (!rows[0]) return resp(404, { error: "sem_resultado" });
  return resp(200, paraPublico(rows[0].result));
}

export const rotas = { getStart, postStart, getSession, putResponse, postSubmit, getResult };
