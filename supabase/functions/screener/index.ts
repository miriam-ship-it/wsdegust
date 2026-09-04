// Edge roteadora do screener (Deno) — COLA FINA.
//
// Toda a lógica está em screener/edge/*.mjs (runtime-agnóstico, testado). Aqui só
// traduzimos HTTP → handlers e ligamos o `ctx` a um Postgres com service_role.
// O service_role vem do AMBIENTE, nunca do bundle público entregue ao navegador.
//
// PROVADO em branch efêmero do Supabase (03/09/2026): `deno check` + grafo de
// bundle, deploy real, as 6 operações por HTTP, concorrência (8 submits
// simultâneos → 1 snapshot; PUT concorrente não altera o pontuado), ciclo de
// credenciais e ausência de segredo no bundle. Dois defeitos que SÓ o Postgres
// real revelou (o pglite mascarava) foram corrigidos:
//   (a) o snapshot precisa receber o OBJETO do resultado — passar a string
//       JSON.stringify faz o postgres.js codificar duas vezes (jsonb string
//       escalar) e viola o check screener_snap_result_obj. Corrigido em handlers.
//   (b) conectar pelo TRANSACTION POOLER (Supavisor, porta 6543), não pela
//       conexão direta: sob concorrência de instâncias a direta esgota os slots
//       ("remaining connection slots are reserved for SUPERUSER").
//
// Conexão: injete SCREENER_DB_POOLER_URL (transaction pooler, com senha, como
// SECRET da função; o prefixo SUPABASE_ é reservado). O papel dessa URL DEVE ser
// `screener_runtime`
// (LOGIN, NOINHERIT, sem BYPASSRLS, sem privilégio de tabela — só EXECUTE nas 6
// funções screener_op_*), NUNCA `postgres` amplo. A senha é criada fora da
// migration e vive só no secret. O fallback SUPABASE_DB_URL (papel postgres,
// direto) é apenas para dev/baixa carga. prepare:false e max:1 por instância.
//
// Token de sessão: SEMPRE via header x-session-token (nunca query string — o
// gateway registra a URL inteira, e o token na query vazaria nos logs de acesso).
import postgres from "npm:postgres@3";
import * as H from "../../../screener/edge/handlers.mjs";

// nome do secret NÃO pode começar com SUPABASE_ (prefixo reservado pelo Supabase)
const dbUrl = Deno.env.get("SCREENER_DB_POOLER_URL") ?? Deno.env.get("SUPABASE_DB_URL")!;
const sql = postgres(dbUrl, { prepare: false, max: 1 });

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
  const sessionToken = req.headers.get("x-session-token") ?? undefined;
  const q = Object.fromEntries(url.searchParams);
  const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
  // token só do header (ou do corpo em POST) — nunca da query, p/ não vazar em log
  const a = { ...q, ...body, previewKey, token: sessionToken ?? (body as { token?: string }).token };

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
