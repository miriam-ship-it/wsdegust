// =============================================================
// DIAGNÓSTICO BOOMIT — front do respondente.
//
// Fluxo: abertura → identificação e consentimento → 40 questões (UMA por tela,
// escolha avança sozinha, voltar sempre à mão, autosave visível) → gate de
// e-mail → devolutiva na tela.
//
// 🔒 FRONTEIRA. O navegador nunca vê pontos, degraus, pesos, tratamento nem
//    regra de cálculo. Ele recebe a projeção pública das questões (vinda da
//    edge em runtime, não embutida neste arquivo) e, no fim, a devolutiva já
//    sanitizada. TODO cálculo é do servidor.
//
// 🔒 ISOLAMENTO. O evento é resolvido pelo EVENTO_SLUG e só quando `ativo`. O
//    respondente nasce com o evento_id dessa linha, e o token de sessão viaja
//    no cabeçalho `x-sessao` em toda leitura e gravação — é o que faz a RLS
//    devolver só a própria sessão, e nada de outro evento.
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CFG = window.APP_CONFIG;
const CHAVE = "diagnostico:" + CFG.EVENTO_SLUG;

// A lógica pura vive em `logica.mjs`, que não importa nada por URL e por isso
// pode ser testada no Node. Ver `diagnostico/logica.test.mjs`.
import {
  escapeHtml, progresso, primeiraNaoRespondida, itensFaltantes,
  opcaoLivre, entrouEmNovoBloco, novoToken, emailValido,
} from "./logica.mjs";

// ---------------------------------------------------------------
// estado e persistência
// ---------------------------------------------------------------

const estado = {
  evento: null,
  instrumento: null,
  itens: [],
  respostas: {},
  respondenteId: null,
  token: null,
  indice: 0,
  outroTexto: "",
  devolutiva: null,
  resultado: null,
  pdfUrl: null,
  emailEnviado: false,
  salvando: false,
};

function salvarSessao() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({
      respondenteId: estado.respondenteId,
      token: estado.token,
      respostas: estado.respostas,
      indice: estado.indice,
      outroTexto: estado.outroTexto,
    }));
  } catch (e) { /* modo privado: segue sem retomada */ }
}
function lerSessao() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || null; } catch (e) { return null; }
}
function limparSessao() {
  try { localStorage.removeItem(CHAVE); } catch (e) {}
}

let _cliente = null;
function cliente() {
  if (!_cliente || _cliente.__token !== estado.token) {
    _cliente = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: estado.token ? { "x-sessao": estado.token } : {} },
    });
    _cliente.__token = estado.token;
  }
  return _cliente;
}

async function chamarEdge(corpo) {
  const url = `${CFG.SUPABASE_URL}/functions/v1/${CFG.EDGE_GATE_FUNCTION}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}` },
    body: JSON.stringify(corpo),
  });
  return resp.json();
}

// ---------------------------------------------------------------
// rede
// ---------------------------------------------------------------

async function carregarCatalogo() {
  const r = await chamarEdge({ acao: "catalogo" });
  if (!r.ok) throw new Error(r.error === "evento_inativo" ? "Este diagnóstico não está disponível no momento." : "Não foi possível carregar o questionário.");
  estado.evento = r.evento;
  estado.instrumento = r.instrumento;
  estado.itens = r.instrumento.itens;
}

async function criarRespondente({ nome, empresa, cargo }) {
  // O evento é resolvido pelo SLUG e só se estiver ativo — nunca por nome,
  // e-mail ou empresa, que se repetem entre eventos.
  const sb0 = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: evento, error: errEv } = await sb0
    .from("eventos")
    .select("id, slug, nome, cliente, catalogo_versao, questionario_versao, ativo")
    .eq("slug", CFG.EVENTO_SLUG)
    .eq("ativo", true)
    .single();
  if (errEv || !evento) throw new Error("Este diagnóstico não está disponível no momento.");

  estado.token = novoToken();
  const { data, error } = await cliente()
    .from("respondentes")
    .insert({
      evento_id: evento.id,
      token_sessao: estado.token,
      nome, empresa, cargo,
      consentimento_lgpd: true,
      versao_questionario: evento.questionario_versao,
    })
    .select("id, token_sessao")
    .single();
  if (error) throw new Error("Não foi possível iniciar: " + error.message);
  estado.respondenteId = data.id;
  salvarSessao();
  return data;
}

