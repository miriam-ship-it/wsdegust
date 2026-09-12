// Peças compartilhadas pelos servidores de desenvolvimento.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLICO = path.join(RAIZ, "frontend");

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

/** Resolve o caminho dentro de frontend/, barrando travessia (../). */
export function resolverPublico(urlPath) {
  const limpo = decodeURIComponent(String(urlPath || "/").split("?")[0]);
  const rel = limpo === "/" ? "/rhia.html" : limpo;
  const destino = path.join(PUBLICO, rel);
  const dentro = path.resolve(destino).startsWith(path.resolve(PUBLICO));
  return dentro && fs.existsSync(destino) && fs.statSync(destino).isFile() ? destino : null;
}

/**
 * Serve um arquivo de frontend/. `transformarHtml` permite injetar configuração
 * de desenvolvimento no HTML sem alterar o arquivo publicado.
 * @returns {Promise<boolean>} true se serviu.
 */
export async function servirEstatico(req, res, transformarHtml) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const arquivo = resolverPublico(req.url);
  if (!arquivo) return false;
  const ext = path.extname(arquivo).toLowerCase();
  const tipo = TIPOS[ext] || "application/octet-stream";
  let corpo = fs.readFileSync(arquivo);
  if (ext === ".html" && typeof transformarHtml === "function") {
    corpo = Buffer.from(transformarHtml(corpo.toString("utf8")), "utf8");
  }
  res.writeHead(200, { "content-type": tipo, "cache-control": "no-store", "content-length": corpo.length });
  res.end(req.method === "HEAD" ? undefined : corpo);
  return true;
}

/** Sobe um servidor e imprime a URL. Devolve o server (para fechar em teste). */
export function subir(handler, porta, mensagem) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((e) => {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(e && e.message || e) }));
    });
  });
  server.listen(porta, () => {
    const p = server.address().port;
    if (mensagem) console.log(mensagem(p));
  });
  return server;
}
