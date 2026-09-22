// =============================================================
// DIAGNÓSTICO BOOMIT · o relatório em HTML (7 páginas A4) e o e-mail
//
// Puro: entra a devolutiva montada, sai uma string. Sem Deno, sem fetch, sem
// relógio — o que permite testar o documento inteiro no Node e garante que a
// TELA e o PDF saiam da mesma estrutura, em vez de divergirem com o tempo.
//
// Marca: cores do guia BerrielBrands 2023, as mesmas do tokens.css do produto.
// Não são amostradas de tela.
//
// 🔒 O documento nunca imprime código de item nem código de estágio. O que ele
//    imprime é a pergunta, a alternativa literal marcada e o estágio em
//    português. Provado em `relatorio-html.test.mjs`.
// =============================================================

export const MARCA = {
  verde: "#545E54",
  preto: "#1B1B1C",
  texto: "#1B1B1C",
  textoSuave: "#3F4340",
  muted: "#6E746A",
  linha: "#DAD4CB",
  creme: "#EDE9E4",
  bloco: "#F7F5F2",
  destaque: "#E5E0D8",
  trilha: "#E2DED7",
  // gold um passo abaixo do token puro: em corpo pequeno o #9A7B3C não cruza
  // 4.5:1 no papel branco
  acento: "#6F5525",
  gateBg: "#F2E9D7",
  gateFg: "#494133",
  gateLinha: "#D5CCBA",
  // a escada dos cinco níveis: preto → verde, monotônica
  niveis: ["#1B1B1C", "#283028", "#3C453C", "#545E54", "#737E73"],
  // os quatro estágios de prática: um matiz, claro → escuro
  estagios: ["#C6D0C6", "#8E988E", "#545E54", "#283028"],
  fonteHref: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
  fonteFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
};

