// =============================================================
// SCREENER — frontend de homologação do gestor.
//
// Fluxo: abertura institucional → código de prévia → consentimento/unidade →
// questionário (UMA questão por tela, voltar/avançar, transições entre blocos,
// autosave visível) → revisão das respostas → devolutiva rica (9 seções).
// Retoma a sessão (e a POSIÇÃO) após atualizar a página.
//
// FRONTEIRA: o navegador nunca vê pontos, estágios (E1–E4), pesos, gabarito,
// regras de cálculo nem mapeamento. Só recebe a projeção pública (ids opacos) e
// o PublicResultV1 sanitizado. TODO cálculo e a seleção de conteúdo metodológico
// são do servidor — diferente da entrega antiga, que rodava o motor no cliente.
//
// Os textos de apoio daqui são de APRESENTAÇÃO, genéricos por faixa/escopo, e se
// apoiam apenas em rótulos que o servidor já enviou (band_label, direction,
// scope). Nenhuma narrativa metodológica por dimensão é inventada no navegador —
// essa fica para a homologação, autorada no instrumento (fonte da verdade).
//
// SEGREDO: a credencial de prévia entra num campo próprio e viaja SÓ no header
// `x-preview-key`. Nunca vai para URL, query ou HTML. Fica em memória e, para a
// retomada, em sessionStorage (namespaced por evento). O token idem, só em
// `x-session-token`.
// =============================================================

export const EVENTO_PADRAO = "preview-interno-ia-v1";
const PREFIXO_ARMAZENAMENTO = "screener:";

// ---------- lógica pura (sem DOM, sem rede) ----------

/** Lê o slug do evento da query string, com fallback para o padrão. */
export function lerEvento(search, padrao = EVENTO_PADRAO) {
  const p = new URLSearchParams(search || "");
  const v = (p.get("evento") || "").trim();
  return v || padrao;
}

/**
 * Cabeçalhos de uma requisição à edge. A credencial só em `x-preview-key`; o
 * token só em `x-session-token`. `content-type` só quando há corpo.
 */
export function montarHeaders({ anonKey, previewKey, token, temCorpo } = {}) {
  const h = { apikey: anonKey, authorization: `Bearer ${anonKey}` };
  if (temCorpo) h["content-type"] = "application/json";
  if (previewKey) h["x-preview-key"] = previewKey;
  if (token) h["x-session-token"] = token;
  return h;
}

/** Progresso do preenchimento. */
export function progresso(respondidas, total) {
  const done = Math.max(0, Math.min(respondidas | 0, total | 0));
  const t = total | 0;
  return { respondidas: done, total: t, restante: Math.max(0, t - done), pct: t ? Math.round((done / t) * 100) : 0 };
}

/** Itens de todos os blocos, achatados na ordem de exibição. */
export function itensDosBlocos(blocks) {
  const out = [];
  for (const b of blocks || []) for (const it of b.items || []) out.push(it);
  return out;
}

/** Índice (flat) do primeiro item ainda sem resposta; total se tudo respondido. */
export function primeiraNaoRespondida(blocks, respostas) {
  const flat = itensDosBlocos(blocks);
  const i = flat.findIndex((it) => !(respostas && respostas[it.id]));
  return i === -1 ? flat.length : i;
}

/** Item_ids ainda sem resposta. */
export function itensFaltantes(blocks, respostas) {
  return itensDosBlocos(blocks).filter((it) => !(respostas && respostas[it.id])).map((it) => it.id);
}

/** Escapa texto para inserção segura como conteúdo HTML. */
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Rótulo pt-BR da qualidade de cobertura. */
export function rotuloCobertura(q) {
  return { alta: "alta", media: "média", insuficiente: "insuficiente" }[q] || "—";
}

/** Normaliza 0–100 (ou null) de forma defensiva. */
export function pontoExibicao(v) {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(v))));
}

/**
 * Glosa GENÉRICA por faixa (apoio de leitura). Chaveada apenas pelo band_label
 * que o servidor envia — não é narrativa por dimensão. Vazio se faixa ausente.
 */
export function glosaFaixa(bandLabel) {
  return {
    "Reativo ou ausente": "prática ainda reativa ou não observada de forma consistente",
    "Informal ou parcial": "prática existe, mas informal ou parcial e dependente de pessoas",
    "Definido e repetível": "prática definida e reconhecível, que tende a se repetir",
    "Gerenciado e sustentado": "prática gerenciada e sustentada, com acompanhamento e revisão",
  }[bandLabel] || "";
}

/** Rótulo do alinhamento Pessoa×Empresa (direção + lado para o gráfico). */
export function rotuloDirecao(direction) {
  return {
    individual_ahead: { label: "Você à frente do contexto", lado: "pessoa" },
    organization_ahead: { label: "Contexto à frente de você", lado: "empresa" },
    aligned: { label: "Alinhamento próximo", lado: "centro" },
    insufficient: { label: "Cobertura insuficiente", lado: "centro" },
  }[direction] || { label: "—", lado: "centro" };
}

/** Rótulo do gate de governança (separado do índice de IA). */
export function rotuloGovernanca(gate) {
  return {
    blocked: { label: "Bloqueada", nota: "Há prática essencial ausente; trate antes de ampliar o uso." },
    conditioned: { label: "Condicionada", nota: "Uso possível com salvaguardas; consolide os controles." },
    eligible: { label: "Elegível", nota: "Controles mínimos reconhecíveis para ampliar com cuidado." },
    insufficient: { label: "Cobertura insuficiente", nota: "Sem itens suficientes para ler a governança." },
  }[gate] || { label: "—", nota: "" };
}

/** Rótulo do escopo de uma prioridade/plano. */
export function rotuloEscopo(scope) {
  return { individual: "Desenvolvimento individual", organization: "Contexto organizacional", ai: "IA e governança" }[scope] || scope || "";
}

/** Ponto (0–100) da matriz Empresa×IA para plotagem. */
export function matrizPonto(orgDisplay, aiDisplay) {
  return { x: pontoExibicao(orgDisplay) ?? 0, y: pontoExibicao(aiDisplay) ?? 0 };
}

/**
 * Síntese executiva composta a partir de dado sanitizado (índices, faixas,
 * cobertura). Deixa explícito que é a percepção de UMA pessoa. Genérica; não
 * afirma nada por dimensão.
 */
