// A leitura cruzada. O que estes testes protegem não é aritmética — é a regra
// de não afirmar mais do que se mediu.
import test from "node:test";
import assert from "node:assert/strict";
import { cruzar, sinteseCruzada, CORTE_CRUZAMENTO } from "./cruzamento.mjs";

const lid = (score100, letra = "A", label = "Consolidado") => ({ score100, letra, label });
const ia = (indice, nome = "Arquiteto de Soluções") => ({ indice, degrau: { posicao: 4, nome } });

test("meia medida não vira leitura cruzada", () => {
  assert.equal(cruzar(null, ia(60)), null, "sem liderança não há cruzamento");
  assert.equal(cruzar(lid(70), null), null, "sem IA não há cruzamento");
  assert.equal(cruzar(null, null), null);
  assert.equal(cruzar({ score100: NaN }, ia(60)), null, "medida inválida não conta como medida");
});

test("patamares próximos: nenhuma frente puxa a outra", () => {
  const c = cruzar(lid(70), ia(60));
  assert.equal(c.padrao.id, "INTEGRADO");
  assert.equal(c.distancia, 10);
  assert.ok(c.distancia < CORTE_CRUZAMENTO);
});

test("liderança à frente: estrutura de decisão maior que a adoção", () => {
  const c = cruzar(lid(85, "AA"), ia(40));
  assert.equal(c.padrao.id, "LIDERANCA_ADIANTE");
  assert.equal(c.distancia, 45);
  assert.match(c.padrao.consequencia, /acelerar/i);
});

test("IA à frente: o caso que mais exige atenção", () => {
  const c = cruzar(lid(35, "C"), ia(80));
  assert.equal(c.padrao.id, "IA_ADIANTE");
  assert.equal(c.distancia, 45);
  assert.match(c.padrao.texto, /mais r[áa]pido/i);
  assert.match(c.padrao.consequencia, /antes de escalar/i);
});

test("o corte é o mesmo que o motor de IA usa para assinatura", () => {
  // 15 de 100 = 1500 pontos-base de 10000. Dois cortes diferentes para a mesma
  // ideia é como se criam contradições entre as metades do documento.
  assert.equal(CORTE_CRUZAMENTO, 15);
  assert.equal(cruzar(lid(60), ia(45)).padrao.id, "LIDERANCA_ADIANTE", "exatamente no corte já separa");
  assert.equal(cruzar(lid(59), ia(45)).padrao.id, "INTEGRADO", "um ponto abaixo do corte ainda é junto");
});

test("a ressalva acompanha a leitura, não fica escondida no fim", () => {
  const c = cruzar(lid(70), ia(60));
  assert.match(c.ressalva, /instrumentos distintos/);
  assert.match(c.ressalva, /direção, não precisão/);
});

test("não existe índice combinado, e nem deveria", () => {
  const c = cruzar(lid(80), ia(40));
  const chaves = Object.keys(c);
  assert.ok(!chaves.some((k) => /combinad|geral|total|unific/i.test(k)),
    "um índice dos dois seria número novo sem instrumento que o sustente");
});

test("síntese cruzada: cita as duas medidas e a relação, sem juízo novo", () => {
  const L = lid(74, "A", "Consolidado"), I = ia(64);
  const t = sinteseCruzada({ lideranca: L, ia: I, cruzamento: cruzar(L, I) });
  assert.ok(t.includes("74"), "cita a medida de liderança");
  assert.ok(t.includes("64"), "cita a medida de IA");
  assert.ok(t.includes("Arquiteto de Soluções"), "cita o degrau");
  assert.ok(t.includes("A"), "cita o estágio");
  const palavras = t.split(/\s+/).length;
  assert.ok(palavras >= 40 && palavras <= 160, `síntese com ${palavras} palavras`);
});

test("síntese com uma metade só avisa, em vez de fingir", () => {
  const t = sinteseCruzada({ lideranca: lid(74), ia: null, cruzamento: null });
  assert.match(t, /apenas uma das duas leituras/);
});
