// =============================================================
// CASOS OBRIGATÓRIOS DO PROMPT §9 / CHECKLIST-DE-ACEITE que a suíte do pacote
// não cobre — E1 uniforme, E2 uniforme, E4 uniforme puro e "IA muito atrás do
// sistema humano".
//
// Por que aqui e não em `pacote/tests/output-engine-v2.test.mjs`: aquele arquivo
// é VERBATIM do pacote (o sha256 é conferido em `pacote-integro.test.mjs`) e não
// pode ser editado. Estes casos são da casa e passam pela MESMA porta que a edge
// usa — `calcularContrato` + `paraPublico` —, de modo que provam o caminho real
// do produto, não só o motor isolado.
//
// Nada aqui altera pesos, cortes ou limiares: os valores esperados foram lidos
// do motor, não escolhidos.
// =============================================================
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento } from "./definicao.mjs";
import { calcularContrato, paraPublico } from "./logica.mjs";

const CTX = instrumento.items.filter((it) => it.kind === "context");

/**
 * Respostas completas com o MESMO nível em todos os itens pontuados e de
 * governança. `over` sobrescreve itens específicos; `ctx` escolhe o índice da
 * opção de papel, alcance e autoridade.
 */
function uniforme(nivel, { over = {}, ctx = [0, 2, 2] } = {}) {
  const out = {};
  CTX.forEach((it, i) => { out[it.id] = it.options[ctx[i]].id; });
  for (const it of instrumento.items) if (it.kind !== "context") out[it.id] = nivel;
  return { ...out, ...over };
}
const publico = (respostas) => paraPublico(calcularContrato({ respostas }));

test("E1 uniforme: primeiro degrau, governança crítica e escala bloqueada", () => {
  const p = publico(uniforme("E1"));
  assert.equal(p.status, "ORIENTATIVE_HYPOTHESIS");
  assert.equal(p.positioning.stage, "Operacional Ágil");
  assert.equal(p.governance.id, "CRITICAL");
  assert.equal(p.restriction, "NO_SCALE");
  assert.equal(p.evidence.status, "BROAD");
  // uniforme = nenhuma dimensão se destaca; nada de extremo artificial
  assert.deepEqual(p.supporters, []);
  assert.deepEqual(p.limiters, []);
  assert.deepEqual(p.tensions, []);
});

test("E2 uniforme: segundo degrau, atenção e experimentos controlados", () => {
  const p = publico(uniforme("E2"));
  assert.equal(p.positioning.stage, "Gestor Tático");
  assert.equal(p.governance.id, "ATTENTION");
  assert.equal(p.restriction, "CONTROLLED_EXPERIMENTS");
  assert.equal(p.signature.id, "BALANCED");
  assert.deepEqual(p.supporters, []);
  assert.deepEqual(p.limiters, []);
});

test("E4 uniforme: quinto degrau, governança estabelecida, sem restrição", () => {
  const p = publico(uniforme("E4"));
  assert.equal(p.positioning.stage, "Criador de Tecnologia");
  assert.equal(p.governance.id, "ESTABLISHED");
  assert.equal(p.restriction, "NONE");
  // a ressalva do quinto degrau vem do motor quando é ele o degrau atual
  assert.match(p.positioning.clarification, /não exige tecnologia proprietária/);
});

test("E3 uniforme: quarto degrau e leitura equilibrada (espelha o caso do pacote pela porta da casa)", () => {
  const p = publico(uniforme("E3"));
  assert.equal(p.positioning.stage, "Arquiteto de Soluções");
  assert.equal(p.signature.id, "BALANCED");
  assert.equal(p.governance.id, "MONITORED");
});

test("o papel muda só a lente do texto: nem o degrau, nem a governança, nem os extremos", () => {
  // CHECKLIST: "linguagem se adapta ao papel sem alterar o cálculo".
  const papeis = CTX[0].options.map((o) => o.id);
  assert.ok(papeis.length >= 3);
  const lentes = new Set();
  let referencia = null;
  for (let i = 0; i < papeis.length; i++) {
    const p = publico(uniforme("E3", { ctx: [i, 2, 2] }));
    const assinatura = JSON.stringify({
      stage: p.positioning.stage, gov: p.governance.id, restr: p.restriction,
      sup: p.supporters, lim: p.limiters, ten: p.tensions, ref: p.reference, gap: p.gap,
    });
    if (referencia === null) referencia = assinatura;
    assert.equal(assinatura, referencia, `o papel "${papeis[i]}" mudou o cálculo`);
    lentes.add(p.roleLens);
  }
  assert.ok(lentes.size > 1, "a lente do papel deveria mudar o texto");
});

test("IA muito atrás do sistema humano: assinatura HUMAN_SYSTEM_AHEAD_OF_AI", () => {
  const ia = instrumento.dimensions.find((d) => d.id === "IA").items;
  const p = publico(uniforme("E4", { over: Object.fromEntries(ia.map((id) => [id, "E1"])) }));
  assert.equal(p.signature.id, "HUMAN_SYSTEM_AHEAD_OF_AI");
  // a dimensão atrasada aparece como limitador, com risco e próximo movimento
  assert.ok(p.limiters.length >= 1);
  assert.ok(p.limiters[0].risk && p.limiters[0].action);
});

test("IA muito à frente do sistema humano: assinatura AI_AHEAD_OF_MANAGEMENT", () => {
  const ia = instrumento.dimensions.find((d) => d.id === "IA").items;
  const gates = instrumento.items.filter((it) => it.kind === "governance_gate").map((it) => it.id);
  // Governança fica sadia de propósito: com o gate crítico a assinatura vira
  // GOVERNANCE_BLOCKED (o motor faz a governança dominar), e o caso a provar
  // aqui é a assimetria entre IA e sistema humano.
  const p = publico(uniforme("E1", { over: { ...Object.fromEntries(ia.map((id) => [id, "E4"])), ...Object.fromEntries(gates.map((id) => [id, "E4"])) } }));
  assert.equal(p.signature.id, "AI_AHEAD_OF_MANAGEMENT");
  assert.ok(p.supporters.length >= 1);
});
