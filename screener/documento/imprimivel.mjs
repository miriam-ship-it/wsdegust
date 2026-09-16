// O DOCUMENTO IMPRIMÍVEL — o mesmo documento da tela, autocontido, para virar PDF.
//
// A DECISÃO QUE GOVERNA ESTE ARQUIVO: **um renderizador só**. O HTML aqui é o
// mesmo `renderUnificado` que a tela usa; o que muda é a moldura — um documento
// autocontido, com o CSS embutido, porque quem vai abri-lo é o navegador do
// serviço de impressão, sem acesso aos `<link>` do site.
//
// Isso não é preferência de estilo. Esta sessão descobriu que a tela e o PDF do
// diagnóstico de liderança usavam FÓRMULAS DIFERENTES: a tela dizia
// R$ 39k–91k e o PDF R$ 62k–273k para a mesma pessoa, e ninguém tinha notado.
// Dois renderizadores divergem do mesmo jeito que duas fórmulas — só que a
// divergência aparece em layout, que é mais fácil de não ver.
//
// O CSS vem de `estilo.mjs`, gerado dos `.css` de `frontend/`. A fonte de
// verdade continua sendo a folha que a tela carrega.

import { renderUnificado } from "../../frontend/rhia.mjs";
import { ESTILO_DOCUMENTO } from "./estilo.mjs";
import { FONTES_PDF, MARCA_PDF } from "./recursos.mjs";

/**
 * Regras que só existem no papel.
 *
 * `rhia.css` já traz o bloco `@media print` do produto (fundo branco, sem
 * sombra, quebras protegidas). O que se acrescenta aqui é o que só faz sentido
 * quando NÃO existe navegador de pessoa nenhuma: forçar o tema claro, já que o
 * serviço de impressão pode herdar o escuro do sistema e devolver um PDF preto,
 * e ligar o `printBackground` nas barras — sem elas, um gráfico de barras
 * imprime vazio.
 *
 * TUDO dentro de `@media print`. A versão anterior aplicava estas regras também
 * na tela — abrir o HTML num navegador para conferir mostrava o documento sem
 * margem nenhuma, e a conferência mentia sobre o que ia ao papel.
 */
export const ESTILO_SO_DO_PAPEL = `
@media print {
  :root { color-scheme: light; }
  html, body { background: #FFFFFF; }
  .rh-barra, .rh-barra__fill, .rh-anel { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sc-shell { max-width: none; padding: 0; }
  .rh-sec { break-inside: auto; }
  .rh-card, .rh-metrica, .rh-cite { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
}
`;

/**
 * A PP Mori de volta ao topo da pilha — só no documento.
 *
 * `screener.css` rebaixa `--font-sans` para Inter no site, porque a PP Mori não
 * pode ser servida como webfont. Sem desfazer isso aqui, as faces embutidas
 * entravam no arquivo e nenhum texto as usava. Fora do `@media print` de
 * propósito: quem abre o HTML para conferir vê a mesma letra que vai ao papel.
 */
export const FONTE_DO_DOCUMENTO = `:root { --font-sans: "PP Mori", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }`;

/**
 * O documento inteiro, autocontido.
 *
 * @param {object} resultado  a saída de `calcularUnificado`
 * @param {object} [o]
 * @param {string} [o.instrumentVersion]
 * @param {string} [o.titulo]  vai na aba e nos metadados do PDF
 */
export function documentoImprimivel(resultado, { instrumentVersion = "", titulo = "Diagnóstico de cenário" } = {}) {
  // A marca vai embutida: o serviço de impressão não tem os arquivos do site, e
  // um logotipo quebrado na capa é o primeiro que a pessoa vê.
  const corpo = renderUnificado(resultado, { instrumentVersion, leadHtml: "", marca: MARCA_PDF });
  // A PP Mori vai dentro do arquivo, e nada é buscado fora: o documento sai
  // igual mesmo se o serviço de impressão estiver sem rede.
  return `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaparTexto(titulo)}</title>
<style>${FONTES_PDF}</style>
<style>${ESTILO_DOCUMENTO}</style>
<style>${FONTE_DO_DOCUMENTO}</style>
<style>${ESTILO_SO_DO_PAPEL}</style>
</head>
<body><div class="sc-shell rh-doc">${corpo}</div></body>
</html>`;
}

/** Escape mínimo para o `<title>` — o único texto fora do renderizador. */
function escaparTexto(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/**
 * Nome do arquivo: a pessoa vai achá-lo na pasta de downloads daqui a seis meses.
 * Sem acento, sem espaço, sem nada que um sistema de arquivos recuse.
 */
export function nomeDoArquivo(perfil, prefixo = "diagnostico-de-cenario") {
  // `nome || empresa` não bastava: um nome só com espaços é "verdadeiro" e
  // vencia a empresa, devolvendo o arquivo genérico. O que decide é o nome
  // depois de aparado.
  const pref = (v) => (typeof v === "string" ? v.trim() : "");
  const base = (perfil && (pref(perfil.nome) || pref(perfil.empresa))) || "";
  const limpo = String(base)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return limpo ? `${prefixo}-${limpo}.pdf` : `${prefixo}.pdf`;
}
