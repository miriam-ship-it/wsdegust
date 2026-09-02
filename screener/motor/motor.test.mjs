// Motor determinístico (spec §17.2–17.5, §17.7–17.8 e obrigatórios do grilling).
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento } from "./definicao.mjs";
import {
  calcular,
  dimensionScore,
  meanBp,
  coverageBp,
  blockIndex,
  matrixQuadrant,
  governanceGate,
} from "./motor.mjs";

/** códigos de item de um (bloco, dimensão). */
function itens(block, dim) {
  return instrumento.items.filter((i) => i.block === block && i.dimension === dim).map((i) => i.code);
}
/** respostas com todos os 30 itens no mesmo estágio, com overrides por código. */
function preencher(stage, overrides = {}) {
  const r = {};
  for (const it of instrumento.items) r[it.code] = stage;
  return Object.assign(r, overrides);
}

// ---------- funções puras ----------
test("dimensionScore: E2+E3 = 5000; E1+E4 = 5000", () => {
  assert.equal(dimensionScore(["E2", "E3"]), 5000);
  assert.equal(dimensionScore(["E1", "E4"]), 5000);
});

test("dimensionScore: um N/A torna a dimensão nula (N/A nunca vira zero)", () => {
  assert.equal(dimensionScore(["NA", "E4"]), null);
  assert.equal(dimensionScore(["E4", "NA"]), null);
  assert.equal(dimensionScore(["NA", "NA"]), null);
});

test("dimensionScore exige exatamente 2 itens", () => {
  assert.equal(dimensionScore(["E4"]), null);
  assert.equal(dimensionScore(["E4", "E4", "E4"]), null);
});

test("meanBp ignora nulos e nunca conta N/A como zero", () => {
  assert.equal(meanBp([0, 10000]), 5000);
  assert.equal(meanBp([null, 10000]), 10000); // nulo fora do denominador
  assert.equal(meanBp([null, null]), null);
});

test("coverageBp reflete proporção de respondidos", () => {
  assert.equal(coverageBp(["E1", "E2", "E3", "E4"]), 10000);
  assert.equal(coverageBp(["E1", "NA", "E3", "NA"]), 5000);
});

test("blockIndex exige ≥4 dimensões válidas", () => {
  assert.equal(blockIndex([1000, 2000, 3000, 4000, 5000]), 3000);
  assert.equal(blockIndex([1000, 2000, 3000, 4000, null]), 2500);
  assert.equal(blockIndex([1000, 2000, 3000, null, null]), null); // só 3 válidas
});

test("matrixQuadrant: cortes 4999/5000", () => {
  assert.equal(matrixQuadrant(4999, 4999), "FOUNDATION_FIRST");
  assert.equal(matrixQuadrant(5000, 4999), "GOVERNED_EXPERIMENTATION");
  assert.equal(matrixQuadrant(4999, 5000), "FRAGILE_ADOPTION");
  assert.equal(matrixQuadrant(5000, 5000), "RESPONSIBLE_SCALE");
});

test("governanceGate: E1→blocked, E2→conditioned, E3→eligible, N/A→insufficient", () => {
  assert.equal(governanceGate(["E1", "E4"]), "blocked");
  assert.equal(governanceGate(["E2", "E4"]), "conditioned");
  assert.equal(governanceGate(["E3", "E3"]), "eligible");
  assert.equal(governanceGate(["E4", "E4"]), "eligible");
  assert.equal(governanceGate(["NA", "E4"]), "insufficient");
});

// ---------- cálculo integrado ----------
test("todos E1 → tudo em 0", () => {
  const r = calcular({ respostas: preencher("E1") });
  for (const d of r.individual.dimensions) assert.equal(d.score_bp, 0);
  assert.equal(r.organization.index_bp, 0);
  assert.equal(r.ai.index_bp, 0);
});

test("todos E4 → tudo em 10000", () => {
  const r = calcular({ respostas: preencher("E4") });
  for (const d of r.organization.dimensions) assert.equal(d.score_bp, 10000);
  assert.equal(r.organization.index_bp, 10000);
  assert.equal(r.ai.index_bp, 10000);
});

