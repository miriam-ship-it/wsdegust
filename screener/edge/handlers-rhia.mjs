// =============================================================
// DIAGNÓSTICO BOOMIT RH + IA v2 ("rhia") — handlers das 7 rotas /rhia/* da edge
//
// Mesmo padrão e mesma FRONTEIRA do V1 (handlers.mjs): nenhum SQL direto — toda
// leitura/escrita passa pelas funções SECURITY DEFINER `screener_rhia_op_*`
// (tabelas `screener_rhia_*`, caminho novo; o V1 não é tocado). Reutiliza os
// helpers genéricos do V1 (token, hash, capacidades, rate) e as funções genéricas
// `screener_op_get_binding` / `screener_op_preview_authorize` / `screener_op_rate_check`.
//
// O CONTEÚDO é do pacote; o SERVIDOR é o da casa: o motor do pacote roda AQUI
// (via screener/rhia/logica.mjs) e o navegador recebe só `paraPublico(contrato)` —
// nunca `internal` (respostas), pontos-base, pesos ou códigos de estágio.
//
// Portão de lead (server-side): quando o vínculo é `required_before_result`, o
// submit NÃO devolve o resultado — só `{submitted:true, lead_required:true}`; a
// RPC get_result retém o snapshot até existir lead da sessão (403 lead_required).
//
// NUNCA logar token ou credencial. A chave de prévia vira sha256 antes do banco.
// =============================================================

import { gerarToken, hashToken, sha256Hex, capacidades } from "./logica.mjs";
import { chaveRate } from "./ratelimit.mjs";
import { instrumento, checksum, apresentacaoPublica } from "../rhia/definicao.mjs";
import { validarResposta, validarSubmissao, canonico, calcularContrato, paraPublico } from "../rhia/logica.mjs";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const NOTICE_VIGENTE = "v1";            // versão vigente do aviso de privacidade
/** Versão do modelo público do motor (output-definition-v2 VERSION). Vai em scoring/report_version. */
const VERSAO_RESULTADO = "2.0.0-pilot";
const TOTAL_ITENS = instrumento.items.length; // 30
const resp = (status, body) => ({ status, body });

/** Chama uma função screener_*op_* e devolve o jsonb já parseado (ou null). */
async function rpc(ctx, fn, params) {
  const { rows } = await ctx.q(`select public.${fn}(${params.map((_, i) => "$" + (i + 1)).join(",")}) as r`, params);
  return rows[0] ? rows[0].r : null;
}
/** Hash sha256 da chave de prévia (só o hash vai ao banco), ou null. */
const previaHash = (previewKey) => (previewKey ? sha256Hex(previewKey) : Promise.resolve(null));

// ---------- rate limiting (mesma política do V1; funções genéricas; fail-closed) ----------
async function checarRate(ctx, operation, keyHmac) {
  if (!ctx.rate || !ctx.rate.ativo || !keyHmac) return null;
  let rc;
  try { rc = await rpc(ctx, "screener_op_rate_check", [keyHmac, operation]); }
  catch { return resp(503, { error: "indisponivel_temporario" }); }
  if (!rc || rc.status === "allowed") return null;
  if (rc.status === "limited") return resp(429, { error: "muitas_requisicoes", retry_after_seconds: rc.retry_after_seconds });
  return resp(503, { error: "indisponivel_temporario" }); // bad_key/unknown_operation/policy_error
}
async function checarRateToken(ctx, operation, token) {
  if (!ctx.rate || !ctx.rate.ativo) return null;
  const key = await chaveRate(ctx.rate.secret, operation, "", token || "");
  return checarRate(ctx, operation, key);
}
/**
 * Resolve o vínculo. Com rate ativo: screener_op_preview_authorize (genérica do
 * V1). Sem rate: screener_rhia_op_get_binding — própria do rhia justamente para
 * projetar lead_capture_mode, que a get_binding do V1 (em produção) não traz e
 * que não pode ser alterada.
 * @returns {{binding?:object, erro?:{status:number,body:object}}}
 */
async function resolverBinding(ctx, event_slug, previewHash, ipHmac) {
  if (ctx.rate && ctx.rate.ativo) {
    let r;
    try { r = await rpc(ctx, "screener_op_preview_authorize", [ipHmac, event_slug, previewHash]); }
    catch { return { erro: resp(503, { error: "indisponivel_temporario" }) }; }
    if (!r) return { erro: resp(503, { error: "indisponivel_temporario" }) };
    if (r.status === "authorized") return { binding: r.binding };
    if (r.status === "limited") return { erro: resp(429, { error: "muitas_requisicoes", retry_after_seconds: r.retry_after_seconds }) };
    if (r.status === "invalid") return { erro: resp(404, { error: "nao_encontrado" }) };
    return { erro: resp(503, { error: "indisponivel_temporario" }) }; // bad_key
  }
  let b;
  try { b = await rpc(ctx, "screener_rhia_op_get_binding", [event_slug, previewHash]); }
  // Sem isto a exceção escapava do handler e o dispatcher devolvia 500 com o
  // texto cru do Postgres a uma entrada anônima (ex.: "invalid byte sequence
  // for encoding UTF8"). O diagnóstico fica no log; o cliente recebe o genérico.
  catch { return { erro: resp(503, { error: "indisponivel_temporario" }) }; }
  if (!b) return { erro: resp(404, { error: "nao_encontrado" }) };
  return { binding: b };
}