export function sinteseExecutiva(pub) {
  const org = pub.organization || {}, ia = pub.ai || {};
  const oi = pontoExibicao(org.index_display), ai = pontoExibicao(ia.index_display);
  const frag = [];
  if (oi != null) frag.push(`o contexto organizacional em ${oi}/100${org.band_label ? ` (${org.band_label.toLowerCase()})` : ""}`);
  if (ai != null) frag.push(`a maturidade em IA em ${ai}/100${ia.band_label ? ` (${ia.band_label.toLowerCase()})` : ""}`);
  const corpo = frag.length
    ? `Sua percepção situa ${frag.join(" e ")}.`
    : "A cobertura das respostas ainda não permite fechar os índices de contexto.";
  return `Este é um retrato de degustação a partir da percepção de uma pessoa — não uma auditoria da empresa. ${corpo} As cinco dimensões individuais aparecem sem uma nota geral, por decisão metodológica.`;
}

/** Plano: uma ação por escopo (a partir das prioridades sanitizadas). */
export function planoDeAcao(priorities) {
  const vistos = new Set(); const out = [];
  for (const p of (priorities || [])) {
    if (vistos.has(p.scope)) continue;
    vistos.add(p.scope);
    out.push({ scope: p.scope, dimension_name: p.dimension_name, action: p.action });
  }
  return out;
}

/**
 * Modo da experiência a partir do STATUS do vínculo (que vem do servidor):
 * `internal_preview` → homologação (tarja + credencial); qualquer outro
 * (`public_pilot`/`published`) → degustação pública (sem tarja, com lead).
 */
export function modoDoStatus(status) {
  return status === "internal_preview" ? "homologacao" : "degustacao";
}

/** Modo de captura de lead efetivo: usa o do vínculo; default por modo. */
export function leadModoEfetivo(leadCaptureMode, modo) {
  const validos = ["none", "optional_after_submit", "required_before_result"];
  if (validos.includes(leadCaptureMode)) return leadCaptureMode;
  return modo === "degustacao" ? "optional_after_submit" : "none";
}

/** Validação leve de e-mail (o servidor revalida e normaliza). */
export function validarEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Mensagem de usuário para uma falha da edge. */
export function mensagemErro(status, body) {
  const e = body && body.error;
  if (status === 404 && (e === "nao_encontrado" || e === "sessao_nao_encontrada")) {
    return "Código ausente ou incorreto, ou o link não corresponde a um evento ativo. Confira o código recebido e tente de novo.";
  }
  if (status === 403 || e === "indisponivel") return "Este evento não está aberto para respostas no momento.";
  if (status === 409 && e === "aviso_desatualizado") return "O aviso de privacidade foi atualizado. Recarregue a página para ver a versão vigente.";
  if (status === 410) return "Esta sessão expirou. Comece uma nova para continuar.";
  if (status === 400 && e === "submissao_incompleta") return "Ainda faltam respostas. Responda todos os itens antes de enviar.";
  if (status === 413) return "O envio ficou grande demais. Recarregue a página e tente novamente.";
  if (status === 429) return "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.";
  return "Não foi possível concluir a operação agora. Tente novamente em instantes.";
}

/**
 * Descreve um erro TERMINAL para a tela dedicada (título/mensagem/ícone e se é
 * recuperável por nova tentativa). Genérico e sem PII.
 */
export function descreverErro(status, body) {
  const e = body && body.error;
  if (status === 410) return { titulo: "Sua sessão expirou", mensagem: "As respostas ficam guardadas por tempo limitado. Comece uma nova sessão para continuar.", recuperavel: false, icone: "relogio" };
  if (status === 403 || e === "indisponivel") return { titulo: "Evento indisponível", mensagem: "Este evento não está aberto para respostas no momento.", recuperavel: false, icone: "aviso" };
  if (status === 404) return { titulo: "Sessão não encontrada", mensagem: "Não localizamos esta sessão. Comece uma nova para continuar.", recuperavel: false, icone: "aviso" };
  if (status === 429) return { titulo: "Muitas tentativas em pouco tempo", mensagem: "Aguarde um instante e tente novamente.", recuperavel: true, icone: "relogio" };
  return { titulo: "Algo não saiu como esperado", mensagem: "Não foi possível concluir agora. Tente novamente em instantes.", recuperavel: true, icone: "aviso" };
}

