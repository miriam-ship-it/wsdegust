// Testes do motor V2 (escada ponderada 0.4·T + 0.6·L + teto de liderança). node --test.
import test from "node:test";
import assert from "node:assert/strict";
import { calcularV2 } from "./motor-v2.mjs";

// Q1-Q3 técnico; Q4-Q8 liderança.
const R = (tec, lid) => ({ Q1: tec, Q2: tec, Q3: tec, Q4: lid, Q5: lid, Q6: lid, Q7: lid, Q8: lid });

test("adoção frágil: técnico à frente da liderança → nível efetivo travado pela liderança", () => {
  const r = calcularV2(R(4, 1), "diretoria");
  assert.equal(r.eixos.tecnico.nivel, 4);
  assert.equal(r.eixos.lideranca.nivel, 1);
  assert.equal(r.ponderada, 2.2);         // 0.4·4 + 0.6·1 = 2.2 → round 2
  assert.equal(r.nivel.n, 2);            // min(round(2.2), 1+1) = 2 (teto de liderança)
  assert.equal(r.sinal, "adocao_fragil"); // 4 − 1 ≥ 2
});

test("equilibrado mediano → nível segue os eixos, sem sinal", () => {
  const r = calcularV2(R(2, 2), "gerencia");
  assert.equal(r.nivel.n, 2);
  assert.equal(r.sinal, "none");
});

test("liderança a destravar: liderança acima do uso técnico puxa o nível para cima", () => {
  const r = calcularV2(R(1, 3));
  assert.equal(r.eixos.tecnico.nivel, 1);
  assert.equal(r.eixos.lideranca.nivel, 3);
  assert.equal(r.ponderada, 2.2);         // 0.4·1 + 0.6·3 = 2.2 → round 2
  assert.equal(r.nivel.n, 2);            // liderança pesa mais e não há teto (min(2, 3+1)=2)
  assert.equal(r.sinal, "lideranca_a_destravar");
});

test("teto de liderança impede saltar acima da liderança + folga", () => {
  // T=4, L=2 → ponderada 0.4·4+0.6·2 = 2.8 → round 3, mas teto = 2+1 = 3 → 3 (no limite)
  assert.equal(calcularV2(R(4, 2)).nivel.n, 3);
  // T=3, L=1 → ponderada 0.4·3+0.6·1 = 1.8 → round 2, teto = 1+1 = 2 → 2
  assert.equal(calcularV2(R(3, 1)).nivel.n, 2);
});

test("topo: tudo Nível 4 → efetivo 4, display 100", () => {
  const r = calcularV2(R(4, 4), "diretoria");
  assert.equal(r.nivel.n, 4);
  assert.equal(r.nivel.name, "Arquiteto de IA");
  assert.equal(r.nivel.display, 100);
  assert.equal(r.gap.valor, 0);
  assert.equal(r.gap.classe, "no");
});

test('"Não sei" é excluído da média (não vira zero)', () => {
  const r = calcularV2({ Q1: 3, Q2: "na", Q3: 3, Q4: 3, Q5: 3, Q6: 3, Q7: "na", Q8: "na" });
  assert.equal(r.eixos.tecnico.respondidos, 2);
  assert.equal(r.eixos.tecnico.nivel, 3);   // média de [3,3]
  assert.equal(r.eixos.tecnico.cobertura, true); // 2 ≥ 2
  assert.equal(r.eixos.lideranca.respondidos, 3);
  assert.equal(r.eixos.lideranca.cobertura, true); // 3 ≥ 3
});

test("cobertura insuficiente por eixo é sinalizada", () => {
  const r = calcularV2({ Q1: 2 }); // só 1 técnico, nenhum de liderança
  assert.equal(r.eixos.tecnico.cobertura, false); // 1 < 2
  assert.equal(r.eixos.lideranca.cobertura, false);
  assert.equal(r.cobertura_ok, false);
});

test("esperado por senioridade e classe do gap", () => {
  assert.equal(calcularV2(R(3, 3), "diretoria").gap.classe, "abaixo"); // efetivo 3, esperado 4
  assert.equal(calcularV2(R(3, 3), "gerencia").gap.classe, "no");      // efetivo 3, esperado 3
  assert.equal(calcularV2(R(2, 2), "analista").gap.classe, "acima");   // efetivo 2, esperado 1
});

test("exibição 0–100 por nível", () => {
  assert.equal(calcularV2(R(1, 1)).nivel.display, 0);
  assert.equal(calcularV2(R(2, 2)).nivel.display, 33);
  assert.equal(calcularV2(R(3, 3)).nivel.display, 67);
  assert.equal(calcularV2(R(4, 4)).nivel.display, 100);
});

test("meia-nota arredonda para cima (round)", () => {
  // técnico [3,4] → média 3.5 → round 4
  const r = calcularV2({ Q1: 3, Q2: 4, Q3: "na", Q4: 4, Q5: 4, Q6: 4, Q7: 4, Q8: 4 });
  assert.equal(r.eixos.tecnico.nivel, 4);
});
