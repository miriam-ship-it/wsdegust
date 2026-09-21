// =============================================================
// DIAGNÓSTICO BOOMIT · o relatório em HTML (7 páginas A4)
//
// Puro: entra a devolutiva montada, sai uma string. Sem Deno, sem fetch, sem
// relógio — o que permite testar o documento inteiro no Node e garante que a
// TELA e o PDF saiam da mesma estrutura, em vez de divergirem com o tempo.
//
// Marca: cores do guia BerrielBrands 2023, as mesmas de
// 3-produto/regras/design/boomit-design-tokens.json e do MARCAS.Boomit da
// gate-and-send. Não são amostradas de tela.
//
// 🔒 O documento NÃO exibe nota de maturidade enquanto `nota_publicavel` for
//    false. Não é o renderizador que decide isso: ele só obedece o motor.
// =============================================================

export const MARCA = {
  verde: "#545E54",
  verdeEscuro: "#3C453C",
  preto: "#1B1B1C",
  texto: "#1B1B1C",
  textoSuave: "#3F4340",
  muted: "#6E746A",
  linha: "#DAD4CB",
  creme: "#EDE9E4",
  bloco: "#F4F2EF",
  destaque: "#E5E0D8",
  // gold um passo abaixo do token puro: em corpo pequeno o #9A7B3C não cruza
  // 4.5:1 no papel branco
  acento: "#6F5525",
  atencao: "#9D9482",
  fonteHref: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
  fonteFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
};

