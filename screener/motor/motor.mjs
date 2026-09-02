// =============================================================
// SCREENER_EMPRESA_IA_V1 — Motor determinístico de pontuação
//
// Puro e sem I/O: entra um mapa de respostas (código do item → estágio),
// sai um ScoreResultV1 imutável. Nenhum LLM, nenhuma rede, nenhum banco.
// Mesma entrada + mesma versão → mesma saída, byte a byte após normalização.
//
// Regras congeladas no seed (`instrumento.scoring`) e nas decisões do parecer:
//   - Pessoa, Empresa e IA NUNCA somam numa nota geral.
//   - N/A fica fora do numerador e do denominador (nunca vira zero).
//   - Dimensão só pontua com seus DOIS itens válidos.
//   - Índice de bloco = média das dimensões válidas (≥4), peso igual.
//   - Governança é condição separada; não contamina o índice de IA.
//   - Nenhuma saída de risco %, CDL, arquétipo ou score combinado.
// =============================================================

import { instrumento, checksum } from "./definicao.mjs";

const SCORING = instrumento.scoring;
const SCORE_BP = SCORING.stage_points_bp; // { E1:0, E2:3333, E3:6667, E4:10000, NA:null }
const BANDS = SCORING.bands;
const MIN_ITENS_DIM = SCORING.min_valid_items_per_dimension;      // 2
const MIN_DIMS_INDICE = SCORING.min_valid_dimensions_for_block_index; // 4
const MIN_COBERTURA_MATRIZ = SCORING.min_block_coverage_bp;       // 8000
const CORTE_MATRIZ = SCORING.matrix_cut_bp;                       // 5000
const GAP_MODERADO = SCORING.gap_moderate_bp;                     // 1667
const GAP_ALTO = SCORING.gap_high_bp;                             // 3333

const ESTAGIOS_VALIDOS = new Set(["E1", "E2", "E3", "E4", "NA"]);

// ---- índices derivados do instrumento (uma vez, no load) ----
const ITENS_POR_CODIGO = new Map(instrumento.items.map((it) => [it.code, it]));

const ORDEM_DIM_ORG = instrumento.dimensions
  .filter((d) => d.block === "individual_organization")
  .sort((a, b) => a.order - b.order)
  .map((d) => d.code); // [VIS, PES, DEC, COM, PER]

const ORDEM_EIXO_IA = instrumento.dimensions
  .filter((d) => d.block === "ai")
  .sort((a, b) => a.order - b.order)
  .map((d) => d.code); // [IA_EST, IA_DAT, IA_USO, IA_PES, IA_GOV]

const NOME_DIM = new Map(instrumento.dimensions.map((d) => [d.code, d.name]));

/** itens de um bloco agrupados por dimensão, na ordem `order` do item. */
function itensPorDimensao(block) {
  /** @type {Map<string,string[]>} */
  const m = new Map();
  const doBloco = instrumento.items
    .filter((it) => it.block === block)
    .sort((a, b) => a.order - b.order);
  for (const it of doBloco) {
    if (!m.has(it.dimension)) m.set(it.dimension, []);
    m.get(it.dimension).push(it.code);
  }
  return m;
}
const DIM_INDIVIDUAL = itensPorDimensao("individual");
const DIM_ORGANIZACAO = itensPorDimensao("organization");
const DIM_IA = itensPorDimensao("ai");

// =============================================================
// Funções puras de referência
// =============================================================

/** @param {string} stage @returns {number|null} */
export function scoreOf(stage) {
  return stage === "NA" ? null : SCORE_BP[stage];
}

/** Média inteira em bp dos valores não-nulos; null se nenhum válido. */
export function meanBp(values) {
  const validos = values.filter((v) => v !== null && v !== undefined);
  if (validos.length === 0) return null;
  return Math.round(validos.reduce((s, v) => s + v, 0) / validos.length);
}

/** @param {number|null} scoreBp @returns {{code:string,label:string}|null} */
export function bandOf(scoreBp) {
  if (scoreBp === null || scoreBp === undefined) return null;
  for (const b of BANDS) {
    if (scoreBp >= b.min_bp && scoreBp <= b.max_bp_inclusive) {
      return { code: b.code, label: b.label };
    }
  }
  return null;
}

