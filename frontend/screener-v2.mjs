// =============================================================
// SCREENER V2 — app do diagnóstico de maturidade em IA (4 níveis).
// Fluxo: abertura → senioridade → 8 questões (uma por tela) → devolutiva rica.
//
// DEMO: o nível é calculado no cliente (motor-v2) para a experiência rodar
// sozinha. Em PRODUÇÃO o cálculo migra para a edge (como no V1), e o cliente só
// envia as respostas e recebe o resultado sanitizado.
//
// Anti-viés: as opções de nível são EMBARALHADAS por sessão (ordem estável),
// com "Não sei" sempre por último.
// =============================================================
import { QUESTOES, SENIORIDADE } from "../screener/v2/instrumento-ia-v2.mjs";
import { calcularV2 } from "../screener/v2/motor-v2.mjs";
import { NARRATIVAS } from "../screener/v2/narrativas-v2.mjs";
import { renderDevolutivaV2 } from "./devolutiva-v2.mjs";

const esc = (s) => String(s == null ? "" : s)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const ICON = {
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  volta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  lua: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  sol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};
const LOGO = `<img class="sc-logo" src="logo-boomit.png" alt="Boomit" width="1464" height="236">`;

/** Fisher–Yates simples (uma vez por sessão). */
function embaralhar(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

export function iniciarV2(cfg = {}) {
  const doc = globalThis.document;
  const raiz = doc.getElementById("sc-app");
  const st = { tela: "abertura", senioridade: null, respostas: {}, pos: 0, resultado: null, ordem: {} };

  // ordem embaralhada das opções de nível por questão (NA fica de fora, vai por último)
  for (const q of QUESTOES) st.ordem[q.code] = embaralhar(q.options.map((o, i) => i).filter((i) => !q.options[i].na));

  function temaAtual() { try { return doc.documentElement.getAttribute("data-theme") || (globalThis.matchMedia && globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch { return "light"; } }
  function alternarTema() { const p = temaAtual() === "dark" ? "light" : "dark"; doc.documentElement.setAttribute("data-theme", p); try { globalThis.localStorage.setItem("screener:tema", p); } catch { /* ok */ } pintar(); }
  function irPara(t) { st.tela = t; pintar(); try { globalThis.scrollTo(0, 0); } catch { /* ok */ } }

  function calcular() {
    const compute = cfg.transporte || calcularV2; // injetável (server em produção)
    st.resultado = compute(st.respostas, st.senioridade);
    irPara("devolutiva");
  }
  function recomecar() { st.senioridade = null; st.respostas = {}; st.pos = 0; st.resultado = null; irPara("abertura"); }

  // --- render ---
  function cabecalho(compacto) {
    const ic = temaAtual() === "dark" ? ICON.sol : ICON.lua;
    const sub = compacto ? "" : `<span class="sc-brand__divisor"></span><span class="sc-brand__sub">Diagnóstico de maturidade em IA</span>`;
    return `<header class="sc-head"><div class="sc-brand">${LOGO}${sub}</div>
      <button class="sc-theme" type="button" data-acao="tema" aria-label="Alternar tema">${ic}</button></header>`;
  }
  function telaAbertura() {
    return `<div class="sc-hero"><div class="sc-hero__logo">${LOGO}</div>
      <p class="sc-eyebrow">Engenharia da Nova Inteligência Humana</p>
      <h1 class="sc-hero__title">Diagnóstico de maturidade em IA</h1>
      <p class="sc-hero__lead">Descubra em qual nível de maturidade em IA você está — de Operacional Ágil a Arquiteto de IA — combinando o uso técnico e a liderança. São 8 perguntas, cerca de 5 minutos.</p>
      <div class="sc-actions"><button class="sc-btn sc-btn--primary" type="button" data-acao="ir-senioridade">Iniciar ${ICON.seta}</button></div>
      <p class="sc-hero__foot">Leitura indicativa a partir da sua percepção. Não é auditoria nem base para decisão de emprego.</p></div>`;
  }
  function telaSenioridade() {
    const opts = SENIORIDADE.map((s) => `<label class="sc-opt ${st.senioridade === s.code ? "is-checked" : ""}">
      <input type="radio" name="sen" value="${esc(s.code)}" ${st.senioridade === s.code ? "checked" : ""} data-acao="senioridade" data-code="${esc(s.code)}">
      <span class="sc-opt__dot" aria-hidden="true"></span><span class="sc-opt__txt">${esc(s.label)}</span></label>`).join("");
    return `<div class="sc-card"><p class="sc-eyebrow">Antes de começar</p>
      <h1 class="sc-title">Sua senioridade</h1>
      <p class="sc-lead">Isso define o nível <b>esperado</b> — a referência contra a qual sua posição é lida. Não pontua o resultado.</p>
      <div class="sc-opts" role="radiogroup" style="margin-top:var(--space-5)">${opts}</div>
      <div class="sc-actions"><button class="sc-btn sc-btn--primary sc-btn--block" type="button" data-acao="senioridade-ok" ${st.senioridade ? "" : "disabled"}>Continuar ${ICON.seta}</button></div></div>`;
  }
  function telaQuestao() {
    const q = QUESTOES[st.pos];
    const escolhido = st.respostas[q.code];
    const idxsNivel = st.ordem[q.code];
    const naIdx = q.options.findIndex((o) => o.na);
    const ordem = [...idxsNivel, naIdx]; // níveis embaralhados + NA por último
    const opts = ordem.map((oi, k) => {
      const op = q.options[oi];
      const val = op.na ? "na" : op.level;
      const checked = String(escolhido) === String(val) ? "checked" : "";
      return `<label class="sc-opt ${op.na ? "sc-opt--na" : ""} ${checked ? "is-checked" : ""}">
        <input type="radio" name="q_${q.code}" value="${esc(String(val))}" ${checked} data-acao="resposta" data-q="${q.code}" data-val="${esc(String(val))}">
        <span class="sc-opt__dot" aria-hidden="true"></span><span class="sc-opt__txt">${esc(op.text)}</span>
        <span class="sc-opt__num" aria-hidden="true">${k + 1}</span></label>`;
    }).join("");
    const respondidas = Object.keys(st.respostas).length;
    const pct = Math.round((respondidas / QUESTOES.length) * 100);
    const ultimo = st.pos === QUESTOES.length - 1;
    return `<div class="sc-progress"><div class="sc-progress__row"><span class="sc-progress__label">${esc(q.dimension)}</span>
        <span class="sc-progress__count">Pergunta ${st.pos + 1} de ${QUESTOES.length}</span></div>
        <div class="sc-track"><div class="sc-track__fill" style="width:${pct}%"></div></div></div>
      <article class="sc-item" id="sc-questao" tabindex="-1" aria-label="Pergunta ${st.pos + 1} de ${QUESTOES.length}">
        <p class="sc-item__prompt">${esc(q.prompt)}</p>
        <div class="sc-opts" role="radiogroup" aria-label="Alternativas">${opts}</div></article>
      <p class="sc-kbd">Use <kbd>1</kbd>–<kbd>${ordem.length}</kbd> para escolher · <kbd>Enter</kbd> avança · <kbd>←</kbd> volta</p>
      <div class="sc-nav">
        <button class="sc-btn sc-btn--ghost" type="button" data-acao="voltar">${ICON.volta} Voltar</button>
        <span class="sc-save">Respostas guardadas nesta sessão</span>
        <button class="sc-btn sc-btn--primary" type="button" data-acao="avancar" ${escolhido !== undefined ? "" : "disabled"}>${ultimo ? "Ver resultado" : "Avançar"} ${ICON.seta}</button>
      </div>`;
  }
  function corpo() {
    switch (st.tela) {
      case "abertura": return telaAbertura();
      case "senioridade": return telaSenioridade();
      case "questao": return telaQuestao();
      case "devolutiva": return renderDevolutivaV2(st.resultado, NARRATIVAS, cfg.unidade || "sua área");
      default: return `<div class="sc-loading">…</div>`;
    }
  }
  function pintar() {
    const compacto = st.tela === "questao";
    raiz.innerHTML = `<div class="sc-shell">` + cabecalho(compacto) + corpo() + `</div>`;
    if (st.tela === "questao") { const q = raiz.querySelector("#sc-questao"); if (q) { try { q.focus({ preventScroll: true }); } catch { /* ok */ } } }
  }

  function avancar() {
    if (st.respostas[QUESTOES[st.pos].code] === undefined) return;
    if (st.pos >= QUESTOES.length - 1) return calcular();
    st.pos++; pintar(); try { globalThis.scrollTo(0, 0); } catch { /* ok */ }
  }
  function voltar() { if (st.pos <= 0) return irPara("senioridade"); st.pos--; pintar(); try { globalThis.scrollTo(0, 0); } catch { /* ok */ } }

  raiz.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-acao]"); if (!alvo) return;
    const a = alvo.getAttribute("data-acao");
    const fns = { tema: alternarTema, "ir-senioridade": () => irPara("senioridade"),
      "senioridade-ok": () => { st.pos = 0; irPara("questao"); }, voltar, avancar, recomecar };
    if (fns[a]) fns[a]();
  });
  raiz.addEventListener("change", (ev) => {
    const t = ev.target; if (!t.getAttribute) return;
    if (t.getAttribute("data-acao") === "senioridade") { st.senioridade = t.getAttribute("data-code"); pintar(); }
    if (t.getAttribute("data-acao") === "resposta") {
      const v = t.getAttribute("data-val"); st.respostas[t.getAttribute("data-q")] = v === "na" ? "na" : Number(v); pintar();
    }
  });
  doc.addEventListener("keydown", (ev) => {
    if (st.tela !== "questao") return;
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName || "")) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const q = QUESTOES[st.pos];
    const naIdx = q.options.findIndex((o) => o.na);
    const ordem = [...st.ordem[q.code], naIdx];
    if (ev.key >= "1" && ev.key <= String(ordem.length)) {
      const op = q.options[ordem[Number(ev.key) - 1]]; ev.preventDefault();
      st.respostas[q.code] = op.na ? "na" : op.level; pintar();
    } else if (ev.key === "Enter" || ev.key === "ArrowRight") { if (st.respostas[q.code] !== undefined) { ev.preventDefault(); avancar(); } }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); voltar(); }
  });

  try { const t = globalThis.localStorage.getItem("screener:tema"); if (t) doc.documentElement.setAttribute("data-theme", t); } catch { /* ok */ }
  irPara("abertura");
  return { st, pintar };
}

if (typeof globalThis.document !== "undefined") {
  const cfg = globalThis.SCREENER_V2_CONFIG || {};
  if (cfg.autostart !== false) {
    const start = () => iniciarV2(cfg);
    if (globalThis.document.readyState === "loading") globalThis.document.addEventListener("DOMContentLoaded", start); else start();
  }
}