/**
 * Forma do slug de evento, igual ao CHECK da tabela de vínculos
 * (`^[a-z0-9]+(-[a-z0-9]+)*$`). Um slug fora disso não pode casar com vínculo
 * nenhum: recusamos antes de tocar o banco, para que caractere de controle ou
 * byte inválido nem cheguem ao Postgres.
 */
const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugUtilizavel = (s) => typeof s === "string" && s.length <= 120 && SLUG_VALIDO.test(s);

/** Versão vigente do aviso de privacidade — do vínculo ou o padrão. */
function noticeVigente(binding) {
  return (binding.branding && binding.branding.privacy_notice_version) || NOTICE_VIGENTE;
}
/**
 * lead_capture_mode do vínculo. As duas funções que resolvem o vínculo trazem o
 * campo: screener_rhia_op_get_binding (própria do rhia) e screener_op_preview_authorize
 * (caminho com rate). Fica null só se um vínculo antigo não tiver o campo — o
 * frontend então assume "optional_after_submit". Em todo caso o valor aqui é
 * informativo: quem decide o portão é o servidor (a RPC get_result retém o
 * resultado até haver lead), nunca o navegador.
 */
const modoLead = (binding) => (binding && typeof binding.lead_capture_mode === "string" ? binding.lead_capture_mode : null);
function sessaoValida(sess, now) {
  if (sess.revoked_at) return false;
  if (sess.expires_at && new Date(sess.expires_at) <= now) return false;
  return true;
}
/** O vínculo aponta para ESTE instrumento (código + versão do JSON do pacote)? */
function instrumentoConfere(binding) {
  return binding.instrument_code === instrumento.instrument_id &&
         binding.instrument_version === instrumento.instrument_version;
}
/** Traduz o raise das funções `screener_rhia_op_*` em status HTTP. */
function mapErroSql(e) {
  const m = String((e && e.message) || e);
  if (m.includes("previa_nao_autorizada")) return resp(404, { error: "nao_encontrado" });
  if (m.includes("vinculo_inexistente")) return resp(404, { error: "nao_encontrado" });
  if (m.includes("sessao_inexistente")) return resp(404, { error: "sessao_nao_encontrada" });
  if (m.includes("sessao_nao_aberta")) return resp(409, { error: "sessao_nao_aberta" });
  if (m.includes("sessao_invalida")) return resp(410, { error: "sessao_invalida" });
  if (m.includes("indisponivel") || m.includes("fora_de_vigencia")) return resp(403, { error: "indisponivel" });
  if (m.includes("respostas_mudaram")) return resp(409, { error: "respostas_mudaram" });
  if (m.includes("item_fora_do_instrumento") || m.includes("opcao_invalida")) return resp(400, { error: "opcao_invalida" });
  if (m.includes("texto_invalido")) return resp(400, { error: "texto_invalido" });
  if (m.includes("email_invalido")) return resp(400, { error: "email_invalido" });
  if (m.includes("lead_desativado")) return resp(409, { error: "lead_desativado" });
  if (m.includes("sessao_nao_submetida")) return resp(409, { error: "sessao_nao_submetida" });
  // Ramo padrão: NADA do texto do Postgres sai para o navegador. A mensagem crua
  // carrega nome de constraint, de tabela, de encoding — detalhe de implementação
  // que a fronteira não entrega a entrada anônima. O diagnóstico fica no log.
  return resp(409, { error: "conflito" });
}