async function gravarResposta(codigo, opcao, textoLivre = null) {
  const { error } = await cliente()
    .from("respostas")
    .upsert(
      {
        respondente_id: estado.respondenteId,
        pergunta_id: codigo,
        opcao_codigo: opcao,
        texto_livre: textoLivre || null,
        // A forma Likert (dimensao/lente/valor) é de outro instrumento do mesmo
        // banco; aqui ela fica nula, e o CHECK `respostas_forma_completa`
        // garante que a linha esteja completa numa das duas formas.
        lente: null, dimensao: null, valor: null,
      },
      { onConflict: "respondente_id,pergunta_id" }
    );
  if (error) { console.warn("resposta não gravou:", error.message); return false; }
  return true;
}

async function recarregarRespostas() {
  const { data, error } = await cliente()
    .from("respostas")
    .select("pergunta_id, opcao_codigo, texto_livre")
    .eq("respondente_id", estado.respondenteId);
  if (error || !data) return;
  const r = {};
  for (const l of data) {
    if (!l.opcao_codigo) continue;
    r[l.pergunta_id] = l.opcao_codigo;
    if (l.texto_livre) estado.outroTexto = l.texto_livre;
  }
  estado.respostas = { ...r, ...estado.respostas };
}

// ---------------------------------------------------------------
// telas
// ---------------------------------------------------------------

const app = () => document.getElementById("dg-app");

function cabecalho() {
  return `
  <header class="sc-head dg-head">
    <div class="sc-brand">
      <img class="sc-logo" src="logo-boomit.png" alt="Boomit">
      <span class="sc-brand__divisor"></span>
      <span class="sc-brand__sub">${escapeHtml(estado.evento?.nome || "Diagnóstico")}</span>
    </div>
    <button class="sc-theme" id="dg-tema" type="button" aria-label="Alternar tema claro e escuro">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>
      </svg>
    </button>
  </header>`;
}

function telaCarregando() {
  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <div class="dg-skeleton" role="status" aria-label="Carregando">
      <span></span><span></span><span></span>
    </div></div>`;
  ligarTema();
}

function telaErro(msg, podeTentar = true) {
  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <div class="sc-card dg-erro" role="alert">
      <h2 class="sc-title">Não foi possível continuar</h2>
      <p class="sc-lead">${escapeHtml(msg)}</p>
      ${podeTentar ? `<div class="sc-actions"><button class="sc-btn sc-btn--primary" id="dg-retry" type="button">Tentar de novo</button></div>` : ""}
      <p class="sc-help" style="margin-top:var(--space-4)">Nada do que já foi respondido se perdeu.</p>
    </div></div>`;
  ligarTema();
  document.getElementById("dg-retry")?.addEventListener("click", () => iniciar());
}

