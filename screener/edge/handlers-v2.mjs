// Handlers das 7 rotas /v2/* da edge (diagnóstico de maturidade em IA).
// Mesmo padrão e mesma FRONTEIRA do V1: nenhum SQL direto — tudo pelas funções
// screener_v2_op_* (SECURITY DEFINER). Reutiliza os helpers genéricos (token,
// capacidades, rate, binding) e as funções genéricas preview_authorize/get_binding/
// rate_check. O motor roda AQUI (servidor); o navegador recebe só o PublicResultIAV2.
import { gerarToken, hashToken, sha256Hex, capacidades } from "./logica.mjs";
import { chaveRate } from "./ratelimit.mjs";
import { instrumentoV2, checksumV2, apresentacaoPublicaV2 } from "./definicao-v2.mjs";
import { calcularV2 } from "../v2/motor-v2.mjs";
import { validarSubmissaoV2, respostasParaMotor, canonicoV2, paraPublicoV2 } from "./logica-v2.mjs";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const NOTICE_VIGENTE = "v1";
const resp = (status, body) => ({ status, body });

async function rpc(ctx, fn, params) {
  const { rows } = await ctx.q(`select public.${fn}(${params.map((_, i) => "$" + (i + 1)).join(",")}) as r`, params);
  return rows[0] ? rows[0].r : null;
}
const previaHash = (previewKey) => (previewKey ? sha256Hex(previewKey) : Promise.resolve(null));

// ---------- rate limiting (mesma política do V1; funções genéricas) ----------
async function checarRate(ctx, operation, keyHmac) {
  if (!ctx.rate || !ctx.rate.ativo || !keyHmac) return null;
  let rc;
  try { rc = await rpc(ctx, "screener_op_rate_check", [keyHmac, operation]); }
  catch { return resp(503, { error: "indisponivel_temporario" }); }
  if (!rc || rc.status === "allowed") return null;
  if (rc.status === "limited") return resp(429, { error: "muitas_requisicoes", retry_after_seconds: rc.retry_after_seconds });
  return resp(503, { error: "indisponivel_temporario" });
}
async function checarRateToken(ctx, operation, token) {
  if (!ctx.rate || !ctx.rate.ativo) return null;
  const key = await chaveRate(ctx.rate.secret, operation, "", token || "");
  return checarRate(ctx, operation, key);
}
async function resolverBinding(ctx, event_slug, previewHash, ipHmac) {
  if (ctx.rate && ctx.rate.ativo) {
    let r;
    try { r = await rpc(ctx, "screener_op_preview_authorize", [ipHmac, event_slug, previewHash]); }
    catch { return { erro: resp(503, { error: "indisponivel_temporario" }) }; }
    if (!r) return { erro: resp(503, { error: "indisponivel_temporario" }) };
    if (r.status === "authorized") return { binding: r.binding };
    if (r.status === "limited") return { erro: resp(429, { error: "muitas_requisicoes", retry_after_seconds: r.retry_after_seconds }) };
    if (r.status === "invalid") return { erro: resp(404, { error: "nao_encontrado" }) };
    return { erro: resp(503, { error: "indisponivel_temporario" }) };
  }
  const b = await rpc(ctx, "screener_op_get_binding", [event_slug, previewHash]);
  if (!b) return { erro: resp(404, { error: "nao_encontrado" }) };
  return { binding: b };
}

const unidadeNome = (b) => (b.branding && b.branding.assessment_unit_name) || "sua empresa";
const noticeVigente = (b) => (b.branding && b.branding.privacy_notice_version) || NOTICE_VIGENTE;
function sessaoValida(sess, now) {
  if (sess.revoked_at) return false;
  if (sess.expires_at && new Date(sess.expires_at) <= now) return false;
  return true;
}
const instrumentoConfereV2 = (b) =>
  b.instrument_code === instrumentoV2.code && b.instrument_version === instrumentoV2.version;

