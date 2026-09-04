// Handlers das 6 rotas da edge. Sem HTTP e sem cliente concreto: recebem um
// `ctx` injetável (q/now). Testável com pglite; no Deno, o index.ts liga `ctx` a
// um Postgres conectado como `screener_runtime`.
//
// FRONTEIRA DE SEGURANÇA: a edge NÃO faz SQL direto. TODA leitura/escrita passa
// pelas 6 funções SECURITY DEFINER `screener_op_*`. screener_runtime só tem
// EXECUTE nelas — nenhuma permissão de tabela. A CHAVE de prévia nunca vai ao
// banco: a edge calcula sha256 e envia SÓ o hash. A credencial é enforçada nas
// funções (a edge não vê o hash guardado), então `capacidades` não a conhece.
// A edge mantém: geração/hash do token, consentimento, projeção pública, cálculo
// determinístico e mapeamento de ids opacos.

import { instrumento, checksum, projecaoPublica } from "../motor/definicao.mjs";
import { calcular } from "../motor/motor.mjs";
import { gerarToken, hashToken, sha256Hex, capacidades, resolverOpcao, validarSubmissao, paraPublico } from "./logica.mjs";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const NOTICE_VIGENTE = "v1";            // versão vigente do aviso de privacidade
const resp = (status, body) => ({ status, body });

/** Chama uma função screener_op_* e devolve o jsonb já parseado (ou null). */
async function rpc(ctx, fn, params) {
  const { rows } = await ctx.q(`select public.${fn}(${params.map((_, i) => "$" + (i + 1)).join(",")}) as r`, params);
  return rows[0] ? rows[0].r : null;
}
/** Hash sha256 da chave de prévia (só o hash vai ao banco), ou null. */
const previaHash = (previewKey) => (previewKey ? sha256Hex(previewKey) : Promise.resolve(null));

function unidadeNome(binding) {
  return (binding.branding && binding.branding.assessment_unit_name) || "sua empresa";
}
/** Versão vigente do aviso de privacidade — do vínculo ou o padrão. */
function noticeVigente(binding) {
  return (binding.branding && binding.branding.privacy_notice_version) || NOTICE_VIGENTE;
}
function sessaoValida(sess, now) {
  if (sess.revoked_at) return false;
  if (sess.expires_at && new Date(sess.expires_at) <= now) return false;
  return true;
}
function instrumentoConfere(binding) {
  return binding.instrument_code === instrumento.instrument.code &&
         binding.instrument_version === instrumento.instrument.version;
}
/** Traduz o raise das funções em status HTTP. */
function mapErroSql(e) {
  const m = String((e && e.message) || e);
  if (m.includes("previa_nao_autorizada")) return resp(404, { error: "nao_encontrado" });
  if (m.includes("sessao_nao_aberta")) return resp(409, { error: "sessao_nao_aberta" });
  if (m.includes("sessao_invalida")) return resp(410, { error: "sessao_invalida" });
  if (m.includes("indisponivel") || m.includes("fora_de_vigencia")) return resp(403, { error: "indisponivel" });
  if (m.includes("respostas_mudaram")) return resp(409, { error: "respostas_mudaram" });
  if (m.includes("item_fora_do_instrumento") || m.includes("estagio_invalido")) return resp(400, { error: "opcao_invalida" });
  return resp(409, { error: "conflito", detalhe: m });
}

// ---------- GET /start (obter apresentação) ----------
export async function getStart(ctx, { event_slug, previewKey }) {
  if (!event_slug) return resp(400, { error: "event_slug_obrigatorio" });
  const binding = await rpc(ctx, "screener_op_get_binding", [event_slug, await previaHash(previewKey)]);
  if (!binding) return resp(404, { error: "nao_encontrado" }); // inexistente ou prévia sem credencial
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" });
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

// ---------- POST /start (iniciar sessão) ----------
export async function postStart(ctx, { event_slug, previewKey, privacy_ack, privacy_notice_version }) {
  if (!event_slug) return resp(400, { error: "event_slug_obrigatorio" });
  const previewHash = await previaHash(previewKey);
  const binding = await rpc(ctx, "screener_op_get_binding", [event_slug, previewHash]);
  if (!binding) return resp(404, { error: "nao_encontrado" });
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "nao_encontrado" });
  if (!cap.podeIniciar) return resp(403, { error: "indisponivel", motivo: cap.motivo });
  if (!instrumentoConfere(binding)) return resp(409, { error: "instrumento_indisponivel" });
  // consentimento: exige ciência E o aviso VIGENTE (cliente não fabrica versão/horário)
  if (privacy_ack !== true) return resp(400, { error: "aviso_de_privacidade_obrigatorio" });
  const vigente = noticeVigente(binding);
  if (privacy_notice_version !== vigente) return resp(409, { error: "aviso_desatualizado", vigente });

  const token = gerarToken();                    // servidor
  const token_hash = await hashToken(token);     // só o hash vai ao banco
  const now = ctx.now();                          // horário do servidor (ignora o do cliente)
  const expires = new Date(now.getTime() + TTL_MS).toISOString();
  let criada;
  try {
    criada = await rpc(ctx, "screener_op_start", [event_slug, token_hash, vigente, now.toISOString(), expires, previewHash]);
  } catch (e) { return mapErroSql(e); }

  const pub = projecaoPublica(instrumento, { sessionSeed: token, assessmentUnitName: unidadeNome(binding) });
  return resp(201, {
    session_id: criada.session_id,
    token, // devolvido UMA vez; o banco só tem o hash
    instrument: pub.instrument,
    blocks: pub.blocks, // itens com ids opacos; SEM mapping
  });
}

