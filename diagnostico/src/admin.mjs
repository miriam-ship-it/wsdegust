// =============================================================
// PAINEL do Diagnóstico Boomit — leitura e export do evento dedicado.
//
// 🔒 AUTENTICAÇÃO OBRIGATÓRIA. Sem sessão do Supabase Auth, a tela mostra o
//    login e mais nada. E isso não é a defesa: a defesa é a RLS. A anon key
//    desta página é a mesma que está no questionário público, e por ela o
//    banco não devolve respondente nenhum — `eventos_do_usuario()` filtra por
//    e-mail do JWT, e `v_diagnosticoboomit_export` roda com security_invoker
//    e já filtra por slug dentro da própria view.
//
// 🔒 O PAINEL NÃO ESCOLHE EVENTO. Ele lê a view do evento dedicado, e ponto.
//    Não há campo de slug, não há seletor: trocar de universo exigiria trocar
//    o arquivo, e a RLS ainda barraria quem não cuida daquele evento.
//
// 🔒 SÓ LEITURA. Esta tela não grava nada — nem slug, nem versão, nem
//    resposta. Corrigir configuração do evento é migration, não clique.
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CFG = window.APP_CONFIG;
const app = () => document.getElementById("ad-app");

let sb = null;
function cliente() {
  if (!sb) {
    sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storageKey: "diagnostico-admin" },
    });
  }
  return sb;
}

// A lógica pura vive em `logica.mjs` — testada no Node, onde o import por URL
// do cliente Supabase não resolveria. Ver `diagnostico/logica.test.mjs`.
import { escapeHtml, resumo, filtrar, dataPt, montarCsv, COLUNAS } from "./logica.mjs";

const ROTULO_GATE = { G1: "Exige tratamento", G2: "Condicionada", G3: "Controles reconhecíveis" };

// ---------------------------------------------------------------
// telas
// ---------------------------------------------------------------

function cabecalho(email) {
  return `<header class="sc-head">
    <div class="sc-brand">
      <img class="sc-logo" src="logo-boomit.png" alt="Boomit">
      <span class="sc-brand__divisor"></span>
      <span class="sc-brand__sub">Painel · Diagnóstico Boomit</span>
    </div>
    ${email ? `<div class="ad-usuario"><span>${escapeHtml(email)}</span>
      <button class="sc-btn sc-btn--ghost sc-btn--sm" id="ad-sair" type="button">Sair</button></div>` : ""}
  </header>`;
}

function telaLogin(erro = "") {
  app().innerHTML = `<div class="sc-shell ad-shell--estreita">${cabecalho()}
    <section class="sc-card">
      <h2 class="sc-title">Acesso ao painel</h2>
      <p class="sc-lead">Entre com o usuário do Supabase que cuida deste evento.</p>
      <div class="dg-form">
        <label class="sc-field"><span class="sc-label">E-mail</span>
          <input class="sc-input" id="ad-email" type="email" autocomplete="username"></label>
        <label class="sc-field"><span class="sc-label">Senha</span>
          <input class="sc-input" id="ad-senha" type="password" autocomplete="current-password"></label>
      </div>
      ${erro ? `<p class="ad-erro" role="alert">${escapeHtml(erro)}</p>` : ""}
      <div class="sc-actions"><button class="sc-btn sc-btn--primary sc-btn--block" id="ad-entrar" type="button">Entrar</button></div>
    </section></div>`;
  const entrar = async () => {
    const botao = document.getElementById("ad-entrar");
    botao.disabled = true;
    const { error } = await cliente().auth.signInWithPassword({
      email: document.getElementById("ad-email").value.trim(),
      password: document.getElementById("ad-senha").value,
    });
    if (error) return telaLogin("E-mail ou senha não conferem.");
    iniciar();
  };
  document.getElementById("ad-entrar").addEventListener("click", entrar);
  document.getElementById("ad-senha").addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });
}

function telaSemAcesso(email) {
  app().innerHTML = `<div class="sc-shell ad-shell--estreita">${cabecalho(email)}
    <section class="sc-card ad-bloqueio" role="alert">
      <h2 class="sc-title">Sem acesso a este evento</h2>
      <p class="sc-lead">Esta conta está autenticada, mas não está associada ao evento <b>${escapeHtml(CFG.EVENTO_SLUG)}</b>. O acesso é concedido no banco, em <code>public.admin_eventos</code>.</p>
      <p class="sc-help">Quem já opera outros eventos da Boomit não enxerga este automaticamente — e isso é intencional.</p>
    </section></div>`;
  ligarSair();
}

function cartao(rotulo, valor, contexto) {
  return `<div class="ad-kpi"><span class="ad-kpi__rot">${escapeHtml(rotulo)}</span>
    <strong class="ad-kpi__num">${escapeHtml(String(valor))}</strong>
    <span class="ad-kpi__ctx">${escapeHtml(contexto)}</span></div>`;
}

let LINHAS = [];