function mapErroSql(e) {
  const m = String((e && e.message) || e);
  if (m.includes("previa_nao_autorizada")) return resp(404, { error: "nao_encontrado" });
  if (m.includes("sessao_nao_aberta")) return resp(409, { error: "sessao_nao_aberta" });
  if (m.includes("sessao_invalida")) return resp(410, { error: "sessao_invalida" });
  if (m.includes("indisponivel") || m.includes("fora_de_vigencia")) return resp(403, { error: "indisponivel" });
  if (m.includes("respostas_mudaram")) return resp(409, { error: "respostas_mudaram" });
  if (m.includes("item_fora_do_instrumento") || m.includes("nivel_invalido") || m.includes("senioridade_invalida")) return resp(400, { error: "opcao_invalida" });
  if (m.includes("email_invalido")) return resp(400, { error: "email_invalido" });
  if (m.includes("lead_desativado")) return resp(409, { error: "lead_desativado" });
  if (m.includes("sessao_nao_submetida")) return resp(409, { error: "sessao_nao_submetida" });
  return resp(409, { error: "conflito", detalhe: m });
}

// ---------- GET /v2/start ----------
export async function getStartV2(ctx, { event_slug, previewKey, ipHmac }) {
  if (!event_slug) return resp(400, { error: "event_slug_obrigatorio" });
  const { binding, erro } = await resolverBinding(ctx, event_slug, await previaHash(previewKey), ipHmac);
  if (erro) return erro;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" });
  if (!cap.podeIniciar) return resp(403, { error: "indisponivel", motivo: cap.motivo });
  if (!instrumentoConfereV2(binding)) return resp(409, { error: "instrumento_indisponivel" });
  return resp(200, {
    presentation: apresentacaoPublicaV2(),
    branding: binding.branding || {},
    status: binding.status,
    unit_name: unidadeNome(binding),
  });
}

// ---------- POST /v2/start ----------
export async function postStartV2(ctx, { event_slug, previewKey, privacy_ack, privacy_notice_version, ipHmac }) {
  if (!event_slug) return resp(400, { error: "event_slug_obrigatorio" });
  const previewHash = await previaHash(previewKey);
  const { binding, erro } = await resolverBinding(ctx, event_slug, previewHash, ipHmac);
  if (erro) return erro;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" });
  if (!cap.podeIniciar) return resp(403, { error: "indisponivel", motivo: cap.motivo });
  if (!instrumentoConfereV2(binding)) return resp(409, { error: "instrumento_indisponivel" });
  if (privacy_ack !== true) return resp(400, { error: "aviso_de_privacidade_obrigatorio" });
  const vigente = noticeVigente(binding);
  if (privacy_notice_version !== vigente) return resp(409, { error: "aviso_desatualizado", vigente });
  const rl = await checarRate(ctx, "start_preview", ipHmac);
  if (rl) return rl;

  const token = gerarToken();
  const token_hash = await hashToken(token);
  const now = ctx.now();
  const expires = new Date(now.getTime() + TTL_MS).toISOString();
  let criada;
  try {
    criada = await rpc(ctx, "screener_v2_op_start", [event_slug, token_hash, vigente, now.toISOString(), expires, previewHash]);
  } catch (e) { return mapErroSql(e); }
  return resp(201, {
    session_id: criada.session_id,
    token,
    presentation: apresentacaoPublicaV2(),
    unit_name: unidadeNome(binding),
  });
}

// ---------- GET /v2/session ----------
export async function getSessionV2(ctx, { token, previewKey }) {
  const rl = await checarRateToken(ctx, "consulta", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const data = await rpc(ctx, "screener_v2_op_resume", [th, await previaHash(previewKey)]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });
  const answered = {};
  for (const r of data.responses) answered[r.item_code] = r.answer_code;
  return resp(200, {
    presentation: apresentacaoPublicaV2(),
    answered,
    seniority: sess.seniority_code || null,
    progress: { answered: data.responses.length, total: instrumentoV2.questoes.length },
    pode_responder: cap.podeEscrever && sess.status === "open",
    submitted: sess.status === "submitted",
  });
}