/** Chave de armazenamento da sessão, isolada por evento. */
export function chaveArmazenamento(evento) {
  return PREFIXO_ARMAZENAMENTO + (evento || EVENTO_PADRAO);
}
export function guardarSessao(evento, dados, store) {
  const s = store || globalThis.sessionStorage;
  try { s.setItem(chaveArmazenamento(evento), JSON.stringify(dados)); return true; } catch { return false; }
}
export function lerSessao(evento, store) {
  const s = store || globalThis.sessionStorage;
  try { const v = s.getItem(chaveArmazenamento(evento)); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function limparSessao(evento, store) {
  const s = store || globalThis.sessionStorage;
  try { s.removeItem(chaveArmazenamento(evento)); } catch { /* ignora */ }
}

// ---------- cliente HTTP da edge (injetável) ----------

export function criarCliente({ edgeUrl, anonKey, transporte } = {}) {
  const fetchImpl = transporte || ((...a) => globalThis.fetch(...a));
  async function chamar(metodo, rota, { query, corpo, previewKey, token } = {}) {
    const url = new URL(edgeUrl.replace(/\/$/, "") + rota);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
    const headers = montarHeaders({ anonKey, previewKey, token, temCorpo: corpo != null });
    const resp = await fetchImpl(url.toString(), { method: metodo, headers, body: corpo != null ? JSON.stringify(corpo) : undefined });
    let body = null;
    try { body = await resp.json(); } catch { body = null; }
    return { status: resp.status, body };
  }
  return {
    apresentacao: (evento, previewKey) => chamar("GET", "/start", { query: { event_slug: evento }, previewKey }),
    iniciar: (evento, previewKey, avisoVersao) => chamar("POST", "/start", { corpo: { event_slug: evento, privacy_ack: true, privacy_notice_version: avisoVersao }, previewKey }),
    retomar: (previewKey, token) => chamar("GET", "/session", { previewKey, token }),
    salvar: (previewKey, token, item_id, option_id) => chamar("PUT", "/response", { corpo: { item_id, option_id }, previewKey, token }),
    enviar: (previewKey, token) => chamar("POST", "/submit", { corpo: {}, previewKey, token }),
    resultado: (previewKey, token) => chamar("GET", "/result", { previewKey, token }),
    lead: (previewKey, token, dados) => chamar("POST", "/lead", { corpo: dados, previewKey, token }),
  };
}

// ---------- ícones (inline) ----------
const ICONE = {
  aviso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  sol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  lua: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  volta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

// Wordmark institucional Boomit (imagem real; o tema é tratado em .sc-logo).
// width/height reservam a proporção (evita salto de layout); o CSS define a altura.
const LOGO = `<img class="sc-logo" src="logo-boomit.png" alt="Boomit" width="1464" height="236">`;

// =============================================================
// Arranque no navegador
// =============================================================

export function iniciarApp(cfg) {
  const doc = globalThis.document;
  const raiz = doc.getElementById("sc-app");
  const evento = lerEvento(globalThis.location ? globalThis.location.search : "");
  const cliente = criarCliente({ edgeUrl: cfg.EDGE_URL, anonKey: cfg.ANON_KEY, transporte: cfg.transporte });

  const st = {
    tela: "carregando",
    modo: "degustacao",        // homologacao | degustacao (vem do status do vínculo)
    previewKey: null, token: null, avisoVersao: "v1",
    branding: {}, consent: null, instrument: null,
    blocksMeta: [], blocks: [], flat: [],
    respostas: {}, pos: 0, transicaoBloco: 0,
    submitido: false, devolutiva: null,
    leadMode: "none", leadEnviado: false, leadEnviando: false, leadErro: null,
    salvando: 0, salvoRecente: false, erroTopo: null, tentandoEnviar: false,
    erro: null,
  };

  // --- tema ---
  function temaAtual() {
    try { return doc.documentElement.getAttribute("data-theme") || (globalThis.matchMedia && globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
    catch { return "light"; }
  }
  function alternarTema() {
    const proximo = temaAtual() === "dark" ? "light" : "dark";
    doc.documentElement.setAttribute("data-theme", proximo);
    try { globalThis.localStorage.setItem("screener:tema", proximo); } catch { /* ok */ }
    pintar();
  }

  function irPara(tela) { st.tela = tela; st.erroTopo = null; pintar(); scrollTopo(); }
  function scrollTopo() { try { globalThis.scrollTo(0, 0); } catch { /* ok */ } }
  // Tela de erro dedicada (estados terminais). `retry` (opcional) re-executa a
  // ação que falhou, quando o erro é recuperável.
  function irParaErro(status, body, retry) {
    st.erro = { ...descreverErro(status, body), retry: retry || null };
    st.erroTopo = null; st.tela = "erro"; pintar(); scrollTopo();
  }
  const persistir = () => guardarSessao(evento, { previewKey: st.previewKey, token: st.token, pos: st.pos, modo: st.modo, leadMode: st.leadMode });

  // --- rede ---
  function aplicarApresentacao(body) {
    st.consent = body.consent; st.branding = body.branding || {};
    st.avisoVersao = (st.branding && st.branding.privacy_notice_version) || "v1";
    st.blocksMeta = body.blocks || []; st.instrument = body.instrument;
    st.modo = modoDoStatus(body.status);
    st.leadMode = leadModoEfetivo(body.lead_capture_mode, st.modo);
  }

  // Abertura → tenta entrar SEM credencial. Evento público responde 200 (modo
  // degustação); internal_preview responde 404 → pede o código (modo homologação).
  async function tentarEntrar() {
    st.tela = "carregando"; pintar();
    const r = await cliente.apresentacao(evento, undefined);
    if (r.status === 200) { st.previewKey = null; aplicarApresentacao(r.body); return irPara("apresentacao"); }
    irPara("codigo");
  }

  async function abrirApresentacao(previewKey) {
    st.previewKey = previewKey; st.tela = "carregando"; pintar();
    const r = await cliente.apresentacao(evento, previewKey);
    if (r.status !== 200) { st.tela = "codigo"; st.erroTopo = mensagemErro(r.status, r.body); return pintar(); }
    aplicarApresentacao(r.body);
    irPara("apresentacao");
  }
  async function comecar() {
    st.tentandoEnviar = true; pintar();
    const r = await cliente.iniciar(evento, st.previewKey, st.avisoVersao);
    st.tentandoEnviar = false;
    if (r.status !== 201) { st.erroTopo = mensagemErro(r.status, r.body); return pintar(); }
    st.token = r.body.token; st.instrument = r.body.instrument; st.blocks = r.body.blocks;
    st.flat = itensDosBlocos(st.blocks); st.respostas = {}; st.pos = 0; st.transicaoBloco = 0;
    persistir(); irPara("transicao");
  }
  async function retomar(salva) {
    st.previewKey = salva.previewKey || null; st.token = salva.token;
    st.modo = salva.modo || "degustacao"; st.leadMode = salva.leadMode || "none";
    st.tela = "carregando"; pintar();
    const r = await cliente.retomar(st.previewKey, st.token);
    if (r.status === 410) { limparSessao(evento); st.token = null; st.previewKey = null; return irParaErro(410, r.body); }
    if (r.status !== 200) { limparSessao(evento); st.token = null; st.previewKey = null; st.tela = "abertura"; return pintar(); }
    st.instrument = r.body.instrument; st.blocks = r.body.blocks; st.flat = itensDosBlocos(st.blocks);
    st.respostas = r.body.answered || {}; st.submitido = !!r.body.submitted;
    if (st.submitido) return carregarResultado();
    const nova = primeiraNaoRespondida(st.blocks, st.respostas);
    st.pos = Math.min(typeof salva.pos === "number" ? salva.pos : nova, Math.max(0, st.flat.length - 1));
    persistir(); irPara("questionario");
  }
  async function salvarResposta(item_id, option_id) {
    st.respostas[item_id] = option_id; st.salvando++; st.salvoRecente = false; pintar();
    const r = await cliente.salvar(st.previewKey, st.token, item_id, option_id);
    st.salvando--;
    // Sessão morta (expirada/indisponível/inexistente) → tela de erro dedicada.
    if (r.status === 410 || r.status === 403 || r.status === 404) return irParaErro(r.status, r.body);
    if (r.status !== 200) st.erroTopo = mensagemErro(r.status, r.body); // transiente → tarja
    else { st.salvoRecente = true; st.erroTopo = null; }
    pintar();
  }
  // Após ter o resultado: lead obrigatório antes de mostrar? senão devolutiva.
  function seguirParaResultado() {
    if (st.leadMode === "required_before_result" && !st.leadEnviado) return irPara("lead_gate");
    irPara("devolutiva");
  }
  async function carregarResultado() {
    st.tela = "carregando"; pintar();
    const r = await cliente.resultado(st.previewKey, st.token);
    if (r.status !== 200) return irParaErro(r.status, r.body, carregarResultado);
    st.devolutiva = r.body; st.submitido = true; seguirParaResultado();
  }
  async function enviar() {
    st.tentandoEnviar = true; pintar();
    const r = await cliente.enviar(st.previewKey, st.token);
    st.tentandoEnviar = false;
    if (r.status !== 200) return irParaErro(r.status, r.body, enviar);
    st.devolutiva = r.body; st.submitido = true; seguirParaResultado();
  }
  async function enviarLead(nome, email, optIn) {
    if (!validarEmail(email)) { st.leadErro = "Informe um e-mail válido."; return pintar(); }
    st.leadEnviando = true; st.leadErro = null; pintar();
    const r = await cliente.lead(st.previewKey, st.token, { nome: (nome || "").trim() || null, email: email.trim(), marketing_opt_in: !!optIn });
    st.leadEnviando = false;
    if (r.status !== 200) { st.leadErro = mensagemErro(r.status, r.body); return pintar(); }
    st.leadEnviado = true; st.leadErro = null;
    if (st.tela === "lead_gate") irPara("devolutiva"); else pintar();
  }
  function recomecar() {
    limparSessao(evento);
    Object.assign(st, { token: null, previewKey: null, respostas: {}, blocks: [], flat: [], pos: 0, devolutiva: null, submitido: false, leadEnviado: false, leadErro: null });
    irPara("abertura");
  }

  // --- navegação do questionário ---
  function blocoDoItem(pos) {
    let n = 0;
    for (let bi = 0; bi < st.blocks.length; bi++) { const len = st.blocks[bi].items.length; if (pos < n + len) return bi; n += len; }
    return st.blocks.length - 1;
  }
  function primeiroDoBloco(bi) { let n = 0; for (let i = 0; i < bi; i++) n += st.blocks[i].items.length; return n; }
  function avancar() {
    const atual = blocoDoItem(st.pos);
    if (st.pos >= st.flat.length - 1) { st.pos = st.flat.length - 1; persistir(); return irPara("revisao"); }
    const prox = st.pos + 1;
    if (blocoDoItem(prox) !== atual) { st.transicaoBloco = blocoDoItem(prox); st.pos = prox; persistir(); return irPara("transicao"); }
    st.pos = prox; persistir(); pintar(); scrollTopo();
  }
  function voltar() {
    if (st.pos <= 0) return irPara("apresentacao");
    st.pos -= 1; persistir(); pintar(); scrollTopo();
  }
  function iniciarBloco() { st.pos = primeiroDoBloco(st.transicaoBloco); persistir(); irPara("questionario"); }
  function editarItem(pos) { st.pos = pos; persistir(); irPara("questionario"); }

  // ---------- render: comuns ----------
  const tarja = `<div class="sc-homolog"><div class="sc-homolog__in"><span class="sc-homolog__ic">${ICONE.aviso}</span><span><b>Ambiente de homologação.</b> As respostas destinam-se à revisão do instrumento e da experiência. Não constituem resultado comercial nem avaliação oficial.</span></div></div>`;
  function cabecalho(compacto) {
    const ic = temaAtual() === "dark" ? ICONE.sol : ICONE.lua;
    const sub = compacto ? "" : `<span class="sc-brand__divisor"></span><span class="sc-brand__sub">Screener de maturidade em IA</span>`;
    return `<header class="sc-head">
      <div class="sc-brand">${LOGO}${sub}</div>
      <button class="sc-theme" type="button" data-acao="tema" aria-label="Alternar tema claro e escuro">${ic}</button>
    </header>`;
  }
  const noteTopo = () => st.erroTopo ? `<div class="sc-note sc-note--danger" role="alert">${ICONE.info}<span>${escapeHtml(st.erroTopo)}</span></div>` : "";

  // ---------- render: abertura institucional ----------
  function telaAbertura() {
    return `<div class="sc-hero">
      <div class="sc-hero__logo">${LOGO}</div>
      <p class="sc-eyebrow">Engenharia da Nova Inteligência Humana</p>
      <h1 class="sc-hero__title">Screener de maturidade em IA</h1>
      <p class="sc-hero__lead">Uma leitura estruturada de como você atua, como percebe a organização e o estágio de uso de IA. São 30 itens em três blocos — Pessoa, Empresa e IA — em cerca de 10 minutos.</p>
      <div class="sc-actions"><button class="sc-btn sc-btn--primary" type="button" data-acao="entrar">Iniciar ${ICONE.seta}</button></div>
      <p class="sc-hero__foot">Instrumento indicativo para desenvolvimento e priorização. Não é avaliação clínica nem base para decisão de emprego.</p>
    </div>`;
  }

  // ---------- render: código ----------
  function telaCodigo() {
    return `<div class="sc-card">
      <p class="sc-eyebrow">Acesso</p>
      <h1 class="sc-title">Código de prévia</h1>
      <p class="sc-lead">Este formulário é uma prévia interna. Informe o código recebido por outro canal para começar.</p>
      ${noteTopo()}
      <form data-acao="codigo" style="margin-top:var(--space-6)">
        <div class="sc-field">
          <label class="sc-label" for="sc-codigo">Código de acesso</label>
          <input class="sc-input" id="sc-codigo" name="codigo" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cole aqui o código" ${st.erroTopo ? 'aria-invalid="true"' : ""} required>
          <p class="sc-help">O código chega separado do link e não fica salvo neste dispositivo além desta aba.</p>
        </div>
        <div class="sc-actions"><button class="sc-btn sc-btn--primary sc-btn--block" type="submit">Continuar</button></div>
      </form>
    </div>`;
  }

  // ---------- render: apresentação / consentimento ----------
  function telaApresentacao() {
    const usos = (st.consent && st.consent.prohibited_uses || []).map((u) => `<li>${escapeHtml(u)}</li>`).join("");
    const unidade = (st.branding && st.branding.assessment_unit_name) || "sua empresa";
    const blocos = (st.blocksMeta || []).map((b) => `<li><b>${escapeHtml(b.name)}</b> — <span class="sc-muted">${escapeHtml(b.reference_period || "")}</span></li>`).join("");
    return `<div class="sc-card">
      <p class="sc-eyebrow">Antes de começar</p>
      <h1 class="sc-title sc-title--lg">Consentimento e escopo</h1>
      <p class="sc-lead">Você vai responder 30 itens sobre prática pessoal, contexto de <b>${escapeHtml(unidade)}</b> e uso de IA. Responda pelo que ocorreu com maior frequência, não pelo ideal.</p>
      ${noteTopo()}
      <div class="sc-consent">
        <div class="sc-usebox"><h3>Para que serve</h3><p>${escapeHtml(st.consent && st.consent.intended_use || "")}</p></div>
        <div class="sc-usebox"><h3>Não serve para</h3><ul>${usos}</ul></div>
        ${blocos ? `<div class="sc-usebox"><h3>Blocos</h3><ul>${blocos}</ul></div>` : ""}
        <label class="sc-ack"><input type="checkbox" data-acao="ack"><span>Li o aviso acima e concordo em responder para fins de homologação do instrumento.</span></label>
      </div>
      <div class="sc-actions sc-actions--split">
        <button class="sc-btn sc-btn--ghost" type="button" data-acao="voltar-codigo">Voltar</button>
        <button class="sc-btn sc-btn--primary" type="button" data-acao="comecar" disabled>${st.tentandoEnviar ? "Iniciando…" : "Começar"}</button>
      </div>
    </div>`;
  }

  // ---------- render: transição de bloco ----------
  const NUM_BLOCO = ["Bloco 1 de 3", "Bloco 2 de 3", "Bloco 3 de 3"];
  function telaTransicao() {
    const b = st.blocks[st.transicaoBloco] || {};
    const primeiro = st.transicaoBloco === 0;
    return `<div class="sc-transicao">
      <p class="sc-eyebrow">${NUM_BLOCO[st.transicaoBloco] || ""}</p>
      <h1 class="sc-title sc-title--lg">${escapeHtml(b.name || "")}</h1>
      ${b.reference_period ? `<p class="sc-transicao__periodo">${escapeHtml(b.reference_period)}</p>` : ""}
      <p class="sc-lead">${escapeHtml(b.instruction || "")}</p>
      <div class="sc-actions sc-actions--split">
        <button class="sc-btn sc-btn--ghost" type="button" data-acao="${primeiro ? "voltar-apresentacao" : "voltar-item"}">${ICONE.volta} Voltar</button>
        <button class="sc-btn sc-btn--primary" type="button" data-acao="iniciar-bloco">Começar bloco ${ICONE.seta}</button>
      </div>
    </div>`;
  }

  // ---------- render: questionário (uma questão por tela) ----------
  function autosaveHtml() {
    if (st.salvando > 0) return `<span class="sc-save sc-save--ativo">Salvando…</span>`;
    if (st.salvoRecente) return `<span class="sc-save sc-save--ok">${ICONE.check} Resposta salva</span>`;
    return `<span class="sc-save">Autosalvo a cada resposta</span>`;
  }
  function telaQuestionario() {
    const it = st.flat[st.pos]; if (!it) return carregando();
    const bi = blocoDoItem(st.pos); const bloco = st.blocks[bi];
    const escolhido = st.respostas[it.id];
    const prog = progresso(Object.keys(st.respostas).length, st.flat.length);
    const opts = it.options.map((op, i) => {
      const na = i === it.options.length - 1; // última opção = "não se aplica" (ordem fixa)
      const checked = escolhido === op.id ? "checked" : "";
      return `<label class="sc-opt ${na ? "sc-opt--na" : ""} ${checked ? "is-checked" : ""}">
        <input type="radio" name="it_${escapeHtml(it.id)}" value="${escapeHtml(op.id)}" ${checked} data-acao="resposta" data-item="${escapeHtml(it.id)}" data-opcao="${escapeHtml(op.id)}">
        <span class="sc-opt__dot" aria-hidden="true"></span>
        <span class="sc-opt__txt">${escapeHtml(op.text)}</span>
        <span class="sc-opt__num" aria-hidden="true">${i + 1}</span>
      </label>`;
    }).join("");
    const ultimo = st.pos === st.flat.length - 1;
    return `<div class="sc-progress">
        <div class="sc-progress__row"><span class="sc-progress__label">${escapeHtml(bloco.name)}</span><span class="sc-progress__count">Pergunta ${st.pos + 1} de ${st.flat.length}</span></div>
        <div class="sc-track"><div class="sc-track__fill" style="width:${prog.pct}%"></div></div>
      </div>
      ${noteTopo()}
      <article class="sc-item" id="sc-questao" tabindex="-1" aria-label="Pergunta ${st.pos + 1} de ${st.flat.length}">
        <p class="sc-item__prompt">${escapeHtml(it.prompt)}</p>
        <div class="sc-opts" role="radiogroup" aria-label="Alternativas">${opts}</div>
      </article>
      <p class="sc-kbd">Use <kbd>1</kbd>–<kbd>${it.options.length}</kbd> para escolher · <kbd>Enter</kbd> avança · <kbd>←</kbd> volta</p>
      <div class="sc-nav">
        <button class="sc-btn sc-btn--ghost" type="button" data-acao="voltar-nav">${ICONE.volta} Voltar</button>
        ${autosaveHtml()}
        <button class="sc-btn sc-btn--primary" type="button" data-acao="avancar-nav" ${escolhido ? "" : "disabled"}>${ultimo ? "Revisar" : "Avançar"} ${ICONE.seta}</button>
      </div>`;
  }

  // ---------- render: revisão ----------
  function telaRevisao() {
    const faltam = itensFaltantes(st.blocks, st.respostas);
    const ok = faltam.length === 0;
    let n = 0;
    const grupos = st.blocks.map((b) => {
      const linhas = b.items.map((it) => {
        n += 1; const pos = n - 1;
        const optId = st.respostas[it.id];
        const op = it.options.find((o) => o.id === optId);
        const txt = op ? escapeHtml(op.text) : `<span class="sc-rev__vazio">Sem resposta</span>`;
        return `<div class="sc-rev__linha ${op ? "" : "is-vazio"}">
          <div class="sc-rev__q"><span class="sc-rev__n">${pos + 1}</span><span>${escapeHtml(it.prompt)}</span></div>
          <div class="sc-rev__a">${txt}</div>
          <button class="sc-btn sc-btn--ghost sc-btn--sm" type="button" data-acao="editar" data-pos="${pos}">Editar</button>
        </div>`;
      }).join("");
      return `<section class="sc-rev__bloco"><h2 class="sc-rev__bnome">${escapeHtml(b.name)}</h2>${linhas}</section>`;
    }).join("");
    return `<div class="sc-rev">
      <p class="sc-eyebrow">Revisão</p>
      <h1 class="sc-title sc-title--lg">${ok ? "Confira antes de enviar" : `Faltam ${faltam.length} ${faltam.length === 1 ? "resposta" : "respostas"}`}</h1>
      <p class="sc-lead">${ok ? "Ao enviar, a devolutiva é calculada e a sessão é fechada — não dá para alterar respostas depois." : "Responda os itens marcados como “Sem resposta” para poder enviar."}</p>
      ${noteTopo()}
      ${grupos}
      <div class="sc-footbar">
        <button class="sc-btn sc-btn--ghost" type="button" data-acao="voltar-item">${ICONE.volta} Voltar ao formulário</button>
        <button class="sc-btn sc-btn--brand" type="button" data-acao="enviar" ${ok ? "" : "disabled"}>${st.tentandoEnviar ? "Enviando…" : "Confirmar e enviar"}</button>
      </div>
    </div>`;
  }

  // ---------- render: devolutiva (9 seções) ----------
  function anelIndice(display, band) {
    const p = pontoExibicao(display);
    return `<div class="sc-anel"><div class="sc-anel__circ"><span class="sc-anel__num">${p == null ? "—" : p}</span><span class="sc-anel__den">/100</span></div>${band ? `<span class="sc-anel__band">${escapeHtml(band)}</span>` : `<span class="sc-anel__band sc-muted">cobertura insuficiente</span>`}</div>`;
  }
  function dimLinha(d, framing) {
    const p = pontoExibicao(d.display_score);
    const glosa = glosaFaixa(d.band_label);
    return `<div class="sc-dim">
      <div class="sc-dim__top"><span class="sc-dim__name">${escapeHtml(d.name)}</span><span class="sc-dim__score">${p == null ? "—" : p}<span class="sc-dim__den">/100</span></span></div>
      <div class="sc-dim__bar"><div class="sc-dim__fill" style="width:${p == null ? 0 : p}%"></div></div>
      ${d.band_label ? `<p class="sc-dim__read">${framing}<b>${escapeHtml(d.band_label)}</b>${glosa ? ` — ${escapeHtml(glosa)}` : ""}.</p>` : `<p class="sc-dim__read sc-muted">Cobertura insuficiente nesta dimensão.</p>`}
    </div>`;
  }
  function secao(num, titulo, subtitulo, corpo) {
    return `<section class="sc-sec">
      <div class="sc-sec__head"><span class="sc-sec__num">${num}</span><div><h2 class="sc-sec__title">${escapeHtml(titulo)}</h2>${subtitulo ? `<p class="sc-sec__sub">${escapeHtml(subtitulo)}</p>` : ""}</div></div>
      ${corpo}
    </section>`;
  }
  function matrizSvg(org, ai, quadLabel, quadMsg) {
    const { x, y } = matrizPonto(org, ai);
    // SVG 0..100 → viewBox 0..100; y invertido (IA alta no topo)
    const cx = x, cy = 100 - y;
    return `<div class="sc-matriz">
      <div class="sc-matriz__plot">
        <svg viewBox="-14 -6 120 120" role="img" aria-label="Matriz Empresa por IA, ponto em Empresa ${x} e IA ${y}">
          <rect x="0" y="0" width="50" height="50" class="sc-mq"/><rect x="50" y="0" width="50" height="50" class="sc-mq sc-mq--alt"/>
          <rect x="0" y="50" width="50" height="50" class="sc-mq sc-mq--alt"/><rect x="50" y="50" width="50" height="50" class="sc-mq"/>
          <line x1="50" y1="0" x2="50" y2="100" class="sc-mx"/><line x1="0" y1="50" x2="100" y2="50" class="sc-mx"/>
          <line x1="0" y1="100" x2="100" y2="100" class="sc-maxis"/><line x1="0" y1="0" x2="0" y2="100" class="sc-maxis"/>
          <circle cx="${cx}" cy="${cy}" r="4.2" class="sc-mdot"/>
          <text x="100" y="112" text-anchor="end" class="sc-mlabel">Empresa →</text>
          <text x="-10" y="0" text-anchor="start" class="sc-mlabel" transform="rotate(-90 -10 0)">IA →</text>
        </svg>
      </div>
      <div class="sc-matriz__leg">
        <p class="sc-matriz__quad">${escapeHtml(quadLabel || "—")}</p>
        <p class="sc-matriz__msg">${escapeHtml(quadMsg || "")}</p>
        <p class="sc-help sc-muted">Empresa ${x}/100 · IA ${y}/100. A percepção individual não entra nesta matriz.</p>
      </div>
    </div>`;
  }
  function alinhamentoLinha(a) {
    const r = rotuloDirecao(a.direction);
    const lado = r.lado; // pessoa (esq) | empresa (dir) | centro
    // Largura da barra a partir do centro, no MÁXIMO 45% (a metade da trilha é 50%).
    const largura = { none: 10, moderate: 28, high: 45, insufficient: 10 }[a.magnitude] ?? 10;
    const barra = lado === "centro"
      ? `<span class="sc-al__mark sc-al__mark--c" style="left:calc(50% - 3px)"></span>`
      : `<span class="sc-al__mark sc-al__mark--${lado}" style="width:${largura}%;${lado === "pessoa" ? "right:50%" : "left:50%"}"></span>`;
    return `<div class="sc-al">
      <div class="sc-al__top"><span class="sc-al__name">${escapeHtml(a.dimension_name)}</span><span class="sc-al__dir">${escapeHtml(r.label)}</span></div>
      <div class="sc-al__track"><span class="sc-al__center"></span>${barra}</div>
    </div>`;
  }
  // Formulário de lead (nome opcional, e-mail obrigatório, opt-in). O servidor
  // revalida e normaliza; guarda a PII isolada em screener_leads.
  function formLeadHtml(titulo, subtitulo) {
    if (st.leadEnviado) return `<div class="sc-note sc-note--ok" role="status">${ICONE.check}<span>Contato registrado. A Boomit pode falar com você sobre este retrato.</span></div>`;
    const erro = st.leadErro ? `<div class="sc-note sc-note--danger" role="alert">${ICONE.info}<span>${escapeHtml(st.leadErro)}</span></div>` : "";
    return `<form class="sc-leadform" data-acao="lead">
      <p class="sc-eyebrow">${escapeHtml(titulo)}</p>
      ${subtitulo ? `<p class="sc-leadform__sub">${escapeHtml(subtitulo)}</p>` : ""}
      ${erro}
      <div class="sc-field"><label class="sc-label" for="sc-lead-nome">Nome <span class="sc-muted">(opcional)</span></label>
        <input class="sc-input" id="sc-lead-nome" name="nome" type="text" autocomplete="name" placeholder="Seu nome"></div>
      <div class="sc-field"><label class="sc-label" for="sc-lead-email">E-mail</label>
        <input class="sc-input" id="sc-lead-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="voce@empresa.com" required></div>
      <label class="sc-ack"><input type="checkbox" id="sc-lead-opt"><span>Aceito receber contato da Boomit sobre este diagnóstico.</span></label>
      <div class="sc-actions"><button class="sc-btn sc-btn--brand sc-btn--block" type="submit" ${st.leadEnviando ? "disabled" : ""}>${st.leadEnviando ? "Enviando…" : "Enviar contato"}</button></div>
    </form>`;
  }
  function telaLeadGate() {
    return `<div class="sc-card">
      <div class="sc-result__head" style="padding:var(--space-2) 0 var(--space-4)"><p class="sc-eyebrow">Quase lá</p><h1 class="sc-title">Seu retrato está pronto</h1></div>
      ${formLeadHtml("Para acessar a devolutiva", "Deixe seu contato para ver o resultado.")}
    </div>`;
  }

  function telaDevolutiva() {
    const d = st.devolutiva || {};
    const unidade = (d.assessment_unit && d.assessment_unit.name) || "sua empresa";
    const cov = d.coverage || {};
    const ind = d.individual || {}, org = d.organization || {}, ia = d.ai || {};
    const gov = rotuloGovernanca(ia.governance);
    const plano = planoDeAcao(d.priorities);

    // 1. Síntese executiva
    const s1 = secao("1", "Síntese executiva", null, `<div class="sc-card sc-card--quiet"><p class="sc-prosa">${escapeHtml(sinteseExecutiva(d))}</p></div>`);

    // 2. Seu modo de atuação (5 dimensões individuais, sem nota geral)
    const s2 = secao("2", "Seu modo de atuação", "Cinco dimensões individuais, sem nota geral do indivíduo.",
      `<div class="sc-dims">${(ind.dimensions || []).map((x) => dimLinha(x, "Sua prática predominante é ")).join("")}</div>`);

    // 3. Como você percebe a organização
    const s3 = secao("3", "Como você percebe a organização", "Sua percepção indica — não é uma afirmação sobre a empresa.",
      `<div class="sc-idx">${anelIndice(org.index_display, org.band_label)}<div class="sc-idx__dims"><div class="sc-dims">${(org.dimensions || []).map((x) => dimLinha(x, "Sua percepção indica ")).join("")}</div></div></div>`);

    // 4. Maturidade em IA percebida (índice + eixos + gate separado)
    const s4 = secao("4", "Maturidade em IA percebida", "Governança é um gate à parte; não reduz o índice.",
      `<div class="sc-idx">${anelIndice(ia.index_display, ia.band_label)}<div class="sc-idx__dims"><div class="sc-dims">${(ia.dimensions || []).map((x) => dimLinha(x, "Sua percepção indica ")).join("")}</div>
        <div class="sc-gate"><span class="sc-gate__k">Governança</span><span class="sc-gate__v">${escapeHtml(gov.label)}</span><p class="sc-gate__n">${escapeHtml(gov.nota)}</p></div>
      </div></div>`);

    // 5. Matriz Empresa × IA
    const m = d.matrix || {};
    const s5 = m.available
      ? secao("5", "Matriz Empresa × IA", "Posição do contexto e da IA percebidos.", matrizSvg(org.index_display, ia.index_display, m.quadrant_label, m.quadrant_message) + `<p class="sc-help sc-muted" style="margin-top:var(--space-3)">${escapeHtml(m.provisional_note || "")}</p>`)
      : secao("5", "Matriz Empresa × IA", null, `<div class="sc-card sc-card--quiet"><p class="sc-muted">Cobertura ainda insuficiente para posicionar a matriz.</p></div>`);

    // 6. Alinhamento Pessoa × Empresa
    const s6 = secao("6", "Alinhamento Pessoa × Empresa", "A distância não é, por si, uma deficiência — é uma leitura.",
      `<div class="sc-als">${(d.alignment || []).map(alinhamentoLinha).join("")}</div>
       <div class="sc-al__leg"><span>Você à frente</span><span>Alinhado</span><span>Contexto à frente</span></div>`);

    // 7. Prioridades (uma por escopo)
    const s7 = secao("7", "Três prioridades", "No máximo uma por escopo. O racional detalhado é definido na homologação.",
      `<div class="sc-prio">${(d.priorities || []).map((p) => `<div class="sc-prio__item">
        <span class="sc-prio__rank">${escapeHtml(String(p.rank))}</span>
        <div class="sc-prio__body"><span class="sc-prio__scope">${escapeHtml(rotuloEscopo(p.scope))}${p.dimension_name ? " · " + escapeHtml(p.dimension_name) : ""}</span>
          <span class="sc-prio__mv"><b>Primeiro movimento:</b> ${escapeHtml(p.action || "")}</span></div>
      </div>`).join("")}</div>`);

    // 8. Plano de 30 dias
    const s8 = secao("8", "Plano de 30 dias", "Um movimento observável por escopo.",
      `<div class="sc-plano">${plano.map((p, i) => `<div class="sc-plano__item"><span class="sc-plano__k">${escapeHtml(rotuloEscopo(p.scope))}</span><p class="sc-plano__a">${escapeHtml(p.action || "")}</p></div>`).join("")}</div>`);

    // 9. Nota metodológica
    const proib = (st.consent && st.consent.prohibited_uses) ? st.consent.prohibited_uses : ((d.notes) || []);
    const s9 = secao("9", "Nota metodológica", null,
      `<div class="sc-card sc-card--quiet">
        <ul class="sc-meta">
          <li>Cobertura das respostas: Pessoa <b>${escapeHtml(rotuloCobertura(cov.individual))}</b>, Empresa <b>${escapeHtml(rotuloCobertura(cov.organization))}</b>, IA <b>${escapeHtml(rotuloCobertura(cov.ai))}</b>.</li>
          <li>“Não se aplica” não vira zero: fica fora da conta, então baixa cobertura torna a leitura indicativa.</li>
          <li>Pessoa, Empresa e IA nunca são somadas numa nota geral.</li>
          <li>Retrato de degustação a partir de uma percepção; não é diagnóstico definitivo da empresa.</li>
          <li>Uso proibido para decisão individual de emprego (contratação, promoção, remuneração ou desligamento).</li>
          ${st.modo === "homologacao" ? '<li class="sc-muted">As leituras por dimensão, o racional das prioridades e a evidência a acompanhar serão autorados a partir desta homologação.</li>' : ""}
        </ul>
      </div>`);

    const leadBloco = (st.leadMode === "optional_after_submit")
      ? `<section class="sc-sec"><div class="sc-card sc-card--lead">${formLeadHtml("Vamos conversar?", "Se quiser aprofundar este retrato com a Boomit, deixe seu contato.")}</div></section>` : "";
    return `<div class="sc-result__head">
        <p class="sc-eyebrow">Devolutiva${st.modo === "homologacao" ? " · homologação" : ""}</p>
        <h1 class="sc-title sc-title--xl">${escapeHtml(unidade)}</h1>
        <p class="sc-lead sc-center">Retrato de degustação, escala 0–100. Percepção de uma pessoa.</p>
      </div>
      ${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}${s9}${leadBloco}
      <div class="sc-actions sc-center-actions"><button class="sc-btn sc-btn--ghost" type="button" data-acao="recomecar">${st.modo === "homologacao" ? "Nova sessão de homologação" : "Nova resposta"}</button></div>`;
  }

  function telaErro() {
    const d = st.erro || {};
    const ic = ICONE[d.icone] || ICONE.aviso;
    const retry = (d.recuperavel && d.retry)
      ? `<button class="sc-btn sc-btn--primary" type="button" data-acao="retry">${st.tentandoEnviar ? "Tentando…" : "Tentar novamente"}</button>` : "";
    return `<div class="sc-erro">
      <div class="sc-erro__ic" aria-hidden="true">${ic}</div>
      <h1 class="sc-title">${escapeHtml(d.titulo || "Algo não saiu como esperado")}</h1>
      <p class="sc-lead">${escapeHtml(d.mensagem || "")}</p>
      <div class="sc-actions">
        ${retry}
        <button class="sc-btn ${retry ? "sc-btn--ghost" : "sc-btn--primary"}" type="button" data-acao="recomecar">Começar de novo</button>
      </div>
    </div>`;
  }

  function carregando() { return `<div class="sc-loading"><span class="sc-spin" aria-hidden="true"></span> Carregando…</div>`; }

  function corpo() {
    switch (st.tela) {
      case "abertura": return telaAbertura();
      case "codigo": return telaCodigo();
      case "apresentacao": return telaApresentacao();
      case "transicao": return telaTransicao();
      case "questionario": return telaQuestionario();
      case "revisao": return telaRevisao();
      case "lead_gate": return telaLeadGate();
      case "devolutiva": return telaDevolutiva();
      case "erro": return telaErro();
      default: return carregando();
    }
  }
  function pintar() {
    const compacto = st.tela === "questionario" || st.tela === "transicao";
    const topo = st.modo === "homologacao" ? tarja : "";
    raiz.innerHTML = topo + `<div class="sc-shell">` + cabecalho(compacto) + corpo() + `</div>`;
    // Mantém o foco na questão enquanto o questionário está aberto — o re-render do
    // autosave destrói o nó, então o foco iria para o body e o teclado (1–9/Enter/
    // setas) dependeria de clicar de volta. Reanunciar a cada render é aceitável:
    // o leitor de tela confirma a questão atual. O anel do contêiner é suprimido.
    if (st.tela === "questionario") {
      const q = raiz.querySelector("#sc-questao");
      if (q) { try { q.focus({ preventScroll: true }); } catch { /* ok */ } }
    }
  }

  // --- eventos ---
  raiz.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-acao]"); if (!alvo) return;
    const acao = alvo.getAttribute("data-acao");
    const fns = {
      tema: alternarTema, entrar: tentarEntrar, "voltar-codigo": () => irPara("codigo"),
      comecar, "voltar-apresentacao": () => irPara("apresentacao"), "iniciar-bloco": iniciarBloco,
      "voltar-nav": voltar, "avancar-nav": avancar, "voltar-item": () => irPara("questionario"),
      enviar, recomecar, "pular-lead": () => irPara("devolutiva"),
      retry: () => { const f = st.erro && st.erro.retry; if (f) f(); },
    };
    if (acao === "editar") return editarItem(Number(alvo.getAttribute("data-pos")));
    if (fns[acao]) return fns[acao]();
  });
  raiz.addEventListener("change", (ev) => {
    const alvo = ev.target; if (!alvo.getAttribute) return;
    if (alvo.getAttribute("data-acao") === "resposta") return salvarResposta(alvo.getAttribute("data-item"), alvo.getAttribute("data-opcao"));
    if (alvo.getAttribute("data-acao") === "ack") { const b = raiz.querySelector('[data-acao="comecar"]'); if (b) b.disabled = !alvo.checked; }
  });
  raiz.addEventListener("submit", (ev) => {
    const form = ev.target; if (!form.getAttribute) return;
    const acao = form.getAttribute("data-acao");
    if (acao === "codigo") {
      ev.preventDefault();
      const campo = form.querySelector("#sc-codigo"); const codigo = (campo && campo.value || "").trim();
      if (!codigo) { st.erroTopo = "Informe o código de acesso."; return pintar(); }
      abrirApresentacao(codigo);
    } else if (acao === "lead") {
      ev.preventDefault();
      const nome = form.querySelector("#sc-lead-nome"); const email = form.querySelector("#sc-lead-email"); const opt = form.querySelector("#sc-lead-opt");
      enviarLead(nome && nome.value, email && email.value, opt && opt.checked);
    }
  });

  // Teclado no questionário: 1–9 escolhe a alternativa; Enter/→ avança (se
  // respondida); ← volta. Não sequestra digitação em campos de texto.
  doc.addEventListener("keydown", (ev) => {
    if (st.tela !== "questionario") return;
    const t = ev.target;
    if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const it = st.flat[st.pos]; if (!it) return;
    if (ev.key >= "1" && ev.key <= "9") {
      const idx = Number(ev.key) - 1;
      if (idx < it.options.length) { ev.preventDefault(); salvarResposta(it.id, it.options[idx].id); }
    } else if (ev.key === "Enter" || ev.key === "ArrowRight") {
      if (st.respostas[it.id]) { ev.preventDefault(); avancar(); }
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault(); voltar();
    }
  });

  // --- arranque ---
  (function bootstrap() {
    try { const t = globalThis.localStorage.getItem("screener:tema"); if (t) doc.documentElement.setAttribute("data-theme", t); } catch { /* ok */ }
    const salva = lerSessao(evento);
    if (salva && salva.token) retomar(salva);
    else irPara("abertura");
  })();

  return { st, pintar };
}

// Arranque automático no navegador (pulável no harness; nunca em node --test).
if (typeof globalThis.document !== "undefined") {
  const cfg = globalThis.SCREENER_CONFIG;
  if (cfg && cfg.autostart !== false) {
    const start = () => iniciarApp(cfg);
    if (globalThis.document.readyState === "loading") globalThis.document.addEventListener("DOMContentLoaded", start);
    else start();
  }
}
