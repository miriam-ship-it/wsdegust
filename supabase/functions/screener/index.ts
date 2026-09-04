// Edge roteadora do screener (Deno) — COLA FINA.
//
// Toda a lógica de negócio está em screener/edge/*.mjs (runtime-agnóstico, testado)
// e nas 6 funções SECURITY DEFINER (a fronteira). A política HTTP (CORS, métodos,
// limite de corpo) está em screener/edge/http.mjs, também testável em node.
//
// Conexão: injete SCREENER_DB_POOLER_URL (transaction pooler, com senha, como
// SECRET da função; o prefixo SUPABASE_ é reservado). O papel dessa URL DEVE ser
// `screener_runtime` (LOGIN, NOINHERIT, sem BYPASSRLS, sem privilégio de tabela —
// só EXECUTE nas 6 funções), NUNCA `postgres`. Fallback SUPABASE_DB_URL só p/ dev.
// prepare:false e max:1 por instância.
//
// Token de sessão: SEMPRE no header x-session-token (nunca query). Credencial de
// prévia: header x-preview-key (a edge envia só o sha256 às funções).
// verify_jwt=false (config.toml): o screener é público sem identidade no Auth; a
// autorização é do próprio handler (credencial/token/estado/vigência/RPC).
import postgres from "npm:postgres@3";
import * as H from "../../../screener/edge/handlers.mjs";
import {
  metodosDaRota, allowDaRota, parseAllowlist, avaliarOrigem, corsHeaders,
  preflightHeaders, headersSolicitadosPermitidos, lerCorpoJson,
} from "../../../screener/edge/http.mjs";

const MAX_CORPO_BYTES = 16384; // 16 KiB
const dbUrl = Deno.env.get("SCREENER_DB_POOLER_URL") ?? Deno.env.get("SUPABASE_DB_URL")!;
const sql = postgres(dbUrl, { prepare: false, max: 1 });
const allowlist = parseAllowlist(Deno.env.get("SCREENER_CORS_ORIGINS"));

const ctx = {
  q: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }),
  now: () => new Date(),
  previewKeyHash: null,
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/.*\/screener/, "") || "/";
  const origin = req.headers.get("origin") ?? undefined;

  // CORS: origem presente e não autorizada → 403 (independe da rota/método).
  const co = avaliarOrigem(origin, allowlist);
  if (co.bloqueado) return json(403, { error: "origem_nao_autorizada" }, { vary: "Origin" });
  const cors: Record<string, string> = co.permitido ? corsHeaders(origin) as Record<string, string> : {};

  // Preflight: só responde para origem + método + headers permitidos.
  if (req.method === "OPTIONS") {
    if (!co.permitido) return new Response(null, { status: 403, headers: { vary: "Origin" } });
    const metodos = metodosDaRota(rota);
    const pedido = req.headers.get("access-control-request-method");
    if (!metodos) return json(404, { error: "rota_desconhecida" }, cors);
    if (pedido && !metodos.includes(pedido)) return json(405, { error: "metodo_nao_permitido" }, { ...cors, allow: allowDaRota(rota) });
    if (!headersSolicitadosPermitidos(req.headers.get("access-control-request-headers"))) {
      return new Response(null, { status: 403, headers: { vary: "Origin" } });
    }
    return new Response(null, { status: 204, headers: preflightHeaders(origin!, rota) as Record<string, string> });
  }

  // Método permitido para a rota.
  const metodos = metodosDaRota(rota);
  if (!metodos) return json(404, { error: "rota_desconhecida" }, cors);
  if (!metodos.includes(req.method)) return json(405, { error: "metodo_nao_permitido" }, { ...cors, allow: allowDaRota(rota) });

  // Corpo com teto de 16 KiB (confere Content-Length e lê o stream incrementalmente).
  let body: Record<string, unknown> = {};
  if (req.method !== "GET") {
    const r = await lerCorpoJson(req, MAX_CORPO_BYTES);
    if ("erro" in r) return json(413, { error: "corpo_grande_demais" }, cors);
    body = r.valor as Record<string, unknown>;
  }

  const previewKey = req.headers.get("x-preview-key") ?? undefined;
  const sessionToken = req.headers.get("x-session-token") ?? undefined;
  const q = Object.fromEntries(url.searchParams);
  // deno-lint-ignore no-explicit-any
  const a: any = { ...q, ...body, previewKey, token: sessionToken ?? (body as { token?: string }).token };

  try {
    let r: { status: number; body: unknown };
    if (req.method === "GET" && rota === "/start") r = await H.getStart(ctx, a);
    else if (req.method === "POST" && rota === "/start") r = await H.postStart(ctx, a);
    else if (req.method === "GET" && rota === "/session") r = await H.getSession(ctx, a);
    else if (req.method === "PUT" && rota === "/response") r = await H.putResponse(ctx, a);
    else if (req.method === "POST" && rota === "/submit") r = await H.postSubmit(ctx, a);
    else if (req.method === "GET" && rota === "/result") r = await H.getResult(ctx, a);
    else return json(404, { error: "rota_desconhecida" }, cors);
    return json(r.status, r.body, cors);
  } catch (e) {
    return json(500, { error: String((e as Error).message) }, cors);
  }
});
