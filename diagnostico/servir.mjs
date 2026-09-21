// Servidor estático local do site do Diagnóstico Boomit.
//
// Serve `diagnostico/public/` — exatamente o que o Netlify publica, e não
// `src/`: conferir no navegador uma pasta diferente da que vai ao ar é como
// nasce o "funcionava na minha máquina".
//
//     node diagnostico/servir.mjs        → http://localhost:4700
//
// Reconstroi a cada requisição de HTML, para não haver a etapa de "esqueci de
// rodar o build" entre editar e olhar.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { construir } from "./build.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(AQUI, "public");
const PORTA = Number(process.env.PORTA || 4700);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Resolve dentro de public/, barrando travessia (../). */
export function resolver(urlPath) {
  const limpo = decodeURIComponent(String(urlPath || "/").split("?")[0]);
  const rel = limpo === "/" ? "/index.html" : limpo;
  const destino = path.join(PUBLICO, rel);
  const dentro = path.resolve(destino).startsWith(path.resolve(PUBLICO));
  return dentro && fs.existsSync(destino) && fs.statSync(destino).isFile() ? destino : null;
}

construir();

http
  .createServer((req, res) => {
    if (req.url === "/" || req.url?.endsWith(".html")) construir();
    const arquivo = resolver(req.url);
    if (!arquivo) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("404");
    }
    res.writeHead(200, {
      "content-type": TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(arquivo).pipe(res);
  })
  .listen(PORTA, () => console.log(`Diagnóstico Boomit em http://localhost:${PORTA}`));
