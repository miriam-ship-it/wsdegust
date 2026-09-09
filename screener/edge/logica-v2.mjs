// Lógica pura da edge do V2 — runtime-agnóstica (sem `node:`, sem I/O).
// Validação de submissão, conversão resposta→motor, canônico e o sanitizador
// paraPublicoV2 (o navegador nunca vê media/ponderada/itens nem a fórmula).
import { instrumentoV2 } from "./definicao-v2.mjs";

const NIVEIS_VALIDOS = new Set(["N1", "N2", "N3", "N4", "NA"]);

/** Converte um código público ('N3'/'NA') no valor que o motor entende (3/'na'). */
export function respostaParaMotor(code) {
  if (code === "NA") return "na";
  if (typeof code === "string" && /^N[1-4]$/.test(code)) return Number(code[1]);
  return null;
}

/** Mapa {Qcode: 'N3'|'NA'} → {Qcode: 3|'na'} para o motor. */
export function respostasParaMotor(map) {
  const out = {};
  for (const [k, v] of Object.entries(map)) out[k] = respostaParaMotor(v);
  return out;
}

/**
 * Garante submissão completa: todas as questões respondidas (nível válido) e a
 * senioridade presente e válida. NA é resposta válida (fica fora do cálculo, mas
 * conta como respondida). Cobertura mínima é sinalizada pelo motor, não aqui.
 * @param {Record<string,string>} respostas  Qcode → 'N1'..'N4'|'NA'
 * @param {string} senioridade  code de senioridade
 */
export function validarSubmissaoV2(respostas, senioridade, def = instrumentoV2) {
  if (!senioridade || !def.senioridade.some((s) => s.code === senioridade)) {
    throw new Error("senioridade_ausente_ou_invalida");
  }
  for (const q of def.questoes) {
    const a = respostas[q.code];
    if (a === undefined) throw new Error(`incompleto: falta ${q.code}`);
    if (!NIVEIS_VALIDOS.has(a)) throw new Error(`nivel invalido em ${q.code}`);
  }
  const codes = new Set(def.questoes.map((q) => q.code));
  const extras = Object.keys(respostas).filter((c) => !codes.has(c));
  if (extras.length) throw new Error(`itens estranhos: ${extras.join(",")}`);
  return true;
}

/** Canônico idêntico ao da função SQL: '@sen:' + senioridade + '|' + item:answer ordenado. */
export function canonicoV2(senioridade, respostas) {
  const corpo = Object.keys(respostas).sort().map((k) => `${k}:${respostas[k]}`).join("|");
  return `@sen:${senioridade || ""}|${corpo}`;
}

/**
 * Converte o ScoreResultIAV2 interno no PublicResultIAV2 (sanitizado).
 * MANTÉM o que a devolutiva mostra: nível (n/nome/display), esperado × atual pela
 * senioridade, gap, sinal e os dois eixos (nível/display 0–100/cobertura).
 * REMOVE: media, ponderada, itens individuais, contagens — tudo que é interno de
 * cálculo. O navegador nunca recebe a fórmula nem os pontos crus.
 * @param {object} r  saída de calcularV2 (interno)
 * @returns {object} PublicResultIAV2
 */
export function paraPublicoV2(r) {
  if (!r || !r.nivel) {
    return { contract_version: "PublicResultIAV2", instrument: r?.instrument ?? null, nivel: null, cobertura_ok: false };
  }
  const eixoPub = (e) => ({ nivel: e.nivel, display: e.display, cobertura: e.cobertura });
  return {
    contract_version: "PublicResultIAV2",
    instrument: r.instrument,
    nivel: { n: r.nivel.n, code: r.nivel.code, name: r.nivel.name, display: r.nivel.display },
    eixos: { tecnico: eixoPub(r.eixos.tecnico), lideranca: eixoPub(r.eixos.lideranca) },
    senioridade: r.senioridade
      ? { code: r.senioridade.code, label: r.senioridade.label, esperado: r.senioridade.esperado, esperado_nome: r.senioridade.esperado_nome }
      : null,
    gap: r.gap ? { valor: r.gap.valor, classe: r.gap.classe } : null,
    sinal: r.sinal,
    cobertura_ok: r.cobertura_ok,
  };
}