/** Exibição aproximada 0–100 (arredonda bp/100). */
export function displayScore(scoreBp) {
  return scoreBp === null || scoreBp === undefined ? null : Math.round(scoreBp / 100);
}

/** Escore de dimensão: exige exatamente os 2 itens válidos (não-NA). */
export function dimensionScore(stages) {
  if (stages.length !== MIN_ITENS_DIM) return null;
  const scores = stages.map(scoreOf);
  if (scores.some((v) => v === null)) return null;
  return meanBp(scores);
}

/** Cobertura em bp: proporção de itens respondidos (não-NA). */
export function coverageBp(stages) {
  if (stages.length === 0) return 0;
  const validos = stages.filter((s) => s !== "NA").length;
  return Math.round((validos / stages.length) * 10000);
}

/** Índice de bloco: média das dimensões válidas, exigindo ≥ MIN_DIMS_INDICE. */
export function blockIndex(dimScores) {
  const validos = dimScores.filter((v) => v !== null && v !== undefined);
  if (validos.length < MIN_DIMS_INDICE) return null;
  return meanBp(validos);
}

/** Condição de governança a partir dos 2 itens de IA_GOV. */
export function governanceGate(stages) {
  if (stages.length !== 2 || stages.some((s) => s === "NA")) return "insufficient";
  if (stages.some((s) => s === "E1")) return "blocked";
  if (stages.some((s) => s === "E2")) return "conditioned";
  return "eligible";
}

/** Quadrante da matriz Empresa × IA. */
export function matrixQuadrant(orgBp, aiBp) {
  const orgHigh = orgBp >= CORTE_MATRIZ;
  const aiHigh = aiBp >= CORTE_MATRIZ;
  if (!orgHigh && !aiHigh) return "FOUNDATION_FIRST";
  if (orgHigh && !aiHigh) return "GOVERNED_EXPERIMENTATION";
  if (!orgHigh && aiHigh) return "FRAGILE_ADOPTION";
  return "RESPONSIBLE_SCALE";
}

/** Magnitude do gap (valor absoluto em bp). */
function gapMagnitude(gapBp) {
  const abs = Math.abs(gapBp);
  if (abs >= GAP_ALTO) return "high";
  if (abs >= GAP_MODERADO) return "moderate";
  return "none";
}

// =============================================================
// Cálculo de um bloco (dimensões + índice + cobertura)
// =============================================================
function calcularBloco(dimMap, ordem, respostas) {
  const dimensions = [];
  const porCodigo = new Map();
  for (const code of ordem) {
    const itens = dimMap.get(code) || [];
    const stages = itens.map((c) => respostas[c]);
    const score_bp = dimensionScore(stages);
    const validItems = stages.filter((s) => s !== "NA").length;
    const dim = {
      code,
      name: NOME_DIM.get(code) || code,
      score_bp,
      display_score: displayScore(score_bp),
      band: bandOf(score_bp),
      valid_items: validItems,
      total_items: itens.length,
    };
    dimensions.push(dim);
    porCodigo.set(code, dim);
  }
  const index_bp = blockIndex(dimensions.map((d) => d.score_bp));
  const todosStages = ordem.flatMap((code) => (dimMap.get(code) || []).map((c) => respostas[c]));
  const coverage_bp = coverageBp(todosStages);
  const valid_dimensions = dimensions.filter((d) => d.score_bp !== null).length;
  return { dimensions, porCodigo, index_bp, coverage_bp, valid_dimensions };
}

// =============================================================
// Contrato de saída
// =============================================================
/**
 * @typedef {"E1"|"E2"|"E3"|"E4"|"NA"} Stage
 */

/**
 * Calcula o resultado determinístico do screener.
 *
 * @param {object} params
 * @param {Record<string,Stage>} params.respostas  código do item → estágio (30 itens)
 * @param {{id:string,name:string}} [params.assessment_unit]
 * @param {string} [params.assessment_id]
 * @param {{respondent_count?:number}} [params.respondent_scope]
 * @param {string} [params.report_version]
 * @returns {object} ScoreResultV1
 */
