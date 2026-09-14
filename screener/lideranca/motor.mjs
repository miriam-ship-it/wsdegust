// =============================================================
// MOTOR DA LIDERANÇA — o cálculo que estava no navegador, agora do lado do
// servidor. Puro: sem DOM, sem rede, sem estado. Testável sozinho.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O diagnóstico de liderança calculava tudo no navegador e a edge gravava o que
// recebia, sem recalcular: letra de maturidade, score, CDL em reais e risco
// percentual chegavam prontos no corpo da requisição. Na prática, qualquer
// pessoa com o console aberto escolhia o próprio resultado — e a Boomit gerava
// e enviava por e-mail um PDF, com a sua marca, carregando aquele número.
//
// O DEFEITO QUE A MUDANÇA EXPÔS, e que é maior que a vulnerabilidade
//
// Havia DUAS fórmulas de CDL e DUAS de risco vivendo ao mesmo tempo: uma que a
// tela mostrava e outra que ia no corpo da requisição — e portanto no PDF
// enviado. Para o mesmo respondente (porte S1, C-level, score 3,7):
//
//     na tela     R$  39.000 a R$    91.000   ·  risco 32%
//     no PDF      R$  62.400 a R$   273.000   ·  risco 26%
//
// Os valores do PDF batem com os relatórios já entregues a clientes. Ou seja: a
// pessoa via um número na tela e recebia outro por e-mail, e o do e-mail é o que
// virou documento.
//
// QUAL FÓRMULA FICOU CANÔNICA, E POR QUÊ
//
// A do PDF. Não porque seja melhor — é a que já foi entregue a clientes reais, e
// trocá-la agora faria os relatórios novos discordarem dos antigos sem que
// ninguém tivesse decidido isso. A outra está preservada abaixo, marcada, para
// que a escolha seja explícita quando for revista.
//
// Todas as fórmulas ficam NESTE arquivo, uma vez só. Enquanto houver duas
// implementações, elas voltam a divergir.
// =============================================================

export const DIMENSOES = Object.freeze(["D1", "D2", "D3", "D4", "D5"]);
export const LENTES = Object.freeze(["pessoa", "empresa"]);

/** Fatores de porte e de nível. Nomes preservados do original. */
const PORTE_FATOR = Object.freeze({ S1: 1, S2: 3, S3: 8, S4: 25 });
const PERSONA_FATOR = Object.freeze({ A: 0.3, C: 0.7, G: 1.5, X: 3 });

/**
 * Faixas da escala D→AAA. Ordem decrescente: a primeira que couber vence, que é
 * como o original as avaliava.
 */
const FAIXAS = Object.freeze([
  { min: 4.5, letra: "AAA", label: "Excelência", diagnostico: "Organização em patamar de excelência em maturidade de liderança. Pontos fortes consolidados em todas as dimensões avaliadas. Foco em sustentação e disseminação para níveis hierárquicos inferiores." },
  { min: 4.0, letra: "AA", label: "Avançado", diagnostico: "Maturidade avançada com pontos fortes claros e poucos gaps específicos. Empresa pronta para escalar práticas de liderança como vantagem competitiva no mercado." },
  { min: 3.5, letra: "A", label: "Consolidado", diagnostico: "Estrutura de liderança consolidada com práticas bem estabelecidas. Oportunidades de evolução em dimensões específicas para alcançar próximo patamar." },
  { min: 3.0, letra: "B", label: "Em desenvolvimento", diagnostico: "Empresa em fase de consolidação estrutural. Processos definidos mas com execução inconsistente. Necessita fortalecer cultura de accountability e rituais de gestão." },
  { min: 2.5, letra: "C", label: "Inicial", diagnostico: "Maturidade inicial — processos em construção e cultura de liderança em formação. Risco moderado de subentrega frente às metas estratégicas; recomenda-se intervenção estruturada." },
  { min: 0, letra: "D", label: "Crítico", diagnostico: "Patamar crítico de maturidade — gaps estruturais em múltiplas dimensões. Risco alto de não-execução do plano estratégico. Intervenção imediata recomendada com foco em fundamentos de liderança." },
]);

const ehNota = (v) => Number.isFinite(v) && v >= 1 && v <= 5;

/**
 * Agrupa as linhas de `respostas` por dimensão e lente.
 * Aceita exatamente o formato da tabela: { dimensao, lente, valor }.
 * A última resposta de um par (dimensão, lente) vence — a tabela já garante
 * unicidade por item, então isso só importa em dado inconsistente.
 */
export function agrupar(linhas) {
  const buckets = {};
  for (const d of DIMENSOES) buckets[d] = { pessoa: null, empresa: null };
  for (const l of linhas || []) {
    const d = l && l.dimensao, len = l && l.lente;
    if (!buckets[d] || !LENTES.includes(len)) continue;
    const v = Number(l.valor);
    if (ehNota(v)) buckets[d][len] = v;
  }
  return buckets;
}