export function esc(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const NOME_BLOCO_CURTO = {
  EST: "Estratégia e pessoas",
  LID: "Liderança",
  PRO: "Processos e dados",
  IA: "Decisão e implementação de IA",
  FUT: "Competências e futuro",
};

function css() {
  return `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ${MARCA.fonteFamily}; color: ${MARCA.texto}; font-size: 10.5pt;
         line-height: 1.55; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { page-break-after: always; }
  .pagina:last-child { page-break-after: auto; }
  h1 { font-size: 22pt; line-height: 1.15; font-weight: 600; margin: 0 0 6pt; letter-spacing: -0.01em; }
  h2 { font-size: 13pt; font-weight: 600; margin: 0 0 8pt; }
  h3 { font-size: 11pt; font-weight: 600; margin: 0 0 4pt; }
  p  { margin: 0 0 8pt; }
  .eyebrow { font-size: 7.5pt; letter-spacing: 0.10em; text-transform: uppercase;
             color: ${MARCA.muted}; font-weight: 500; margin: 0 0 10pt; }
  .regua { height: 3pt; background: ${MARCA.verde}; width: 44pt; margin: 0 0 14pt; }
  .capa { border-bottom: 1px solid ${MARCA.linha}; padding-bottom: 14pt; margin-bottom: 16pt; }
  .capa .meta { font-size: 9pt; color: ${MARCA.muted}; margin: 0; }
  .capa .meta b { color: ${MARCA.textoSuave}; font-weight: 500; }
  .bloco { background: ${MARCA.bloco}; border: 1px solid ${MARCA.linha};
           border-radius: 8pt; padding: 11pt 13pt; margin: 0 0 11pt; page-break-inside: avoid; }
  .bloco--quieto { background: #FFF; }
  .aviso { background: ${MARCA.destaque}; border-left: 3pt solid ${MARCA.acento};
           border-radius: 3pt; padding: 9pt 12pt; margin: 0 0 12pt; font-size: 9pt;
           color: ${MARCA.textoSuave}; page-break-inside: avoid; }
  .rodape { position: fixed; bottom: -10mm; left: 0; right: 0; font-size: 7.5pt;
            color: ${MARCA.muted}; border-top: 1px solid ${MARCA.linha}; padding-top: 4pt; }
  .perfil { display: table; width: 100%; border-collapse: collapse; margin: 0 0 12pt; }
  .perfil .l { display: table-row; }
  .perfil .l > div { display: table-cell; padding: 5pt 0; border-bottom: 1px solid ${MARCA.linha};
                     font-size: 9pt; vertical-align: top; }
  .perfil .l > div:first-child { color: ${MARCA.muted}; width: 34%; padding-right: 10pt; }
  .barra { display: table; width: 100%; border-collapse: separate; border-spacing: 2pt 0;
           margin: 5pt 0 3pt; table-layout: fixed; }
  .barra > span { display: table-cell; height: 9pt; border-radius: 2pt; }
  .legenda { font-size: 7.5pt; color: ${MARCA.muted}; margin: 0; }
  .chip { display: inline-block; font-size: 7.5pt; font-weight: 500; padding: 2pt 7pt;
          border-radius: 20pt; border: 1px solid ${MARCA.linha}; color: ${MARCA.textoSuave};
          background: #FFF; margin-right: 4pt; }
  .passo { margin: 0 0 7pt; padding-left: 10pt; border-left: 2pt solid ${MARCA.linha}; }
  .passo .rot { font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase;
                color: ${MARCA.muted}; font-weight: 500; display: block; margin-bottom: 1pt; }
  .passo .txt { font-size: 9.5pt; color: ${MARCA.textoSuave}; }
  .passo--evid { border-left-color: ${MARCA.verde}; }
  .citacao { font-style: normal; color: ${MARCA.texto}; }
  .janela { border: 1px solid ${MARCA.linha}; border-radius: 8pt; padding: 10pt 12pt;
            margin: 0 0 9pt; page-break-inside: avoid; }
  .janela .cab { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase;
                 color: ${MARCA.verde}; font-weight: 600; margin: 0 0 5pt; }
  ul { margin: 4pt 0 0; padding-left: 14pt; }
  li { margin: 0 0 4pt; font-size: 9.5pt; color: ${MARCA.textoSuave}; }
  .duas { display: table; width: 100%; table-layout: fixed; border-spacing: 8pt 0; margin: 0 0 10pt; }
  .duas > div { display: table-cell; vertical-align: top; }
  .nota-rodape { font-size: 8.5pt; color: ${MARCA.muted}; font-style: normal; }
  `;
}

/** Barra de distribuição E1–E4: descreve as respostas, não uma nota. */
function barraDistribuicao(d, considerados) {
  if (!considerados) return `<p class="legenda">Sem itens com posição declarada neste bloco.</p>`;
  const tons = { E1: MARCA.destaque, E2: MARCA.atencao, E3: MARCA.verde, E4: MARCA.preto };
  const celulas = ["E1", "E2", "E3", "E4"]
    .filter((k) => d[k] > 0)
    .map((k) => `<span style="background:${tons[k]};width:${(d[k] / considerados) * 100}%"></span>`)
    .join("");
  const leg = ["E1", "E2", "E3", "E4"].filter((k) => d[k] > 0).map((k) => `${k}: ${d[k]}`).join(" · ");
  return `<div class="barra">${celulas}</div><p class="legenda">${esc(leg)} — ${considerados} ${considerados === 1 ? "item respondido" : "itens respondidos"} com posição</p>`;
}

function secaoBloco(b) {
  return `
    <div class="bloco">
      <h3>${esc(b.titulo)}</h3>
      <p class="legenda" style="margin-bottom:6pt">${esc(b.foco)}</p>
      ${barraDistribuicao(b.distribuicao, b.considerados)}
      ${b.na ? `<p class="legenda">${b.na} ${b.na === 1 ? "item ficou" : "itens ficaram"} sem exposição suficiente e ${b.na === 1 ? "está" : "estão"} fora do cálculo.</p>` : ""}
      <p style="margin-top:8pt">${esc(b.leitura)}</p>
    </div>`;
}

function prioridadeHtml(p, i) {
  return `
  <div class="janela">
    <p class="cab">Prioridade ${i + 1} · ${esc(p.bloco_nome)}${p.lente ? ` · lente ${esc(p.lente)}` : ""}</p>
    <div class="passo passo--evid">
      <span class="rot">Evidência relatada</span>
      <span class="txt">Em resposta a “${esc(p.evidencia.pergunta)}”, a alternativa marcada foi:
      <span class="citacao">“${esc(p.evidencia.resposta_literal)}”</span></span>
    </div>
    <div class="passo"><span class="rot">Hipótese diagnóstica</span><span class="txt">${esc(p.hipotese)}</span></div>
    <div class="passo"><span class="rot">Consequência possível</span><span class="txt">${esc(p.consequencia)}</span></div>
    <div class="passo"><span class="rot">Verificação necessária</span><span class="txt">${esc(p.verificacao)}</span></div>
  </div>`;
}

function cenarioHtml(c) {
  return `
  <div class="janela">
    <p class="cab">Cenário de solução · ${esc(c.especialidade.nome)}</p>
    <p style="font-size:9.5pt;margin-bottom:6pt">${esc(c.cenario_de_transformacao)}</p>
    <h3 style="font-size:9pt">Sinais observados que sustentam este cenário</h3>
    <ul>${c.sinais.map((s) => `<li>${esc(s.bloco_nome)} — “${esc(s.resposta_literal)}”</li>`).join("")}</ul>
    <h3 style="font-size:9pt;margin-top:8pt">Evidência que confirma ou refuta</h3>
    <ul>${c.evidencia_que_decide.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
    <p style="font-size:9pt;margin-top:8pt;color:${MARCA.muted}">${esc(c.proximo_passo)}</p>
  </div>`;
}

/** O documento completo. `d` é o retorno de `montarDevolutiva`. */
export function renderRelatorio(d) {
  const p = Object.fromEntries(d.paginas.map((x) => [x.n, x]));
  const capa = p[1].capa;
  const linhaPerfil = (c) => `<div class="l"><div>${esc(c.rotulo)}</div><div>${esc(c.texto)}</div></div>`;

  const avisoNota = d.nota_publicavel
    ? ""
    : `<div class="aviso"><b>Sobre a escala.</b> ${esc(d.aviso_pontuacao)}</div>`;

  const pagina1 = `
  <section class="pagina">
    <div class="capa">
      <p class="eyebrow">${esc(capa.evento || "Diagnóstico Boomit")}</p>
      <h1>Leitura de gestão de pessoas e IA</h1>
      <div class="regua"></div>
      <p class="meta">
        ${capa.respondente ? `<b>${esc(capa.respondente)}</b>` : ""}${capa.empresa ? ` · ${esc(capa.empresa)}` : ""}
        ${capa.data ? `<br>${esc(capa.data)}` : ""}
      </p>
    </div>
    ${avisoNota}
    <h2>Resumo Executivo</h2>
    ${p[1].resumo.map((l) => `<p>${esc(l)}</p>`).join("")}
    <h2 style="margin-top:14pt">Contexto Declarado</h2>
    <div class="perfil">${(p[1].contexto || []).map(linhaPerfil).join("")}</div>
    <p class="legenda">Os itens de contexto descrevem de onde parte a leitura. Eles não pontuam.</p>
    <div class="aviso" style="margin-top:12pt">
      <b>Como ler este documento.</b> ${esc(p[1].aviso_de_interpretacao)}
    </div>
  </section>`;

  const pagina2 = `
  <section class="pagina">
    <p class="eyebrow">Página 2</p>
    <h1 style="font-size:17pt">Resultado Geral</h1>
    <div class="regua"></div>
    ${
      p[2].sem_nota
        ? `<div class="aviso"><b>Nota de maturidade não publicada.</b> ${esc(d.aviso_pontuacao)} O que vem abaixo descreve a distribuição das próprias respostas por bloco — não uma nota derivada delas.</div>`
        : `<div class="bloco"><h3>Índice geral</h3><p style="font-size:24pt;font-weight:600;margin:0">${esc(String(p[2].nota_geral))}<span style="font-size:11pt;color:${MARCA.muted}"> /100</span></p></div>`
    }
    ${p[2].blocos
      .map(
        (b) => `
      <div class="bloco bloco--quieto">
        <h3 style="font-size:10pt">${esc(NOME_BLOCO_CURTO[b.id] || b.titulo)}</h3>
        ${barraDistribuicao(b.distribuicao, b.considerados)}
        ${b.na ? `<p class="legenda">${b.na} sem exposição suficiente — fora do cálculo.</p>` : ""}
      </div>`
      )
      .join("")}
    <p class="legenda" style="margin-top:10pt">Escala de prática: <b>E1</b> não estabelecida · <b>E2</b> informal ou parcial · <b>E3</b> definida e repetível · <b>E4</b> gerenciada e revisada por evidência. A alternativa “não tenho exposição suficiente” fica fora do numerador e do denominador e não representa baixa maturidade.</p>
  </section>`;

  const pagina3 = `
  <section class="pagina">
    <p class="eyebrow">Página 3</p>
    <h1 style="font-size:17pt">Estratégia, Pessoas e Liderança</h1>
    <div class="regua"></div>
    ${p[3].blocos.map(secaoBloco).join("")}
    <div class="bloco">
      <h3>${esc(p[3].lideranca.titulo)}</h3>
      <div class="duas">
        <div>
          <p class="legenda"><b>Lente Pessoa</b> — atuação individual</p>
          ${barraDistribuicao(p[3].lideranca.pessoa.distribuicao, p[3].lideranca.pessoa.considerados)}
        </div>
        <div>
          <p class="legenda"><b>Lente Organização</b> — sustentação organizacional</p>
          ${barraDistribuicao(p[3].lideranca.organizacao.distribuicao, p[3].lideranca.organizacao.considerados)}
        </div>
      </div>
      <p>${esc(p[3].lideranca.leitura)}</p>
      <p class="nota-rodape">${esc(p[3].lideranca.nota)}</p>
    </div>
  </section>`;

  const pagina4 = `
  <section class="pagina">
    <p class="eyebrow">Página 4</p>
    <h1 style="font-size:17pt">Processos, Dados e IA</h1>
    <div class="regua"></div>
    ${p[4].blocos.map(secaoBloco).join("")}
    <p class="nota-rodape">A decisão de aplicar IA e a implementação depois da decisão permanecem itens separados. Decidir conscientemente não aplicar IA, com análise de processos, riscos e benefícios, justificativa registrada e condição de revisão, é posição distinta da inação — e não é lida como baixa maturidade decisória.</p>
  </section>`;

  const pagina5 = `
  <section class="pagina">
    <p class="eyebrow">Página 5</p>
    <h1 style="font-size:17pt">Competências, Capacidade e Futuro do Trabalho</h1>
    <div class="regua"></div>
    ${p[5].blocos.map(secaoBloco).join("")}
  </section>`;

  const gov = p[6].governanca;
  const pagina6 = `
  <section class="pagina">
    <p class="eyebrow">Página 6</p>
    <h1 style="font-size:17pt">Governança e Cenários de Solução</h1>
    <div class="regua"></div>
    <div class="bloco">
      <h3>Condição de Governança</h3>
      <p><span class="chip">${esc(gov.rotulo)}</span>${gov.item_determinante ? `<span class="chip">definida por ${esc(gov.item_determinante)}</span>` : ""}</p>
      <p>${esc(gov.leitura)}</p>
      <p class="nota-rodape">${esc(gov.nota)}</p>
    </div>
    ${p[6].prioridades.length ? `<h2 style="margin-top:14pt">Prioridades do Ciclo</h2>` : ""}
    ${p[6].prioridades.map(prioridadeHtml).join("")}
    ${p[6].cenarios.length ? `<h2 style="margin-top:14pt">Cenários de Solução Boomit</h2>
      <p class="legenda" style="margin-bottom:8pt">Cada cenário abaixo parte de um sinal efetivamente registrado nas respostas. Eles descrevem o que precisaria ser construído, e não uma recomendação de compra.</p>` : ""}
    ${p[6].cenarios.map(cenarioHtml).join("")}
  </section>`;

  const pl = p[7];
  const pagina7 = `
  <section class="pagina">
    <p class="eyebrow">Página 7</p>
    <h1 style="font-size:17pt">${esc(pl.titulo)}</h1>
    <div class="regua"></div>
    ${pl.vazio ? `<p>${esc(pl.leitura)}</p>` : ""}
    ${pl.etapas
      .map(
        (e) => `
      <div class="janela">
        <p class="cab">${esc(e.janela)} · ${esc(e.foco)}</p>
        <ul>${e.acoes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      </div>`
      )
      .join("")}
    <div class="aviso" style="margin-top:14pt">
      <b>Conversa, workshop ou piloto.</b> Uma leitura conjunta destes sinais com quem convive com o processo costuma separar, em uma sessão, o que é percepção individual do que é padrão organizacional. É o passo que a Boomit propõe antes de qualquer desenho de solução.
    </div>
    <p class="nota-rodape" style="margin-top:12pt">Documento confidencial · ${esc(capa.evento || "Diagnóstico Boomit")} · Questionário ${esc(d.versao_questionario)}${capa.data ? ` · ${esc(capa.data)}` : ""}</p>
  </section>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${esc(capa.evento || "Diagnóstico Boomit")}</title>
<link href="${MARCA.fonteHref}" rel="stylesheet"><style>${css()}</style></head>
<body>${pagina1}${pagina2}${pagina3}${pagina4}${pagina5}${pagina6}${pagina7}</body></html>`;
}

/**
 * O corpo do e-mail. Tabela com estilo inline de propósito: o Outlook
 * renderiza com o motor do Word e ignora flex e grid, e caixa corporativa é
 * exatamente o público deste relatório.
 */
export function renderEmail(d, contexto = {}) {
  const p6 = d.paginas.find((x) => x.n === 6);
  const nome = contexto.nome ? esc(contexto.nome.split(" ")[0]) : "";
  const prioridades = p6.prioridades
    .map(
      (x) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${MARCA.linha};font:400 14px ${MARCA.fonteFamily};color:${MARCA.textoSuave}">
        <b style="font-weight:500;color:${MARCA.texto}">${esc(x.bloco_nome)}</b><br>${esc(x.hipotese)}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${MARCA.creme}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${MARCA.creme};padding:24px 12px">
 <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden">
    <tr><td style="background:${MARCA.verde};padding:20px 28px">
      <div style="font:600 16px ${MARCA.fonteFamily};color:#FFFFFF;letter-spacing:0.04em">${esc(contexto.evento_nome || "Diagnóstico Boomit")}</div>
    </td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 14px;font:400 15px/1.6 ${MARCA.fonteFamily};color:${MARCA.texto}">
        ${nome ? `Olá, ${nome}. ` : ""}A devolutiva do diagnóstico está em anexo, em PDF, com sete páginas.
      </p>
      ${
        d.nota_publicavel
          ? ""
          : `<p style="margin:0 0 16px;padding:12px 14px;background:${MARCA.destaque};border-left:3px solid ${MARCA.acento};font:400 13px/1.55 ${MARCA.fonteFamily};color:${MARCA.textoSuave}">
              ${esc(d.aviso_pontuacao)}</p>`
      }
      ${
        prioridades
          ? `<p style="margin:0 0 8px;font:500 13px ${MARCA.fonteFamily};color:${MARCA.muted};letter-spacing:0.06em;text-transform:uppercase">Pontos de atenção do ciclo</p>
             <table width="100%" cellpadding="0" cellspacing="0">${prioridades}</table>`
          : `<p style="margin:0 0 14px;font:400 14px/1.6 ${MARCA.fonteFamily};color:${MARCA.textoSuave}">Nenhum item foi respondido nos dois degraus iniciais da progressão. O relatório descreve as práticas relatadas e as condições de governança.</p>`
      }
      <p style="margin:18px 0 0;font:400 14px/1.6 ${MARCA.fonteFamily};color:${MARCA.textoSuave}">
        O relatório traz, para cada ponto, a resposta que o sustenta, a hipótese correspondente e a verificação que a confirma ou refuta. As hipóteses existem para serem testadas com evidência.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid ${MARCA.linha};font:400 12px ${MARCA.fonteFamily};color:${MARCA.muted}">
      Boomit · ${esc(contexto.evento_nome || "Diagnóstico Boomit")}
    </td></tr>
  </table>
 </td></tr>
</table></body></html>`;
}
