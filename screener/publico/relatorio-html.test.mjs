// Catracas do DOCUMENTO. O PDF é o que chega à caixa de entrada de quem
// respondeu — o que ele afirma tem que ser exatamente o que o motor autorizou.

import test from "node:test";
import assert from "node:assert/strict";
import { definicao, itensAtivos } from "./definicao.mjs";
import { calcular, publicar } from "./motor.mjs";
import { montarDevolutiva } from "./devolutiva.mjs";
import { renderRelatorio, renderEmail } from "./relatorio-html.mjs";

const def = definicao();
const PONTUAVEIS = itensAtivos(def).filter((i) => i.pontua).map((i) => i.codigo);

function respondente(degrau, extra = {}) {
  const r = { CTX01: "P3", CTX02: "N3", CTX03: "N4", GOV01: "G2", GOV02: "G3", GOV03: "G3" };
  for (const c of PONTUAVEIS) r[c] = degrau;
  return { ...r, ...extra };
}
function doc(respostas, contexto = {}) {
  const d = montarDevolutiva(publicar(calcular(respostas)), respostas, contexto, def);
  return { d, html: renderRelatorio(d), email: renderEmail(d, contexto) };
}

const CONTEXTO = {
  evento_nome: "Diagnóstico Boomit",
  evento_cliente: "Boomit",
  nome: "Fulana de Tal",
  empresa: "Empresa Exemplo",
  data: "21 de setembro de 2026",
};

