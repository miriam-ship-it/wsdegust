// =============================================================
// SCREENER_IA_V2 — adaptador do instrumento para a edge.
//
// Diferente do V1: no V2 o TEXTO das opções já descreve o nível (N1→N4), então
// não há "gabarito" a esconder por opção — o que precisa ficar no servidor é a
// FÓRMULA (pesos/teto/curva) e o ESCORE. Por isso a apresentação pública leva os
// códigos de nível abertos (N1–N4/NA); o navegador devolve o código e a edge
// valida + calcula. Sem ids opacos, sem mapping — mais simples e igualmente seguro.
//
// A `definicao` (o que é gravado em screener_instrument_versions) mantém `questoes`
// e `senioridade` com `code`, que as funções SQL usam para validar item/senioridade.
// =============================================================
import { INSTRUMENTO_IA_V2 } from "../v2/instrumento-ia-v2.mjs";
import { canonicalize } from "../motor/definicao.mjs";

export const instrumentoV2 = INSTRUMENTO_IA_V2;

/** Checksum SHA-256 (hex) sobre a serialização canônica da definição V2. */
export async function checksumV2(def = instrumentoV2) {
  const data = new TextEncoder().encode(canonicalize(def));
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Código público de uma opção: 'N1'–'N4' por nível, 'NA' para "Não sei". */
export const codigoOpcao = (op) => (op.na ? "NA" : "N" + op.level);

/**
 * Apresentação pública do instrumento V2 (sem fórmula, sem pesos, sem cálculo).
 * O front pode embaralhar a ordem das opções (mantendo NA por último).
 * @param {object} [def=instrumentoV2]
 * @returns {{instrument:{code:string,version:string}, seniority:{code:string,label:string}[], questions:{code:string,dimension:string,prompt:string,options:{code:string,text:string}[]}[]}}
 */
export function apresentacaoPublicaV2(def = instrumentoV2) {
  return {
    instrument: { code: def.code, version: def.version },
    seniority: def.senioridade.map((s) => ({ code: s.code, label: s.label })),
    questions: def.questoes.map((q) => ({
      code: q.code,
      dimension: q.dimension,
      prompt: q.prompt,
      options: q.options.map((op) => ({ code: codigoOpcao(op), text: op.text })),
    })),
  };
}