function telaAbertura() {
  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <section class="sc-hero">
      <p class="sc-eyebrow">${escapeHtml(estado.evento.cliente)}</p>
      <h1 class="sc-hero__title">${escapeHtml(estado.evento.nome)}</h1>
      <p class="sc-hero__lead">Uma leitura de como a gestão de pessoas, os processos e a decisão sobre IA acontecem hoje — do ponto de vista de quem convive com eles.</p>
      <div class="sc-actions"><button class="sc-btn sc-btn--primary" id="dg-comecar" type="button">Começar</button></div>
      <div class="sc-hero__foot">
        <p><b>40 questões, cerca de 10 minutos.</b> Uma por tela. Dá para sair e voltar depois no mesmo link, do mesmo navegador.</p>
        <p style="margin-top:var(--space-3)">Sempre há a alternativa <b>“não tenho exposição suficiente para responder”</b>. Ela fica fora do cálculo e não é lida como baixa maturidade — marcar essa opção é informação, não perda.</p>
      </div>
    </section></div>`;
  ligarTema();
  document.getElementById("dg-comecar").addEventListener("click", telaIdentificacao);
}

function telaIdentificacao() {
  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <section class="sc-card">
      <p class="sc-eyebrow">Antes de começar</p>
      <h2 class="sc-title">Quem está respondendo</h2>
      <p class="sc-lead">A devolutiva é enviada por e-mail ao final. O nome e a empresa aparecem apenas no seu relatório.</p>
      <div class="dg-form">
        <label class="sc-field"><span class="sc-label">Nome</span>
          <input class="sc-input" id="f-nome" type="text" autocomplete="name" required></label>
        <label class="sc-field"><span class="sc-label">Empresa</span>
          <input class="sc-input" id="f-empresa" type="text" autocomplete="organization" required></label>
        <label class="sc-field"><span class="sc-label">Cargo</span>
          <input class="sc-input" id="f-cargo" type="text" autocomplete="organization-title" required></label>
      </div>
      <div class="sc-consent">
        <div class="sc-usebox">
          <h3>Como os dados são usados</h3>
          <ul>
            <li>As respostas geram a sua devolutiva e ficam associadas apenas a este diagnóstico.</li>
            <li>Nenhuma resposta individual é compartilhada com a sua organização.</li>
            <li>A exclusão pode ser pedida a qualquer momento por <b>miriam@boomit.com.br</b>.</li>
          </ul>
        </div>
        <label class="sc-ack"><input type="checkbox" id="f-lgpd">
          <span>Concordo com o uso dos meus dados para gerar e enviar esta devolutiva.</span></label>
      </div>
      <div class="sc-actions sc-actions--split">
        <button class="sc-btn sc-btn--ghost" id="dg-voltar" type="button">Voltar</button>
        <button class="sc-btn sc-btn--primary" id="dg-iniciar" type="button" disabled>Começar o diagnóstico</button>
      </div>
      <p class="sc-help dg-msg" id="dg-msg" role="status"></p>
    </section></div>`;
  ligarTema();

  const campos = ["f-nome", "f-empresa", "f-cargo"].map((id) => document.getElementById(id));
  const lgpd = document.getElementById("f-lgpd");
  const botao = document.getElementById("dg-iniciar");
  const validar = () => {
    botao.disabled = !(campos.every((c) => c.value.trim()) && lgpd.checked);
  };
  campos.forEach((c) => c.addEventListener("input", validar));
  lgpd.addEventListener("change", validar);
  document.getElementById("dg-voltar").addEventListener("click", telaAbertura);

  botao.addEventListener("click", async () => {
    botao.disabled = true;
    document.getElementById("dg-msg").textContent = "Iniciando…";
    try {
      await criarRespondente({
        nome: campos[0].value.trim(), empresa: campos[1].value.trim(), cargo: campos[2].value.trim(),
      });
      estado.indice = 0;
      telaQuestao();
    } catch (e) {
      document.getElementById("dg-msg").textContent = e.message;
      botao.disabled = false;
    }
  });
}

const NOME_BLOCO = {
  CTX: "Contexto e autoridade",
  EST: "Estratégia do negócio e pessoas",
  LID: "Liderança e funcionalidade",
  PRO: "Processos e dados",
  IA: "Decisão e implementação de IA",
  FUT: "Competências, capacidade e organização futura",
  GOV: "Governança",
};

