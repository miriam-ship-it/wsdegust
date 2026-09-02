// =============================================================
// SCREENER_EMPRESA_IA_V1 — Definição do instrumento
//
// Duas representações, como decidido no grilling (01-02/09):
//   1. DEFINIÇÃO PRIVADA (`instrumento`): textos, estágios, pontos, dimensões,
//      lentes, pesos e regras. NUNCA vai para o navegador — só a edge lê.
//   2. PROJEÇÃO PÚBLICA (`projecaoPublica`): versão, blocos (nome, instrução,
//      período de referência), enunciados e opções — com identificadores opacos
//      e SEM pontos, E1–E4, resposta ideal, pesos, dimensão, lente ou regra.
//      É o único formato que o front recebe; os textos vivem só aqui (nunca
//      duplicados no HTML).
//
// Ordem das alternativas FIXA na versão 1.0.0 — embaralhamento produtivo é
// impossível (lança erro). Spec §5.5 + parecer P0.7: o efeito de ordem só será
// analisado no piloto; até lá, ordem fixa E1→E4.
//
// Puro e sem I/O de runtime: o JSON é importado no load; nenhuma função abaixo
// faz leitura/escrita.
// =============================================================

import { createHash } from "node:crypto";
import instrumento from "../instrumento/SCREENER_EMPRESA_IA_V1.json" with { type: "json" };

export { instrumento };

/**
 * Serialização canônica: chaves de objeto em ordem alfabética, arrays na ordem.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

/**
 * Checksum SHA-256 (hex) sobre a serialização canônica do instrumento.
 * @param {object} [def=instrumento]
 * @returns {string}
 */
export function checksum(def = instrumento) {
  return createHash("sha256").update(canonicalize(def)).digest("hex");
}

// ---- hashing determinístico e leve para ids opacos (sem dependência) ----
/** FNV-1a 32-bit. @param {string} str @returns {number} */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** @param {string} seed @param {string} label @returns {string} */
function idOpaco(seed, label) {
  return fnv1a(seed + "|" + label).toString(16).padStart(8, "0");
}

/**
 * @typedef {object} BlocoPublico
 * @property {"individual"|"organization"|"ai"} code
 * @property {string} name
 * @property {string} instruction
 * @property {string} reference_period
 * @property {{id:string, prompt:string, options:{id:string,text:string}[]}[]} items
 */

/**
 * @typedef {object} ProjecaoPublica
 * @property {{code:string, version:string}} instrument
 * @property {{intended_use:string, prohibited_uses:string[]}} consent
 * @property {BlocoPublico[]} blocks   Na ordem Pessoa → Empresa → IA.
 * @property {{
 *   items: Record<string,string>,
 *   options: Record<string,{item:string, stage:string}>
 * }} mapping  Tradução id-opaco → código/estágio real. EDGE-ONLY, nunca vai ao front.
 */

/**
 * Projeta a definição privada no formato público sanitizado, agrupado por bloco.
 *
 * A ordem das opções é SEMPRE fixa (E1→E4, N/A por último). `shuffle:true` é
 * rejeitado — não existe embaralhamento produtivo na versão 1.0.0.
 *
 * @param {object} [def=instrumento]
 * @param {{sessionSeed?:string, assessmentUnitName?:string|null, shuffle?:boolean}} [opts]
 * @returns {ProjecaoPublica}
 */
export function projecaoPublica(def = instrumento, { sessionSeed = "", assessmentUnitName = null, shuffle = false } = {}) {
  if (shuffle) {
    throw new Error("Embaralhamento não é suportado na versão 1.0.0: a ordem das alternativas é fixa (spec §5.5).");
  }
  const seed = sessionSeed || "SCREENER_PUBLIC_FIXO";
  /** @type {Record<string,string>} */
  const itemMap = {};
  /** @type {Record<string,{item:string,stage:string}>} */
  const optionMap = {};

  const projetarItem = (it) => {
    const itemId = idOpaco(seed, it.code);
    itemMap[itemId] = it.code;
    const options = it.options.map((op) => {
      const optId = idOpaco(seed, it.code + "#" + op.code);
      optionMap[optId] = { item: it.code, stage: op.code };
      return { id: optId, text: op.text }; // ordem preservada da definição (fixa)
    });
    return { id: itemId, prompt: it.prompt, options };
  };

  const substituirUnidade = (texto) =>
    assessmentUnitName ? texto.replaceAll("{assessment_unit_name}", assessmentUnitName) : texto;

  const blocks = def.presentation.blocks.map((b) => ({
    code: b.code,
    name: b.name,
    instruction: substituirUnidade(b.instruction),
    reference_period: b.reference_period,
    items: def.items
      .filter((it) => it.block === b.code)
      .sort((a, c) => a.order - c.order)
      .map(projetarItem),
  }));

  return {
    instrument: { code: def.instrument.code, version: def.instrument.version },
    consent: { intended_use: def.instrument.intended_use, prohibited_uses: def.instrument.prohibited_uses },
    blocks,
    mapping: { items: itemMap, options: optionMap },
  };
}