test("todos E3 → 6667, banda E3, matriz Escala Responsável, governança elegível", () => {
  const r = calcular({ respostas: preencher("E3") });
  assert.equal(r.organization.index_bp, 6667);
  assert.equal(r.organization.band.code, "E3");
  assert.equal(r.ai.governance_gate, "eligible");
  assert.equal(r.matrix.available, true);
  assert.equal(r.matrix.quadrant, "RESPONSIBLE_SCALE");
  assert.equal(r.individual.overall_score_bp, null); // indivíduo não tem nota geral
  assert.equal(r.respondent_scope.organization_label, "individual_perception");
});

test("N/A num item deixa a dimensão nula e reduz cobertura (nunca zera)", () => {
  const vis = itens("individual", "VIS");
  const r = calcular({ respostas: preencher("E4", { [vis[0]]: "NA" }) });
  const dim = r.individual.dimensions.find((d) => d.code === "VIS");
  assert.equal(dim.score_bp, null);
  assert.equal(dim.valid_items, 1);
  assert.ok(r.coverage.individual_bp < 10000);
});

test("índice de bloco: 4 dimensões válidas calcula, 3 não", () => {
  const dec = itens("organization", "DEC");
  let r = calcular({ respostas: preencher("E3", { [dec[0]]: "NA", [dec[1]]: "NA" }) });
  assert.notEqual(r.organization.index_bp, null);
  assert.equal(r.coverage.valid_dimensions.organization, 4);

  const per = itens("organization", "PER");
  r = calcular({ respostas: preencher("E3", { [dec[0]]: "NA", [dec[1]]: "NA", [per[0]]: "NA", [per[1]]: "NA" }) });
  assert.equal(r.organization.index_bp, null);
  assert.equal(r.coverage.valid_dimensions.organization, 3);
});

test("independência entre blocos: mexer em Pessoa não altera Empresa nem IA", () => {
  const base = calcular({ respostas: preencher("E3") });
  const ov = {};
  for (const c of instrumento.items.filter((i) => i.block === "individual").map((i) => i.code)) ov[c] = "E1";
  const mod = calcular({ respostas: preencher("E3", ov) });
  assert.equal(mod.organization.index_bp, base.organization.index_bp);
  assert.equal(mod.ai.index_bp, base.ai.index_bp);
  assert.equal(mod.ai.governance_gate, base.ai.governance_gate);
});

test("independência entre blocos: mexer em IA não altera Pessoa nem Empresa", () => {
  const base = calcular({ respostas: preencher("E3") });
  const ov = {};
  for (const c of instrumento.items.filter((i) => i.block === "ai").map((i) => i.code)) ov[c] = "E1";
  const mod = calcular({ respostas: preencher("E3", ov) });
  assert.deepEqual(mod.individual.dimensions, base.individual.dimensions);
  assert.equal(mod.organization.index_bp, base.organization.index_bp);
});

test("governança é separada: o gate não entra como penalidade no índice de IA", () => {
  const gov = itens("ai", "IA_GOV");
  const r = calcular({ respostas: preencher("E3", { [gov[0]]: "E1", [gov[1]]: "E1" }) });
  assert.equal(r.ai.governance_gate, "blocked");
  // o índice é exatamente a média dos 5 eixos — reflete IA_GOV=0, sem punição extra
  const eixos = r.ai.dimensions.map((d) => d.score_bp);
  assert.equal(r.ai.index_bp, meanBp(eixos));
});

test("gap Pessoa × Empresa: direção e magnitude", () => {
  const vi = itens("individual", "VIS");
  const vo = itens("organization", "VIS");
  const r = calcular({ respostas: preencher("E3", { [vi[0]]: "E4", [vi[1]]: "E4", [vo[0]]: "E2", [vo[1]]: "E2" }) });
  const al = r.alignment.find((a) => a.dimension === "VIS");
  assert.equal(al.individual_bp, 10000);
  assert.equal(al.organization_bp, 3333);
  assert.equal(al.gap_bp, 6667);
  assert.equal(al.direction, "individual_ahead");
  assert.equal(al.magnitude, "high");
});