export function calcular({
  respostas,
  assessment_unit = { id: "unknown", name: "Unidade avaliada" },
  assessment_id = "unknown",
  respondent_scope = { respondent_count: 1 },
  report_version = "1.0.0",
} = {}) {
  // --- validação de entrada: 30 itens, estágios válidos ---
  for (const it of instrumento.items) {
    const s = respostas[it.code];
    if (s === undefined) throw new Error(`Resposta ausente: ${it.code}`);
    if (!ESTAGIOS_VALIDOS.has(s)) throw new Error(`Estágio inválido em ${it.code}: ${s}`);
  }
  const extras = Object.keys(respostas).filter((c) => !ITENS_POR_CODIGO.has(c));
  if (extras.length) throw new Error(`Respostas para itens inexistentes: ${extras.join(", ")}`);

  const ind = calcularBloco(DIM_INDIVIDUAL, ORDEM_DIM_ORG, respostas);
  const org = calcularBloco(DIM_ORGANIZACAO, ORDEM_DIM_ORG, respostas);
  const ia = calcularBloco(DIM_IA, ORDEM_EIXO_IA, respostas);

  // --- alinhamento Pessoa × Empresa por dimensão ---
  const alignment = ORDEM_DIM_ORG.map((code) => {
    const i = ind.porCodigo.get(code).score_bp;
    const o = org.porCodigo.get(code).score_bp;
    if (i === null || o === null) {
      return {
        dimension: code,
        individual_bp: i,
        organization_bp: o,
        gap_bp: null,
        magnitude: "insufficient",
        direction: "insufficient",
      };
    }
    const gap = i - o;
    const direction = gap > 0 ? "individual_ahead" : gap < 0 ? "organization_ahead" : "aligned";
    return { dimension: code, individual_bp: i, organization_bp: o, gap_bp: gap, magnitude: gapMagnitude(gap), direction };
  });
  const gapPorDim = new Map(alignment.map((a) => [a.dimension, a.gap_bp]));

  // --- governança (itens de IA_GOV) ---
  const govItens = DIM_IA.get("IA_GOV") || [];
  const governance_gate = governanceGate(govItens.map((c) => respostas[c]));

  // --- matriz Empresa × IA ---
  const matrizDisponivel =
    org.index_bp !== null &&
    ia.index_bp !== null &&
    org.coverage_bp >= MIN_COBERTURA_MATRIZ &&
    ia.coverage_bp >= MIN_COBERTURA_MATRIZ;
  const matrix = {
    available: matrizDisponivel,
    quadrant: matrizDisponivel ? matrixQuadrant(org.index_bp, ia.index_bp) : null,
    provisional_cut_bp: CORTE_MATRIZ,
    governance_overlay: governance_gate,
  };

  // --- prioridades determinísticas (uma por escopo, máx. 3) ---
  const priorities = [];
  const pInd = prioridadeIndividual(ind, gapPorDim);
  if (pInd) priorities.push(pInd);
  const pOrg = prioridadeOrganizacional(org);
  if (pOrg) priorities.push(pOrg);
  const pIa = prioridadeIA(ia, governance_gate);
  if (pIa) priorities.push(pIa);
  priorities.forEach((p, i) => (p.rank = i + 1));

  // --- avisos ---
  const warnings = [];
  if (ind.valid_dimensions < ORDEM_DIM_ORG.length) warnings.push({ code: "individual_partial", scope: "individual" });
  if (org.index_bp === null) warnings.push({ code: "organization_index_unavailable", scope: "organization" });
  if (ia.index_bp === null) warnings.push({ code: "ai_index_unavailable", scope: "ai" });
  if (!matrizDisponivel) warnings.push({ code: "matrix_unavailable", scope: "matrix" });
  if (governance_gate === "insufficient") warnings.push({ code: "governance_insufficient", scope: "ai" });

  const respondentCount = respondent_scope.respondent_count ?? 1;

  return {
    instrument_version: instrumento.instrument.version,
    scoring_version: "1.0.0",
    report_version,
    instrument_checksum: checksum(),
    assessment_id,
    assessment_unit,
    respondent_scope: {
      respondent_count: respondentCount,
      organization_label: respondentCount <= 1 ? "individual_perception" : "triangulated_perceptions",
      represented_groups: respondent_scope.represented_groups ?? 1,
    },
    coverage: {
      individual_bp: ind.coverage_bp,
      organization_bp: org.coverage_bp,
      ai_bp: ia.coverage_bp,
      valid_dimensions: {
        individual: ind.valid_dimensions,
        organization: org.valid_dimensions,
        ai: ia.valid_dimensions,
      },
    },
    individual: {
      overall_score_bp: null, // por decisão: indivíduo não tem nota geral
      dimensions: ind.dimensions,
    },
    organization: {
      index_bp: org.index_bp,
      band: bandOf(org.index_bp),
      dimensions: org.dimensions,
      agreement: null, // só com múltiplos respondentes
    },
    ai: {
      index_bp: ia.index_bp,
      band: bandOf(ia.index_bp),
      dimensions: ia.dimensions,
      governance_gate,
    },
    alignment,
    matrix,
    priorities,
    warnings,
    prohibited_outputs: [
      "combined_overall_score",
      "risk_percentage",
      "financial_loss_estimate",
      "personality_archetype",
      "automatic_people_decision",
    ],
  };
}

