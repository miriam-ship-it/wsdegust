// =============================================================
// Transporte de PRODUÇÃO do V2: liga o frontend à edge (/v2/*).
// O cálculo acontece no SERVIDOR — este módulo só envia respostas e recebe o
// PublicResultIAV2 já sanitizado. O motor NUNCA roda no navegador em produção.
//
// Segurança: a credencial de prévia vai SÓ no header `x-preview-key`; o token de
// sessão SÓ no header `x-session-token`. Nunca em URL, query string ou corpo
// registrável. O token é mantido apenas em memória (fechada nesta closure).
// =============================================================

/** Erro de transporte com status/erro do servidor preservados. */
export class ErroTransporteV2 extends Error {
  constructor(mensagem, { status, corpo } = {}) { super(mensagem); this.name = "ErroTransporteV2"; this.status = status; this.corpo = corpo; }
}

/** Converte o valor interno (número/"na") no código público ('N3'/'NA'). */
const codigo = (v) => (v === "na" || v === "NA" ? "NA" : "N" + v);

/**
 * Cria o transporte assíncrono usado como `cfg.transporte(respostas, senioridade)`.
 * Faz o fluxo completo: start → salva a senioridade e cada resposta → submit,
 * e devolve o resultado público sanitizado.
 *
 * @param {object} cfg
 * @param {string} cfg.baseUrl               URL base da função edge (ex.: https://x.supabase.co/functions/v1/screener)
 * @param {string} cfg.eventSlug             slug do vínculo (evento)
 * @param {string|null} [cfg.previewKey]     credencial de prévia (só se internal_preview); vai no header
 * @param {string} [cfg.privacyNoticeVersion="v1"]
 * @param {typeof fetch} [cfg.fetchImpl]     injeção para teste
 * @returns {(respostas:Record<string,number|"na">, senioridade:string)=>Promise<object>}
 */
export function criarTransporteV2({ baseUrl, eventSlug, previewKey = null, privacyNoticeVersion = "v1", fetchImpl } = {}) {
  if (!baseUrl || !eventSlug) throw new Error("criarTransporteV2: baseUrl e eventSlug são obrigatórios");
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const base = String(baseUrl).replace(/\/+$/, "");

  const cabecalhos = (extra = {}) => {
    const h = { "content-type": "application/json", ...extra };
    if (previewKey) h["x-preview-key"] = previewKey; // credencial SÓ no header
    return h;
  };
  async function pedir(rota, { method, token, body } = {}) {
    const extra = token ? { "x-session-token": token } : {}; // token SÓ no header
    const res = await f(base + rota, { method, headers: cabecalhos(extra), body: body ? JSON.stringify(body) : undefined });
    let corpo = {};
    try { corpo = await res.json(); } catch { /* corpo vazio/ inválido */ }
    if (!res.ok) throw new ErroTransporteV2(corpo.error || ("http_" + res.status), { status: res.status, corpo });
    return corpo;
  }

  return async function transporte(respostas, senioridade) {
    const start = await pedir("/v2/start", {
      method: "POST",
      body: { event_slug: eventSlug, privacy_ack: true, privacy_notice_version: privacyNoticeVersion },
    });
    const token = start.token;
    if (!token) throw new ErroTransporteV2("sem_token", { status: 500, corpo: start });

    await pedir("/v2/response", { method: "PUT", token, body: { item_code: "SENIORIDADE", answer_code: senioridade } });
    for (const [item_code, v] of Object.entries(respostas)) {
      await pedir("/v2/response", { method: "PUT", token, body: { item_code, answer_code: codigo(v) } });
    }
    return await pedir("/v2/submit", { method: "POST", token, body: {} });
  };
}
