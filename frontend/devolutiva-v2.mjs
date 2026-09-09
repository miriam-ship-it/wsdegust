// =============================================================
// Devolutiva V2 — render rico do resultado do diagnóstico de maturidade em IA.
// Puro: recebe o resultado do motor-v2 + as narrativas e devolve HTML (string).
// Consome os tokens/componentes de tokens.css + screener.css + devolutiva-v2.css.
// =============================================================

const esc = (s) => String(s == null ? "" : s)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const ICON = {
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
};

const NIVEL_ORDEM = ["ARQUITETO_IA", "ESTRATEGISTA_ESCALA", "GESTOR_TATICO", "OPERACIONAL_AGIL"]; // topo→base
const N_POR_CODE = { OPERACIONAL_AGIL: 1, GESTOR_TATICO: 2, ESTRATEGISTA_ESCALA: 3, ARQUITETO_IA: 4 };
const NOME = { OPERACIONAL_AGIL: "Operacional Ágil", GESTOR_TATICO: "Gestor Tático", ESTRATEGISTA_ESCALA: "Estrategista de Escala", ARQUITETO_IA: "Arquiteto de IA" };
const RESUMO = {
  OPERACIONAL_AGIL: "IA em tarefas individuais; produtividade pessoal; o processo não muda.",
  GESTOR_TATICO: "IA nos processos; processos visíveis; decisão por dados; margem.",
  ESTRATEGISTA_ESCALA: "IA sustenta decisões estratégicas e novas receitas; escala.",
  ARQUITETO_IA: "IA no núcleo do negócio; solução proprietária; força híbrida.",
};

/** A escada (4 degraus, topo→base) com o nível ATUAL e o ESPERADO marcados. */
function escada(res) {
  const atual = res.nivel ? res.nivel.n : null;
  const esperado = res.senioridade ? res.senioridade.esperado : null;
  const degraus = NIVEL_ORDEM.map((code) => {
    const n = N_POR_CODE[code];
    const isAtual = n === atual;
    const isEsp = n === esperado;
    const cls = ["sc-v2-degrau", isAtual ? "is-atual" : "", isEsp && !isAtual ? "is-esperado" : ""].join(" ").trim();
    const tags = [
      isAtual ? `<span class="sc-v2-tag sc-v2-tag--atual">você está aqui</span>` : "",
      isEsp ? `<span class="sc-v2-tag sc-v2-tag--esp">esperado</span>` : "",
    ].join("");
    return `<div class="${cls}">
      <div class="sc-v2-degrau__n">${n}</div>
      <div class="sc-v2-degrau__txt"><div class="sc-v2-degrau__nome">${esc(NOME[code])} ${tags}</div>
        <div class="sc-v2-degrau__resumo">${esc(RESUMO[code])}</div></div>
    </div>`;
  }).join("");
  return `<div class="sc-v2-escada">${degraus}</div>`;
}

/** Barra 0–100 de um eixo com nível e cobertura. */
function eixoBarra(nome, eixo) {
  if (!eixo || eixo.nivel == null || !eixo.cobertura) {
    return `<div class="sc-v2-eixo"><div class="sc-v2-eixo__top"><span>${esc(nome)}</span><span class="sc-muted">cobertura insuficiente</span></div>
      <div class="sc-dim__bar"><div class="sc-dim__fill" style="width:0%"></div></div></div>`;
  }
  const nm = NOME[Object.keys(N_POR_CODE).find((k) => N_POR_CODE[k] === eixo.nivel)] || "";
  return `<div class="sc-v2-eixo">
    <div class="sc-v2-eixo__top"><span>${esc(nome)}</span><span class="sc-v2-eixo__nivel">Nível ${eixo.nivel} · ${esc(nm)}</span></div>
    <div class="sc-dim__bar"><div class="sc-dim__fill" style="width:${eixo.display}%"></div></div>
  </div>`;
}

function secao(num, titulo, sub, corpo) {
  return `<section class="sc-sec"><div class="sc-sec__head"><span class="sc-sec__num">${num}</span>
    <div><h2 class="sc-sec__title">${esc(titulo)}</h2>${sub ? `<p class="sc-sec__sub">${esc(sub)}</p>` : ""}</div></div>${corpo}</section>`;
}

/**
 * @param {object} res  saída de calcularV2
 * @param {object} NARR  NARRATIVAS (narrativas-v2.mjs)
 * @param {string} [unidade]  nome da unidade avaliada (opcional)
 */
