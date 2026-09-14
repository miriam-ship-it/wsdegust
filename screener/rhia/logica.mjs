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
import {
  buildResultContractV2,
  scoreAllDimensions, calculateAxes, calculatePosition, calculateReference,
} from "./pacote/src/output-engine-v2.mjs";
import { DIMENSIONS, STAGES } from "./pacote/src/output-definition-v2.mjs";

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
/**
 * MÉTRICAS NUMÉRICAS — decisão de produto de 14/09/2026, tomada pela dona do
 * produto depois de a restrição ter sido apresentada duas vezes.
 *
 * O QUE MUDA. A arquitetura aprovada (ARQUITETURA-DEVOLUTIVA-V2 §10) manda
 * "não exibir radar, barras ou números por dimensão". A devolutiva passa a
 * exibir. A justificativa é de produto: o relatório de liderança que a Boomit
 * já entrega é analítico e acionável PORQUE quantifica, e a devolutiva de IA
 * ficava ao lado dele parecendo entregar menos. A exceção fica registrada,
 * datada e endereçada a quem aprovou o instrumento — um método que se dobra em
 * silêncio deixa de valer; um que registra a exceção continua valendo.
 *
 * DE ONDE VÊM OS NÚMEROS. Das funções EXPORTADAS pelo próprio motor do pacote:
 * `scoreAllDimensions`, `calculateAxes`, `calculatePosition`,
 * `calculateReference`. Nada é recalculado aqui e nada é estimado. Se o pacote
 * mudar a matemática, estes números mudam junto — não existe uma segunda
 * implementação para divergir da primeira.
 *
 * A ESCALA. O motor trabalha em pontos-base (0 a 10000). Publicar isso seria
 * ilegível. Converte-se para 0 a 100 dividindo por 100 — é exato, não é
 * reescala — que é o mesmo registro do relatório de liderança ("74/100").
 *
 * O QUE CONTINUA FORA, porque seria invenção e não exibição:
 *   - benchmark de setor ou percentil: o instrumento não coleta comparação;
 *   - valor em reais (CDL) e risco em percentual: são metodologia de OUTRO
 *     instrumento, o de liderança;
 *   - letra D→AAA: é a escala daquele diagnóstico, não desta.
 *
 * Dimensão inválida (menos de três respostas úteis) sai com `valor: null` —
 * ausência de evidência não pode virar zero. Sem as seis válidas, o motor não
 * sintetiza, e aqui também não se publica eixo nem índice: seriam média de
 * coisa faltando.
 */
export function metricas({ instrumento: def = instrumento, respostas, respostasMotor }) {
  // `respostasMotor` existe para `paraPublico`, que recebe o contrato pronto e
  // já tem as respostas no formato do motor em `internal.answers`. Converter de
  // novo seria converter o que já está convertido.
  const ans = respostasMotor || respostasParaMotor(respostas);
  const dims = scoreAllDimensions(def, ans);
  const cem = (bp) => (bp == null || Number.isNaN(Number(bp)) ? null : Math.round(Number(bp) / 100));
  const nomeDe = (s) => s.label ?? s.name ?? s.title ?? null;

  // O eixo sai pelo NOME de exibição, nunca pelo código do motor ("leadership",
  // "process", "ai"): código interno não atravessa a fronteira, mesmo quando é
  // inofensivo — a regra vale por ser regra, e o teste de projeção a cobra.
  const EIXO = { leadership: "Liderança", process: "Processos", ai: "IA" };
  const porDimensao = Object.entries(DIMENSIONS).map(([code, d]) => ({
    nome: d.name,
    eixo: EIXO[d.axis] || null,
    valor: dims[code] && dims[code].valid ? cem(dims[code].bp) : null,
  }));
  if (porDimensao.some((d) => d.valor === null)) {
    return { porDimensao, eixos: null, indice: null, degrau: null, faixa: null,
             referencia: null, distancia: null, degraus: null };
  }

  const eixos = calculateAxes(dims);
  const pos = calculatePosition(eixos);
  const ref = calculateReference(ans.CTX02, ans.CTX03);
  const valida = ref && ref.status === "VALID";
  return {
    porDimensao,
    // Os pesos aparecem porque o índice é ponderado: sem eles, três números e
    // um quarto sem relação aritmética visível entre si.
    eixos: [
      { nome: "Liderança", peso: 35, valor: cem(eixos.leadership_bp) },
      { nome: "Processos", peso: 35, valor: cem(eixos.process_bp) },
      { nome: "IA", peso: 30, valor: cem(eixos.ai_bp) },
    ],
    indice: cem(pos.bp),
    degrau: pos.stage ? { posicao: pos.stage.index, nome: nomeDe(pos.stage) } : null,
    // A faixa do degrau responde a pergunta que vem logo depois da posição:
    // quanto falta para o próximo.
    faixa: pos.stage ? { de: cem(pos.stage.min), ate: cem(pos.stage.max) } : null,
    referencia: valida ? ref.index : null,
    distancia: valida && pos.stage ? pos.stage.index - ref.index : null,
    degraus: STAGES.map((s) => ({ posicao: s.index, nome: nomeDe(s), de: cem(s.min), ate: cem(s.max) })),
  };
}

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

  // Métricas numéricas (decisão de 14/09 — ver `metricas`). Derivadas das
  // respostas que já estão no contrato, pelas funções do próprio motor. Ponto-
  // base continua NÃO saindo: o que vai ao navegador é a escala 0–100.
  // No ramo INSUFFICIENT não há métrica: sem evidência não se publica número.
  const ans = contrato?.internal?.answers;
  if (ans && pub.status !== "INSUFFICIENT") {
    try { pub.metricas = metricas({ respostasMotor: ans }); }
    catch { /* uma falha de cálculo não pode derrubar a devolutiva inteira */ }
  }

  return { ...pub, emitido_em };
}