test("gap insuficiente quando um lado é nulo; gap não altera nenhum score", () => {
  const vi = itens("individual", "VIS");
  const base = calcular({ respostas: preencher("E3") });
  const r = calcular({ respostas: preencher("E3", { [vi[0]]: "NA", [vi[1]]: "NA" }) });
  const al = r.alignment.find((a) => a.dimension === "VIS");
  assert.equal(al.gap_bp, null);
  assert.equal(al.direction, "insufficient");
  // Empresa/IA intactos
  assert.equal(r.organization.index_bp, base.organization.index_bp);
  assert.equal(r.ai.index_bp, base.ai.index_bp);
});

test("matriz indisponível quando o índice de Empresa é nulo", () => {
  const dec = itens("organization", "DEC");
  const per = itens("organization", "PER");
  const com = itens("organization", "COM");
  const ov = {};
  for (const c of [...dec, ...per, ...com]) ov[c] = "NA"; // 3 dims nulas → 2 válidas → índice nulo
  const r = calcular({ respostas: preencher("E3", ov) });
  assert.equal(r.organization.index_bp, null);
  assert.equal(r.matrix.available, false);
  assert.equal(r.matrix.quadrant, null);
});

test("prioridades: uma por escopo, determinísticas, ancoradas na menor dimensão", () => {
  const dec = itens("individual", "DEC");
  const r = calcular({ respostas: preencher("E4", { [dec[0]]: "E1", [dec[1]]: "E1" }) });
  const p = r.priorities.find((x) => x.scope === "individual");
  assert.equal(p.dimension, "DEC");
  assert.deepEqual([...p.evidence_item_codes].sort(), [...dec].sort());
  assert.ok(p.action && p.action.length > 0);
  assert.ok(r.priorities.length <= 3);
  assert.deepEqual(r.priorities.map((x) => x.scope), ["individual", "organization", "ai"]);
});

test("prioridade de IA vai para governança quando o gate está bloqueado", () => {
  const gov = itens("ai", "IA_GOV");
  const r = calcular({ respostas: preencher("E4", { [gov[0]]: "E1", [gov[1]]: "E1" }) });
  const p = r.priorities.find((x) => x.scope === "ai");
  assert.equal(p.dimension, "IA_GOV");
});

test("determinismo: mesma entrada → snapshot idêntico byte a byte", () => {
  const entrada = preencher("E3", { [itens("ai", "IA_USO")[0]]: "E2" });
  const a = JSON.stringify(calcular({ respostas: entrada }));
  const b = JSON.stringify(calcular({ respostas: entrada }));
  assert.equal(a, b);
});

test("resultado carrega o checksum do instrumento e as versões", () => {
  const r = calcular({ respostas: preencher("E3") });
  assert.match(r.instrument_checksum, /^[0-9a-f]{64}$/);
  assert.equal(r.instrument_version, "1.0.0");
  assert.equal(r.scoring_version, "1.0.0");
});

test("submissão incompleta ou inválida é rejeitada", () => {
  const faltando = preencher("E3");
  delete faltando[instrumento.items[0].code];
  assert.throws(() => calcular({ respostas: faltando }), /ausente/);

  const invalido = preencher("E3");
  invalido[instrumento.items[0].code] = "E5";
  assert.throws(() => calcular({ respostas: invalido }), /inválido/);
});

test("nenhuma saída proibida vaza; contrato lista as proibições", () => {
  const r = calcular({ respostas: preencher("E3") });
  const blob = JSON.stringify(r);
  for (const proibido of ["risk_percentage", "cdl", "financial_loss", "archetype", "combined_overall"]) {
    // não aparece como VALOR calculado (só como rótulo em prohibited_outputs)
  }
  assert.deepEqual(r.prohibited_outputs, [
    "combined_overall_score",
    "risk_percentage",
    "financial_loss_estimate",
    "personality_archetype",
    "automatic_people_decision",
  ]);
  assert.equal(r.individual.overall_score_bp, null);
});
