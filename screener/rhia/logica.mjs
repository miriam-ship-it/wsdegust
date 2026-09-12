// =============================================================
// DIAGNÓSTICO BOOMIT RH + IA v2 ("rhia") — Lógica pura da edge
//
// Runtime-agnóstica (Deno na edge e node --test). Sem `node:`, sem I/O, sem
// rede, sem Date.now: a data de emissão vem do contrato gerado pelo motor.
//
// O que vive aqui:
//   - validação de resposta (espelha, no servidor de aplicação, a validação
//     que a RPC screener_rhia_op_save_response faz no banco);
//   - validação de submissão (30 itens + texto obrigatório quando CTX01=OTHER);
//   - canônico das respostas (idêntico ao SQL da RPC de finalize);
//   - ponte para o motor do pacote (importado sem alterar semântica);
//   - projeção pública do contrato (nunca inclui `internal`).
// =============================================================

import { instrumento } from "./definicao.mjs";
import { buildResultContractV2 } from "./pacote/src/output-engine-v2.mjs";

/** Id do campo condicional de texto livre (CTX01 = OTHER). Lido do JSON. */
const CAMPO_TEXTO = instrumento.items.find((it) => it.conditional_field)?.conditional_field ?? null;
const ID_TEXTO = CAMPO_TEXTO?.id ?? "CTX01_OTHER_TEXT";
const ITEM_DO_TEXTO = instrumento.items.find((it) => it.conditional_field)?.id ?? "CTX01";
const OPCAO_ABRE_TEXTO = CAMPO_TEXTO?.show_when?.option_id ?? "OTHER";
const TEXTO_MIN = CAMPO_TEXTO?.min_length ?? 2;
const TEXTO_MAX = CAMPO_TEXTO?.max_length ?? 120;

/** Os 30 ids do instrumento, na ordem do campo `order`. */
export const ITENS_IDS = Object.freeze(
  [...instrumento.items].sort((a, b) => a.order - b.order).map((it) => it.id),
);

const ESTAGIOS = new Set(["E1", "E2", "E3", "E4", "NA"]);
const CONTROLE = /[\u0000-\u001f\u007f]/;

/**
 * Texto livre válido: string, 2–120 chars após trim, sem caracteres de controle.
 * @param {unknown} value
 */
function textoValido(value) {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return t.length >= TEXTO_MIN && t.length <= TEXTO_MAX && !CONTROLE.test(t);
}

/**
 * Valida UMA resposta antes de ir à RPC.
 * Lança Error("opcao_invalida") | Error("texto_invalido") | Error("item_fora_do_instrumento").
 * A coerência CTX01/texto (texto só quando OTHER) não é decidida aqui: fica em
 * validarSubmissao — o texto pode ser gravado a qualquer momento e ignorado
 * depois se CTX01 mudar.
 * @param {string} item_id
 * @param {unknown} value
 * @param {object} [def=instrumento]
 */
export function validarResposta(item_id, value, def = instrumento) {
  if (item_id === ID_TEXTO) {
    if (!textoValido(value)) throw new Error("texto_invalido");
    return true;
  }
  const item = def.items.find((it) => it.id === item_id);
  if (!item) throw new Error("item_fora_do_instrumento");
  if (typeof value !== "string") throw new Error("opcao_invalida");
  if (item.kind === "context") {
    if (!item.options.some((op) => op.id === value)) throw new Error("opcao_invalida");
    return true;
  }
  // scored e governance_gate: estágio E1..E4 ou NA (e presente nas opções do item)
  if (!ESTAGIOS.has(value) || !item.options.some((op) => op.id === value)) throw new Error("opcao_invalida");
  return true;
}

