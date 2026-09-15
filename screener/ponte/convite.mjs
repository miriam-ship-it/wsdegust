// O CONVITE — o que liga as duas metades na mesma pessoa.
//
// Ele existe por uma restrição de segurança, não por gosto de desenho. A regra
// da casa é que token de sessão só trafega em cabeçalho, nunca em URL. Pôr o
// `token_sessao` da liderança no link do rhia o exporia em histórico de
// navegador, em link compartilhado e em `Referer`. O convite é outra coisa:
// opaco, de uso único, com validade, e **não dá acesso a nada** da liderança —
// só diz de quem é aquela sessão de rhia.
//
// E o código cru nunca chega ao banco: guardamos só o sha256, como o
// `token_hash` das sessões.
//
// Runtime-agnóstico de propósito: `crypto.getRandomValues` e `crypto.subtle`
// existem igual em Deno (a edge) e em Node 18+ (os testes). Uma implementação
// só, testada onde é barato testar.

/** 32 bytes de aleatoriedade em hexa — 256 bits, o mesmo porte do token. */
export function gerarCodigo() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return hexa(b);
}

export async function hashDoCodigo(codigo) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codigo));
  return hexa(new Uint8Array(d));
}

const hexa = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * O link que vai no e-mail de fecho da liderança.
 * Preserva o que a base já tiver de query — a base é configuração, e configuração
 * com `?utm=...` não pode virar link quebrado.
 */
export function linkDoConvite(base, codigo) {
  const u = new URL(base);
  u.searchParams.set("convite", codigo);
  return u.toString();
}

/**
 * Emite o convite e devolve o código CRU, que só existe aqui e no e-mail.
 *
 * `tokenSessao` é o token da sessão de liderança, lido do registro do
 * respondente no servidor — nunca de corpo de requisição. A RPC nem aceita um
 * `respondente_id`: ela deriva a pessoa do token, dentro do banco, justamente
 * para que ninguém possa emitir convite para outra pessoa.
 *
 * Nunca lança: uma falha aqui não pode impedir a entrega do relatório, que é o
 * que a pessoa pediu. Devolve o motivo para o chamador registrar.
 */
export async function emitirConvite({ q, tokenSessao, horas = 720 }) {
  if (!tokenSessao) return { status: "sem_token_de_sessao", codigo: null };
  const codigo = gerarCodigo();
  let r = null;
  try {
    const saida = await q(
      "select public.screener_rhia_op_emitir_convite($1,$2,$3) as r",
      [tokenSessao, await hashDoCodigo(codigo), horas],
    );
    r = saida?.rows?.[0]?.r ?? null;
  } catch (e) {
    return { status: "falhou", erro: String(e?.message ?? e), codigo: null };
  }
  if (!r) return { status: "sem_resposta", codigo: null };
  if (r.status !== "ok") return { status: r.status, codigo: null };
  return { status: "ok", codigo, convite_id: r.convite_id, ja_existia: r.ja_existia === true };
}

/** Lê o código do convite de uma URL de chegada. Formato conferido aqui. */
export function convitePresenteNaUrl(href) {
  let v = null;
  try { v = new URL(href).searchParams.get("convite"); } catch { return null; }
  return v && /^[0-9a-f]{64}$/.test(v) ? v : null;
}

/**
 * A mesma URL sem o convite, para trocar o endereço da barra assim que ele for
 * lido. O código é de uso único, mas enquanto está na barra ele viaja em
 * histórico, em "compartilhar esta página" e no `Referer` de qualquer link que a
 * pessoa clique depois.
 */
export function urlSemConvite(href) {
  const u = new URL(href);
  u.searchParams.delete("convite");
  return u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash;
}