function telaPainel(email, evento) {
  const r = resumo(LINHAS);
  app().innerHTML = `<div class="sc-shell ad-shell">${cabecalho(email)}
    <div class="ad-cab">
      <div>
        <h1 class="sc-title">${escapeHtml(evento.nome)}</h1>
        <p class="sc-help">slug <code>${escapeHtml(evento.slug)}</code> · questionário <code>${escapeHtml(evento.questionario_versao)}</code> · catálogo <code>${escapeHtml(evento.catalogo_versao)}</code> · ${evento.ativo ? "ativo" : "<b>desativado</b>"}</p>
      </div>
      <button class="sc-btn sc-btn--ghost sc-btn--sm" id="ad-csv" type="button">Exportar CSV</button>
    </div>

    <div class="dg-aviso">
      <b>A nota de maturidade não é publicada.</b> A escala numérica E1–E4 deste instrumento ainda está em validação, então nem a devolutiva nem este painel apresentam nota — e não há classificação de temperatura de lead, que dependeria dela.
    </div>

    <div class="ad-kpis">
      ${cartao("Respondentes", r.respondentes, "iniciaram o diagnóstico")}
      ${cartao("Finalizados", r.finalizados, `de ${r.respondentes}`)}
      ${cartao("Com e-mail", r.com_email, `de ${r.respondentes}`)}
      ${cartao("Devolutivas enviadas", r.pdf_enviados, `de ${r.finalizados} finalizados`)}
      ${cartao("Aceitam contato", r.aceitaram_contato, `de ${r.com_email} com e-mail`)}
      ${cartao("Erros", r.erros, r.erros ? "verificar a coluna Erro" : "nenhum")}
    </div>

    <div class="ad-filtros">
      <input class="sc-input" id="ad-busca" type="search" placeholder="Buscar por nome, empresa, cargo ou e-mail">
      <select class="sc-input" id="ad-gate" aria-label="Filtrar por gate de governança">
        <option value="todos">Governança: todas</option>
        <option value="G1">G1 · exige tratamento</option>
        <option value="G2">G2 · condicionada</option>
        <option value="G3">G3 · controles reconhecíveis</option>
      </select>
      <button class="sc-btn sc-btn--ghost sc-btn--sm" id="ad-limpar" type="button">Limpar filtros</button>
    </div>

    <div id="ad-tabela"></div>
  </div>`;
  ligarSair();
  document.getElementById("ad-busca").addEventListener("input", desenharTabela);
  document.getElementById("ad-gate").addEventListener("change", desenharTabela);
  document.getElementById("ad-limpar").addEventListener("click", () => {
    document.getElementById("ad-busca").value = "";
    document.getElementById("ad-gate").value = "todos";
    desenharTabela();
  });
  document.getElementById("ad-csv").addEventListener("click", baixarCsv);
  desenharTabela();
}

function linhasVisiveis() {
  return filtrar(LINHAS, document.getElementById("ad-busca")?.value, document.getElementById("ad-gate")?.value);
}

function desenharTabela() {
  const linhas = linhasVisiveis();
  const alvo = document.getElementById("ad-tabela");
  if (!LINHAS.length) {
    alvo.innerHTML = `<div class="ad-vazio"><h3>Ainda não há respondentes</h3>
      <p>Quem abrir o link dedicado e concluir o diagnóstico aparece aqui.</p></div>`;
    return;
  }
  if (!linhas.length) {
    alvo.innerHTML = `<div class="ad-vazio"><h3>Nenhum respondente com esses filtros</h3>
      <p>Os ${LINHAS.length} registros do evento continuam gravados.</p></div>`;
    return;
  }
  alvo.innerHTML = `
    <div class="ad-tabela-rolagem">
      <table class="ad-tabela">
        <thead><tr>
          <th>Respondente</th><th>Papel declarado</th><th>Governança</th>
          <th class="num">Respondidos</th><th class="num">Sem exposição</th>
          <th>Finalizado</th><th>Devolutiva</th>
        </tr></thead>
        <tbody>${linhas.map((l) => `
          <tr>
            <td><b>${escapeHtml(l.nome || "—")}</b><span class="ad-sub">${escapeHtml(l.empresa || "")}${l.cargo ? " · " + escapeHtml(l.cargo) : ""}</span>
                <span class="ad-sub">${escapeHtml(l.email || "sem e-mail")}</span></td>
            <td>${escapeHtml(l.papel || "—")}</td>
            <td>${l.governanca_gate
              ? `<span class="ad-badge ad-badge--${escapeHtml(l.governanca_gate.toLowerCase())}">${escapeHtml(l.governanca_gate)} · ${escapeHtml(ROTULO_GATE[l.governanca_gate] || "")}</span>`
              : "—"}</td>
            <td class="num">${l.itens_respondidos ?? "—"}</td>
            <td class="num">${l.itens_sem_exposicao ?? "—"}</td>
            <td>${escapeHtml(dataPt(l.submetido_em))}</td>
            <td>${l.erro_geracao
              ? `<span class="ad-badge ad-badge--erro" title="${escapeHtml(l.erro_geracao)}">erro</span>`
              : l.pdf_enviado_em ? `enviada<span class="ad-sub">${escapeHtml(dataPt(l.pdf_enviado_em))}</span>` : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="ad-rodape">Mostrando ${linhas.length} de ${LINHAS.length} · apenas o evento <code>${escapeHtml(CFG.EVENTO_SLUG)}</code></p>`;
}

function baixarCsv() {
  const csv = montarCsv(linhasVisiveis(), COLUNAS);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${CFG.EVENTO_SLUG}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ligarSair() {
  document.getElementById("ad-sair")?.addEventListener("click", async () => {
    await cliente().auth.signOut();
    telaLogin();
  });
}

async function iniciar() {
  const { data: sessao } = await cliente().auth.getSession();
  if (!sessao?.session) return telaLogin();
  const email = sessao.session.user.email;

  // A RLS já decide: quem não cuida deste evento recebe zero linha aqui.
  const { data: eventos } = await cliente()
    .from("eventos")
    .select("id, slug, nome, cliente, catalogo_versao, questionario_versao, ativo")
    .eq("slug", CFG.EVENTO_SLUG);
  if (!eventos || !eventos.length) return telaSemAcesso(email);

  const { data, error } = await cliente().from(CFG.EXPORT_VIEW).select("*").order("iniciado_em", { ascending: false });
  if (error) return telaSemAcesso(email);
  LINHAS = data || [];
  telaPainel(email, eventos[0]);
}

if (typeof document !== "undefined" && document.getElementById("ad-app")) iniciar();
