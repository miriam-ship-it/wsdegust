// Gera `screener/documento/recursos.mjs` — a fonte da marca e as imagens da capa
// como data URI, para o documento imprimível sair inteiro sem buscar nada fora.
//
// POR QUE EMBUTIR: quem abre o documento é o navegador do serviço de impressão.
// Ele não tem os arquivos do site, e uma imagem que não carrega vira um ícone
// quebrado NA CAPA de um documento que vai para fora da casa.
//
// POR QUE A PP MORI SÓ AQUI: ela é licenciada e não é webfont pública. No PDF ela
// vai dentro do arquivo, como em qualquer documento tipográfico; no site, a tela
// continua em Inter (fallback de `--font-sans`) até a licença de uso na web estar
// confirmada. Os `.otf` ficam em `screener/documento/fontes/`, FORA do diretório
// publicado.
//
// Uso:  node scripts/gerar-recursos-documento.mjs        # escreve o arquivo
//       node scripts/gerar-recursos-documento.mjs --ver  # só diz se mudou

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, "..");
export const DESTINO_RECURSOS = path.join(RAIZ, "screener", "documento", "recursos.mjs");

export const PESOS = [
  { arquivo: "PPMori-Regular.otf", peso: 400 },
  { arquivo: "PPMori-Medium.otf", peso: 500 },
  { arquivo: "PPMori-SemiBold.otf", peso: 600 },
];
export const IMAGENS = { logo: "logo-boomit.png", grafismo: "grafismo-boomit.png" };

const b64 = (p) => fs.readFileSync(p).toString("base64");

/** O conteúdo do módulo gerado. */
export function montarRecursos(raiz = RAIZ) {
  const faces = PESOS.map(({ arquivo, peso }) =>
    `@font-face{font-family:"PP Mori";src:url(data:font/otf;base64,${b64(path.join(raiz, "screener", "documento", "fontes", arquivo))}) format("opentype");font-weight:${peso};font-style:normal;font-display:block}`,
  ).join("\n");
  const marca = Object.fromEntries(Object.entries(IMAGENS).map(([k, f]) =>
    [k, `data:image/png;base64,${b64(path.join(raiz, "frontend", f))}`]));
  return `// GERADO por scripts/gerar-recursos-documento.mjs — NÃO EDITE À MÃO.
//
// A PP Mori (licenciada — só no PDF, nunca servida no site) e as imagens da capa,
// como data URI. Fontes: screener/documento/fontes/*.otf e frontend/*.png. Há
// teste que reprova este arquivo se ele ficar velho.
export const FONTES_PDF = ${JSON.stringify(faces)};
export const MARCA_PDF = Object.freeze(${JSON.stringify(marca)});
`;
}

if (process.argv[1]?.endsWith("gerar-recursos-documento.mjs")) {
  const novo = montarRecursos();
  const atual = fs.existsSync(DESTINO_RECURSOS) ? fs.readFileSync(DESTINO_RECURSOS, "utf8") : null;
  if (process.argv.includes("--ver")) {
    console.log(novo === atual ? "recursos.mjs está em dia" : "recursos.mjs está VELHO");
    process.exit(novo === atual ? 0 : 1);
  }
  if (novo === atual) console.log("recursos.mjs já estava em dia");
  else { fs.writeFileSync(DESTINO_RECURSOS, novo); console.log(`screener/documento/recursos.mjs gerado (${(novo.length / 1024).toFixed(0)} KB)`); }
}