test("o documento tem sete páginas e quebra entre elas", () => {
  const { html } = doc(respondente("E2"), CONTEXTO);
  assert.equal(html.split('class="pagina"').length - 1, 7);
  assert.match(html, /page-break-after: always/);
  assert.match(html, /@page \{ size: A4/);
});

test("o PDF não exibe nota de maturidade enquanto E1–E4 não for confirmado", () => {
  const { d, html } = doc(respondente("E4"), CONTEXTO);
  assert.equal(d.nota_publicavel, false);
  assert.match(html, /Nota de maturidade não publicada/);
  assert.doesNotMatch(html, /Índice geral/);
  assert.doesNotMatch(html, /\/100/);
  assert.match(html, /em validação/);
});

test("o PDF traz o evento dedicado e nenhuma marca de outro evento", () => {
  const { html, email } = doc(respondente("E2"), CONTEXTO);
  for (const texto of [html, email]) {
    assert.match(texto, /Diagnóstico Boomit/);
    assert.doesNotMatch(texto, /IBMEC/i);
    assert.doesNotMatch(texto, /Krub/);          // fonte do IBMEC
    assert.doesNotMatch(texto, /#002555|#F5AC00/); // paleta do IBMEC
    assert.doesNotMatch(texto, /degustacao|degustação/i);
  }
});

test("a evidência citada no PDF é a alternativa literal marcada", () => {
  const respostas = respondente("E4", { PRO01: "E1" });
  const { html } = doc(respostas, CONTEXTO);
  const it = def.itens.find((i) => i.codigo === "PRO01");
  assert.ok(html.includes(it.opcoes[0].texto), "a resposta literal não aparece no documento");
  assert.ok(html.includes(it.pergunta), "o enunciado que originou a evidência não aparece");
  assert.match(html, /Evidência relatada/);
  assert.match(html, /Hipótese diagnóstica/);
  assert.match(html, /Consequência possível/);
  assert.match(html, /Verificação necessária/);
});

test("o objetivo analítico interno nunca chega ao documento", () => {
  const { html, email } = doc(respondente("E1"), CONTEXTO);
  for (const i of def.itens) {
    assert.ok(!html.includes(i.objetivo_interno), `${i.codigo}: objetivo interno vazou no PDF`);
    assert.ok(!email.includes(i.objetivo_interno), `${i.codigo}: objetivo interno vazou no e-mail`);
  }
  // nem a fonte/rastreabilidade metodológica, que é nota interna
  assert.doesNotMatch(html, /Critério C\d+/);
  assert.doesNotMatch(html, /Transcrição 00:/);
  assert.doesNotMatch(html, /parecer p\./);
});

test("as duas lentes de liderança aparecem separadas no documento", () => {
  const { html } = doc(respondente("E3", { LID01P: "E1", LID02P: "E1" }), CONTEXTO);
  assert.match(html, /Lente Pessoa/);
  assert.match(html, /Lente Organização/);
  assert.match(html, /atuação individual/);
  assert.match(html, /sustentação organizacional/);
});

test("governança aparece como condição, e o documento diz que não compõe a nota", () => {
  const { html } = doc(respondente("E4", { GOV01: "G1" }), CONTEXTO);
  assert.match(html, /Condição de Governança/);
  assert.match(html, /Exige tratamento antes de ampliar/);
  assert.match(html, /não é compensada/);
});

test("sem sinal, o documento não oferece cenário de solução", () => {
  const { html } = doc(respondente("E4"), CONTEXTO);
  assert.doesNotMatch(html, /Cenários de Solução Boomit/);
  assert.doesNotMatch(html, /Cenário de solução ·/);
});

test("com sinal, o cenário cita a especialidade real e a evidência que decide", () => {
  const { html } = doc(respondente("E4", { PRO01: "E1", IA02: "E1" }), CONTEXTO);
  assert.match(html, /Cenários de Solução Boomit/);
  assert.match(html, /Redesenho de processos|Estratégia de IA/);
  assert.match(html, /Evidência que confirma ou refuta/);
  assert.match(html, /não é uma recomendação de compra|não uma recomendação de compra/);
});

test("o documento não afirma causalidade nem trata percepção como fato", () => {
  const { html } = doc(respondente("E1"), CONTEXTO);
  assert.match(html, /percepção situada neste momento/);
  // linguagem condicional nas hipóteses
  assert.match(html, /pode indicar|cenário possível/);
  // nenhum veredito sobre a pessoa
  for (const proibido of ["líder fraco", "imaturo", "ineficiente", "despreparado", "incompetente"]) {
    assert.ok(!html.toLowerCase().includes(proibido), `documento rotula a pessoa: "${proibido}"`);
  }
});

test("a escala E1–E4 é explicada e o N/A é dito como fora do cálculo", () => {
  const { html } = doc(respondente("E2", { EST01: "NA", EST02: "NA" }), CONTEXTO);
  assert.match(html, /não estabelecida/);
  assert.match(html, /gerenciada e revisada por evidência/);
  assert.match(html, /fora do numerador e do denominador/);
  assert.match(html, /não representa baixa maturidade/);
  assert.match(html, /sem exposição suficiente/);
});

test("o e-mail se sustenta sozinho e carrega o aviso da escala", () => {
  const { email } = doc(respondente("E1"), CONTEXTO);
  assert.match(email, /Fulana/);
  assert.match(email, /sete páginas/);
  assert.match(email, /em validação/);
  assert.match(email, /Pontos de atenção do ciclo/);
  // tabela com estilo inline — Outlook ignora flex/grid
  assert.doesNotMatch(email, /display:\s*flex|display:\s*grid/);
});

test("todo texto do documento é escapado — nada de HTML vindo do respondente", () => {
  const { html } = doc(respondente("E2"), { ...CONTEXTO, nome: '<script>alert(1)</script>', empresa: 'A & B "C"' });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A &amp; B/);
});

// --- defeitos encontrados verificando a tela no navegador ---

test("a hipótese nunca contradiz a evidência que a sustenta", () => {
  // FUT06/E2 é o caso que pegou isto: a evidência dizia "o tema está em
  // discussão" e a hipótese afirmava "ainda não discutida".
  const respostas = respondente("E4", { FUT06: "E2" });
  const { html } = doc(respostas, CONTEXTO);
  assert.match(html, /O tema está em discussão, mas não há modelo/);
  assert.doesNotMatch(html, /pode indicar estrutura organizacional ainda não discutida/);
  assert.match(html, /seja porque a discussão ocorre sem modelo, critério ou caminho definido/);
  // e o mesmo texto tem que servir ao E1 do mesmo item
  const e1 = doc(respondente("E4", { FUT06: "E1" }), CONTEXTO).html;
  assert.match(e1, /O tema ainda não foi discutido de forma concreta/);
  assert.match(e1, /não foi discutido de forma concreta, seja porque/);
});

test("a concordância acompanha a contagem — '1 descreve', '2 descrevem'", () => {
  const um = doc(respondente("E3", { EST01: "E1", EST02: "NA", EST03: "NA", EST04: "NA" }), CONTEXTO).html;
  assert.match(um, /1 descreve práticas ainda não estabelecidas/);
  assert.doesNotMatch(um, /1 descrevem/);
  const varios = doc(respondente("E1"), CONTEXTO).html;
  assert.match(varios, /\d+ descrevem práticas ainda não estabelecidas/);
});

test("o rótulo do gate entra como aposto, não depois de 'é'", () => {
  for (const g of ["G1", "G2", "G3"]) {
    const { html } = doc(respondente("E3", { GOV01: g, GOV02: "G3", GOV03: "G3" }), CONTEXTO);
    assert.doesNotMatch(html, /leitura de governança é [A-Z]/, `gate ${g}`);
    assert.doesNotMatch(html, /é exige|é condicionada|é controles/i, `gate ${g}`);
    assert.match(html, /A condição de governança deste ciclo — .+ — condiciona/, `gate ${g}`);
  }
});
