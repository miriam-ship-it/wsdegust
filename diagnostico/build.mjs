// =============================================================
// Build do site dedicado do Diagnóstico Boomit.
//
// Monta `diagnostico/public/` com os arquivos próprios (src/) MAIS os ativos
// compartilhados que já vivem em `frontend/`: os tokens auditados do design
// system, o estilo do instrumento, a logo e os favicons.
//
// POR QUE COPIAR, e não duplicar à mão: tokens.css e screener.css são a fonte
// de verdade visual da casa. Um segundo arquivo com os mesmos valores é
// exatamente a defasagem que este projeto existe para não repetir — em um mês
// os dois divergem e ninguém sabe qual vale. Aqui existe uma cópia só, feita
// no build, e `fronteira.test.mjs` reprova se ela sair do lugar.
//
//   node diagnostico/build.mjs
// =============================================================

import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const SRC = join(AQUI, "src");
const PUBLIC = join(AQUI, "public");
const FRONTEND = join(RAIZ, "frontend");

/** Ativos compartilhados com o site principal. Nomes iguais dos dois lados. */
export const COMPARTILHADOS = [
  "tokens.css",
  "screener.css",
  "logo-boomit.png",
  "favicon-boomit-preto.png",
  "favicon-boomit-claro.png",
  "og-image.png",
];

/** O que o site publica. Nada além disto pode sair em `public/`. */
export const PROPRIOS = [
  "index.html", "diagnostico.mjs", "diagnostico.css",
  // O painel vai no MESMO site: é a mesma marca, o mesmo token de tema e o
  // mesmo CSS. Ele é público no sentido de estar no ar, e protegido pelo
  // Supabase Auth mais a RLS — nunca por estar escondido.
  "admin.html", "admin.mjs", "admin.css",
  // A lógica pura, importada pelos dois. Esquecê-la aqui publicava um site
  // que dava 404 no import e não saía da tela de carregando — por isso o
  // teste de fronteira confere todo import relativo contra o que foi montado.
  "logica.mjs",
];

export function construir() {
  rmSync(PUBLIC, { recursive: true, force: true });
  mkdirSync(PUBLIC, { recursive: true });
  for (const f of PROPRIOS) copyFileSync(join(SRC, f), join(PUBLIC, f));
  for (const f of COMPARTILHADOS) {
    const origem = join(FRONTEND, f);
    if (!existsSync(origem)) throw new Error(`ativo compartilhado ausente em frontend/: ${f}`);
    copyFileSync(origem, join(PUBLIC, f));
  }
  return readdirSync(PUBLIC).sort();
}

// `process.argv[1]` e undefined quando o modulo e importado por `node -e`
// ou por um teste — sem a guarda, so importar este arquivo derrubava o
// processo dentro de pathToFileURL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arquivos = construir();
  console.log(`diagnostico/public/ montado com ${arquivos.length} arquivos:`);
  for (const a of arquivos) console.log("  ", a);
}
