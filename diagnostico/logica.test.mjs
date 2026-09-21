// Catracas da lógica do front — questionário e painel.

import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml, progresso, primeiraNaoRespondida, itensFaltantes, opcaoLivre,
  entrouEmNovoBloco, novoToken, emailValido,
  resumo, filtrar, dataPt, montarCsv, COLUNAS,
} from "./src/logica.mjs";

const ITENS = [
  { codigo: "CTX01", bloco: "CTX", opcoes: [{ codigo: "P1", texto: "C-level" }, { codigo: "OUTRO", texto: "Outro", texto_livre: true }] },
  { codigo: "CTX02", bloco: "CTX", opcoes: [{ codigo: "N1", texto: "Entregas" }] },
  { codigo: "EST01", bloco: "EST", opcoes: [{ codigo: "E1", texto: "a" }] },
  { codigo: "EST02", bloco: "EST", opcoes: [{ codigo: "E1", texto: "a" }] },
];

test("o progresso é do instrumento inteiro e se protege de lixo", () => {
  assert.deepEqual(progresso(10, 40), { respondidas: 10, total: 40, restante: 30, pct: 25 });
  assert.equal(progresso(0, 40).pct, 0);
  assert.equal(progresso(40, 40).pct, 100);
  assert.equal(progresso(99, 40).respondidas, 40, "não passa de 100%");
  assert.equal(progresso(-5, 40).respondidas, 0);
  assert.equal(progresso(3, 0).pct, 0, "total zero não divide por zero");
});

test("a retomada volta para a primeira sem resposta", () => {
  assert.equal(primeiraNaoRespondida(ITENS, {}), 0);
  assert.equal(primeiraNaoRespondida(ITENS, { CTX01: "P1", CTX02: "N1" }), 2);
  assert.equal(primeiraNaoRespondida(ITENS, { CTX01: "P1", CTX02: "N1", EST01: "E1", EST02: "E1" }), 4);
  // buraco no meio: volta para o buraco, não para o fim
  assert.equal(primeiraNaoRespondida(ITENS, { CTX01: "P1", EST01: "E1" }), 1);
});

test("itensFaltantes lista o que ainda falta, e nada mais", () => {
  assert.deepEqual(itensFaltantes(ITENS, { CTX01: "P1" }), ["CTX02", "EST01", "EST02"]);
  assert.deepEqual(itensFaltantes(ITENS, { CTX01: "P1", CTX02: "N1", EST01: "E1", EST02: "E1" }), []);
});

test("quem declara o campo aberto é o instrumento", () => {
  assert.equal(opcaoLivre(ITENS[0]).codigo, "OUTRO");
  assert.equal(opcaoLivre(ITENS[1]), null);
  assert.equal(opcaoLivre(undefined), null, "item ausente não estoura");
  assert.equal(opcaoLivre({}), null);
});

test("a transição de bloco aparece só na virada", () => {
  assert.equal(entrouEmNovoBloco(ITENS, 0), false, "índice 0 não tem anterior");
  assert.equal(entrouEmNovoBloco(ITENS, 1), false, "CTX → CTX");
  assert.equal(entrouEmNovoBloco(ITENS, 2), true, "CTX → EST");
  assert.equal(entrouEmNovoBloco(ITENS, 3), false, "EST → EST");
  assert.equal(entrouEmNovoBloco(ITENS, 99), false);
});

test("o token é UUID v4 válido e não se repete", () => {
  const t = novoToken();
  assert.match(t, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(Array.from({ length: 200 }, novoToken)).size, 200);
});

test("e-mail: aceita o que é e-mail e recusa o resto", () => {
  for (const bom of ["a@b.co", " miriam@boomit.com.br ", "x.y+z@sub.dominio.com"]) {
    assert.ok(emailValido(bom), bom);
  }
  for (const ruim of ["", null, undefined, "sem-arroba", "a@b", "a b@c.co", "@b.co", "a@.co"]) {
    assert.ok(!emailValido(ruim), String(ruim));
  }
});

