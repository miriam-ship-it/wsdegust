// Gera `screener/documento/estilo.mjs` — o CSS do produto como módulo, para que
// a EDGE possa montar o documento imprimível com exatamente o mesmo estilo da
// tela.
//
// POR QUE UM ARQUIVO GERADO, e não uma segunda folha de estilo escrita à mão:
// porque duas folhas divergem. Esta sessão já viu o que acontece quando a tela e
// o PDF têm implementações separadas — a tela dizia R$ 39k–91k e o PDF dizia
// R$ 62k–273k para a mesma pessoa. A fonte de verdade continua sendo os `.css`;
// este módulo é derivado deles, e `screener/documento/estilo.test.mjs` reprova se
// ficar velho.
//
// Uso:  node scripts/gerar-estilo-documento.mjs        # escreve o arquivo
//       node scripts/gerar-estilo-documento.mjs --ver  # só imprime se mudou

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, "..");
export const FONTES = ["tokens.css", "screener.css", "rhia.css"];
// FORA do diretório publicado: o CSS já vai ao navegador pelos `<link>` do
// HTML, e publicar 76 KB de novo, em JavaScript, seria pagar duas vezes pela
// mesma folha. Quem precisa dele como string é a EDGE.
export const DESTINO = path.join(RAIZ, "screener", "documento", "estilo.mjs");

/** O CSS concatenado, na ordem em que `rhia.html` o carrega. */
export function montarCss(raiz = RAIZ) {
  return FONTES
    .map((f) => {
      // Quebra de linha normalizada para LF, sempre. Motivo concreto: este CSS
      // vai para dentro de um TEMPLATE LITERAL, e o JavaScript normaliza
      // terminador de linha ao interpretar um — entao o valor em memoria nunca
      // seria identico a um arquivo em CRLF, e a comparacao com a folha de
      // origem falharia sem que nada estivesse errado.
      const css = fs.readFileSync(path.join(raiz, "frontend", f), "utf8").replace(/\r\n/g, "\n");
      return `/* ${f} */\n${css.trim()}`;
    })
    .join("\n\n");
}

/** O conteúdo do módulo gerado. */
export function montarModulo(css = montarCss()) {
  // Crase e `${` precisam de escape: o CSS entra num template literal.
  const seguro = css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  return `// GERADO por scripts/gerar-estilo-documento.mjs — NÃO EDITE À MÃO.
//
// O CSS do produto como string, para a edge montar o documento imprimível com o
// mesmo estilo da tela. A fonte de verdade são os .css em frontend/; rode o
// gerador depois de mexer em qualquer um deles. Há teste que reprova este
// arquivo se ele ficar velho.
//
// Fontes, nesta ordem: ${FONTES.join(", ")}
export const ESTILO_DOCUMENTO = \`${seguro}\`;
`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gerar-estilo-documento.mjs")) {
  const novo = montarModulo();
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8") : null;
  if (process.argv.includes("--ver")) {
    console.log(novo === atual ? "screener/documento/estilo.mjs está em dia" : "screener/documento/estilo.mjs está VELHO");
    process.exit(novo === atual ? 0 : 1);
  }
  if (novo === atual) { console.log("screener/documento/estilo.mjs já estava em dia"); }
  else { fs.writeFileSync(DESTINO, novo); console.log(`screener/documento/estilo.mjs gerado (${(novo.length / 1024).toFixed(0)} KB)`); }
}