export function renderDevolutivaV2(res, NARR, unidade = "sua área") {
  if (!res || !res.nivel) {
    return `<div class="sc-erro"><div class="sc-erro__card"><div class="sc-erro__corpo">
      <h1 class="sc-title">Cobertura insuficiente</h1>
      <p class="sc-lead">Não há respostas suficientes para posicionar o resultado. Responda mais itens para ver o diagnóstico.</p>
    </div></div></div>`;
  }
  const code = res.nivel.code;
  const nv = (NARR.niveis && NARR.niveis[code]) || {};
  const sen = res.senioridade || {};
  const gap = res.gap || {};
  const sinalTxt = res.sinal === "adocao_fragil" ? (NARR.sinais && NARR.sinais.adocao_fragil)
    : res.sinal === "lideranca_a_destravar" ? (NARR.sinais && NARR.sinais.lideranca_a_destravar) : "";
  const plano = (NARR.plano30 && NARR.plano30[code]) || [];

  // 1. Posição na escada
  const s1 = secao("1", "Sua posição na escada de maturidade em IA",
    `Onde você está hoje e para onde o próximo degrau aponta.`,
    `<div class="sc-v2-topo">
      <div class="sc-v2-anel"><span class="sc-v2-anel__nome">${esc(res.nivel.name)}</span>
        <span class="sc-v2-anel__n">Nível ${res.nivel.n}<span class="sc-v2-anel__de"> de 4</span></span></div>
      ${escada(res)}
    </div>`);

  // 2. Esperado × atual (senioridade)
  const gapNarr = gap.classe ? (NARR.gap && NARR.gap[gap.classe]) || "" : "";
  const s2 = secao("2", "Esperado × atual",
    "O esperado vem da sua senioridade, não de um veredito.",
    `<div class="sc-card sc-card--quiet">
      <div class="sc-v2-esp">
        <div><span class="sc-v2-esp__k">Esperado (${esc(sen.label || "")})</span><span class="sc-v2-esp__v">Nível ${esc(String(sen.esperado ?? "—"))}${sen.esperado_nome ? ` · ${esc(sen.esperado_nome)}` : ""}</span></div>
        <div class="sc-v2-esp__x">×</div>
        <div><span class="sc-v2-esp__k">Atual</span><span class="sc-v2-esp__v">Nível ${res.nivel.n} · ${esc(res.nivel.name)}</span></div>
      </div>
      ${gapNarr ? `<p class="sc-prosa" style="margin-top:var(--space-4)">${esc(gapNarr)}</p>` : ""}
    </div>`);

  // 3. Os dois eixos (por que o nível está aqui — o teto de liderança)
  const s3 = secao("3", "O que sustenta o seu nível",
    "A liderança é o teto: você não sustenta um nível muito acima dela.",
    `<div class="sc-v2-eixos">
      ${eixoBarra("Uso técnico da IA", res.eixos.tecnico)}
      ${eixoBarra("Maturidade da liderança", res.eixos.lideranca)}
    </div>
    ${sinalTxt ? `<div class="sc-note sc-note--info" role="note" style="margin-top:var(--space-4)">${ICON.alerta}<span>${esc(sinalTxt)}</span></div>` : ""}`);

  // 4. Leitura do seu nível
  const linha = (rot, txt) => txt ? `<div class="sc-v2-leitura__item"><span class="sc-v2-leitura__k">${esc(rot)}</span><p>${esc(txt)}</p></div>` : "";
  const s4 = secao("4", "Leitura do seu nível", null,
    `<div class="sc-card sc-card--quiet"><p class="sc-prosa">${esc(nv.sintese || "")}</p>
      <div class="sc-v2-leitura">
        ${linha("O que favorece", nv.o_que_favorece)}
        ${linha("Ponto de atenção", nv.ponto_de_atencao)}
        ${linha("Primeiro movimento", nv.primeiro_movimento)}
      </div></div>`);

  // 5. Plano de 30 dias
  const s5 = plano.length ? secao("5", "Plano de 30 dias", "Movimentos concretos e observáveis para subir um degrau.",
    `<div class="sc-v2-plano">${plano.map((a, i) => `<div class="sc-v2-plano__item"><span class="sc-v2-plano__n">${i + 1}</span><p>${esc(a)}</p></div>`).join("")}</div>`) : "";

  // 6. Nota metodológica
  const cob = (e) => e && e.cobertura ? "suficiente" : "insuficiente";
  const s6 = secao("6", "Nota metodológica", null,
    `<div class="sc-card sc-card--quiet"><ul class="sc-meta">
      <li>Cobertura das respostas: Uso técnico <b>${cob(res.eixos.tecnico)}</b>, Liderança <b>${cob(res.eixos.lideranca)}</b>.</li>
      <li>"Não sei" não vira zero: fica fora da conta.</li>
      <li>O nível combina dois eixos (técnica × liderança); a <b>liderança é o teto</b> do que se sustenta.</li>
      <li>Este diagnóstico posiciona você na escada. Mapear <b>quais atribuições</b> são elegíveis para IA é um passo seguinte, feito por área.</li>
      <li>É uma <b>leitura</b> a partir da sua percepção, não um veredito nem uma auditoria.</li>
    </ul></div>`);

  return `<div class="sc-result__head">
      <p class="sc-eyebrow">Diagnóstico de maturidade em IA</p>
      <h1 class="sc-title sc-title--xl">${esc(unidade)}</h1>
      <p class="sc-lead sc-center">Posição numa escada de 4 níveis, a partir da sua percepção.</p>
    </div>
    ${s1}${s2}${s3}${s4}${s5}${s6}
    <div class="sc-actions sc-center-actions"><button class="sc-btn sc-btn--ghost" type="button" data-acao="recomecar">Responder de novo ${ICON.seta}</button></div>`;
}
