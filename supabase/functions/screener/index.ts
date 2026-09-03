// Edge roteadora do screener (Deno) — COLA FINA. NÃO DEPLOYADA no corte 3.
//
// Toda a lógica está em screener/edge/*.mjs (runtime-agnóstico, testado). Aqui só
// traduzimos HTTP → handlers e ligamos o `ctx` a um Postgres com service_role.
// O service_role vem do AMBIENTE, nunca do bundle público entregue ao navegador.
//
// Conexão: connection string do projeto (env). A ATOMICIDADE vive nas funções
// SQL (screener_save_response / screener_finalize_submission), então a cola só
// precisa de `q` (uma chamada por vez). Sem deploy, estes envs ainda não existem.
//
// ⚠️ GATE DE DEPLOY (corte proprio): antes de expor, provar (precisa de deno +
//    edge-runtime do Supabase, ausentes neste ambiente):
//    1) `deno check` deste wrapper e de TODOS os imports;
//    2) que os imports fora da pasta da função (../../../screener/*) entram no
//       bundle — senão, vendorizar sob supabase/functions/_shared ou usar import map;
//    3) inicialização local pelo runtime do Supabase;
//    4) teste HTTP das seis operações contra o wrapper real;
//    5) ausência de credencial literal no bundle e nos logs.
import postgres from "npm:postgres@3";
import * as H from "../../../screener/edge/handlers.mjs";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });

const ctx = {
  q: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }),
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
