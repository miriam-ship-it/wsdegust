// =============================================================
// DIAGNÓSTICO BOOMIT RH + IA v2 ("rhia") — Definição do instrumento
//
// Duas representações, no mesmo padrão do V1 (screener/motor/definicao.mjs):
//   1. DEFINIÇÃO PRIVADA (`instrumento`): o JSON do pacote, verbatim. Traz
//      escala, facetas, cenários, dimensões por código. NUNCA vai ao navegador:
//      só a edge lê, e é o que o motor do pacote consome.
//   2. APRESENTAÇÃO PÚBLICA (`apresentacaoPublica`): título, propósito,
//      disclaimer, grupos, enunciados e alternativas LITERAIS — sem escala,
//      faceta, cenário, código de dimensão, pesos ou pontos. É o único formato
//      que o front recebe; as questões chegam pela edge, nunca embutidas no HTML
//      (fronteira provada em fronteira-rhia.test.mjs).
//
// Runtime-agnóstico: roda em Deno (edge) e em node --test. Sem `node:`; o
// checksum usa Web Crypto (crypto.subtle) e por isso é assíncrono. O
// `canonicalize` é reimplementado aqui com a MESMA regra do motor V1 (objeto:
// chaves ordenadas; array: ordem preservada) porque ../motor/definicao.mjs
// importa node:crypto e não pode ser carregado na edge. A igualdade entre as
// duas funções é provada em definicao.test.mjs.
//
// Puro e sem I/O de runtime: o JSON é importado no load; nenhuma função abaixo
// faz leitura/escrita.
// =============================================================

import instrumento from "./pacote/instrumento-rh-ia-v1.json" with { type: "json" };

export { instrumento };

/**
 * Serialização canônica: chaves de objeto em ordem alfabética (sort() padrão,
 * por code unit), arrays na ordem. Idêntica a screener/motor/definicao.mjs.
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
 * Checksum SHA-256 (hex, 64 chars) sobre a serialização canônica do instrumento.
 * Web Crypto — assíncrono. Bate com createHash("sha256") do node sobre a mesma
 * string (provado no teste) e com o checksum gravado pelo loader.
 * @param {object} [def=instrumento]
 * @returns {Promise<string>}
 */
export async function checksum(def = instrumento) {
  const data = new TextEncoder().encode(canonicalize(def));
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Grupos públicos, na ordem de apresentação. */
export const GRUPOS = Object.freeze([
  Object.freeze({ code: "contexto", name: "Contexto" }),
  Object.freeze({ code: "praticas", name: "Práticas" }),
  Object.freeze({ code: "governanca", name: "Governança" }),
]);

/** kind do JSON → grupo público. */
const GRUPO_POR_KIND = Object.freeze({
  context: "contexto",
  scored: "praticas",
  governance_gate: "governanca",
});

/**
 * @typedef {object} ItemPublico
 * @property {string} id
 * @property {number} order
 * @property {"context"|"scored"|"governance_gate"} kind
 * @property {"contexto"|"praticas"|"governanca"} group
 * @property {string} [dimension_name]   nome humano da dimensão — só em scored
 * @property {string} prompt
 * @property {{id:string,label:string}[]} options
 * @property {object} [conditional_field] copiado do JSON quando existir
 */

/**
 * @typedef {object} ApresentacaoPublica
 * @property {{id:string,version:string,title:string,purpose:string,disclaimer:string,estimated_minutes:string}} instrument
 * @property {{code:string,name:string}[]} groups
 * @property {ItemPublico[]} items   30 itens, na ordem do campo `order`.
 */

/**
 * Projeta a definição privada no formato público. Enunciados e rótulos são
 * copiados LITERALMENTE do JSON (o conteúdo é do pacote e não se reescreve).
 * Nada de scale/facet/scenario/dimension(código)/gate/required na saída.
 * @param {object} [def=instrumento]
 * @returns {ApresentacaoPublica}
 */
export function apresentacaoPublica(def = instrumento) {
  const nomeDim = new Map(def.dimensions.map((d) => [d.id, d.name]));
  const items = [...def.items]
    .sort((a, b) => a.order - b.order)
    .map((it) => {
      const group = GRUPO_POR_KIND[it.kind];
      if (!group) throw new Error(`kind desconhecido no instrumento: ${it.kind}`);
      /** @type {ItemPublico} */
      const pub = {
        id: it.id,
        order: it.order,
        kind: it.kind,
        group,
      };
      if (it.kind === "scored") pub.dimension_name = nomeDim.get(it.dimension) ?? null;
      pub.prompt = it.prompt;
      pub.options = it.options.map((op) => ({ id: op.id, label: op.label }));
      if (it.conditional_field) pub.conditional_field = structuredClone(it.conditional_field);
      return pub;
    });

  return {
    instrument: {
      id: def.instrument_id,
      version: def.instrument_version,
      title: def.title,
      purpose: def.purpose,
      disclaimer: def.disclaimer,
      estimated_minutes: "8–10",
    },
    groups: GRUPOS.map((g) => ({ code: g.code, name: g.name })),
    items,
  };
}
