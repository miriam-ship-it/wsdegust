// QUAL INSTRUMENTO A EDGE SERVE — o registro que desfaz o acoplamento de um só.
//
// O PROBLEMA QUE ISTO RESOLVE. Até aqui a edge chamava `apresentacaoPublica()`
// sem argumento — sempre o pacote local — e `instrumentoConfere` devolvia 409
// para qualquer vínculo que apontasse para outro instrumento. Era uma escolha
// razoável quando existia um produto só. Com o formulário único, ela passou a
// ser o gargalo: sem isto não existe sessão do formulário único, e sem sessão
// não há o que responder, calcular nem imprimir.
//
// O DESENHO. Cada instrumento responde às MESMAS cinco perguntas, e a edge não
// precisa saber qual está atendendo:
//
//   apresentacao()            o que o navegador recebe para montar o formulário
//   checksum()                a impressão digital da definição, para o snapshot
//   validarResposta(id, v)    lança quando a resposta não é do instrumento
//   validar(respostas)        lança quando falta o que é obrigatório
//   calcular({respostas,...}) o contrato {public, internal} que o snapshot guarda
//   paraPublico(contrato)     a projeção pública de um contrato JÁ GUARDADO
//
// O QUE NÃO PODE MUDAR: o comportamento do link público. O módulo do rhia chama
// exatamente as mesmas funções de antes, com os mesmos argumentos — este arquivo
// é uma tabela de despacho, não uma reescrita. Há teste comparando a saída do
// módulo com a chamada direta.

import { instrumento, checksum as checksumRhia, apresentacaoPublica } from "../rhia/definicao.mjs";
import { validarSubmissao, calcularContrato, paraPublico, validarResposta } from "../rhia/logica.mjs";
import {
  CODIGO_UNIFICADO, apresentacaoUnificada, definicaoParaBanco,
  calcularUnificado, perfilCompleto, validarRespostaUnificada,
} from "../unificado/composicao.mjs";

/** Versão do modelo público do motor do pacote (output-definition-v2 VERSION). */
export const VERSAO_RESULTADO_RHIA = "2.0.0-pilot";
/** Versão do modelo público do documento único. */
export const VERSAO_RESULTADO_UNIFICADO = "unificado-1.0.0";
export const VERSAO_UNIFICADO = "1.0.0";

/** sha256 hex de um texto, com Web Crypto — igual em Deno e em Node 18+. */
async function sha256(texto) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

const MODULO_RHIA = Object.freeze({
  code: instrumento.instrument_id,
  version: instrumento.instrument_version,
  versaoResultado: VERSAO_RESULTADO_RHIA,
  // O link público é ANÔNIMO: sem bloco de perfil, a RPC de perfil recusa, e é
  // essa ausência — não um `if` em alguma rota — que sustenta a anonimidade.
  temPerfil: false,
  podeFinalizar: true,
  apresentacao: () => apresentacaoPublica(),
  checksum: () => checksumRhia(),
  validarResposta: (item_id, value) => validarResposta(item_id, value),
  validar: (respostas) => validarSubmissao(respostas),
  calcular: ({ respostas }) => calcularContrato({ respostas }),
  paraPublico: (contrato) => paraPublico(contrato),
});

const MODULO_UNIFICADO = Object.freeze({
  code: CODIGO_UNIFICADO,
  version: VERSAO_UNIFICADO,
  versaoResultado: VERSAO_RESULTADO_UNIFICADO,
  temPerfil: true,
  // Passou a finalizar com a 20260916140000: o CHECK do snapshot deixou de
  // comparar com a constante "2.0.0-pilot" e passou a exigir que o contrato não
  // MINTA sobre a própria versão — `result->'public'->>'version'` tem de ser
  // igual à coluna `report_version`, que a edge já gravava. Mais estrito num
  // ponto, e aberto a qualquer instrumento, que é o que a coluna sempre existiu
  // para registrar.
  podeFinalizar: true,
  apresentacao: () => apresentacaoUnificada(),
  checksum: () => sha256(JSON.stringify(definicaoParaBanco({ versao: VERSAO_UNIFICADO }))),
  validarResposta: (item_id, value) => validarRespostaUnificada(item_id, value),
  validar: (respostas, perfil) => {
    const r = calcularUnificado({ perfil, respostas });
    const faltaPerfil = perfilCompleto(perfil).faltam;
    if (faltaPerfil.length) throw new Error(`perfil_incompleto: ${faltaPerfil.join(",")}`);
    if (r.lideranca.status !== "OK") {
      throw new Error(`lideranca_incompleta: ${(r.lideranca.faltantes || []).join(",")}`);
    }
    if (!r.ia) throw new Error("ia_incompleta");
  },
  calcular: ({ respostas, perfil }) => {
    const r = calcularUnificado({ perfil, respostas });
    // Mesma forma de sempre: o público vai ao navegador, o interno fica no
    // snapshot. As respostas cruas continuam sendo `internal`, nunca publicadas.
    return {
      public: { version: VERSAO_RESULTADO_UNIFICADO, ...semInterno(r) },
      internal: { answers: respostas, perfil: perfil ?? null },
    };
  },
  paraPublico: (contrato) => ({ ...(contrato?.public ?? {}), emitido_em: new Date().toISOString() }),
});

/** O resultado sem o que não é para publicar (a metade crua de liderança, em 1–5). */
function semInterno(r) {
  const { lideranca, ...resto } = r || {};
  return resto;
}

const REGISTRO = Object.freeze({
  [MODULO_RHIA.code]: Object.freeze({ [MODULO_RHIA.version]: MODULO_RHIA }),
  [MODULO_UNIFICADO.code]: Object.freeze({ [MODULO_UNIFICADO.version]: MODULO_UNIFICADO }),
});

/**
 * O módulo que atende este vínculo, ou `null`.
 *
 * `null` é o que vira 409 `instrumento_indisponivel`: vínculo apontando para
 * instrumento que esta edge não sabe servir. Não é erro de quem responde.
 */
export function moduloDoBinding(binding) {
  const porVersao = binding && REGISTRO[binding.instrument_code];
  return (porVersao && porVersao[binding.instrument_version]) || null;
}

/** Os instrumentos que esta edge sabe servir — para diagnóstico e teste. */
export const instrumentosServidos = () =>
  Object.values(REGISTRO).flatMap((v) => Object.values(v)).map((m) => ({ code: m.code, version: m.version }));