/** Caracteres de controle (inclui NUL) — o Postgres nem aceita, e o texto do erro vazava. */
const CONTROLE = /[\u0000-\u001f\u007f]/g;
/** Nome do lead: opcional, sem caracteres de controle, aparado, no máximo 120 chars. */
function limparNome(nome) {
  if (typeof nome !== "string") return null;
  const v = nome.replace(CONTROLE, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return v || null;
}

/** Respostas da RPC (lista) → mapa item_id → value. */
function mapaRespostas(responses) {
  const out = {};
  for (const r of responses || []) out[r.item_code] = r.answer_code;
  return out;
}

// ---------- GET /rhia/start (obter apresentação) ----------
export async function getStartRhia(ctx, { event_slug, previewKey, ipHmac }) {
  if (!event_slug) return resp(400, { error: "event_slug_obrigatorio" });
  if (!slugUtilizavel(event_slug)) return resp(404, { error: "nao_encontrado" });
  const { binding, erro } = await resolverBinding(ctx, event_slug, await previaHash(previewKey), ipHmac);
  if (erro) return erro; // inexistente/prévia sem credencial → 404; excesso → 429
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" });
  if (!cap.podeIniciar) return resp(403, { error: "indisponivel", motivo: cap.motivo });
  if (!instrumentoConfere(binding)) return resp(409, { error: "instrumento_indisponivel" });
  return resp(200, {
    ...apresentacaoPublica(),
    branding: binding.branding || {},
    status: binding.status,
    lead_capture_mode: modoLead(binding),
    privacy_notice_version: noticeVigente(binding),
  });
}

// ---------- POST /rhia/start (iniciar sessão) ----------
export async function postStartRhia(ctx, { event_slug, previewKey, privacy_ack, privacy_notice_version, ipHmac }) {
  if (!event_slug) return resp(400, { error: "event_slug_obrigatorio" });
  if (!slugUtilizavel(event_slug)) return resp(404, { error: "nao_encontrado" });
  const previewHash = await previaHash(previewKey);
  const { binding, erro } = await resolverBinding(ctx, event_slug, previewHash, ipHmac);
  if (erro) return erro;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" });
  if (!cap.podeIniciar) return resp(403, { error: "indisponivel", motivo: cap.motivo });
  if (!instrumentoConfere(binding)) return resp(409, { error: "instrumento_indisponivel" });
  // consentimento: exige ciência E o aviso VIGENTE (cliente não fabrica versão/horário)
  if (privacy_ack !== true) return resp(400, { error: "aviso_de_privacidade_obrigatorio" });
  const vigente = noticeVigente(binding);
  if (privacy_notice_version !== vigente) return resp(409, { error: "aviso_desatualizado", vigente });
  const rl = await checarRate(ctx, "start_preview", ipHmac); // limita criação de sessão por IP
  if (rl) return rl;

  const token = gerarToken();                    // servidor
  const token_hash = await hashToken(token);     // só o hash vai ao banco
  const now = ctx.now();                          // horário do servidor (ignora o do cliente)
  const expires = new Date(now.getTime() + TTL_MS).toISOString();
  let criada;
  try {
    criada = await rpc(ctx, "screener_rhia_op_start", [event_slug, token_hash, vigente, now.toISOString(), expires, previewHash]);
  } catch (e) { return mapErroSql(e); }
  return resp(201, {
    session_id: criada.session_id,
    token, // devolvido UMA vez; o banco só tem o hash
    ...apresentacaoPublica(),
  });
}

// ---------- GET /rhia/session (retomar sessão) ----------
export async function getSessionRhia(ctx, { token, previewKey }) {
  const rl = await checarRateToken(ctx, "consulta", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const data = await rpc(ctx, "screener_rhia_op_resume", [th, await previaHash(previewKey)]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });
  const answered = mapaRespostas(data.responses);
  // progresso conta só os 30 itens do instrumento (o texto livre não é item)
  const respondidos = instrumento.items.filter((it) => answered[it.id] !== undefined).length;
  return resp(200, {
    ...apresentacaoPublica(),
    answered,
    progress: { answered: respondidos, total: TOTAL_ITENS },
    pode_responder: cap.podeEscrever && sess.status === "open",
    submitted: sess.status === "submitted",
    lead_capture_mode: modoLead(binding),
  });
}

// ---------- PUT /rhia/response (salvar resposta) ----------
export async function putResponseRhia(ctx, { token, item_id, value, previewKey }) {
  const rl = await checarRateToken(ctx, "autosave", token);
  if (rl) return rl;
  if (typeof item_id !== "string" || !item_id) return resp(400, { error: "campos_obrigatorios" });
  // validação local antes da RPC (a função revalida contra a definição gravada)
  try { validarResposta(item_id, value); }
  catch (e) {
    const m = String(e.message);
    return resp(400, { error: m === "texto_invalido" ? "texto_invalido" : "opcao_invalida" });
  }
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  const data = await rpc(ctx, "screener_rhia_op_resume", [th, previewHash]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (sess.status === "submitted") return resp(409, { error: "resposta_impossivel_apos_submissao" });
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });

  let saved;
  try {
    saved = await rpc(ctx, "screener_rhia_op_save_response", [th, item_id, value, previewHash]);
  } catch (e) { return mapErroSql(e); } // função trava a sessão e revalida atomicamente
  return resp(200, { ok: true, progress: { answered: saved.answered, total: TOTAL_ITENS } });
}