// ---------- GET /session (retomar sessão) ----------
export async function getSession(ctx, { token, previewKey }) {
  const th = await hashToken(token || "");
  const data = await rpc(ctx, "screener_op_resume", [th, await previaHash(previewKey)]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });

  const pub = projecaoPublica(instrumento, { sessionSeed: token, assessmentUnitName: unidadeNome(binding) });
  const porItemStage = new Map();
  for (const [optId, alvo] of Object.entries(pub.mapping.options)) porItemStage.set(alvo.item + "|" + alvo.stage, optId);
  const answered = {};
  for (const r of data.responses) {
    const itemId = Object.keys(pub.mapping.items).find((k) => pub.mapping.items[k] === r.item_code);
    const optId = porItemStage.get(r.item_code + "|" + r.stage_code);
    if (itemId && optId) answered[itemId] = optId;
  }
  return resp(200, {
    instrument: pub.instrument,
    blocks: pub.blocks,
    answered,
    progress: { answered: data.responses.length, total: instrumento.items.length },
    pode_responder: cap.podeEscrever && sess.status === "open",
    submitted: sess.status === "submitted",
  });
}

// ---------- PUT /response (salvar resposta) ----------
export async function putResponse(ctx, { token, item_id, option_id, previewKey }) {
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  const data = await rpc(ctx, "screener_op_resume", [th, previewHash]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (sess.status === "submitted") return resp(409, { error: "resposta_impossivel_apos_submissao" });
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });

  const pub = projecaoPublica(instrumento, { sessionSeed: token, assessmentUnitName: unidadeNome(binding) });
  let alvo;
  try { alvo = resolverOpcao(pub.mapping, item_id, option_id); } // só ids opacos; stage vem do mapping
  catch { return resp(400, { error: "opcao_invalida" }); }

  let saved;
  try {
    saved = await rpc(ctx, "screener_op_save_response", [th, alvo.item_code, alvo.stage_code, previewHash]);
  } catch (e) { return mapErroSql(e); } // função trava a sessão e revalida atomicamente
  return resp(200, { ok: true, progress: { answered: saved.answered, total: instrumento.items.length } });
}

// ---------- POST /submit (finalizar submissão) ----------
export async function postSubmit(ctx, { token, previewKey }) {
  const th = await hashToken(token || "");
  const previewHash = await previaHash(previewKey);
  const data = await rpc(ctx, "screener_op_resume", [th, previewHash]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });

  // já submetida → idempotente: devolve o MESMO snapshot
  if (sess.status === "submitted") {
    const got = await rpc(ctx, "screener_op_get_result", [th, previewHash]);
    if (!got || !got.result) return resp(409, { error: "submetida_sem_snapshot" });
    return resp(200, paraPublico(got.result));
  }
  if (!cap.podeEscrever) return resp(403, { error: "escrita_indisponivel", motivo: cap.motivo });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });

  // ler → calcular (motor) → finalizar (função atômica). Se as respostas mudarem
  // entre a leitura e a finalização, a função rejeita e a edge relê/recalcula.
  const instrument_checksum = checksum();
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const atual = tentativa === 0 ? data : await rpc(ctx, "screener_op_resume", [th, previewHash]);
    if (!atual) return resp(404, { error: "sessao_nao_encontrada" });
    const respostas = {};
    for (const r of atual.responses) respostas[r.item_code] = r.stage_code;
    try { validarSubmissao(respostas); } catch (e) { return resp(400, { error: "submissao_incompleta", detalhe: String(e.message) }); }

    const resultado = calcular({ respostas, assessment_unit: { id: binding.event_slug, name: unidadeNome(binding) }, assessment_id: atual.session.id });
    // canônico com sort de code-unit (JS default) — casa com `order by ... collate "C"` na função
    const canon = Object.keys(respostas).sort().map((k) => k + ":" + respostas[k]).join("|");
    const input_checksum = await sha256Hex(canon);
    try {
      const fin = await rpc(ctx, "screener_op_finalize",
        [th, canon, resultado, instrument_checksum, input_checksum, resultado.scoring_version, resultado.report_version, previewHash]);
      return resp(200, paraPublico(fin.result));
    } catch (e) {
      ultimoErro = e;
      if (String(e.message).includes("respostas_mudaram")) continue; // relê
      return mapErroSql(e);
    }
  }
  // só chega aqui após esgotar as 3 tentativas por 'respostas_mudaram'
  void ultimoErro;
  return resp(409, { error: "respostas_instaveis" });
}

// ---------- GET /result (obter resultado) ----------
export async function getResult(ctx, { token, previewKey }) {
  const th = await hashToken(token || "");
  const data = await rpc(ctx, "screener_op_get_result", [th, await previaHash(previewKey)]);
  if (!data) return resp(404, { error: "sessao_nao_encontrada" });
  const binding = data.binding, sess = data.session;
  const cap = capacidades(binding, ctx.now());
  if (!cap.autorizado) return resp(404, { error: "sessao_nao_encontrada" });
  if (!cap.podeLerResultado) return resp(403, { error: "leitura_indisponivel" });
  if (!sessaoValida(sess, ctx.now())) return resp(410, { error: "sessao_expirada" });
  if (!data.result) return resp(404, { error: "sem_resultado" });
  return resp(200, paraPublico(data.result));
}

export const rotas = { getStart, postStart, getSession, putResponse, postSubmit, getResult };
