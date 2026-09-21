// =============================================================
// DIAGNÓSTICO BOOMIT · 40 itens — carga da definição e projeção pública
//
// A definição (`instrumento/DIAGNOSTICO_BOOMIT_40.json`) é PRIVADA: ela carrega
// o objetivo analítico de cada item, a regra de pontuação, o mapa numérico
// provisório e o gabarito de gate. Nada disso pode chegar ao navegador.
//
// `projecaoPublica()` é a única coisa que o respondente vê: código, bloco,
// lente, enunciado e alternativas — sem tratamento, sem peso, sem ponto.
//
// 🔒 A fronteira é PROVADA em `fronteira.test.mjs`. Se um campo novo entrar na
//    definição e não for listado aqui, o teste quebra — de propósito.
// =============================================================

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CAMINHO = join(AQUI, "instrumento", "DIAGNOSTICO_BOOMIT_40.json");

let _cache = null;

/** A definição completa (PRIVADA). Só o servidor chama. */
export function definicao() {
  if (!_cache) _cache = JSON.parse(readFileSync(CAMINHO, "utf8"));
  return _cache;
}

/** Checksum da definição — vai congelado no relatório, para auditoria. */
export function checksum() {
  return createHash("sha256").update(readFileSync(CAMINHO, "utf8")).digest("hex");
}

/** As versões congeladas no evento e em cada linha de `relatorios`. */
export function versoes() {
  return { ...definicao().versoes, definicao_sha256: checksum() };
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
 * lista negra: campo novo na definição não vaza por esquecimento.
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