// ---- seleção de prioridades (determinística) ----
function menorDimensao(dimensions, ordem, desempate) {
  const validas = dimensions.filter((d) => d.score_bp !== null);
  if (validas.length === 0) return null;
  validas.sort((a, b) => {
    if (a.score_bp !== b.score_bp) return a.score_bp - b.score_bp;
    const d = desempate ? desempate(a, b) : 0;
    if (d !== 0) return d;
    return ordem.indexOf(a.code) - ordem.indexOf(b.code);
  });
  return validas[0];
}

function acao(code) {
  return instrumento.action_library[code] || null;
}

function prioridadeIndividual(ind, gapPorDim) {
  const escolhida = menorDimensao(ind.dimensions, ORDEM_DIM_ORG, (a, b) => {
    // desempate: maior gap negativo (contexto à frente da pessoa)
    const ga = gapPorDim.get(a.code) ?? 0;
    const gb = gapPorDim.get(b.code) ?? 0;
    return ga - gb; // mais negativo primeiro
  });
  if (!escolhida) return null;
  return {
    scope: "individual",
    dimension: escolhida.code,
    score_bp: escolhida.score_bp,
    evidence_item_codes: DIM_INDIVIDUAL.get(escolhida.code) || [],
    action: acao(escolhida.code),
    rationale_template_key: `priority_individual_${escolhida.code}`,
  };
}

function prioridadeOrganizacional(org) {
  // um respondente: sem dispersão; desempate cai na ordem configurada
  const escolhida = menorDimensao(org.dimensions, ORDEM_DIM_ORG, null);
  if (!escolhida) return null;
  return {
    scope: "organization",
    dimension: escolhida.code,
    score_bp: escolhida.score_bp,
    evidence_item_codes: DIM_ORGANIZACAO.get(escolhida.code) || [],
    action: acao(escolhida.code),
    rationale_template_key: `priority_organization_${escolhida.code}`,
  };
}

function prioridadeIA(ia, gate) {
  // governança bloqueada ou condicionada → IA_GOV é a prioridade
  if (gate === "blocked" || gate === "conditioned") {
    const gov = ia.porCodigo.get("IA_GOV");
    if (gov && gov.score_bp !== null) {
      return {
        scope: "ai",
        dimension: "IA_GOV",
        score_bp: gov.score_bp,
        evidence_item_codes: DIM_IA.get("IA_GOV") || [],
        action: acao("IA_GOV"),
        rationale_template_key: "priority_ai_governance_gate",
      };
    }
  }
  const escolhida = menorDimensao(ia.dimensions, ORDEM_EIXO_IA, null);
  if (!escolhida) return null;
  return {
    scope: "ai",
    dimension: escolhida.code,
    score_bp: escolhida.score_bp,
    evidence_item_codes: DIM_IA.get(escolhida.code) || [],
    action: acao(escolhida.code),
    rationale_template_key: `priority_ai_${escolhida.code}`,
  };
}