function telaQuestao() {
  const it = estado.itens[estado.indice];
  if (!it) return telaGate();
  const p = progresso(Object.keys(estado.respostas).length, estado.itens.length);
  const marcada = estado.respostas[it.codigo];
  const novoBloco = entrouEmNovoBloco(estado.itens, estado.indice) || estado.indice === 0;

  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <div class="sc-progress">
      <div class="sc-progress__row">
        <span class="sc-progress__label">${escapeHtml(NOME_BLOCO[it.bloco] || "")}</span>
        <span class="sc-progress__count">Questão ${estado.indice + 1} de ${estado.itens.length}</span>
      </div>
      <div class="sc-track"><div class="sc-track__fill" style="width:${p.pct}%"></div></div>
    </div>
    ${novoBloco ? `<p class="dg-transicao">${escapeHtml(NOME_BLOCO[it.bloco])}${it.lente && it.bloco === "LID" ? ` · lente ${escapeHtml(it.lente)}` : ""}</p>` : ""}
    <section class="sc-item" id="dg-questao" tabindex="-1">
      <p class="sc-item__prompt">${escapeHtml(it.pergunta)}</p>
      <div class="sc-opts" role="radiogroup" aria-label="Alternativas">
        ${it.opcoes.map((o) => `
          <label class="sc-opt ${o.codigo === "NA" ? "sc-opt--na" : ""} ${marcada === o.codigo ? "is-checked" : ""}">
            <input type="radio" name="op" value="${escapeHtml(o.codigo)}" ${marcada === o.codigo ? "checked" : ""}>
            <span class="sc-opt__dot"></span>
            <span class="sc-opt__txt">${escapeHtml(o.texto)}</span>
          </label>`).join("")}
      </div>
      ${opcaoLivre(it) ? `<div class="dg-outro ${marcada === opcaoLivre(it).codigo ? "" : "is-hidden"}" id="dg-outro-wrap">
        <label class="sc-field"><span class="sc-label">Qual?</span>
          <input class="sc-input" id="dg-outro" type="text" value="${escapeHtml(estado.outroTexto)}" maxlength="120"></label>
      </div>` : ""}
    </section>
    <nav class="sc-nav">
      <button class="sc-btn sc-btn--ghost sc-btn--sm" id="dg-ant" type="button" ${estado.indice === 0 ? "disabled" : ""}>Anterior</button>
      <span class="dg-autosave" id="dg-autosave" role="status">${marcada ? "Salvo automaticamente" : ""}</span>
      <button class="sc-btn sc-btn--primary sc-btn--sm" id="dg-prox" type="button" ${marcada ? "" : "disabled"}>${estado.indice === estado.itens.length - 1 ? "Concluir" : "Avançar"}</button>
    </nav>
    <p class="sc-help dg-sair"><button type="button" class="dg-link" id="dg-sair">Sair e continuar depois</button> — o mesmo link retoma de onde parou, neste navegador.</p>
  </div>`;
  ligarTema();
  document.getElementById("dg-questao").focus();

  const wrapOutro = document.getElementById("dg-outro-wrap");
  app().querySelectorAll('input[name="op"]').forEach((r) => {
    r.addEventListener("change", async () => {
      const livre = opcaoLivre(it);
      const ehLivre = livre && r.value === livre.codigo;
      estado.respostas[it.codigo] = r.value;
      if (wrapOutro) wrapOutro.classList.toggle("is-hidden", !ehLivre);
      salvarSessao();
      app().querySelectorAll(".sc-opt").forEach((l) => l.classList.toggle("is-checked", l.contains(r) && r.checked));
      document.getElementById("dg-prox").disabled = false;
      const aviso = document.getElementById("dg-autosave");
      aviso.textContent = "Salvando…";
      const ok = await gravarResposta(it.codigo, r.value);
      aviso.textContent = ok ? "Salvo automaticamente" : "Sem conexão — será salvo ao avançar";
      // Escolha avança sozinha — menos quando ela ainda pede um texto.
      if (ok && !ehLivre) {
        setTimeout(() => { if (estado.respostas[it.codigo] === r.value) avancar(); }, 260);
      }
    });
  });
  let debounce;
  document.getElementById("dg-outro")?.addEventListener("input", (e) => {
    estado.outroTexto = e.target.value;
    salvarSessao();
    // O texto livre vai para o BANCO, não só para o localStorage: ele é o que
    // a devolutiva mostra no lugar de "Outro", e localStorage não sobrevive a
    // trocar de máquina nem a limpar o navegador.
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const aviso = document.getElementById("dg-autosave");
      const ok = await gravarResposta(it.codigo, estado.respostas[it.codigo], estado.outroTexto);
      if (aviso) aviso.textContent = ok ? "Salvo automaticamente" : "Sem conexão — será salvo ao avançar";
    }, 600);
  });
  document.getElementById("dg-ant").addEventListener("click", () => { estado.indice--; salvarSessao(); telaQuestao(); });
  document.getElementById("dg-prox").addEventListener("click", avancar);
  document.getElementById("dg-sair").addEventListener("click", telaPausa);
}

function avancar() {
  if (estado.indice >= estado.itens.length - 1) return telaGate();
  estado.indice++;
  salvarSessao();
  telaQuestao();
}

function telaPausa() {
  const p = progresso(Object.keys(estado.respostas).length, estado.itens.length);
  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <section class="sc-card sc-center">
      <h2 class="sc-title">Progresso guardado</h2>
      <p class="sc-lead">${p.respondidas} de ${p.total} questões respondidas. Abrir este mesmo link neste navegador retoma de onde parou.</p>
      <div class="sc-actions sc-center-actions"><button class="sc-btn sc-btn--primary" id="dg-continuar" type="button">Continuar agora</button></div>
    </section></div>`;
  ligarTema();
  document.getElementById("dg-continuar").addEventListener("click", telaQuestao);
}

