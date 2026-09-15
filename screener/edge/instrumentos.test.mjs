// O registro de instrumentos da edge.
//
// O que estes testes protegem, acima de tudo: que o link público NÃO MUDE. O
// módulo do rhia tem de chamar exatamente as mesmas funções de antes, com os
// mesmos argumentos — este registro é uma tabela de despacho, não uma reescrita.
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento, checksum as checksumRhia, apresentacaoPublica } from "../rhia/definicao.mjs";
import { calcularContrato, paraPublico } from "../rhia/logica.mjs";
import { apresentacaoUnificada, CODIGO_UNIFICADO } from "../unificado/composicao.mjs";
import {
  moduloDoBinding, instrumentosServidos,
  VERSAO_RESULTADO_RHIA, VERSAO_RESULTADO_UNIFICADO, VERSAO_UNIFICADO,
} from "./instrumentos.mjs";

const bindingRhia = { instrument_code: instrumento.instrument_id, instrument_version: instrumento.instrument_version };
const bindingUnificado = { instrument_code: CODIGO_UNIFICADO, instrument_version: VERSAO_UNIFICADO };

function respostasRhia() {
  const R = { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor de RH", CTX02: "AREA", CTX03: "DECIDE_SCOPE" };
  const dims = {
    EST: ["E3", "E3", "E4", "E3"], TAL: ["E2", "E3", "E3", "E2"], DES: ["E3", "E3", "E2", "E3"],
    INF: ["E3", "E4", "E3", "E3"], DAD: ["E2", "E2", "E3", "E2"], IA: ["E2", "E1", "E2", "NA"],
  };
  for (const [d, vs] of Object.entries(dims)) vs.forEach((v, i) => { R[`${d}0${i + 1}`] = v; });
  R.GOV01 = "E3"; R.GOV02 = "E2"; R.GOV03 = "E3";
  return R;
}

// -------------------------------------------------------------------------
// O link público não muda
// -------------------------------------------------------------------------

test("o módulo do rhia é a chamada direta, sem uma vírgula de diferença", async () => {
  const mod = moduloDoBinding(bindingRhia);
  assert.ok(mod, "o vínculo público tem de continuar sendo servido");

  assert.deepEqual(mod.apresentacao(), apresentacaoPublica());
  assert.equal(await mod.checksum(), await checksumRhia());
  assert.equal(mod.versaoResultado, VERSAO_RESULTADO_RHIA);

  // `generatedAt` e `emitido_em` são o relógio, e as duas chamadas não caem no
  // mesmo milissegundo. Compara-se o resto — que é o que muda se alguém
  // transformar esta tabela de despacho numa reimplementação.
  const semRelogio = (c) => ({ ...c, internal: { ...c.internal, generatedAt: null } });
  const respostas = respostasRhia();
  assert.deepEqual(semRelogio(mod.calcular({ respostas })), semRelogio(calcularContrato({ respostas })));
  const contrato = calcularContrato({ respostas });
  // `emitido_em` é o relógio: compara-se o resto
  const pelaTabela = mod.paraPublico(contrato), direto = paraPublico(contrato);
  delete pelaTabela.emitido_em; delete direto.emitido_em;
  assert.deepEqual(pelaTabela, direto);
});

test("o rhia NÃO declara perfil — é a ausência que o mantém anônimo", () => {
  const mod = moduloDoBinding(bindingRhia);
  assert.equal(mod.temPerfil, false);
  assert.equal(apresentacaoPublica().perfil, undefined);
});

test("o rhia finaliza, como sempre finalizou", () => {
  assert.equal(moduloDoBinding(bindingRhia).podeFinalizar, true);
});

// -------------------------------------------------------------------------
// O formulário único passa a ser servível
// -------------------------------------------------------------------------

test("o formulário único é servido, e traz o bloco de perfil", () => {
  const mod = moduloDoBinding(bindingUnificado);
  assert.ok(mod, "sem isto não existe sessão do formulário único, e sem sessão não há o que imprimir");
  assert.equal(mod.temPerfil, true);
  assert.deepEqual(mod.apresentacao(), apresentacaoUnificada());
  assert.ok(Array.isArray(mod.apresentacao().perfil));
});

test("o formulário único finaliza com a própria versão, sem fingir ser o de IA", () => {
  // O CHECK do snapshot deixou de comparar com a constante "2.0.0-pilot"
  // (20260916140000) e passou a exigir que o contrato não minta sobre a própria
  // versão. Fazer o documento único se declarar "2.0.0-pilot" para caber no
  // CHECK antigo teria funcionado — e mentiria no banco para quem lesse aquele
  // campo daqui a seis meses.
  const mod = moduloDoBinding(bindingUnificado);
  assert.equal(mod.podeFinalizar, true);
  assert.equal(mod.versaoResultado, VERSAO_RESULTADO_UNIFICADO);
  assert.notEqual(mod.versaoResultado, VERSAO_RESULTADO_RHIA);
});

test("o contrato do formulário único separa o que é público do que não é", () => {
  const mod = moduloDoBinding(bindingUnificado);
  const perfil = { nome: "Ana", empresa: "Boomit", cargo: "Head", nivel: "G", porte: "S3", setor: "V1" };
  const contrato = mod.calcular({ respostas: respostasRhia(), perfil });

  assert.equal(contrato.public.version, VERSAO_RESULTADO_UNIFICADO);
  assert.deepEqual(contrato.internal.answers, respostasRhia());
  assert.deepEqual(contrato.internal.perfil, perfil);
  // a metade CRUA de liderança (escala 1–5, a régua interna) não é publicada
  assert.equal(contrato.public.lideranca, undefined,
    "o que sai é `liderancaPublica`, em 0–100; o cru fica no interno");
  assert.ok(!JSON.stringify(contrato.public).includes("CTX01"), "resposta não é resultado");
});

test("o formulário único recusa submissão com metade faltando, dizendo o que falta", () => {
  const mod = moduloDoBinding(bindingUnificado);
  const perfil = { nome: "Ana", empresa: "Boomit", cargo: "Head", nivel: "G", porte: "S3", setor: "V1" };

  assert.throws(() => mod.validar(respostasRhia(), perfil), /lideranca_incompleta/);
  assert.throws(() => mod.validar(respostasRhia(), { nome: "Ana" }), /perfil_incompleto/);
});

// -------------------------------------------------------------------------
// O que a edge não sabe servir
// -------------------------------------------------------------------------

test("vínculo apontando para o que a edge não conhece devolve nada — e vira 409", () => {
  assert.equal(moduloDoBinding({ instrument_code: "nao_existe", instrument_version: "1.0.0" }), null);
  assert.equal(moduloDoBinding({ ...bindingRhia, instrument_version: "9.9.9" }), null,
    "versão errada é instrumento errado: é o que impede servir um formulário que não é o do vínculo");
  assert.equal(moduloDoBinding(null), null);
  assert.equal(moduloDoBinding({}), null);
});

test("a edge diz quais instrumentos sabe servir", () => {
  const servidos = instrumentosServidos();
  assert.equal(servidos.length, 2);
  assert.ok(servidos.some((i) => i.code === instrumento.instrument_id));
  assert.ok(servidos.some((i) => i.code === CODIGO_UNIFICADO));
});
