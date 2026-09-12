import {
  VERSION, DIMENSIONS, STAGES, GAP_OUTPUTS, SIGNATURES, TENSIONS,
  GOVERNANCE, NIST_FUNCTIONS, ROLE_LENSES, DIMENSION_GUIDANCE,
  EXECUTIVE_QUESTIONS, DISCLAIMER
} from "./output-definition-v2.mjs";

const SCORE = { E1: 0, E2: 3333, E3: 6667, E4: 10000 };
const SCOPE = { SELF: 1, TEAM: 2, AREA: 3, MULTI_AREA: 4, ENTERPRISE: 5 };
const AUTHORITY = { INFORM: 1, RECOMMEND: 2, CO_DECIDE: 3, DECIDE_SCOPE: 4, DECIDE_ENTERPRISE: 5 };
const round = n => Math.round(n);
const mean = xs => xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

export function scoreItem(optionId) { return SCORE[optionId] ?? null; }

export function scoreDimension(itemIds, answers) {
  const values = itemIds.map(id => scoreItem(answers[id])).filter(Number.isFinite);
  return { valid: values.length >= 3, validItems: values.length, bp: values.length >= 3 ? mean(values) : null };
}

export function scoreAllDimensions(instrument, answers) {
  return Object.fromEntries(instrument.dimensions.map(d => [d.id, scoreDimension(d.items, answers)]));
}

export function calculateEvidenceSufficiency(dimensions) {
  const validItems = Object.values(dimensions).reduce((n, d) => n + d.validItems, 0);
  const validDimensions = Object.values(dimensions).filter(d => d.valid).length;
  if (validDimensions < 6) return { status: "INSUFFICIENT", validItems, validDimensions, canSynthesize: false };
  if (validItems === 24) return { status: "BROAD", validItems, validDimensions, canSynthesize: true };
  if (validItems >= 21) return { status: "ADEQUATE", validItems, validDimensions, canSynthesize: true };
  return { status: "LIMITED", validItems, validDimensions, canSynthesize: true };
}

export function calculateAxes(dimensions) {
  if (Object.values(dimensions).some(d => !d.valid)) return null;
  return {
    leadership_bp: mean([dimensions.EST.bp, dimensions.INF.bp]),
    process_bp: mean([dimensions.TAL.bp, dimensions.DES.bp, dimensions.DAD.bp]),
    ai_bp: dimensions.IA.bp
  };
}

export function stageFromBp(bp) { return STAGES.find(s => bp >= s.min && bp <= s.max) ?? null; }

export function calculatePosition(axes) {
  if (!axes) return null;
  const bp = round(.35 * axes.leadership_bp + .35 * axes.process_bp + .30 * axes.ai_bp);
  return { bp, stage: stageFromBp(bp) };
}

export function calculateReference(scopeId, authorityId) {
  const scope = SCOPE[scopeId];
  const authority = AUTHORITY[authorityId];
  if (!scope || !authority) return { status: "UNCERTAIN", stage: null, index: null };
  if (Math.abs(scope - authority) >= 2) return { status: "UNCERTAIN", stage: null, index: null, scope, authority };
  const index = round((scope + authority) / 2);
  return { status: "VALID", index, stage: STAGES[index - 1], scope, authority };
}

export function calculateGap(position, reference) {
  if (!position || reference.status !== "VALID") return { id: "UNCERTAIN", distance: null, ...GAP_OUTPUTS.UNCERTAIN };
  const distance = position.stage.index - reference.index;
  const id = distance > 0 ? "AHEAD" : distance === 0 ? "ALIGNED" : distance === -1 ? "ONE_BELOW" : "TWO_OR_MORE_BELOW";
  return { id, distance, ...GAP_OUTPUTS[id] };
}

export function calculateGovernance(answers) {
  const ids = ["GOV01", "GOV02", "GOV03"];
  const values = ids.map(id => SCORE[answers[id]]).filter(Number.isFinite);
  if (values.length < 3) return { id: "INSUFFICIENT", ...GOVERNANCE.INSUFFICIENT };
  const min = Math.min(...values);
  const id = min === 0 ? "CRITICAL" : min === 3333 ? "ATTENTION" : min === 6667 ? "MONITORED" : "ESTABLISHED";
  return { id, weakestBp: min, ...GOVERNANCE[id] };
}

export function detectSignature(axes, governance) {
  if (governance.id === "CRITICAL") return { id: "GOVERNANCE_BLOCKED", ...SIGNATURES.GOVERNANCE_BLOCKED };
  const values = [axes.leadership_bp, axes.process_bp, axes.ai_bp];
  if (Math.max(...values) - Math.min(...values) < 1000) return { id: "BALANCED", ...SIGNATURES.BALANCED };
  const human = mean([axes.leadership_bp, axes.process_bp]);
  let id = "EMERGING_INTEGRATION";
  if (axes.ai_bp >= human + 1500) id = "AI_AHEAD_OF_MANAGEMENT";
  else if (human >= axes.ai_bp + 1500) id = "HUMAN_SYSTEM_AHEAD_OF_AI";
  else if (axes.leadership_bp >= axes.process_bp + 1500) id = "LEADERSHIP_AHEAD_OF_PROCESS";
  else if (axes.process_bp >= axes.leadership_bp + 1500) id = "PROCESS_WITHOUT_MOBILIZATION";
  return { id, ...SIGNATURES[id] };
}

export function detectTensions(dimensions) {
  return Object.entries(TENSIONS)
    .map(([id, t]) => ({ id, magnitude: dimensions[t.high].bp - dimensions[t.low].bp, ...t }))
    .filter(t => t.magnitude >= 2500)
    .sort((a, b) => b.magnitude - a.magnitude || a.id.localeCompare(b.id))
    .slice(0, 2);
}

