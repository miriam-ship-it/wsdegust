// Lógica pura da edge do screener — runtime-agnóstica (Web Crypto; sem `node:`).
// Roda em Deno (edge) e em node --test. Sem I/O, sem service_role, sem rede.

import { instrumento } from "../motor/definicao.mjs";

// ---------- token de sessão (servidor) ----------
/** Token opaco aleatório (32 bytes → 64 hex). Gerado no servidor. */
export function gerarToken() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** SHA-256 hex de uma string (Web Crypto). @returns {Promise<string>} */
export async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** Hash do token para persistência (só o hash vai ao banco). */
export const hashToken = sha256Hex;

// A credencial de prévia é verificada DENTRO das funções SQL (a edge manda só o
// hash e nunca vê o hash guardado). Um vínculo internal_preview sem credencial
// válida faz a função devolver null / levantar erro — então, se a edge chegou a
// ter um binding em mãos, a credencial já foi aprovada. Por isso `capacidades`
// não conhece mais credencial.

// ---------- matriz de estados ----------
/**
 * @typedef {object} Capacidades
 * @property {boolean} autorizado      base: passou pelo gate de estado
 * @property {boolean} podeIniciar     GET/POST /start
 * @property {boolean} podeEscrever    PUT /response, POST /submit
 * @property {boolean} podeLerResultado GET /session, GET /result
 * @property {string}  motivo
 */
/**
 * Decide o que o vínculo permite, dado estado e vigência. A credencial de prévia
 * NÃO entra aqui (é enforçada nas funções SQL).
 * @param {{status:string, starts_at?:string|null, ends_at?:string|null}} binding
 * @param {Date} now
 * @returns {Capacidades}
 */
export function capacidades(binding, now) {
  const nada = (motivo) => ({ autorizado: false, podeIniciar: false, podeEscrever: false, podeLerResultado: false, motivo });
  if (!binding) return nada("vinculo_inexistente");
  const st = binding.status;
  if (st === "inactive") return nada("inactive");
  // internal_preview só chega aqui se a função aprovou a credencial (senão: null → 404)

  const inicio = binding.starts_at ? new Date(binding.starts_at) : null;
  const fim = binding.ends_at ? new Date(binding.ends_at) : null;
  const dentroVigencia = (!inicio || now >= inicio) && (!fim || now <= fim);

  const abertoParaInicio = (st === "public_pilot" || st === "published" || st === "internal_preview") && dentroVigencia;
  return {
    autorizado: true,
    podeIniciar: abertoParaInicio,
    podeEscrever: abertoParaInicio,
    podeLerResultado: true, // closed/fora de vigência ainda permitem leitura do já submetido
    motivo: abertoParaInicio ? "ok" : (st === "closed" ? "closed" : "fora_de_vigencia"),
  };
}

// ---------- resolução de id opaco (edge-only) ----------
/**
 * Traduz um option_id opaco em {item, stage} usando o mapping da sessão.
 * Rejeita id desconhecido (de outra sessão/instrumento).
 * @param {{options:Record<string,{item:string,stage:string}>, items:Record<string,string>}} mapping
 * @param {string} itemId  @param {string} optionId
 */
export function resolverOpcao(mapping, itemId, optionId) {
  const alvo = mapping.options?.[optionId];
  if (!alvo) throw new Error("option_id desconhecido");
  if (mapping.items?.[itemId] !== alvo.item) throw new Error("item_id nao corresponde a option_id");
  return { item_code: alvo.item, stage_code: alvo.stage };
}

// ---------- validação de submissão ----------
/**
 * Garante que todos os itens do instrumento foram respondidos com estágio válido.
 * @param {Record<string,string>} respostas  item_code → stage_code
 */
export function validarSubmissao(respostas, def = instrumento) {
  const validos = new Set(["E1", "E2", "E3", "E4", "NA"]);
  for (const it of def.items) {
    const s = respostas[it.code];
    if (s === undefined) throw new Error(`incompleto: falta ${it.code}`);
    if (!validos.has(s)) throw new Error(`estagio invalido em ${it.code}`);
  }
  const extras = Object.keys(respostas).filter((c) => !def.items.some((it) => it.code === c));
  if (extras.length) throw new Error(`itens estranhos: ${extras.join(",")}`);
  return true;
}

// ---------- projeção PublicResultV1 (sanitizada) ----------
function coberturaQual(bp) {
  if (bp == null) return "insuficiente";
  if (bp >= 8000) return "alta";
  if (bp >= 5000) return "media";
  return "insuficiente";
}

/** Exibição 0–100 a partir de basis points (nunca expõe o bp cru). */
function disp(bp) { return bp == null ? null : Math.round(bp / 100); }

/**
 * Converte o ScoreResultV1 interno no PublicResultV1.
 * MANTÉM os resultados agregados da devolutiva: pontuação de EXIBIÇÃO 0–100 por
 * dimensão/eixo/índice, cobertura, direção e intensidade dos gaps, quadrante,
 * gate, prioridades e narrativas.
 * REMOVE: basis points, código de estágio (E1–E4), pesos, cortes, regra de
 * conversão e respostas individuais. O indivíduo continua sem nota geral, mas
 * cada uma das cinco dimensões tem resultado mensurável (0–100).
 * @param {object} r  ScoreResultV1 (saída do motor)
 * @param {object} [def=instrumento]
 * @returns {object} PublicResultV1
 */
export function paraPublico(r, def = instrumento) {
  const nomeDim = new Map(def.dimensions.map((d) => [d.code, d.name]));
  const quad = new Map((def.matrix?.quadrants || []).map((q) => [q.code, q]));
  const dimPub = (d) => ({ name: d.name, display_score: disp(d.score_bp), band_label: d.band ? d.band.label : null });

  const q = r.matrix.available ? quad.get(r.matrix.quadrant) : null;

  return {
    contract_version: "PublicResultV1",
    assessment_unit: { name: r.assessment_unit?.name ?? null },
    respondent_scope: { organization_label: r.respondent_scope.organization_label },
    coverage: {
      individual: coberturaQual(r.coverage.individual_bp),
      organization: coberturaQual(r.coverage.organization_bp),
      ai: coberturaQual(r.coverage.ai_bp),
    },
    individual: { overall: null, dimensions: r.individual.dimensions.map(dimPub) },
    organization: { index_display: disp(r.organization.index_bp), band_label: r.organization.band ? r.organization.band.label : null, dimensions: r.organization.dimensions.map(dimPub) },
    ai: {
      index_display: disp(r.ai.index_bp),
      band_label: r.ai.band ? r.ai.band.label : null,
      dimensions: r.ai.dimensions.map(dimPub),
      governance: r.ai.governance_gate,
    },
    alignment: r.alignment.map((a) => ({
      dimension_name: nomeDim.get(a.dimension) || a.dimension,
      direction: a.direction,
      magnitude: a.magnitude,
    })),
    matrix: {
      available: r.matrix.available,
      quadrant: r.matrix.available ? r.matrix.quadrant : null,
      quadrant_label: q ? q.label : null,
      quadrant_message: q ? q.message : null,
      governance_overlay: r.matrix.governance_overlay,
      provisional_note: "Corte de quadrante provisório; recalibrar após o piloto.",
    },
    priorities: r.priorities.map((p) => ({
      rank: p.rank,
      scope: p.scope,
      dimension_name: nomeDim.get(p.dimension) || p.dimension,
      action: p.action,
    })),
    notes: [
      "Retrato de degustação; não é diagnóstico definitivo da empresa.",
      "Com um respondente, o resultado reflete a percepção individual do contexto.",
    ],
  };
}
