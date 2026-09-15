// A CHAMADA AO SERVIÇO DE IMPRESSÃO — isolada para poder ser testada sem rede.
//
// Espelha o que `gate-and-send` já faz há meses com o relatório de liderança:
// mesmo serviço, mesmo formato A4, mesmas margens. Repetir as margens aqui é
// deliberado — dois documentos da mesma casa com margens diferentes é o tipo de
// diferença que ninguém nota até ver os dois lado a lado.
//
// `fetch` entra por parâmetro para que o teste prove o que foi enviado sem tocar
// a rede; em produção é o `fetch` do runtime.

export const OPCOES_A4 = Object.freeze({
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
});

/**
 * Converte HTML em PDF.
 *
 * NUNCA registra o HTML nem o token: o documento carrega nome, empresa e cargo,
 * e o token é credencial. O que pode ir para o log é o tamanho e o status.
 *
 * @returns {Promise<Uint8Array>}
 */
export async function gerarPdf(html, { token, fetch: buscar = globalThis.fetch, opcoes = OPCOES_A4 } = {}) {
  if (!token) throw new Error("servico_de_impressao_nao_configurado");
  if (typeof html !== "string" || !html.trim()) throw new Error("documento_vazio");

  const resposta = await buscar(`https://chrome.browserless.io/pdf?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // `networkidle0`: o documento busca a fonte da marca. Sem esperar, o PDF sai
    // com a fonte de sistema — e a diferença só aparece depois de enviado.
    body: JSON.stringify({ html, options: opcoes, gotoOptions: { waitUntil: "networkidle0" } }),
  });

  if (!resposta.ok) {
    // O corpo do erro do serviço pode ecoar trechos do HTML enviado; por isso só
    // o status atravessa.
    throw new Error(`servico_de_impressao_falhou_${resposta.status}`);
  }
  return new Uint8Array(await resposta.arrayBuffer());
}

/** Bytes → base64, em blocos: `String.fromCharCode(...)` estoura a pilha com PDF grande. */
export function base64(bytes) {
  let bin = "";
  const bloco = 8192;
  for (let i = 0; i < bytes.length; i += bloco) bin += String.fromCharCode(...bytes.subarray(i, i + bloco));
  return btoa(bin);
}
