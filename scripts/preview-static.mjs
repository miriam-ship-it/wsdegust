// Servidor estático do diretório publicado (frontend/), sem edge.
// Serve para conferir o artefato exatamente como o Netlify o publica —
// por isso NÃO injeta configuração de desenvolvimento.
//   node scripts/preview-static.mjs  →  http://localhost:4601/rhia.html
import { servirEstatico, subir } from "./servidor-estatico.mjs";

const PORTA = Number(process.env.PORT || 4601);
subir(async (req, res) => {
  if (await servirEstatico(req, res)) return;
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("404");
}, PORTA, (p) => `estático em http://localhost:${p}/rhia.html (sem edge — o formulário não vai carregar as questões)`);
