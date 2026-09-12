import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  scoreAllDimensions, calculateEvidenceSufficiency, calculateAxes, calculatePosition,
  calculateReference, calculateGap, calculateGovernance, buildPublicReportModel
} from "../src/output-engine-v2.mjs";

const instrument = JSON.parse(await readFile(new URL("../instrumento-rh-ia-v1.json", import.meta.url)));
const scoredIds = instrument.items.filter(x => x.kind === "scored").map(x => x.id);
const answersAt = (level, overrides = {}) => Object.assign({
  CTX01: "HR_LEADER", CTX02: "AREA", CTX03: "CO_DECIDE",
  ...Object.fromEntries(scoredIds.map(id => [id, level])),
  GOV01: level, GOV02: level, GOV03: level
}, overrides);

test("instrumento aprovado permanece 3 contexto + 24 escalares + 3 gates", () => {
  assert.equal(instrument.items.length, 30);
  assert.equal(instrument.items.filter(x => x.kind === "context").length, 3);
  assert.equal(instrument.items.filter(x => x.kind === "scored").length, 24);
  assert.equal(instrument.items.filter(x => x.kind === "governance_gate").length, 3);
});

test("cada dimensão exige três respostas válidas", () => {
  const a = answersAt("E3", { EST01: "NA", EST02: "NA" });
  const dims = scoreAllDimensions(instrument, a);
  assert.equal(dims.EST.valid, false);
  assert.equal(calculateEvidenceSufficiency(dims).canSynthesize, false);
});

test("E3 uniforme gera Arquiteto de Soluções e leitura equilibrada", () => {
  const report = buildPublicReportModel({ instrument, answers: answersAt("E3") });
  assert.equal(report.positioning.stage, "Arquiteto de Soluções");
  assert.equal(report.signature.id, "BALANCED");
  assert.deepEqual(report.supporters, []);
  assert.deepEqual(report.limiters, []);
  assert.equal(report.governance.id, "MONITORED");
});

test("gate crítico bloqueia escala mesmo com alta capacidade", () => {
  const report = buildPublicReportModel({ instrument, answers: answersAt("E4", { GOV02: "E1" }) });
  assert.equal(report.positioning.stage, "Criador de Tecnologia");
  assert.equal(report.governance.id, "CRITICAL");
  assert.equal(report.signature.id, "GOVERNANCE_BLOCKED");
  assert.equal(report.restriction, "NO_SCALE");
  assert.equal(report.nistRoute[0].function, "Governar");
});

test("referência fica inconclusiva quando alcance e autoridade divergem dois pontos", () => {
  const ref = calculateReference("ENTERPRISE", "RECOMMEND");
  assert.equal(ref.status, "UNCERTAIN");
  const position = calculatePosition({ leadership_bp: 5000, process_bp: 5000, ai_bp: 5000 });
  assert.equal(calculateGap(position, ref).id, "UNCERTAIN");
});

test("IA à frente do sistema humano é identificada", () => {
  const overrides = Object.fromEntries(scoredIds.filter(id => id.startsWith("IA")).map(id => [id, "E4"]));
  const report = buildPublicReportModel({ instrument, answers: answersAt("E2", overrides) });
  assert.equal(report.signature.id, "AI_AHEAD_OF_MANAGEMENT");
});

test("modelo público não expõe notas por dimensão nem pontos-base", () => {
  const report = buildPublicReportModel({ instrument, answers: answersAt("E2") });
  const publicJson = JSON.stringify(report);
  assert.doesNotMatch(publicJson, /leadership_bp|process_bp|ai_bp|"bp"|3333|6667|10000/);
  assert.ok(report.disclaimer.includes("hipótese orientativa"));
});

test("funções puras calculam eixos, posição e governança", () => {
  const a = answersAt("E2");
  const dims = scoreAllDimensions(instrument, a);
  assert.deepEqual(calculateAxes(dims), { leadership_bp: 3333, process_bp: 3333, ai_bp: 3333 });
  assert.equal(calculatePosition(calculateAxes(dims)).stage.name, "Gestor Tático");
  assert.equal(calculateGovernance(a).id, "ATTENTION");
});
