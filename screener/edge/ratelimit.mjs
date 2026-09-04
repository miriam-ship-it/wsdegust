// Helpers de rate limiting da edge (runtime-agnóstico; Web Crypto). Testável em node.
// A edge NUNCA envia IP/token em claro ao banco: só o HMAC opaco. A chave HMAC
// também não deve ir aos logs.

const RE_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** IPv4 (octetos 0–255) ou IPv6 (validado por `new URL`). */
export function ehIpValido(s) {
  if (!s || typeof s !== "string") return false;
  const m = RE_IPV4.exec(s);
  if (m) return m.slice(1).every((o) => o.length <= 3 && Number(o) <= 255);
  try { const u = new URL(`http://[${s}]`); return u.hostname === `[${s.toLowerCase()}]`; } catch { return false; }
}

/**
 * Extrai o IP do cliente. Fonte de AUTORIDADE: `cf-connecting-ip` (validado).
 * NÃO usa x-forwarded-for como autoridade (cliente pode interferir na cadeia),
 * nem aceita IP de body/query. Ausente/inválido → bucket compartilhado `unknown`.
 * @param {(nome:string)=>(string|null|undefined)} getHeader
 * @returns {string}
 */
export function extrairIp(getHeader) {
  const bruto = (getHeader("cf-connecting-ip") || "").trim();
  return ehIpValido(bruto) ? bruto : "unknown";
}

/**
 * Chave opaca para o rate limit: HMAC-SHA256(secret, "tipo:event_slug:id") em hex.
 * O banco recebe só isso — nunca o IP/token em claro.
 * @returns {Promise<string>} 64 hex
 */
export async function chaveRate(secret, tipo, eventSlug, identificador) {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const msg = `${tipo}:${eventSlug ?? ""}:${identificador ?? ""}`;
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
