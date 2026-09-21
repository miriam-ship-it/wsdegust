// =============================================================
// Prepara `supabase/functions/diagnostico/_motor/` para o deploy.
//
// A edge roda o MESMO motor dos testes. Ela poderia importá-lo por caminho
// relativo (`../../../screener/publico/...`), como faz a gate-and-send — isso
// funciona com a CLI do Supabase, que empacota a árvore. Mas o deploy pela API
// envia uma lista de arquivos relativos à pasta da função, e caminho para fora
// dela não existe ali.
//
// Então o motor é COPIADO para dentro da função no momento do deploy. Copiado,
// nunca editado: `_motor/` é gerado e ignorado pelo git, e o teste
// `screener/publico/edge.test.mjs` reprova se a cópia divergir da fonte.
//
//     node scripts/preparar-edge-diagnostico.mjs
// =============================================================

import { mkdirSync, copyFileSync, rmSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTE = join(RAIZ, "screener", "publico");
const DESTINO = join(RAIZ, "supabase", "functions", "diagnostico", "_motor");

/** Os módulos que a edge precisa. Caminhos relativos a `screener/publico/`. */
export const MODULOS = [
  "definicao.mjs",
  "motor.mjs",
  "devolutiva.mjs",
  "conteudo-devolutiva.mjs",
  "relatorio-html.mjs",
  "instrumento/definicao-embutida.mjs",
];

export function preparar() {
  rmSync(DESTINO, { recursive: true, force: true });
  mkdirSync(join(DESTINO, "instrumento"), { recursive: true });
  for (const m of MODULOS) copyFileSync(join(FONTE, m), join(DESTINO, m));
  return MODULOS;
}

/** Os arquivos no formato que a API de deploy espera. */
export function arquivosParaDeploy() {
  const out = [{
    name: "index.ts",
    content: readFileSync(join(RAIZ, "supabase", "functions", "diagnostico", "index.ts"), "utf8"),
  }];
  for (const m of MODULOS) {
    out.push({ name: `_motor/${m}`, content: readFileSync(join(FONTE, m), "utf8") });
  }
  return out;
}

// `process.argv[1]` e undefined quando o modulo e importado por `node -e`
// ou por um teste — sem a guarda, so importar este arquivo derrubava o
// processo dentro de pathToFileURL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const m = preparar();
  console.log(`_motor/ preparado com ${m.length} modulos:`);
  for (const x of m) console.log("  ", x);
}