/** O que falta para o resultado ser calculável. Vazio = completo. */
export function faltantes(buckets) {
  const out = [];
  for (const d of DIMENSOES) {
    for (const len of LENTES) if (buckets[d][len] == null) out.push(`${d}-${len}`);
  }
  return out;
}

/**
 * Notas por dimensão e a média geral. Mesma aritmética do original:
 * gap = pessoa − empresa; média = (pessoa + empresa) / 2; geral = média das 5.
 */
export function calcularScores(buckets) {
  const scores = {};
  for (const d of DIMENSOES) {
    const { pessoa, empresa } = buckets[d];
    scores[d] = { pessoa, empresa, gap: pessoa - empresa, media: (pessoa + empresa) / 2 };
  }
  const scoreGeral = DIMENSOES.reduce((s, d) => s + scores[d].media, 0) / DIMENSOES.length;
  return { scores, scoreGeral };
}

/** Letra, score 0–100, rótulo e diagnóstico textual. */
export function maturidade(scoreGeral) {
  const faixa = FAIXAS.find((f) => scoreGeral >= f.min) ?? FAIXAS[FAIXAS.length - 1];
  return {
    letra: faixa.letra,
    score100: Math.round(scoreGeral * 20),
    label: faixa.label,
    diagnostico: faixa.diagnostico,
  };
}

/**
 * Risco estratégico, em pontos percentuais.
 * CANÔNICA (a que foi entregue): round((5 − score) × 20), sem limite.
 * A tela usava `max(15, min(95, round((5 − score) × 25)))` — para score 4,8 uma
 * dizia 4% e a outra 15%. Ver o cabeçalho deste arquivo.
 */
export function riscoEstrategico(scoreGeral) {
  return Math.round((5 - scoreGeral) * 20);
}

/**
 * CDL — faixa anual estimada, em reais.
 * CANÔNICA (a que foi entregue): porte × nível × (5 − score)/5 × {80k, 350k}.
 * A tela usava outra base (fator de porte S4 = 20, multiplicador de nível
 * 1/2/4/10, e o gap medido só pela lente da empresa), chegando a menos da
 * metade. Ver o cabeçalho deste arquivo.
 *
 * A decomposição 50/30/20 entre estratégico, tático e operacional é a do
 * relatório entregue.
 */
export function cdl({ scoreGeral, tamanho, persona }) {
  const porte = PORTE_FATOR[tamanho] ?? 5;
  const nivel = PERSONA_FATOR[persona] ?? 1;
  const gap = (5 - scoreGeral) / 5;
  const min = Math.round(porte * nivel * gap * 80000);
  const max = Math.round(porte * nivel * gap * 350000);
  return {
    min, max,
    estrategico: { min: Math.round(min * 0.5), max: Math.round(max * 0.5) },
    tatico: { min: Math.round(min * 0.3), max: Math.round(max * 0.3) },
    operacional: { min: Math.round(min * 0.2), max: Math.round(max * 0.2) },
  };
}

/**
 * Resultado completo a partir das respostas GRAVADAS e do respondente.
 * Devolve `{ status: "INCOMPLETO", faltantes }` quando falta resposta — o
 * original assumia tudo respondido e produziria `NaN` silencioso, que viraria
 * "R$ NaN" num PDF enviado ao cliente.
 */
export function calcularResultado({ respostas, respondente }) {
  const buckets = agrupar(respostas);
  const falta = faltantes(buckets);
  if (falta.length) return { status: "INCOMPLETO", faltantes: falta };

  const { scores, scoreGeral } = calcularScores(buckets);
  const r = respondente || {};
  return {
    status: "OK",
    scores,
    scoreGeral,
    maturidade: maturidade(scoreGeral),
    risco_estrategico: riscoEstrategico(scoreGeral),
    cdl: cdl({ scoreGeral, tamanho: r.tamanho, persona: r.persona }),
  };
}

/**
 * Compara o que o navegador mandou com o que o servidor calculou. Não serve
 * para aceitar ou recusar — o servidor sempre vence. Serve para registrar que
 * houve divergência, que é o sinal de adulteração ou de fórmula desencontrada.
 */
export function divergencias(servidor, cliente) {
  if (!cliente || servidor.status !== "OK") return [];
  const out = [];
  const cmp = (nome, a, b, tol = 0) => {
    if (b == null) return;
    if (Math.abs(Number(a) - Number(b)) > tol) out.push({ campo: nome, servidor: a, cliente: b });
  };
  cmp("maturidade_score", servidor.maturidade.score100, cliente.maturidade_score);
  cmp("risco_estrategico", servidor.risco_estrategico, cliente.risco_estrategico);
  cmp("cdl_min", servidor.cdl.min, cliente.cdl_min, 1);
  cmp("cdl_max", servidor.cdl.max, cliente.cdl_max, 1);
  if (cliente.maturidade_letra && cliente.maturidade_letra !== servidor.maturidade.letra) {
    out.push({ campo: "maturidade_letra", servidor: servidor.maturidade.letra, cliente: cliente.maturidade_letra });
  }
  return out;
}