export function esc(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const CIRCUNFERENCIA = 2 * Math.PI * 76;

/** Indicador circular com furo. O número é dado; a prosa não o repete. */
function anel(valor, tamanho = 150) {
  if (valor == null) return "";
  const arco = Math.max(0, Math.min(100, valor)) / 100 * CIRCUNFERENCIA;
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 200 200" style="display:block">
    <circle cx="100" cy="100" r="76" fill="none" stroke="${MARCA.trilha}" stroke-width="17"></circle>
    <circle cx="100" cy="100" r="76" fill="none" stroke="${MARCA.verde}" stroke-width="17"
      stroke-linecap="round" stroke-dasharray="${arco.toFixed(1)} ${CIRCUNFERENCIA.toFixed(1)}"
      transform="rotate(-90 100 100)"></circle>
    <text x="100" y="104" text-anchor="middle" font-family="${MARCA.fonteFamily}"
      font-size="48" font-weight="600" fill="${MARCA.texto}">${esc(String(valor))}</text>
    <text x="100" y="130" text-anchor="middle" font-family="${MARCA.fonteFamily}"
      font-size="16" fill="${MARCA.muted}">de 100</text>
  </svg>`;
}

function css() {
  return `
  @page { size: A4; margin: 15mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: ${MARCA.fonteFamily}; color: ${MARCA.texto}; font-size: 10pt;
         line-height: 1.55; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { page-break-after: always; }
  .pagina:last-child { page-break-after: auto; }
  h1 { font-size: 21pt; line-height: 1.12; font-weight: 600; margin: 0 0 6pt; letter-spacing: -.01em; }
  h2 { font-size: 13pt; font-weight: 600; margin: 0 0 7pt; }
  h3 { font-size: 10.5pt; font-weight: 600; margin: 0 0 4pt; }
  h4 { font-size: 8.5pt; font-weight: 500; margin: 9pt 0 3pt; text-transform: uppercase;
       letter-spacing: .05em; color: ${MARCA.muted}; }
  p { margin: 0 0 7pt; }
  .eyebrow { font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase;
             color: ${MARCA.muted}; font-weight: 500; margin: 0 0 9pt; }
  .regua { height: 3pt; background: ${MARCA.verde}; width: 42pt; margin: 0 0 13pt; }
  .capa { border-bottom: 1px solid ${MARCA.linha}; padding-bottom: 13pt; margin-bottom: 15pt; }
  .capa .meta { font-size: 9pt; color: ${MARCA.muted}; margin: 0; }
  .capa .meta b { color: ${MARCA.textoSuave}; font-weight: 500; }
  .cartao { background: #FFF; border: 1px solid ${MARCA.linha}; border-radius: 4pt;
            padding: 12pt 14pt; margin: 0 0 10pt; page-break-inside: avoid; }
  .cartao--quieto { background: ${MARCA.bloco}; }
  .indicador { display: table; width: 100%; }
  .indicador > div { display: table-cell; vertical-align: middle; }
  .indicador .ic { width: 160pt; padding-right: 16pt; }
  .duplo { display: table; width: 100%; border-spacing: 8pt 0; margin: 0 0 10pt; }
  .duplo > div { display: table-cell; width: 50%; vertical-align: top;
                 background: #FFF; border: 1px solid ${MARCA.linha}; border-radius: 4pt; padding: 10pt 12pt; }
  .num { font-size: 20pt; font-weight: 600; line-height: 1; }
  .num span { font-size: 9pt; font-weight: 400; color: ${MARCA.muted}; }
  .aviso { background: ${MARCA.destaque}; border-left: 3pt solid ${MARCA.acento};
           border-radius: 2pt; padding: 8pt 11pt; margin: 0 0 10pt; font-size: 8.5pt;
           color: ${MARCA.textoSuave}; page-break-inside: avoid; }
  .perfil { display: table; width: 100%; margin: 0 0 10pt; }
  .perfil .l { display: table-row; }
  .perfil .l > div { display: table-cell; padding: 4pt 0; border-bottom: 1px solid ${MARCA.linha};
                     font-size: 9pt; vertical-align: top; }
  .perfil .l > div:first-child { color: ${MARCA.muted}; width: 36%; padding-right: 10pt; }
  .escada { display: table; width: 100%; border-spacing: 5pt 0; table-layout: fixed; margin: 0 0 10pt; }
  .escada > div { display: table-cell; vertical-align: bottom; padding: 6pt; border-radius: 4pt;
                  border: 1pt solid transparent; }
  .escada .atual { border-color: ${MARCA.verde}; background: #FFF; }
  .escada .aqui { font-size: 6.5pt; letter-spacing: .07em; text-transform: uppercase;
                  font-weight: 600; color: #FFF; background: ${MARCA.verde};
                  padding: 2pt 4pt; border-radius: 2pt; display: inline-block; margin-bottom: 4pt; }
  .escada .nv { font-size: 7pt; color: ${MARCA.muted}; }
  .escada .nm { font-size: 8.5pt; font-weight: 600; line-height: 1.2; }
  .escada .sd { font-size: 7pt; color: ${MARCA.muted}; margin-bottom: 5pt; }
  .escada .bl { border-radius: 2pt 2pt 0 0; }
  .barra { display: table; width: 100%; border-collapse: separate; border-spacing: 2pt 0;
           margin: 5pt 0 3pt; table-layout: fixed; }
  .barra > span { display: table-cell; height: 9pt; border-radius: 2pt; }
  .legenda { font-size: 7.5pt; color: ${MARCA.muted}; margin: 0; }
  .dim { border-top: 1px solid ${MARCA.linha}; padding: 9pt 0; page-break-inside: avoid; }
  .dim:first-of-type { border-top: 0; }
  .dim .cab { display: table; width: 100%; }
  .dim .cab h3 { display: table-cell; }
  .dim .cab .n { display: table-cell; text-align: right; white-space: nowrap;
                 font-size: 9pt; color: ${MARCA.textoSuave}; }
  .dim .cab .n b { font-size: 12pt; font-weight: 600; color: ${MARCA.texto}; }
  .gate { background: ${MARCA.gateBg}; border: 1px solid ${MARCA.gateLinha}; color: ${MARCA.gateFg};
          border-radius: 4pt; padding: 11pt 13pt; margin: 0 0 10pt; page-break-inside: avoid; }
  .chip { display: inline-block; font-size: 7.5pt; font-weight: 500; padding: 2pt 7pt;
          border-radius: 20pt; border: 1px solid currentColor; }
  .passo { margin: 0 0 6pt; padding-left: 9pt; border-left: 2pt solid ${MARCA.linha}; }
  .passo .rot { font-size: 7pt; letter-spacing: .09em; text-transform: uppercase;
                color: ${MARCA.muted}; font-weight: 500; display: block; margin-bottom: 1pt; }
  .passo .txt { font-size: 9pt; color: ${MARCA.textoSuave}; }
  .passo--evid { border-left-color: ${MARCA.verde}; }
  .cab-cenario { font-size: 7.5pt; letter-spacing: .09em; text-transform: uppercase;
                 color: ${MARCA.verde}; font-weight: 600; margin: 0 0 4pt; }
  ul { margin: 3pt 0 0; padding-left: 13pt; }
  li { margin: 0 0 3pt; font-size: 9pt; color: ${MARCA.textoSuave}; }
  .rodape { font-size: 8pt; color: ${MARCA.muted}; }
  `;
}

/** Barra dos quatro estágios. Sem percentual: o rótulo nomeia o estágio. */
function barraEstagios(d, considerados, escala) {
  if (!considerados) return `<p class="legenda">Sem prática com posição declarada nesta dimensão.</p>`;
  const chaves = ["E1", "E2", "E3", "E4"];
  const celulas = chaves
    .map((k, i) => (d[k] > 0 ? `<span style="background:${MARCA.estagios[i]};width:${(d[k] / considerados) * 100}%"></span>` : ""))
    .join("");
  const nomes = chaves.filter((k) => d[k] > 0).map((k, i) => escala[chaves.indexOf(k)].nome);
  return `<div class="barra">${celulas}</div><p class="legenda">${esc(nomes.join(" · "))}</p>`;
}

function dimensao(b, escala) {
  return `<div class="dim">
    <div class="cab"><h3>${esc(b.titulo)}</h3>${b.pontos != null ? `<span class="n"><b>${esc(String(b.pontos))}</b> /100</span>` : ""}</div>
    <p class="legenda" style="margin-bottom:4pt">${esc(b.foco)}</p>
    ${barraEstagios(b.distribuicao, b.considerados, escala)}
    ${b.na ? `<p class="legenda">Parte das práticas ficou sem exposição suficiente e está fora do cálculo.</p>` : ""}
    <p style="margin-top:6pt">${esc(b.leitura)}</p>
  </div>`;
}

function prioridadeHtml(p, i) {
  return `<div class="cartao">
    <p class="cab-cenario">Ponto de atenção ${i + 1} · ${esc(p.bloco_nome)}${p.lente ? ` · lente ${esc(p.lente)}` : ""}</p>
    <div class="passo passo--evid"><span class="rot">O que foi relatado</span>
      <span class="txt">Em resposta a “${esc(p.evidencia.pergunta)}”, a alternativa marcada foi:
      “${esc(p.evidencia.resposta_literal)}”.</span></div>
    <div class="passo"><span class="rot">O que isso pode indicar</span><span class="txt">${esc(p.hipotese)}</span></div>
    <div class="passo"><span class="rot">O que isso abre</span><span class="txt">${esc(p.consequencia)}</span></div>
    <div class="passo"><span class="rot">Como verificar</span><span class="txt">${esc(p.verificacao)}</span></div>
  </div>`;
}

function cenarioHtml(c) {
  return `<div class="cartao cartao--quieto">
    <p class="cab-cenario">Cenário de trabalho · ${esc(c.especialidade.nome)}</p>
    <p style="font-size:9pt">${esc(c.cenario_de_transformacao)}</p>
    <h4>Sinais que sustentam este cenário</h4>
    <ul>${c.sinais.map((s) => `<li>${esc(s.bloco_nome)} — “${esc(s.resposta_literal)}”</li>`).join("")}</ul>
    <h4>Evidência que confirma ou refuta</h4>
    <ul>${c.evidencia_que_decide.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
    <p class="legenda" style="margin-top:7pt">${esc(c.proximo_passo)}</p>
  </div>`;
}

function escadaHtml(niveis, atual) {
  const alturas = [26, 39, 52, 65, 78];
  return `<div class="escada">${niveis
    .map(
      (n, i) => `<div class="${n.n === atual ? "atual" : ""}">
      ${n.n === atual ? `<span class="aqui">A organização está aqui</span>` : ""}
      <p class="nv">Nível ${n.n}</p>
      <p class="nm">${esc(n.nome)}</p>
      <p class="sd">${esc(n.saida)}</p>
      <div class="bl" style="background:${MARCA.niveis[i]};height:${alturas[i]}pt"></div>
    </div>`
    )
    .join("")}</div>`;
}

/** O documento completo. `d` é o retorno de `montarDevolutiva`. */
export function renderRelatorio(d) {
  const p = Object.fromEntries(d.paginas.map((x) => [x.n, x]));
  const capa = p[1].capa;
  const escala = d.escala;

  const pagina1 = `<section class="pagina">
    <div class="capa">
      <p class="eyebrow">${esc(capa.evento || "Diagnóstico Boomit")}</p>
      <h1>O que as respostas indicam sobre a travessia desta organização</h1>
      <div class="regua"></div>
      <p class="meta">${capa.respondente ? `<b>${esc(capa.respondente)}</b>` : ""}${capa.empresa ? ` · ${esc(capa.empresa)}` : ""}${capa.data ? `<br>${esc(capa.data)}` : ""}</p>
    </div>
    <h2>Resumo Executivo</h2>
    ${p[1].resumo.map((l) => `<p>${esc(l)}</p>`).join("")}
    <h2 style="margin-top:12pt">Contexto Declarado</h2>
    <div class="perfil">${(p[1].contexto || []).map((c) => `<div class="l"><div>${esc(c.rotulo)}</div><div>${esc(c.texto)}</div></div>`).join("")}</div>
    <p class="legenda">Os itens de contexto descrevem de onde parte a leitura. Eles não pontuam.</p>
    <div class="aviso" style="margin-top:11pt"><b>Como ler este documento.</b> ${esc(p[1].aviso_de_interpretacao)}</div>
  </section>`;

  const pg2 = p[2];
  const pagina2 = `<section class="pagina">
    <p class="eyebrow">Página 2</p>
    <h1 style="font-size:17pt">Índice de Maturidade da Empresa</h1>
    <div class="regua"></div>
    <p>${esc(pg2.nota)}</p>
    <div class="cartao" style="margin-top:10pt">
      <div class="indicador">
        <div class="ic">${anel(pg2.indice)}</div>
        <div>
          <h2>${esc(pg2.leitura.titulo)}</h2>
          ${pg2.leitura.paragrafos.map((x) => `<p>${esc(x)}</p>`).join("")}
        </div>
      </div>
    </div>
    <div class="duplo">${pg2.derivados
      .map((x) => `<div><p class="num">${x.pontos != null ? esc(String(x.pontos)) : "—"}<span> /100</span></p>
        <h3 style="margin-top:4pt">${esc(x.nome)}</h3><p class="legenda">${esc(x.desc)}</p></div>`)
      .join("")}</div>
    ${pg2.nota_na ? `<p class="legenda">${esc(pg2.nota_na)}</p>` : ""}
  </section>`;

  const pg3 = p[3];
  const pagina3 = `<section class="pagina">
    <p class="eyebrow">Página 3</p>
    <h1 style="font-size:17pt">Diagnóstico de IA</h1>
    <div class="regua"></div>
    ${escadaHtml(pg3.niveis, pg3.nivel_atual)}
    <div class="cartao">
      ${pg3.leitura.nivel ? `<p class="eyebrow" style="margin-bottom:4pt">Nível ${pg3.leitura.nivel.n} de 5</p>` : ""}
      <h2>${esc(pg3.leitura.titulo)}</h2>
      ${pg3.leitura.paragrafos.map((x) => `<p>${esc(x)}</p>`).join("")}
    </div>
    <p>${esc(pg3.fecho)}</p>
  </section>`;

  const pg5 = p[5].lentes;
  const pagina4 = `<section class="pagina">
    <p class="eyebrow">Página 4</p>
    <h1 style="font-size:17pt">Retrato por Dimensão</h1>
    <div class="regua"></div>
    <p class="legenda" style="margin-bottom:8pt">Escala de prática: ${escala.map((e) => esc(e.nome)).join(" · ")}. A alternativa “não tenho exposição suficiente” fica fora do numerador e do denominador e não representa baixa maturidade.</p>
    ${p[4].blocos.map((b) => dimensao(b, escala)).join("")}
  </section>`;

  const pagina5 = `<section class="pagina">
    <p class="eyebrow">Página 5</p>
    <h1 style="font-size:17pt">${esc(pg5.titulo)}</h1>
    <div class="regua"></div>
    <div class="cartao">
      <div class="indicador">
        <div class="ic">${anel(pg5.distancia)}</div>
        <div>
          <p class="eyebrow" style="margin-bottom:4pt">Distância entre as duas leituras</p>
          ${pg5.paragrafos.slice(0, 2).map((x) => `<p>${esc(x)}</p>`).join("")}
        </div>
      </div>
    </div>
    ${pg5.paragrafos.slice(2).map((x) => `<p>${esc(x)}</p>`).join("")}
    <p class="legenda">${esc(pg5.nota)}</p>
    <h2 style="margin-top:13pt">${esc(p[6].titulo)}</h2>
    ${p[6].paragrafos.map((x) => `<p>${esc(x)}</p>`).join("")}
    <p class="legenda">${esc(p[6].nota)}</p>
  </section>`;

  const pg7 = p[7];
  const pagina6 = `<section class="pagina">
    <p class="eyebrow">Página 6</p>
    <h1 style="font-size:17pt">${esc(pg7.titulo)}</h1>
    <div class="regua"></div>
    ${pg7.paragrafos.map((x) => `<p>${esc(x)}</p>`).join("")}
    <div class="cartao">
      <h3>${esc(pg7.provocacao.titulo)}</h3>
      <p style="font-size:11pt;font-weight:500;margin-top:5pt">${esc(pg7.provocacao.pergunta)}</p>
      ${pg7.provocacao.notas.map((x) => `<p class="legenda" style="margin-top:6pt">${esc(x)}</p>`).join("")}
    </div>
    ${pg7.blocos.map((b) => dimensao(b, escala)).join("")}
  </section>`;

  const pg8 = p[8];
  const pagina7 = `<section class="pagina">
    <p class="eyebrow">Página 7</p>
    <h1 style="font-size:17pt">Governança e Cenários</h1>
    <div class="regua"></div>
    <div class="gate">
      <p><span class="chip">${esc(pg8.governanca.rotulo)}</span></p>
      <p style="margin-top:7pt">${esc(pg8.governanca.leitura)}</p>
      <p class="legenda" style="color:inherit">${esc(pg8.governanca.nota)}</p>
    </div>
    ${pg8.prioridades.map(prioridadeHtml).join("")}
    ${pg8.cenarios.length ? `<h2 style="margin-top:12pt">Cenários de Trabalho Possíveis</h2>
      <p class="legenda" style="margin-bottom:7pt">Cada cenário parte de um sinal efetivamente registrado nas respostas. Descrevem o que precisaria ser construído, e não uma recomendação de compra.</p>` : ""}
    ${pg8.cenarios.map(cenarioHtml).join("")}
  </section>`;

  const pl = p[9];
  const pagina8 = `<section class="pagina">
    <p class="eyebrow">Página 8</p>
    <h1 style="font-size:17pt">${esc(pl.titulo)}</h1>
    <div class="regua"></div>
    ${pl.vazio ? `<p>${esc(pl.leitura)}</p>` : `<p>${esc(pl.abertura)}</p>`}
    ${(pl.etapas || [])
      .map((e) => `<div class="cartao"><p class="cab-cenario">${esc(e.janela)} · ${esc(e.foco)}</p>
        <ul>${e.acoes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>`)
      .join("")}
    <div class="aviso" style="margin-top:12pt"><b>O próximo passo útil é uma conversa, não um projeto.</b>
      Uma leitura conjunta destes sinais com quem convive com o processo costuma separar, em uma sessão,
      o que é percepção individual do que é padrão organizacional. É o passo que a Boomit propõe antes de
      qualquer desenho de solução.</div>
    <p class="rodape" style="margin-top:11pt">Documento confidencial · ${esc(capa.evento || "Diagnóstico Boomit")} · Questionário ${esc(d.versao_questionario)}${capa.data ? ` · ${esc(capa.data)}` : ""}</p>
  </section>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${esc(capa.evento || "Diagnóstico Boomit")}</title>
<link href="${MARCA.fonteHref}" rel="stylesheet"><style>${css()}</style></head>
<body>${pagina1}${pagina2}${pagina3}${pagina4}${pagina5}${pagina6}${pagina7}${pagina8}</body></html>`;
}

/**
 * O corpo do e-mail. Tabela com estilo inline de propósito: o Outlook
 * renderiza com o motor do Word e ignora flex e grid, e caixa corporativa é
 * exatamente o público deste relatório.
 */
export function renderEmail(d, contexto = {}) {
  const p = Object.fromEntries(d.paginas.map((x) => [x.n, x]));
  const nome = contexto.nome ? esc(String(contexto.nome).split(" ")[0]) : "";
  const emp = p[2].indice;
  const nivel = p[3].leitura.nivel;
  const pri = p[8].prioridades
    .map(
      (x) => `<tr><td style="padding:7px 0;border-bottom:1px solid ${MARCA.linha};font:400 14px ${MARCA.fonteFamily};color:${MARCA.textoSuave}">
      <b style="font-weight:500;color:${MARCA.texto}">${esc(x.bloco_nome)}</b><br>${esc(x.hipotese)}</td></tr>`
    )
    .join("");

  const indicadores = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
    <tr>
      <td width="50%" style="padding:12px;background:${MARCA.bloco};border-radius:8px" valign="top">
        <div style="font:600 26px ${MARCA.fonteFamily};color:${MARCA.texto}">${emp != null ? esc(String(emp)) : "—"}<span style="font:400 12px ${MARCA.fonteFamily};color:${MARCA.muted}"> /100</span></div>
        <div style="font:500 12px ${MARCA.fonteFamily};color:${MARCA.textoSuave};margin-top:3px">Maturidade da empresa</div>
      </td>
      <td width="8"></td>
      <td width="50%" style="padding:12px;background:${MARCA.bloco};border-radius:8px" valign="top">
        <div style="font:600 16px ${MARCA.fonteFamily};color:${MARCA.texto}">${nivel ? "Nível " + nivel.n : "—"}</div>
        <div style="font:500 12px ${MARCA.fonteFamily};color:${MARCA.textoSuave};margin-top:3px">Diagnóstico de IA${nivel ? " · " + esc(nivel.nome) : ""}</div>
      </td>
    </tr>
  </table>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${MARCA.creme}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.creme};padding:24px 12px">
 <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden">
    <tr><td style="background:${MARCA.verde};padding:20px 28px">
      <div style="font:600 16px ${MARCA.fonteFamily};color:#FFFFFF;letter-spacing:.04em">${esc(contexto.evento_nome || "Diagnóstico Boomit")}</div>
    </td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 18px;font:400 15px/1.6 ${MARCA.fonteFamily};color:${MARCA.texto}">
        ${nome ? `Olá, ${nome}. ` : ""}A devolutiva do diagnóstico está em anexo, em PDF.
      </p>
      ${indicadores}
      ${pri
        ? `<p style="margin:0 0 8px;font:500 12px ${MARCA.fonteFamily};color:${MARCA.muted};letter-spacing:.06em;text-transform:uppercase">Pontos de atenção do ciclo</p>
           <table width="100%" cellpadding="0" cellspacing="0">${pri}</table>`
        : `<p style="margin:0 0 14px;font:400 14px/1.6 ${MARCA.fonteFamily};color:${MARCA.textoSuave}">Nenhuma prática foi descrita nos dois estágios iniciais. O relatório descreve o que foi relatado e as condições de governança.</p>`}
      <p style="margin:18px 0 0;font:400 14px/1.6 ${MARCA.fonteFamily};color:${MARCA.textoSuave}">
        O relatório traz, para cada ponto, a resposta que o sustenta, a hipótese correspondente e a
        verificação que a confirma ou refuta. As hipóteses existem para serem testadas com evidência.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid ${MARCA.linha};font:400 12px ${MARCA.fonteFamily};color:${MARCA.muted}">
      Boomit · ${esc(contexto.evento_nome || "Diagnóstico Boomit")}
    </td></tr>
  </table>
 </td></tr>
</table></body></html>`;
}