function telaGate() {
  const faltando = itensFaltantes(estado.itens, estado.respostas);
  if (faltando.length) {
    estado.indice = primeiraNaoRespondida(estado.itens, estado.respostas);
    return telaQuestao();
  }
  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <section class="sc-card">
      <p class="sc-eyebrow">Última etapa</p>
      <h2 class="sc-title">Para onde enviamos a devolutiva</h2>
      <p class="sc-lead">As 40 questões estão respondidas. A devolutiva é gerada agora e chega em PDF, com sete páginas.</p>
      <div class="dg-form">
        <label class="sc-field"><span class="sc-label">E-mail</span>
          <input class="sc-input" id="f-email" type="email" inputmode="email" autocomplete="email" required></label>
      </div>
      <div class="sc-consent">
        <label class="sc-ack"><input type="checkbox" id="f-mkt">
          <span>Aceito receber outros conteúdos da Boomit. (opcional)</span></label>
      </div>
      <div class="sc-actions">
        <button class="sc-btn sc-btn--brand sc-btn--block" id="dg-finalizar" type="button" disabled>Gerar a devolutiva</button>
      </div>
      <p class="sc-help dg-msg" id="dg-msg" role="status"></p>
    </section></div>`;
  ligarTema();
  const campo = document.getElementById("f-email");
  const botao = document.getElementById("dg-finalizar");
  campo.addEventListener("input", () => { botao.disabled = !emailValido(campo.value); });
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    const msg = document.getElementById("dg-msg");
    msg.textContent = "Gerando a devolutiva… isso leva alguns segundos.";
    try {
      const r = await chamarEdge({
        acao: "finalizar",
        token: estado.token,
        email: campo.value.trim(),
        consentimento_marketing: document.getElementById("f-mkt").checked,
      });
      if (!r.ok) {
        if (r.error === "respostas_incompletas") {
          estado.indice = primeiraNaoRespondida(estado.itens, estado.respostas);
          return telaQuestao();
        }
        throw new Error("Não foi possível gerar a devolutiva agora.");
      }
      estado.devolutiva = r.devolutiva;
      estado.resultado = r.resultado;
      estado.pdfUrl = r.pdf_url;
      estado.emailEnviado = r.email_enviado;
      limparSessao();
      telaResultado();
    } catch (e) {
      msg.textContent = e.message + " Nada do que foi respondido se perdeu — dá para tentar de novo.";
      botao.disabled = false;
    }
  });
}

// ---------------------------------------------------------------
// devolutiva na tela — a MESMA estrutura que o PDF consome
// ---------------------------------------------------------------

function barra(d, considerados) {
  if (!considerados) return `<p class="dg-legenda">Sem itens com posição declarada neste bloco.</p>`;
  const cls = { E1: "e1", E2: "e2", E3: "e3", E4: "e4" };
  const celulas = ["E1", "E2", "E3", "E4"].filter((k) => d[k] > 0)
    .map((k) => `<span class="dg-barra__seg dg-barra__seg--${cls[k]}" style="flex:${d[k]}"></span>`).join("");
  const leg = ["E1", "E2", "E3", "E4"].filter((k) => d[k] > 0).map((k) => `${k}: ${d[k]}`).join(" · ");
  return `<div class="dg-barra">${celulas}</div><p class="dg-legenda">${escapeHtml(leg)} — ${considerados} ${considerados === 1 ? "item respondido" : "itens respondidos"} com posição</p>`;
}

function blocoHtml(b) {
  return `<div class="dg-bloco">
    <h3>${escapeHtml(b.titulo)}</h3>
    <p class="dg-legenda">${escapeHtml(b.foco)}</p>
    ${barra(b.distribuicao, b.considerados)}
    ${b.na ? `<p class="dg-legenda">${b.na} ${b.na === 1 ? "item ficou" : "itens ficaram"} sem exposição suficiente e ${b.na === 1 ? "está" : "estão"} fora do cálculo.</p>` : ""}
    <p>${escapeHtml(b.leitura)}</p>
  </div>`;
}

function prioridadeHtml(p, i) {
  return `<article class="dg-janela">
    <p class="dg-janela__cab">Prioridade ${i + 1} · ${escapeHtml(p.bloco_nome)}${p.lente ? ` · lente ${escapeHtml(p.lente)}` : ""}</p>
    <div class="dg-passo dg-passo--evid"><span class="dg-rot">Evidência relatada</span>
      <p>Em resposta a “${escapeHtml(p.evidencia.pergunta)}”, a alternativa marcada foi: <b>“${escapeHtml(p.evidencia.resposta_literal)}”</b></p></div>
    <div class="dg-passo"><span class="dg-rot">Hipótese diagnóstica</span><p>${escapeHtml(p.hipotese)}</p></div>
    <div class="dg-passo"><span class="dg-rot">Consequência possível</span><p>${escapeHtml(p.consequencia)}</p></div>
    <div class="dg-passo"><span class="dg-rot">Verificação necessária</span><p>${escapeHtml(p.verificacao)}</p></div>
  </article>`;
}

function cenarioHtml(c) {
  return `<article class="dg-janela dg-janela--cenario">
    <p class="dg-janela__cab">Cenário de solução · ${escapeHtml(c.especialidade.nome)}</p>
    <p>${escapeHtml(c.cenario_de_transformacao)}</p>
    <h4>Sinais observados que sustentam este cenário</h4>
    <ul>${c.sinais.map((s) => `<li>${escapeHtml(s.bloco_nome)} — “${escapeHtml(s.resposta_literal)}”</li>`).join("")}</ul>
    <h4>Evidência que confirma ou refuta</h4>
    <ul>${c.evidencia_que_decide.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
    <p class="dg-legenda">${escapeHtml(c.proximo_passo)}</p>
  </article>`;
}

function telaResultado() {
  const d = estado.devolutiva;
  const p = Object.fromEntries(d.paginas.map((x) => [x.n, x]));
  const linha = (c) => `<div class="dg-perfil__l"><span>${escapeHtml(c.rotulo)}</span><span>${escapeHtml(c.texto)}</span></div>`;
  const gov = p[6].governanca;
  const pl = p[7];

  app().innerHTML = `<div class="sc-shell">${cabecalho()}
    <section class="dg-res">
      <p class="sc-eyebrow">${escapeHtml(estado.evento.cliente)} · devolutiva</p>
      <h1 class="sc-title sc-title--lg">Leitura de gestão de pessoas e IA</h1>

      <div class="dg-entrega" role="status">
        ${estado.emailEnviado
          ? `<b>A devolutiva foi enviada por e-mail</b>, com o PDF de sete páginas em anexo.`
          : `<b>O envio por e-mail não se completou agora.</b> A leitura abaixo está completa${estado.pdfUrl ? " e o PDF pode ser baixado aqui mesmo" : ""}.`}
        ${estado.pdfUrl ? ` <a class="dg-link" href="${escapeHtml(estado.pdfUrl)}" target="_blank" rel="noopener">Baixar o PDF</a>` : ""}
      </div>

      ${!d.nota_publicavel ? `<div class="dg-aviso"><b>Sobre a escala.</b> ${escapeHtml(d.aviso_pontuacao)}</div>` : ""}

      <h2 class="dg-h2">Resumo executivo</h2>
      ${p[1].resumo.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}

      <h2 class="dg-h2">Contexto declarado</h2>
      <div class="dg-perfil">${(p[1].contexto || []).map(linha).join("")}</div>
      <p class="dg-legenda">Os itens de contexto descrevem de onde parte a leitura. Eles não pontuam.</p>

      <h2 class="dg-h2">Leitura por bloco</h2>
      ${[3, 4, 5].flatMap((n) => (p[n].blocos || []).map(blocoHtml)).join("")}

      <div class="dg-bloco">
        <h3>${escapeHtml(p[3].lideranca.titulo)}</h3>
        <div class="dg-duas">
          <div><p class="dg-legenda"><b>Lente Pessoa</b> — atuação individual</p>
            ${barra(p[3].lideranca.pessoa.distribuicao, p[3].lideranca.pessoa.considerados)}</div>
          <div><p class="dg-legenda"><b>Lente Organização</b> — sustentação organizacional</p>
            ${barra(p[3].lideranca.organizacao.distribuicao, p[3].lideranca.organizacao.considerados)}</div>
        </div>
        <p>${escapeHtml(p[3].lideranca.leitura)}</p>
        <p class="dg-legenda">${escapeHtml(p[3].lideranca.nota)}</p>
      </div>

      <h2 class="dg-h2">Governança</h2>
      <div class="dg-bloco">
        <p><span class="dg-chip">${escapeHtml(gov.rotulo)}</span>${gov.item_determinante ? `<span class="dg-chip">definida por ${escapeHtml(gov.item_determinante)}</span>` : ""}</p>
        <p>${escapeHtml(gov.leitura)}</p>
        <p class="dg-legenda">${escapeHtml(gov.nota)}</p>
      </div>

      ${p[6].prioridades.length ? `<h2 class="dg-h2">Prioridades do ciclo</h2>${p[6].prioridades.map(prioridadeHtml).join("")}` : ""}
      ${p[6].cenarios.length ? `<h2 class="dg-h2">Cenários de solução Boomit</h2>
        <p class="dg-legenda">Cada cenário parte de um sinal efetivamente registrado nas respostas. Eles descrevem o que precisaria ser construído, e não uma recomendação de compra.</p>
        ${p[6].cenarios.map(cenarioHtml).join("")}` : ""}

      <h2 class="dg-h2">${escapeHtml(pl.titulo)}</h2>
      ${pl.vazio ? `<p>${escapeHtml(pl.leitura)}</p>` : ""}
      ${(pl.etapas || []).map((e) => `<article class="dg-janela">
        <p class="dg-janela__cab">${escapeHtml(e.janela)} · ${escapeHtml(e.foco)}</p>
        <ul>${e.acoes.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul></article>`).join("")}

      <div class="dg-aviso dg-aviso--final">${escapeHtml(p[1].aviso_de_interpretacao)}</div>
    </section></div>`;
  ligarTema();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------
// tema
// ---------------------------------------------------------------

function ligarTema() {
  document.getElementById("dg-tema")?.addEventListener("click", () => {
    const atual = document.documentElement.getAttribute("data-theme");
    const escuro = atual ? atual === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const novo = escuro ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("diagnostico:tema", novo); } catch (e) {}
  });
}

// ---------------------------------------------------------------
// entrada
// ---------------------------------------------------------------

async function iniciar() {
  telaCarregando();
  try {
    await carregarCatalogo();
  } catch (e) {
    return telaErro(e.message);
  }
  const s = lerSessao();
  if (s?.respondenteId && s?.token) {
    estado.respondenteId = s.respondenteId;
    estado.token = s.token;
    estado.respostas = s.respostas || {};
    estado.outroTexto = s.outroTexto || "";
    // A fonte da verdade é o banco: a retomada reconcilia o que está gravado
    // com o que ficou em localStorage, e não o contrário.
    await recarregarRespostas();
    estado.indice = Math.min(s.indice ?? 0, estado.itens.length - 1);
    if (itensFaltantes(estado.itens, estado.respostas).length === 0) return telaGate();
    return telaQuestao();
  }
  telaAbertura();
}

if (typeof document !== "undefined" && document.getElementById("dg-app")) iniciar();
