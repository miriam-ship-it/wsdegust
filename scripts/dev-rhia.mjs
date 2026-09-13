// =============================================================
// DEV SERVER — o diagnóstico rodando inteiro na sua máquina.
//
// Sobe em uma porta só: (1) os arquivos de `frontend/` e (2) a edge do screener
// em /functions/v1/screener/*, ligada a um Postgres EFÊMERO (pglite) com as
// migrations do repositório aplicadas — inclusive a carga do instrumento e o
// vínculo público. Nada toca a Supabase; o banco vive em memória e some ao sair.
//
// A fronteira é a mesma da produção: o motor roda aqui (servidor), o navegador
// recebe só o modelo público. O HTML publicado NÃO é alterado — a configuração
// de desenvolvimento é injetada na resposta, em memória.
//
//   npm run dev  →  http://localhost:4600/rhia.html
// =============================================================
import { createRequire } from "node:module";
import fs, { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { servirEstatico, subir, RAIZ } from "./servidor-estatico.mjs";
import * as H from "../screener/edge/handlers.mjs";
import * as HR from "../screener/edge/handlers-rhia.mjs";
import { instrumento, canonicalize } from "../screener/rhia/definicao.mjs";

// pglite vive em screener/loader/behavioral/node_modules (é dependência de teste).
const require = createRequire(path.join(RAIZ, "screener/loader/behavioral/package.json"));
let PGlite;
try {
  ({ PGlite } = require("@electric-sql/pglite"));
} catch {
  // Num clone novo essa dependência ainda não foi instalada. Diga o que fazer,
  // em vez de deixar o stack trace do require falar pela ferramenta.
  console.error(
    "\nO banco de desenvolvimento (pglite) ainda não foi instalado.\n" +
    "Rode uma vez:  npm run setup\n" +
    "(equivale a `npm ci` dentro de screener/loader/behavioral, onde essa dependência vive.)\n"
  );
  process.exit(1);
}
const { createHash } = await import("node:crypto");

const MIGR = path.join(RAIZ, "supabase", "migrations");
const ler = (f) => fs.readFileSync(path.join(MIGR, f), "utf8");

/** Banco efêmero com o schema do screener + rhia + o instrumento carregado. */
export async function prepararBanco() {
  const db = new PGlite();
  await db.exec("create role anon noinherit; create role authenticated noinherit; create role service_role noinherit;");
  await db.exec(ler("20260902143339_screener_tabelas_isoladas.sql"));
  await db.exec(ler("20260903120000_screener_rpc_e_papeis.sql"));
  await db.exec(ler("20260912120000_screener_rhia_tabelas_e_rpc.sql"));
  // Carga do instrumento + vínculo público, exatamente a migration versionada.
  await db.exec(ler("20260913120000_screener_rhia_carga_publica.sql"));
  // Confere que a carga deixou o banco coerente com o repositório.
  const somaRepo = createHash("sha256").update(canonicalize(instrumento), "utf8").digest("hex");
  const { rows } = await db.query(
    "select checksum from public.screener_instrument_versions where instrument_code=$1 and instrument_version=$2",
    [instrumento.instrument_id, instrumento.instrument_version]);
  if (!rows[0]) throw new Error("a carga não inseriu o instrumento");
  if (rows[0].checksum !== somaRepo) throw new Error("checksum da carga difere do instrumento do repositório");
  return db;
}

/** ctx da edge sobre o banco efêmero (mesma forma do index.ts de produção). */
export function criarCtx(db) {
  return {
    q: async (texto, params = []) => db.query(texto, params),
    now: () => new Date(),
    rate: { ativo: false, secret: null }, // rate limiting fica desligado em dev
  };
}

const ROTAS = {
  "GET /start": H.getStart, "POST /start": H.postStart, "GET /session": H.getSession,
  "PUT /response": H.putResponse, "POST /submit": H.postSubmit, "GET /result": H.getResult,
  "POST /lead": H.postLead,
  "GET /rhia/start": HR.getStartRhia, "POST /rhia/start": HR.postStartRhia,
  "GET /rhia/session": HR.getSessionRhia, "PUT /rhia/response": HR.putResponseRhia,
  "POST /rhia/submit": HR.postSubmitRhia, "GET /rhia/result": HR.getResultRhia,
  "POST /rhia/lead": HR.postLeadRhia,
};
const PREFIXO = "/functions/v1/screener";

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  if (!partes.length) return {};
  try { return JSON.parse(Buffer.concat(partes).toString("utf8")); } catch { return {}; }
}

/** Injeta a configuração de dev logo antes de </head> (não altera o arquivo). */
export function injetarConfig(html, edgeUrl) {
  const tag = `<script>window.SCREENER_RHIA_CONFIG={EDGE_URL:${JSON.stringify(edgeUrl)},ANON_KEY:"dev-anon"};` +
    `window.SCREENER_CONFIG=Object.assign({},window.SCREENER_CONFIG,{EDGE_URL:${JSON.stringify(edgeUrl)},ANON_KEY:"dev-anon"});</script>`;
  return html.includes("</head>") ? html.replace("</head>", `${tag}\n</head>`) : tag + html;
}

export async function criarServidor({ porta = 4600 } = {}) {
  const db = await prepararBanco();
  const ctx = criarCtx(db);
  const server = subir(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const origem = req.headers.origin;
    // CORS aberto só para desenvolvimento local.
    if (origem && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem)) {
      res.setHeader("access-control-allow-origin", origem);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-headers", "content-type, x-preview-key, x-session-token, apikey, authorization");
      res.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
    }
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    if (url.pathname.startsWith(PREFIXO)) {
      const rota = url.pathname.slice(PREFIXO.length) || "/";
      const fn = ROTAS[`${req.method} ${rota}`];
      if (!fn) { res.writeHead(404, { "content-type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ error: "rota_desconhecida" })); }
      const corpo = req.method === "GET" ? {} : await lerCorpo(req);
      const a = {
        ...Object.fromEntries(url.searchParams), ...corpo,
        previewKey: req.headers["x-preview-key"] || undefined,
        token: req.headers["x-session-token"] || corpo.token, ipHmac: null,
      };
      const r = await fn(ctx, a);
      res.writeHead(r.status, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(r.body));
    }

    const edgeUrl = `http://localhost:${server.address().port}${PREFIXO}`;
    if (await servirEstatico(req, res, (html) => injetarConfig(html, edgeUrl))) return;
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
  }, porta, (p) => `Diagnóstico RH+IA em http://localhost:${p}/rhia.html  (banco efêmero; screener V1 em /screener.html)`);
  await new Promise((r) => server.once("listening", r));
  return { server, db, porta: server.address().port, fechar: async () => { server.close(); await db.close?.(); } };
}

// Execução direta: sobe e fica no ar.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await criarServidor({ porta: Number(process.env.PORT || 4600) });
}
