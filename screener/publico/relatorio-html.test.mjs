// Catracas do DOCUMENTO. O PDF é o que chega à caixa de entrada de quem
// respondeu — o que ele afirma tem que ser exatamente o que o motor autorizou,
// e do jeito que foi aprovado.

import test from "node:test";
import assert from "node:assert/strict";
import { definicao, itensAtivos } from "./definicao.mjs";
import { calcular, publicar } from "./motor.mjs";
import { montarDevolutiva } from "./devolutiva.mjs";
import { renderRelatorio, renderEmail, MARCA } from "./relatorio-html.mjs";

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

/** Só o texto que a pessoa lê: sem CSS, sem atributo, sem tag. */
function textoVisivel(html) {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

test("o documento tem oito páginas e quebra entre elas", () => {
  const { html } = doc(respondente("E2"), CONTEXTO);
  assert.equal(html.split('class="pagina"').length - 1, 8);
  assert.match(html, /page-break-after: always/);
  assert.match(html, /@page \{ size: A4/);
});

test("o número exibido é inteiro — a precisão fica no resultado auditável", () => {
  const { d } = doc(respondente("E2", { EST01: "E1", PRO01: "E4" }), CONTEXTO);
  const pg2 = d.paginas.find((p) => p.n === 2);
  const exibidos = [pg2.indice, ...pg2.derivados.map((x) => x.pontos),
    d.paginas.find((p) => p.n === 5).lentes.distancia,
    ...d.paginas.find((p) => p.n === 4).blocos.map((b) => b.pontos)].filter((v) => v != null);
  assert.ok(exibidos.length >= 6);
  for (const v of exibidos) {
    assert.ok(Number.isInteger(v), `a devolutiva exibiria ${v}, que não é inteiro`);
  }
  // e o resultado privado guarda a precisão, para auditoria
  const bruto = calcular(respondente("E2", { EST01: "E1", PRO01: "E4" }));
  assert.ok(bruto.blocos.some((b) => !Number.isInteger(b.pontos_provisorios)),
    "o resultado privado tem que manter a casa decimal");
});

test("os indicadores circulares desenham o arco proporcional ao valor", () => {
  const { d, html } = doc(respondente("E4"), CONTEXTO);
  const circ = 2 * Math.PI * 76;
  // tudo no topo: o índice da empresa é 100, e o arco é a circunferência toda
  assert.equal(d.paginas.find((p) => p.n === 2).indice, 100);
  assert.ok(html.includes(`stroke-dasharray="${circ.toFixed(1)} ${circ.toFixed(1)}"`),
    "o anel de 100 tem que fechar a volta");
  // um valor intermediário desenha o arco correspondente, e não um fixo
  const d2 = doc(respondente("E2"), CONTEXTO);
  const indice = d2.d.paginas.find((p) => p.n === 2).indice;
  assert.equal(indice, 33, "E2 em tudo dá 33 depois do arredondamento de exibição");
  assert.ok(d2.html.includes(`${(circ * 0.33).toFixed(1)} ${circ.toFixed(1)}`),
    "o anel tem que acompanhar o valor, e não um número fixo");
});

test("o PDF publica a nota — e o motor que a calculou vai no rodapé", () => {
  const { d, html } = doc(respondente("E3"), CONTEXTO);
  assert.equal(d.nota_publicavel, true);
  assert.match(html, /de 100/);
  assert.match(html, /Índice de Maturidade da Empresa/);
  assert.match(html, /Maturidade de Gestão/);
  assert.match(html, /Maturidade de Processos/);
});

test("a leitura de IA fica em seção própria, fora do índice da empresa", () => {
  const r = respondente("E4");
  for (const c of PONTUAVEIS) if (c.startsWith("IA")) r[c] = "E1";
  const { d, html } = doc(r, CONTEXTO);
  assert.equal(d.paginas.find((p) => p.n === 2).indice, 100, "IA não entra no índice da empresa");
  assert.match(html, /Diagnóstico de IA/);
  assert.match(html, /Operacional Ágil/);
  assert.match(html, /A organização está aqui/);
  // os cinco níveis aparecem, com a saída de negócio de cada um
  for (const n of ["Operacional Ágil", "Gestor Tático", "Estrategista de Escala",
                   "Arquiteto de Soluções", "Criador de Tecnologia"]) {
    assert.ok(html.includes(n), `nível ausente: ${n}`);
  }
  assert.match(html, /Automação de tarefas/);
  assert.match(html, /Aumento de margem/);
});

test("a palavra “degrau” não aparece na entrega", () => {
  const { html, email } = doc(respondente("E2"), CONTEXTO);
  for (const t of [textoVisivel(html), textoVisivel(email)]) {
    assert.doesNotMatch(t, /degrau/i, "‘degrau’ é vocabulário interno, não da entrega");
  }
});

test("nenhum código de item ou de estágio chega ao documento", () => {
  const { html, email } = doc(respondente("E1", { EST01: "E2", PRO01: "E1" }), CONTEXTO);
  for (const t of [textoVisivel(html), textoVisivel(email)]) {
    for (const it of def.itens) {
      assert.ok(!t.includes(it.codigo), `o documento imprime o código ${it.codigo}`);
    }
    for (const cod of ["E1", "E2", "E3", "E4", "G1", "G2", "G3"]) {
      assert.doesNotMatch(t, new RegExp(`\\b${cod}\\b`), `o documento imprime o estágio ${cod}`);
    }
  }
});

test("a prosa explicativa não repete os números que o indicador já mostra", () => {
  const { d, html } = doc(respondente("E2", { LID01P: "E4", LID02P: "E4", LID03P: "E4" }), CONTEXTO);
  const valores = [
    d.paginas.find((p) => p.n === 2).indice,
    d.paginas.find((p) => p.n === 5).lentes.distancia,
    ...d.paginas.find((p) => p.n === 2).derivados.map((x) => x.pontos),
  ].filter((v) => v != null);
  assert.ok(valores.length >= 3);
  // os índices e a distância nunca entram nos parágrafos de leitura
  const prosa = [
    ...d.paginas.find((p) => p.n === 2).leitura.paragrafos,
    ...d.paginas.find((p) => p.n === 3).leitura.paragrafos,
    ...d.paginas.find((p) => p.n === 5).lentes.paragrafos,
    ...d.paginas.find((p) => p.n === 1).resumo,
  ].join(" ");
  assert.doesNotMatch(prosa, /\d+ de 100|\d+ pontos|\/100/);
  assert.doesNotMatch(prosa, /\b\d{1,3},\d\b/, "nem nota com decimal em prosa");
  assert.ok(html.includes("de 100"), "o número segue existindo — no indicador");
});

test("a leitura das duas lentes descreve o afastamento sem citá-lo", () => {
  const r = respondente("E4");
  for (const c of PONTUAVEIS) if (/^LID\d+O$/.test(c)) r[c] = "E1";
  const { d, html } = doc(r, CONTEXTO);
  const lentes = d.paginas.find((p) => p.n === 5).lentes;
  assert.equal(lentes.distancia, 100);
  assert.equal(lentes.titulo, "Atuação Individual à Frente do Contexto");
  assert.match(lentes.paragrafos.join(" "), /esforço individual/);
  assert.doesNotMatch(lentes.paragrafos.join(" "), /\d/, "a leitura não cita número nenhum");
  assert.match(html, /fragilidade da continuidade/);
  // e o sentido inverso tem leitura própria, não a mesma frase
  const r2 = respondente("E4");
  for (const c of PONTUAVEIS) if (/^LID\d+P$/.test(c)) r2[c] = "E1";
  const inv = doc(r2, CONTEXTO).d.paginas.find((p) => p.n === 5).lentes;
  assert.equal(inv.titulo, "Contexto à Frente da Atuação Descrita");
  assert.notDeepEqual(inv.paragrafos, lentes.paragrafos);
});

test("a evidência citada no PDF é a alternativa literal marcada", () => {
  const respostas = respondente("E4", { PRO01: "E1" });
  const { html } = doc(respostas, CONTEXTO);
  const it = def.itens.find((i) => i.codigo === "PRO01");
  assert.ok(html.includes(it.opcoes[0].texto), "a resposta literal não aparece no documento");
  assert.ok(html.includes(it.pergunta), "o enunciado que originou a evidência não aparece");
  assert.match(html, /O que foi relatado/);
  assert.match(html, /O que isso pode indicar/);
  assert.match(html, /O que isso abre/);
  assert.match(html, /Como verificar/);
});

test("o objetivo analítico interno nunca chega ao documento", () => {
  const { html, email } = doc(respondente("E1"), CONTEXTO);
  for (const i of def.itens) {
    assert.ok(!html.includes(i.objetivo_interno), `${i.codigo}: objetivo interno vazou no PDF`);
    assert.ok(!email.includes(i.objetivo_interno), `${i.codigo}: objetivo interno vazou no e-mail`);
  }
  assert.doesNotMatch(html, /Critério C\d+/);
  assert.doesNotMatch(html, /Transcrição 00:/);
  assert.doesNotMatch(html, /parecer p\./);
});

test("o PDF traz o evento dedicado e nenhuma marca de outro evento", () => {
  const { html, email } = doc(respondente("E2"), CONTEXTO);
  for (const texto of [html, email]) {
    assert.match(texto, /Diagnóstico Boomit/);
    assert.doesNotMatch(texto, /IBMEC/i);
    assert.doesNotMatch(texto, /Krub/);
    assert.doesNotMatch(texto, /#002555|#F5AC00/);
    assert.doesNotMatch(texto, /degustacao|degustação/i);
  }
});

test("governança aparece como condição, e o documento diz que não compõe a nota", () => {
  const { html } = doc(respondente("E4", { GOV01: "G1" }), CONTEXTO);
  assert.match(html, /Exige tratamento antes de ampliar/);
  assert.match(html, /não é compensada/);
  assert.match(html, /condição, e não como pontos/);
});

test("sem sinal, o documento não oferece cenário de solução", () => {
  const { html } = doc(respondente("E4"), CONTEXTO);
  assert.doesNotMatch(html, /Cenários de Trabalho Possíveis/);
  assert.doesNotMatch(html, /Cenário de trabalho ·/);
});

test("com sinal, o cenário cita a especialidade real e a evidência que decide", () => {
  const { html } = doc(respondente("E4", { PRO01: "E1", IA02: "E1" }), CONTEXTO);
  assert.match(html, /Cenários de Trabalho Possíveis/);
  assert.match(html, /Redesenho de processos|Estratégia de IA/);
  assert.match(html, /Evidência que confirma ou refuta/);
  assert.match(html, /não uma recomendação de compra/);
});

test("a escala é explicada em português e o N/A é dito como fora do cálculo", () => {
  const { html } = doc(respondente("E2", { EST01: "NA", EST02: "NA" }), CONTEXTO);
  assert.match(html, /Só quando pedem/);
  assert.match(html, /Varia conforme a pessoa/);
  assert.match(html, /Tem forma definida/);
  assert.match(html, /Ajustado pelo resultado/);
  assert.match(html, /fora do numerador e do denominador/);
  assert.match(html, /não representa baixa maturidade/);
});

test("o e-mail se sustenta sozinho e traz os dois indicadores", () => {
  const { email } = doc(respondente("E1"), CONTEXTO);
  assert.match(email, /Fulana/);
  assert.match(email, /Maturidade da empresa/);
  assert.match(email, /Diagnóstico de IA/);
  assert.match(email, /Pontos de atenção do ciclo/);
  // tabela com estilo inline — Outlook ignora flex/grid
  assert.doesNotMatch(email, /display:\s*flex|display:\s*grid/);
});

test("todo texto do documento é escapado — nada de HTML vindo do respondente", () => {
  const { html } = doc(respondente("E2"), { ...CONTEXTO, nome: "<script>alert(1)</script>", empresa: 'A & B "C"' });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A &amp; B/);
});

test("a hipótese nunca contradiz a evidência que a sustenta", () => {
  // FUT06 é o caso que pegou isto: a evidência dizia "o tema está em discussão"
  // e a hipótese afirmava "ainda não discutida".
  const { html } = doc(respondente("E4", { FUT06: "E2" }), CONTEXTO);
  assert.match(html, /O tema está em discussão, mas não há modelo/);
  assert.doesNotMatch(html, /pode indicar estrutura organizacional ainda não discutida/);
  assert.match(html, /seja porque a discussão ocorre sem modelo, critério ou caminho definido/);
});

test("a concordância acompanha a contagem — “1 descreve”, “2 descrevem”", () => {
  const um = doc(respondente("E3", { EST01: "E1", EST02: "NA", EST03: "NA", EST04: "NA" }), CONTEXTO).html;
  assert.match(um, /1 descreve algo que ainda depende/);
  assert.doesNotMatch(um, /1 descrevem/);
  const varios = doc(respondente("E1"), CONTEXTO).html;
  assert.match(varios, /\d+ descrevem algo que ainda depende/);
});

test("a marca do documento é a da casa, com os cinco níveis em uma rampa só", () => {
  assert.equal(MARCA.verde, "#545E54");
  assert.equal(MARCA.niveis.length, 5);
  assert.equal(MARCA.estagios.length, 4);
  // a rampa dos níveis clareia monotonicamente — é o que faz a escada ser lida
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const L = MARCA.niveis.map(lum);
  assert.ok(L.every((v, i) => i === 0 || v > L[i - 1]), "a rampa dos níveis tem que ser monotônica");
});
