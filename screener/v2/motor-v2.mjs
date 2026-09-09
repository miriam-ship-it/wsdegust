// =============================================================
// SCREENER_IA_V2 — motor de cálculo (puro; sem I/O).
//
// Transforma respostas (nível 1–4 por questão, ou "Não sei") + senioridade no
// RESULTADO: nível efetivo na escada, por eixo (técnico × liderança), com o
// TETO DE LIDERANÇA, o nível esperado pela senioridade e o gap. Ver
// RACIONAL-DE-CALCULO.md para o passo a passo e os exemplos.
// =============================================================
import { INSTRUMENTO_IA_V2, QUESTOES, NIVEIS, SENIORIDADE, SCORING } from "./instrumento-ia-v2.mjs";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const media = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const nivelInfo = (n) => NIVEIS.find((x) => x.n === n) || null;
const display = (n) => (n == null ? null : Math.round(((n - 1) / (SCORING.niveis_max - 1)) * 100));

/**
 * @param {Record<string, number|"na"|null>} respostas  Qcode → nível 1–4 (ou "na").
 * @param {string} [senioridade]  code de SENIORIDADE.
 */
export function calcularV2(respostas = {}, senioridade) {
  const porEixo = { tecnico: [], lideranca: [] };
  const itens = [];
  for (const q of QUESTOES) {
    const r = respostas[q.code];
    const valido = typeof r === "number" && r >= SCORING.niveis_min && r <= SCORING.niveis_max;
    if (valido) porEixo[q.axis].push(r);
    itens.push({ code: q.code, axis: q.axis, dimension: q.dimension, level: valido ? r : null });
  }

  const T = media(porEixo.tecnico);
  const L = media(porEixo.lideranca);
  const covT = porEixo.tecnico.length >= SCORING.cobertura_min.tecnico;
  const covL = porEixo.lideranca.length >= SCORING.cobertura_min.lideranca;
  const nivelT = T == null ? null : Math.round(T);
  const nivelL = L == null ? null : Math.round(L);

  // Nível efetivo: média PONDERADA (liderança pesa mais) + TETO de liderança
  // (não sustenta mais de `folga` degraus acima dela — regra do Guia da Carol).
  let nivelEfetivo = null, sinal = "none", ponderada = null;
  if (nivelT != null && nivelL != null) {
    ponderada = SCORING.pesos.tecnico * T + SCORING.pesos.lideranca * L;
    const nivelPonderado = Math.round(ponderada);
    nivelEfetivo = clamp(Math.min(nivelPonderado, nivelL + SCORING.folga_lideranca), SCORING.niveis_min, SCORING.niveis_max);
    if (nivelT - nivelL >= SCORING.gap_fragil) sinal = "adocao_fragil";
    else if (nivelL > nivelT) sinal = "lideranca_a_destravar";
  } else if (nivelT != null) {
    nivelEfetivo = nivelT; // liderança sem cobertura → usa o técnico (cobertura sinalizada)
  } else if (nivelL != null) {
    nivelEfetivo = nivelL;
  }

  const sen = SENIORIDADE.find((s) => s.code === senioridade) || null;
  const esperado = sen ? sen.esperado : null;
  let gap = null, gapClasse = null;
  if (nivelEfetivo != null && esperado != null) {
    gap = nivelEfetivo - esperado;
    gapClasse = gap <= -1 ? "abaixo" : gap === 0 ? "no" : "acima";
  }

  return {
    contract_version: "ScoreResultIAV2", // resultado INTERNO (com media/ponderada); a edge projeta o PublicResultIAV2
    instrument: { code: INSTRUMENTO_IA_V2.code, version: INSTRUMENTO_IA_V2.version },
    eixos: {
      tecnico: { media: T, nivel: nivelT, display: display(nivelT), cobertura: covT, respondidos: porEixo.tecnico.length, total: 3 },
      lideranca: { media: L, nivel: nivelL, display: display(nivelL), cobertura: covL, respondidos: porEixo.lideranca.length, total: 5 },
    },
    ponderada: ponderada == null ? null : Math.round(ponderada * 100) / 100,
    nivel: nivelEfetivo == null ? null : { n: nivelEfetivo, code: nivelInfo(nivelEfetivo).code, name: nivelInfo(nivelEfetivo).name, resumo: nivelInfo(nivelEfetivo).resumo, display: display(nivelEfetivo) },
    senioridade: sen ? { code: sen.code, label: sen.label, esperado, esperado_nome: nivelInfo(esperado)?.name || null } : null,
    gap: gap == null ? null : { valor: gap, classe: gapClasse },
    sinal, // "adocao_fragil" | "lideranca_a_destravar" | "none"
    itens,
    cobertura_ok: covT && covL,
  };
}