// ---------- POST /rhia/submit (finalizar submissão) ----------
export async function postSubmitRhia(ctx, { token, previewKey }) {
  const rl = await checarRateToken(ctx, "submit", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  const data = await rpc(ctx, "screener_rhia_op_resume", [th, previewHash]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  // Portão: em required_before_result o resultado NÃO sai no submit — o frontend
  // captura o lead e depois busca via GET /rhia/result (que a RPC libera com lead).
  const comPortao = binding.lead_capture_mode === "required_before_result";

  // já submetida → idempotente: consulta o snapshot e espelha o gate
  if (sess.status === "submitted") {
    const got = await rpc(ctx, "screener_rhia_op_get_result", [th, previewHash]);
    if (got && got.lead_required) return resp(200, { submitted: true, lead_required: true });
    if (!got || !got.result) return resp(409, { error: "submetida_sem_snapshot" });
    return resp(200, paraPublico(got.result));
  }
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });

  // ler → validar → calcular (motor do pacote) → finalizar (função atômica). Se as
  // respostas mudarem entre a leitura e a finalização, a função rejeita e a edge
  // relê/recalcula (até 3 vezes).
  const instrument_checksum = await checksum();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const atual = tentativa === 0 ? data : await rpc(ctx, "screener_rhia_op_resume", [th, previewHash]);
    if (!atual) return resp(404, { error: "sessao_nao_encontrada" });
    const respostas = mapaRespostas(atual.responses);
    try { validarSubmissao(respostas); }
    catch (e) { return resp(400, { error: "submissao_incompleta", detalhe: String(e.message) }); }

    const contrato = calcularContrato({ respostas }); // {public, internal} — o snapshot guarda os dois
    const canon = canonico(respostas);                 // idêntico ao string_agg da função
    const input_checksum = await sha256Hex(canon);
    try {
      const fin = await rpc(ctx, "screener_rhia_op_finalize",
        [th, canon, contrato, instrument_checksum, input_checksum, VERSAO_RESULTADO, VERSAO_RESULTADO, previewHash]);
      // com portão, retém o resultado (sessão recém-submetida ainda não tem lead)
      if (comPortao) return resp(200, { submitted: true, lead_required: true });
      return resp(200, paraPublico(fin.result));
    } catch (e) {
      if (String(e.message).includes("respostas_mudaram")) continue; // relê
      return mapErroSql(e);
    }
  }
  // só chega aqui após esgotar as 3 tentativas por 'respostas_mudaram'
  return resp(409, { error: "respostas_instaveis" });
}

// ---------- GET /rhia/result (obter resultado) ----------
export async function getResultRhia(ctx, { token, previewKey }) {
  const rl = await checarRateToken(ctx, "consulta", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const data = await rpc(ctx, "screener_rhia_op_get_result", [th, await previaHash(previewKey)]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!cap.podeLerResultado) return resp(403, { error: "leitura_indisponivel" });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });
  if (!data.result) {
    if (data.lead_required) return resp(403, { error: "lead_required" }); // portão: falta capturar o lead
    return resp(404, { error: "sem_resultado" });
  }
  return resp(200, paraPublico(data.result));
}

// ---------- POST /rhia/lead (capturar lead — degustação pública) ----------
// Único caminho de escrita da PII: a função valida sessão/vínculo/credencial,
// exige sessão SUBMETIDA e respeita lead_capture_mode.
export async function postLeadRhia(ctx, { token, previewKey, nome, email, marketing_opt_in }) {
  const rl = await checarRateToken(ctx, "consulta", token);
  if (rl) return rl;
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  // O texto do lead é aparado ANTES do banco: caractere de controle (NUL
  // inclusive) faz o Postgres abortar a transação com um erro de encoding que
  // não tem por que chegar ao navegador. Nome é limpo; e-mail com controle é
  // simplesmente inválido (limpar poderia transformar lixo em e-mail aceito).
  const nomeLimpo = limparNome(nome);
  if (typeof email === "string" && email !== email.replace(CONTROLE, "")) {
    return resp(400, { error: "email_invalido" });
  }
  let r;
  try {
    r = await rpc(ctx, "screener_rhia_op_capturar_lead",
      [th, previewHash, nomeLimpo, email ?? null, marketing_opt_in === true]);
  } catch (e) { return mapErroSql(e); }
  if (!r) return resp(404, { error: "sessao_nao_encontrada" });
  return resp(200, { ok: true });
}

export const rotasRhia = { getStartRhia, postStartRhia, getSessionRhia, putResponseRhia, postSubmitRhia, getResultRhia, postLeadRhia };
