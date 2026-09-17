// =============================================================
// LEITURA CRUZADA — o que os dois diagnósticos dizem JUNTOS.
//
// Juntar dois relatórios num documento não é empilhar um depois do outro. Se
// fosse, bastaria grampear os PDFs. O que justifica o documento único é a
// relação entre as duas medidas — e essa relação é interpretação de duas coisas
// medidas, não invenção de uma terceira.
//
// O QUE TORNOU ISSO POSSÍVEL. Os dois lados passaram a falar na mesma escala
// 0–100: o de liderança sempre falou (score × 20), e o de IA passou a falar em
// 14/09. Sem isso, comparar seria comparar régua com termômetro.
//
// O QUE ESTE MÓDULO NÃO FAZ, de propósito:
//   - não cria um índice combinado dos dois. Seria um número novo, sem
//     instrumento que o sustente, e ninguém decidiu o peso de cada metade;
//   - não diz qual metade "vale mais";
//   - não compara com mercado. Nenhum dos dois instrumentos coleta isso.
//
// O que ele faz é nomear a FORMA da relação e dizer o que ela costuma
// significar — do mesmo jeito que o motor de IA nomeia a assinatura de
// posicionamento a partir da relação entre eixos.
// =============================================================

/**
 * Distância a partir da qual duas medidas param de ser "a mesma coisa".
 * 15 pontos numa escala de 100 é o mesmo critério que o motor de IA usa para
 * declarar assinatura (1500 pontos-base de 10000). Mantido igual de propósito:
 * dois cortes diferentes para a mesma ideia é como se criam contradições.
 */
const CORTE = 15;

const PADROES = {
  INTEGRADO: {
    id: "INTEGRADO",
    titulo: "Liderança e adoção de IA no mesmo patamar",
    texto: "As duas leituras chegam a patamares próximos. Não há uma metade puxando a outra, o que significa que o próximo avanço tende a depender de mover as duas juntas — ganhar em IA sem ganhar em liderança, ou o contrário, costuma esbarrar rápido.",
    consequencia: "Priorize uma frente que apareça como limitadora nos dois lados: é onde o mesmo esforço rende duas vezes.",
  },
  LIDERANCA_ADIANTE: {
    id: "LIDERANCA_ADIANTE",
    titulo: "A liderança está à frente da adoção de IA",
    texto: "A maturidade de liderança observada é consideravelmente maior que a de integração entre pessoas, dados e IA. Há estrutura de decisão para sustentar um avanço que ainda não aconteceu.",
    consequencia: "É o cenário mais favorável para acelerar: a capacidade de decidir já existe, e o que falta é aplicá-la à agenda de dados e IA. O risco aqui é confundir maturidade de gestão com prontidão técnica.",
  },
  IA_ADIANTE: {
    id: "IA_ADIANTE",
    titulo: "A adoção de IA está à frente da liderança que a sustenta",
    texto: "A integração de dados, pessoas e IA aparece mais avançada que a maturidade de liderança medida. Na prática, a tecnologia está andando mais rápido do que a estrutura que decide sobre ela.",
    consequencia: "É o cenário que mais exige atenção: avanço técnico sem lastro de decisão tende a produzir iniciativa isolada, retrabalho e dependência de poucas pessoas. Antes de escalar, vale fortalecer a camada que prioriza e responde pelo que a IA faz.",
  },
};

/** Faixa qualitativa de uma medida 0–100, para dizer "alto" sem inventar nota. */
function patamar(v) {
  if (v == null) return null;
  if (v >= 80) return "muito alto";
  if (v >= 60) return "alto";
  if (v >= 40) return "intermediário";
  if (v >= 20) return "baixo";
  return "muito baixo";
}

/**
 * A leitura cruzada.
 * @param {{score100:number, letra:string}|null} lideranca
 * @param {{indice:number, degrau:{posicao:number,nome:string}|null}|null} ia
 * @returns {null|{padrao:object, distancia:number, lideranca:object, ia:object, ressalva:string}}
 *
 * Devolve `null` quando falta uma das metades — meia medida não vira leitura
 * cruzada, e fingir que vira é o começo de um relatório que afirma mais do que
 * mediu.
 */
export function cruzar(lideranca, ia) {
  const l = lideranca && Number.isFinite(lideranca.score100) ? lideranca.score100 : null;
  const i = ia && Number.isFinite(ia.indice) ? ia.indice : null;
  if (l == null || i == null) return null;

  const distancia = l - i;
  const padrao = Math.abs(distancia) < CORTE
    ? PADROES.INTEGRADO
    : (distancia > 0 ? PADROES.LIDERANCA_ADIANTE : PADROES.IA_ADIANTE);

  return {
    padrao,
    distancia: Math.abs(distancia),
    lideranca: { valor: l, patamar: patamar(l), letra: lideranca.letra ?? null },
    ia: { valor: i, patamar: patamar(i), degrau: (ia.degrau && ia.degrau.nome) || null },
    // A ressalva acompanha a leitura, não fica escondida no fim: as duas medidas
    // vêm de instrumentos diferentes, com números de itens diferentes.
    ressalva: "As duas medidas usam a mesma escala de 0 a 100, mas vêm de instrumentos distintos e de números diferentes de itens. A distância entre elas indica direção, não precisão: leia como “qual das duas frentes está puxando”, não como “quanto exatamente uma supera a outra”.",
  };
}

/**
 * Síntese do documento único, em um parágrafo. Atravessa as duas leituras e a
 * relação entre elas. Compõe a partir do que os dois motores já afirmaram — não
 * acrescenta juízo novo, só as conjunções que ligam uma evidência à outra.
 */
export function sinteseCruzada({ lideranca, ia, cruzamento }) {
  const frases = [];
  if (lideranca) {
    frases.push(`Na leitura de liderança, a organização aparece no estágio ${lideranca.letra}, com ${lideranca.score100} de 100.`);
    if (lideranca.label) frases.push(`É um patamar ${lideranca.label.toLowerCase()}.`);
  }
  if (ia && ia.degrau) {
    frases.push(`Na leitura de RH, desenvolvimento e IA, as práticas se situam no degrau ${ia.degrau.nome}, com ${ia.indice} de 100.`);
  }
  if (cruzamento) {
    frases.push(`${cruzamento.padrao.titulo}: ${cruzamento.padrao.texto}`);
    frases.push(cruzamento.padrao.consequencia);
  } else {
    frases.push("Este documento traz apenas uma das duas leituras; a leitura cruzada aparece quando as duas existem.");
  }
  return frases.join(" ");
}

export const PADROES_CRUZAMENTO = PADROES;
export const CORTE_CRUZAMENTO = CORTE;
