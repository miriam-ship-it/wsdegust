// Regenera `screener/publico/instrumento/definicao-embutida.mjs` a partir do
// JSON auditável. Rode sempre que o instrumento mudar:
//
//     node scripts/gerar-definicao-embutida.mjs
//
// O teste `screener/publico/definicao.test.mjs` reprova se o módulo embutido
// estiver defasado em relação ao JSON — então esquecer de rodar isto quebra o
// build, em vez de publicar um instrumento errado em silêncio.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = join(RAIZ, "screener", "publico", "instrumento", "DIAGNOSTICO_BOOMIT_40.json");
const MJS_PATH = join(RAIZ, "screener", "publico", "instrumento", "definicao-embutida.mjs");

// Normaliza CRLF → LF antes do hash: o repo é editado no Windows e o hash não
// pode mudar por causa da quebra de linha.
export function conteudoNormalizado(caminho = JSON_PATH) {
  return readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");
}

export function gerar() {
  const cru = conteudoNormalizado();
  const sha = createHash("sha256").update(cru).digest("hex");
  const obj = JSON.parse(cru);
  return `// GERADO por scripts/gerar-definicao-embutida.mjs — NAO EDITAR A MAO.
//
// A fonte auditavel e instrumento/DIAGNOSTICO_BOOMIT_40.json. Este modulo existe
// porque o motor tambem roda na edge (Deno), onde ler um JSON do disco relativo
// ao modulo e fragil. \`definicao.test.mjs\` prova que os dois nao divergem.

export const SHA256 = ${JSON.stringify(sha)};

export const INSTRUMENTO = ${JSON.stringify(obj, null, 1)};
`;
}

// pathToFileURL, e não montar a string na mão: no Windows o caminho vira
// `file:///C:/...` (três barras) e a comparação com `file://C:/...` dava
// falso em silêncio — o gerador não escrevia, o script saía com status 0, e o
// instrumento embutido ficava para trás sem ninguém perceber.
// `process.argv[1]` e undefined quando o modulo e importado por `node -e`
// ou por um teste — sem a guarda, so importar este arquivo derrubava o
// processo dentro de pathToFileURL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(MJS_PATH, gerar());
  console.log("definicao-embutida.mjs regenerada");
}