test("escapeHtml fecha as cinco portas", () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`),
    "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(0), "0", "zero não vira vazio");
});

// ---------------------------------------------------------------
// painel
// ---------------------------------------------------------------

const LINHAS = [
  { nome: "Ana", empresa: "Alfa", cargo: "Diretora", email: "ana@alfa.com", papel: "Diretor(a)", governanca_gate: "G1", submetido_em: "2026-09-21T10:00:00Z", pdf_enviado_em: "2026-09-21T10:01:00Z", consentimento_marketing: true, erro_geracao: null },
  { nome: "Bruno", empresa: "Beta", cargo: "Gerente", email: "bruno@beta.com", papel: "Gerente", governanca_gate: "G3", submetido_em: "2026-09-21T11:00:00Z", pdf_enviado_em: null, consentimento_marketing: false, erro_geracao: "Browserless 500" },
  { nome: "Clara", empresa: "Gama", cargo: "Sócia", email: null, papel: null, governanca_gate: null, submetido_em: null, pdf_enviado_em: null, consentimento_marketing: false, erro_geracao: null },
];

test("o resumo conta cada coisa pelo campo que a define", () => {
  assert.deepEqual(resumo(LINHAS), {
    respondentes: 3, finalizados: 2, com_email: 2,
    pdf_enviados: 1, erros: 1, aceitaram_contato: 1,
  });
  assert.deepEqual(resumo([]), { respondentes: 0, finalizados: 0, com_email: 0, pdf_enviados: 0, erros: 0, aceitaram_contato: 0 });
  assert.equal(resumo(null).respondentes, 0);
});

test("o filtro busca em várias colunas e combina com o gate", () => {
  assert.equal(filtrar(LINHAS, "alfa").length, 1);
  assert.equal(filtrar(LINHAS, "GERENTE").length, 1, "busca é indiferente a maiúscula");
  assert.equal(filtrar(LINHAS, "@beta.com").length, 1);
  assert.equal(filtrar(LINHAS, "", "G1").length, 1);
  assert.equal(filtrar(LINHAS, "ana", "G3").length, 0, "termo e gate se somam");
  assert.equal(filtrar(LINHAS, "").length, 3);
  assert.equal(filtrar(LINHAS, "   ", "todos").length, 3);
  assert.equal(filtrar(LINHAS, "clara").length, 1, "linha com campos nulos não quebra a busca");
});

test("data nula vira travessão — não vira 'hoje'", () => {
  assert.equal(dataPt(null), "—");
  assert.equal(dataPt(""), "—");
  assert.equal(dataPt("não é data"), "—");
  assert.match(dataPt("2026-09-21T10:00:00Z"), /21\/09\/2026/);
});

test("o CSV abre no Excel em pt-BR e escapa o que precisa", () => {
  const csv = montarCsv(LINHAS, COLUNAS);
  assert.ok(csv.startsWith("﻿"), "sem BOM o Excel come os acentos");
  const linhas = csv.slice(1).split("\r\n");
  assert.equal(linhas.length, 4, "cabeçalho + 3 linhas");
  assert.ok(linhas[0].startsWith("Nome;Empresa;Cargo;E-mail"));
  assert.equal(linhas[0].split(";").length, COLUNAS.length);
  // separador ';' — no Excel pt-BR a vírgula é decimal
  assert.ok(!linhas[0].includes(","));
});

test("o CSV não deixa ponto-e-vírgula, aspas ou quebra de linha estourarem a coluna", () => {
  const csv = montarCsv([{ nome: 'Ana "A"; Silva', empresa: "linha1\nlinha2" }], [
    { campo: "nome", rotulo: "Nome" }, { campo: "empresa", rotulo: "Empresa" },
  ]);
  const corpo = csv.slice(1).split("\r\n").slice(1).join("\r\n");
  assert.ok(corpo.includes('"Ana ""A""; Silva"'), corpo);
  assert.ok(corpo.includes('"linha1\nlinha2"'));
});

test("o CSV exporta exatamente as linhas recebidas — nada a mais", () => {
  assert.equal(montarCsv([], COLUNAS).slice(1).split("\r\n").length, 1, "só o cabeçalho");
  const filtradas = filtrar(LINHAS, "", "G1");
  const csv = montarCsv(filtradas, COLUNAS);
  assert.ok(csv.includes("Ana"));
  assert.ok(!csv.includes("Bruno"), "o export segue o filtro da tela");
});

test("nenhuma coluna do CSV carrega nota de maturidade ou temperatura de lead", () => {
  const campos = COLUNAS.map((c) => c.campo).join(" ");
  for (const proibido of ["maturidade", "score", "nota", "temperatura", "lead"]) {
    assert.ok(!campos.includes(proibido), `coluna proibida no export: ${proibido}`);
  }
});