// ---------- PUT /v2/response ----------
export async function putResponseV2(ctx, { token, item_code, answer_code, previewKey }) {
  const rl = await checarRateToken(ctx, "autosave", token);
  if (rl) return rl;
  if (!item_code || !answer_code) return resp(400, { error: "campos_obrigatorios" });
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  const data = await rpc(ctx, "screener_v2_op_resume", [th, previewHash]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (sess.status === "submitted") return resp(409, { error: "resposta_impossivel_apos_submissao" });
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });

  let saved;
  try {
    saved = await rpc(ctx, "screener_v2_op_save_response", [th, item_code, answer_code, previewHash]);
  } catch (e) { return mapErroSql(e); }
  return resp(200, { ok: true, progress: { answered: saved.answered, total: instrumentoV2.questoes.length } });
}

// ---------- POST /v2/submit ----------
export async function postSubmitV2(ctx, { token, previewKey }) {
  const rl = await checarRateToken(ctx, "submit", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  const data = await rpc(ctx, "screener_v2_op_resume", [th, previewHash]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });

  if (sess.status === "submitted") {
    const got = await rpc(ctx, "screener_v2_op_get_result", [th, previewHash]);
    if (!got || !got.result) return resp(409, { error: "submetida_sem_snapshot" });
    return resp(200, paraPublicoV2(got.result));
  }
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });

  const instrument_checksum = await checksumV2();
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const atual = tentativa === 0 ? data : await rpc(ctx, "screener_v2_op_resume", [th, previewHash]);
    if (!atual) return resp(404, { error: "sessao_nao_encontrada" });
    const respostas = {};
    for (const r of atual.responses) respostas[r.item_code] = r.answer_code;
    const senioridade = atual.session.seniority_code;
    try { validarSubmissaoV2(respostas, senioridade); }
    catch (e) { return resp(400, { error: "submissao_incompleta", detalhe: String(e.message) }); }

    const interno = calcularV2(respostasParaMotor(respostas), senioridade); // ScoreResultIAV2 (fica no snapshot)
    const canon = canonicoV2(senioridade, respostas);
    const input_checksum = await sha256Hex(canon);
    try {
      const fin = await rpc(ctx, "screener_v2_op_finalize",
        [th, canon, interno, instrument_checksum, input_checksum, instrumentoV2.version, instrumentoV2.version, previewHash]);
      return resp(200, paraPublicoV2(fin.result));
    } catch (e) {
      ultimoErro = e;
      if (String(e.message).includes("respostas_mudaram")) continue;
      return mapErroSql(e);
    }
  }
  void ultimoErro;
  return resp(409, { error: "respostas_instaveis" });
}

// ---------- GET /v2/result ----------
export async function getResultV2(ctx, { token, previewKey }) {
  const rl = await checarRateToken(ctx, "consulta", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const data = await rpc(ctx, "screener_v2_op_get_result", [th, await previaHash(previewKey)]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!cap.podeLerResultado) return resp(403, { error: "leitura_indisponivel" });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });
  if (!data.result) return resp(404, { error: "sem_resultado" });
  return resp(200, paraPublicoV2(data.result));
}

// ---------- POST /v2/lead ----------
export async function postLeadV2(ctx, { token, previewKey, nome, email, marketing_opt_in }) {
  const rl = await checarRateToken(ctx, "consulta", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  let r;
  try {
    r = await rpc(ctx, "screener_v2_op_capturar_lead",
      [th, previewHash, nome ?? null, email ?? null, marketing_opt_in === true]);
  } catch (e) { return mapErroSql(e); }
  if (!r) return resp(404, { error: "sessao_nao_encontrada" });
  return resp(200, { ok: true });
}

export const rotasV2 = { getStartV2, postStartV2, getSessionV2, putResponseV2, postSubmitV2, getResultV2, postLeadV2 };
