// Edge roteadora do screener (Deno) — COLA FINA. NÃO DEPLOYADA no corte 3.
//
// Toda a lógica está em screener/edge/*.mjs (runtime-agnóstico, testado). Aqui só
// traduzimos HTTP → handlers e ligamos o `ctx` a um Postgres com service_role.
// O service_role vem do AMBIENTE, nunca do bundle público entregue ao navegador.
//
// Conexão: usa a connection string do projeto (env), com pooler de sessão para
// suportar a transação do /submit. Sem deploy, estes envs ainda não existem.
import postgres from "npm:postgres@3";
import * as H from "../../../screener/edge/handlers.mjs";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });

const ctx = {
  q: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }),
  tx: async (fn: (q: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<void>) =>
    sql.begin((tx) => fn(async (t, p = []) => ({ rows: await tx.unsafe(t, p as never[]) }))),
  now: () => new Date(),
  previewKeyHash: Deno.env.get("SCREENER_PREVIEW_KEY_SHA256") ?? null,
};

const json = (r: { status: number; body: unknown }) =>
  new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/.*\/screener/, "") || "/";
  const previewKey = req.headers.get("x-preview-key") ?? undefined;
  const q = Object.fromEntries(url.searchParams);
  const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
  const a = { ...q, ...body, previewKey };

  try {
    if (req.method === "GET" && rota === "/start") return json(await H.getStart(ctx, a));
    if (req.method === "POST" && rota === "/start") return json(await H.postStart(ctx, a));
    if (req.method === "GET" && rota === "/session") return json(await H.getSession(ctx, a));
    if (req.method === "PUT" && rota === "/response") return json(await H.putResponse(ctx, a));
    if (req.method === "POST" && rota === "/submit") return json(await H.postSubmit(ctx, a));
    if (req.method === "GET" && rota === "/result") return json(await H.getResult(ctx, a));
    return json({ status: 404, body: { error: "rota_desconhecida" } });
  } catch (e) {
    return json({ status: 500, body: { error: String((e as Error).message) } });
  }
});
