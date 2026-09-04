// Política HTTP da edge do screener: CORS, métodos por rota e limite de corpo.
// Runtime-agnóstico (Web APIs: URL, Request, ReadableStream, TextDecoder). Testável
// em node --test. CORS NÃO é controle contra chamadas diretas (só restringe
// navegadores) — o bloqueio real é token/credencial/estado/vigência/RPC.

// Headers que o cliente pode enviar (allowlist de request headers no preflight).
export const HEADERS_PERMITIDOS = ["content-type", "x-preview-key", "x-session-token", "apikey", "authorization"];

// Métodos aceitos por rota (OPTIONS é tratado à parte, para preflight).
const METODOS = {
  "/start": ["GET", "POST"],
  "/session": ["GET"],
  "/response": ["PUT"],
  "/submit": ["POST"],
  "/result": ["GET"],
};
/** Métodos da rota (sem OPTIONS), ou null se a rota não existe. */
export function metodosDaRota(rota) { return METODOS[rota] ? METODOS[rota].slice() : null; }
/** Valor do header Allow para uma rota (inclui OPTIONS). */
export function allowDaRota(rota) { return (metodosDaRota(rota) || []).concat("OPTIONS").join(", "); }

/**
 * Valida e normaliza a allowlist de origens (env `SCREENER_CORS_ORIGINS`, CSV).
 * Rejeita `*`, `null`, credenciais, path, query, fragmento; exige https em produção.
 * @returns {Set<string>} origens válidas (ex.: "https://app.exemplo.com")
 */
export function parseAllowlist(valor, { exigirHttps = true } = {}) {
  const out = new Set();
  for (const bruto of String(valor || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (bruto === "*" || bruto === "null") continue;      // curingas proibidos
    let u;
    try { u = new URL(bruto); } catch { continue; }        // precisa ser URL absoluta válida
    if (u.username || u.password) continue;                // sem credenciais
    if (u.search || u.hash) continue;                      // sem query/fragmento
    if (u.origin !== bruto) continue;                      // sem path/barra final/porta divergente
    if (exigirHttps && u.protocol !== "https:") continue;  // só https em produção
    out.add(u.origin);
  }
  return out;
}

/**
 * Decide o tratamento CORS de um Origin.
 * - sem Origin → segue (CORS não autentica chamada direta), sem headers CORS.
 * - Origin na allowlist → permitido, com headers.
 * - Origin presente e fora da allowlist → bloqueado (403).
 */
export function avaliarOrigem(origin, allowlist) {
  if (!origin) return { semOrigem: true };
  if (allowlist.has(origin)) return { permitido: true, origin };
  return { bloqueado: true };
}

/** Headers CORS de resposta para uma origem permitida (sem allow-credentials). */
export function corsHeaders(origin) {
  return origin ? { "access-control-allow-origin": origin, "vary": "Origin" } : { "vary": "Origin" };
}

/** Headers de resposta ao preflight (OPTIONS) para origem permitida. */
export function preflightHeaders(origin, rota) {
  return {
    ...corsHeaders(origin),
    "access-control-allow-methods": allowDaRota(rota),
    "access-control-allow-headers": HEADERS_PERMITIDOS.join(", "),
    "access-control-max-age": "600",
  };
}

/** Todos os `Access-Control-Request-Headers` pedidos estão na allowlist? */
export function headersSolicitadosPermitidos(reqHeadersCsv) {
  const pedidos = String(reqHeadersCsv || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return pedidos.every((h) => HEADERS_PERMITIDOS.includes(h));
}

/**
 * Lê o corpo JSON com teto de bytes. Confere `Content-Length` E lê o stream de
 * forma incremental (não confia só no header). Corpo acima do teto → {erro:413}.
 * @param {Request} req @param {number} maxBytes
 * @returns {Promise<{valor:object}|{erro:number}>}
 */
export async function lerCorpoJson(req, maxBytes = 16384) {
  const cl = req.headers.get("content-length");
  if (cl !== null && cl !== "" && Number(cl) > maxBytes) return { erro: 413 };
  if (!req.body) return { valor: {} };
  const reader = req.body.getReader();
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } return { erro: 413 }; }
      chunks.push(value);
    }
  } catch { return { valor: {} }; }
  if (total === 0) return { valor: {} };
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  try { return { valor: JSON.parse(new TextDecoder().decode(buf)) }; }
  catch { return { valor: {} }; }  // corpo inválido → vazio; os handlers validam o conteúdo
}
