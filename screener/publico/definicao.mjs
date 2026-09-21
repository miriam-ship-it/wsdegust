// =============================================================
// DIAGNÓSTICO BOOMIT · 40 itens — carga da definição e projeção pública
//
// A definição é PRIVADA: ela carrega o objetivo analítico de cada item, a regra
// de pontuação, o mapa numérico provisório e o gabarito de gate. Nada disso
// pode chegar ao navegador.
//
// `projecaoPublica()` é a única coisa que o respondente vê: código, bloco,
// lente, enunciado e alternativas — sem tratamento, sem peso, sem ponto.
//
// 🔒 A fronteira é uma LISTA BRANCA de chaves, provada em `catalogo.test.mjs`.
//    Campo novo na definição não vaza por esquecimento: ele simplesmente não
//    é copiado, e o teste que conta as chaves quebra se alguém alargar a lista.
//
// Sem `node:fs`: este módulo roda igual no Node (testes) e no Deno (edge).
// =============================================================

import { INSTRUMENTO, SHA256 } from "./instrumento/definicao-embutida.mjs";

/** A definição completa (PRIVADA). Só o servidor chama. */
export function definicao() {
  return INSTRUMENTO;
}

/** Checksum da definição — vai congelado no relatório, para auditoria. */
export function checksum() {
  return SHA256;
}

/** As versões congeladas no evento e em cada linha de `relatorios`. */
export function versoes() {
  return { ...INSTRUMENTO.versoes, definicao_sha256: SHA256 };
}

/** Itens ativos, na ordem de exibição do documento aprovado. */
export function itensAtivos(def = definicao()) {
  return def.itens.filter((i) => i.ativo).sort((a, b) => a.ordem - b.ordem);
}

/** O item de um código, ou undefined. */
export function item(codigo, def = definicao()) {
  return def.itens.find((i) => i.codigo === codigo);
}

/**
 * O que o navegador recebe. Campos permitidos, um a um — lista branca, não
 * lista negra.
 */
export function projecaoPublica(def = definicao()) {
  return {
    id: def.id,
    nome: def.nome,
    versao_questionario: def.versoes.questionario,
    blocos: def.blocos.map((b) => ({ id: b.id, nome: b.nome })),
    itens: itensAtivos(def).map((i) => ({
      codigo: i.codigo,
      ordem: i.ordem,
      bloco: i.bloco,
      lente: i.lente,
      pergunta: i.pergunta,
      opcoes: i.opcoes.map((o) => ({ codigo: o.codigo, texto: o.texto })),
    })),
  };
}

/**
 * Se a nota numérica pode ser publicada ao respondente.
 *
 * Enquanto `e1_e4_confirmado` for false, o mapa numérico é uma CONFIGURAÇÃO
 * PROVISÓRIA: o fluxo inteiro roda e grava, mas nem a tela nem o PDF nem o
 * e-mail exibem nota de maturidade. Ver `motor.mjs`.
 */
export function notaPublicavel(def = definicao()) {
  return def.pontuacao.e1_e4_confirmado === true;
}