function selectExtremes(dimensions, positionBp, direction) {
  const entries = Object.entries(dimensions).map(([id, d]) => ({ id, bp: d.bp, ...DIMENSION_GUIDANCE[id], name: DIMENSIONS[id].name }));
  const range = Math.max(...entries.map(e => e.bp)) - Math.min(...entries.map(e => e.bp));
  if (range < 833) return [];
  const filtered = entries.filter(e => direction === "high" ? e.bp >= positionBp + 833 : e.bp <= positionBp - 833);
  const pool = filtered.length ? filtered : [entries.sort((a, b) => direction === "high" ? b.bp - a.bp : a.bp - b.bp)[0]];
  return pool.sort((a, b) => direction === "high" ? b.bp - a.bp : a.bp - b.bp).slice(0, 2);
}

export const selectSupporters = (dimensions, positionBp) => selectExtremes(dimensions, positionBp, "high");
export const selectLimiters = (dimensions, positionBp) => selectExtremes(dimensions, positionBp, "low");

export function buildActionRoute(position, governance, limiters) {
  if (governance.id === "CRITICAL" || governance.id === "INSUFFICIENT") {
    return { priority: limiters[0]?.id ?? "IA", nist: ["GOVERN", "MAP"], restriction: "NO_SCALE" };
  }
  if (governance.id === "ATTENTION") {
    return { priority: limiters[0]?.id ?? "IA", nist: ["GOVERN", "MAP", "MEASURE"], restriction: "CONTROLLED_EXPERIMENTS" };
  }
  const byStage = { P1: ["MAP", "GOVERN"], P2: ["MAP", "MEASURE"], P3: ["MEASURE", "MANAGE"], P4: ["GOVERN", "MANAGE"], P5: ["GOVERN", "MAP", "MEASURE", "MANAGE"] };
  return { priority: limiters[0]?.id ?? "EST", nist: byStage[position.stage.id], restriction: "NONE" };
}

function actionPlan(priority, route) {
  const g = DIMENSION_GUIDANCE[priority];
  return [
    { horizon: "30 dias", action: `Definir o problema prioritário e ${g.action}; aplicar ${NIST_FUNCTIONS[route.nist[0]].name.toLowerCase()} ao contexto.`, evidence: "Problema, responsável, público afetado, linha de base e decisão esperada registrados." },
    { horizon: "60 dias", action: "Executar um ciclo controlado, registrar exceções e colher evidências de uso, resultado e risco.", evidence: `Primeira leitura do indicador: ${g.indicator}.` },
    { horizon: "90 dias", action: "Revisar as evidências e decidir: escalar, corrigir, manter em teste ou interromper.", evidence: "Decisão registrada com aprendizados, limites e próximo responsável." }
  ];
}

export function buildPublicReportModel({ instrument, answers }) {
  const dimensions = scoreAllDimensions(instrument, answers);
  const evidence = calculateEvidenceSufficiency(dimensions);
  const governance = calculateGovernance(answers);
  const roleId = answers.CTX01 ?? "OTHER";
  if (!evidence.canSynthesize) {
    return { version: VERSION, status: "INSUFFICIENT", evidence, governance, disclaimer: DISCLAIMER, missingMessage: "Não há evidência suficiente para compor uma hipótese de posicionamento. Complete ao menos três itens em cada dimensão." };
  }
  const axes = calculateAxes(dimensions);
  const position = calculatePosition(axes);
  const reference = calculateReference(answers.CTX02, answers.CTX03);
  const gap = calculateGap(position, reference);
  const signature = detectSignature(axes, governance);
  const supporters = selectSupporters(dimensions, position.bp);
  const limiters = selectLimiters(dimensions, position.bp);
  const tensions = detectTensions(dimensions);
  const route = buildActionRoute(position, governance, limiters);
  return {
    version: VERSION,
    status: "ORIENTATIVE_HYPOTHESIS",
    evidence: { status: evidence.status, validItems: evidence.validItems },
    positioning: { stage: position.stage.name, headline: position.stage.headline, reading: position.stage.reading, next: position.stage.next, clarification: position.stage.clarification },
    reference: reference.status === "VALID" ? { status: "VALID", stage: reference.stage.name } : { status: "UNCERTAIN" },
    gap: { id: gap.id, label: gap.label, text: gap.text },
    signature: { id: signature.id, label: signature.label, text: signature.text },
    supporters: supporters.map(x => ({ name: x.name, evidence: x.strength })),
    limiters: limiters.map(x => ({ name: x.name, risk: x.risk, action: x.action })),
    tensions: tensions.map(x => ({ label: x.label, text: x.text })),
    governance: { id: governance.id, label: governance.label, text: governance.text },
    roleLens: ROLE_LENSES[roleId] ?? ROLE_LENSES.OTHER,
    nistRoute: route.nist.map(id => ({ function: NIST_FUNCTIONS[id].name, instruction: NIST_FUNCTIONS[id].instruction })),
    restriction: route.restriction,
    actionPlan: actionPlan(route.priority, route),
    indicators: [...new Set([...(limiters.length ? limiters : supporters).map(x => x.indicator), DIMENSION_GUIDANCE.IA.indicator])].slice(0, 3),
    executiveQuestions: EXECUTIVE_QUESTIONS.slice(0, 3),
    reassessment: "Refaça a leitura em 90 dias, usando o mesmo perímetro da área e registrando evidências que expliquem mudanças de resposta.",
    disclaimer: DISCLAIMER
  };
}

export function buildResultContractV2(args) {
  const publicReport = buildPublicReportModel(args);
  return { public: publicReport, internal: { generatedAt: new Date().toISOString(), instrumentVersion: args.instrument.instrument_version, answers: args.answers } };
}
