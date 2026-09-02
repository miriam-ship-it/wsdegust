// =============================================================
// SCREENER_EMPRESA_IA_V1 — Definição do instrumento
//
// Duas representações, como decidido no grilling (01-02/09):
//   1. DEFINIÇÃO PRIVADA (`instrumento`): textos, estágios, pontos,
//      dimensões, pesos e regras. NUNCA vai para o navegador — só a edge lê.
//   2. PROJEÇÃO PÚBLICA (`projecaoPublica`): identificadores opacos, enunciados
//      e opções (texto), sem pontos, sem E1–E4, sem resposta ideal, sem pesos,
//      sem dimensão, sem regra. É o único formato que o front recebe.
//
// O checksum é calculado sobre a serialização canônica (chaves ordenadas), de
// modo que qualquer mudança no instrumento muda o hash — a âncora de
// reprodutibilidade dos snapshots.
//
// Puro e sem I/O de runtime: o JSON é importado no load do módulo; nenhuma
// função abaixo faz leitura/escrita.
// =============================================================

import { createHash } from "node:crypto";
import instrumento from "../instrumento/SCREENER_EMPRESA_IA_V1.json" with { type: "json" };

export { instrumento };

/**
 * Serialização canônica: chaves de objeto em ordem alfabética, arrays na ordem.
 * Determinística e estável entre execuções e ambientes.
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
/** PRNG determinístico mulberry32. @param {number} a @returns {() => number} */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Embaralhamento determinístico (Fisher-Yates) por semente numérica. */
function embaralharDeterministico(arr, seedNum) {
  const a = arr.slice();
  const rnd = mulberry32(seedNum);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @typedef {object} ProjecaoPublica
 * @property {{id:string, prompt:string, options:{id:string,text:string}[]}[]} items
 *   O que o navegador recebe — zero metadado metodológico.
 * @property {{
 *   items: Record<string,string>,
 *   options: Record<string,{item:string, stage:string}>
 * }} mapping  Tradução id-opaco → código/estágio real. EDGE-ONLY, nunca vai ao front.
 */

/**
 * Projeta a definição privada no formato público sanitizado.
 *
 * Embaralhamento: DESLIGADO por default (ordem fixa E1→E4), respeitando a spec
 * §5.5 ("o piloto analisará efeito de ordem antes de qualquer embaralhamento")
 * e o parecer P0.7. A capacidade existe (`shuffle:true` + `sessionSeed`) para
 * quando a Miriam bater o martelo depois do piloto. Quando ligado, é
 * determinístico por sessão (reprodutível e testável).
 *
 * @param {object} [def=instrumento]
 * @param {{sessionSeed?:string, shuffle?:boolean}} [opts]
 * @returns {ProjecaoPublica}
 */
export function projecaoPublica(def = instrumento, { sessionSeed = "", shuffle = false } = {}) {
  const seed = sessionSeed || "SCREENER_PUBLIC_FIXO";
  const items = [];
  /** @type {Record<string,string>} */
  const itemMap = {};
  /** @type {Record<string,{item:string,stage:string}>} */
  const optionMap = {};

  for (const it of def.items) {
    const itemId = idOpaco(seed, it.code);
    itemMap[itemId] = it.code;

    let opts = it.options;
    if (shuffle && sessionSeed) {
      opts = embaralharDeterministico(opts, fnv1a(seed + "|ord|" + it.code));
    }

    const options = opts.map((op) => {
      const optId = idOpaco(seed, it.code + "#" + op.code);
      optionMap[optId] = { item: it.code, stage: op.code };
      return { id: optId, text: op.text };
    });

    items.push({ id: itemId, prompt: it.prompt, options });
  }

  return { items, mapping: { items: itemMap, options: optionMap } };
}