/**
 * Garante que a submissão está completa e coerente.
 * Lança:
 *   "incompleto: falta <id>"  — qualquer um dos 30 ids ausente;
 *   "texto_obrigatorio"       — CTX01 = OTHER sem CTX01_OTHER_TEXT válido;
 *   "itens_estranhos"         — chave fora dos 30 ids + CTX01_OTHER_TEXT;
 *   e os erros de validarResposta para valores inválidos (defesa em profundidade:
 *   o banco já validou na gravação).
 * Texto órfão (CTX01 ≠ OTHER com texto gravado) é tolerado: não pontua e
 * respostasParaMotor o descarta.
 * @param {Record<string,string>} respostas  item_id → value
 * @param {object} [def=instrumento]
 */
export function validarSubmissao(respostas, def = instrumento) {
  const ids = [...def.items].sort((a, b) => a.order - b.order).map((it) => it.id);
  for (const id of ids) {
    if (respostas[id] === undefined || respostas[id] === null) throw new Error(`incompleto: falta ${id}`);
  }
  for (const id of ids) validarResposta(id, respostas[id], def);
  if (respostas[ITEM_DO_TEXTO] === OPCAO_ABRE_TEXTO && !textoValido(respostas[ID_TEXTO])) {
    throw new Error("texto_obrigatorio");
  }
  const permitidas = new Set([...ids, ID_TEXTO]);
  const extras = Object.keys(respostas).filter((k) => !permitidas.has(k));
  if (extras.length) throw new Error("itens_estranhos");
  return true;
}

/**
 * Serialização canônica das respostas — IDÊNTICA ao SQL da RPC de finalize:
 *   string_agg(item_code || E'\t' || answer_code, E'\n' order by item_code collate "C")
 * Chaves ordenadas por code unit (sort() padrão), independente da ordem de
 * inserção. Inclui o texto livre quando presente (ele também é uma linha na
 * tabela de respostas). Vazio → "".
 * @param {Record<string,string>} respostas
 * @returns {string}
 */
export function canonico(respostas) {
  return Object.keys(respostas)
    .sort()
    .map((k) => k + "\t" + respostas[k])
    .join("\n");
}

/**
 * Respostas que o motor lê: só ids do instrumento. O texto livre não pontua e
 * nunca entra em `internal.answers`.
 * @param {Record<string,string>} respostas
 * @returns {Record<string,string>}
 */
export function respostasParaMotor(respostas) {
  const out = { ...respostas };
  delete out[ID_TEXTO];
  return out;
}

/**
 * Executa o motor do pacote sem alterar sua semântica.
 * @param {{instrumento?:object, respostas:Record<string,string>}} args
 * @returns {{public:object, internal:{generatedAt:string,instrumentVersion:string,answers:object}}}
 */
export function calcularContrato({ instrumento: def = instrumento, respostas }) {
  return buildResultContractV2({ instrument: def, answers: respostasParaMotor(respostas) });
}

/**
 * Projeção pública do contrato: `public` + `emitido_em` (YYYY-MM-DD derivado de
 * internal.generatedAt). NUNCA inclui `internal` (respostas, versão interna).
 * @param {{public:object, internal:{generatedAt:string}}} contrato
 * @returns {object}
 */
export function paraPublico(contrato) {
  const gerado = contrato?.internal?.generatedAt;
  const emitido_em = typeof gerado === "string" && /^\d{4}-\d{2}-\d{2}/.test(gerado) ? gerado.slice(0, 10) : null;
  const pub = structuredClone(contrato.public);
  // O motor do pacote, no ramo INSUFFICIENT, devolve `governance` e `evidence`
  // inteiros — e eles carregam internos de cálculo (weakestBp em pontos-base,
  // rank, canSynthesize, validDimensions). O ramo normal já projeta só o que é
  // público. Aqui igualamos os dois: a fronteira é nossa, não do motor, e o
  // navegador nunca recebe ponto-base. A semântica do motor não é alterada.
  if (pub.governance) {
    const { id, label, text } = pub.governance;
    pub.governance = { id, label, text };
  }
  if (pub.evidence) {
    const { status, validItems } = pub.evidence;
    pub.evidence = { status, validItems };
  }
  return { ...pub, emitido_em };
}
