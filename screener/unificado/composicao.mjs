// O FORMULÁRIO ÚNICO — liderança e RH+IA na mesma sentada.
//
// Decisão da dona do produto (16/09): um formulário só, com tudo integrado, no
// pipeline novo. Isto substitui a ponte como caminho para quem chega de agora em
// diante — a ponte fica aplicada e inerte, para o dia em que alguém quiser ligar
// as metades de quem já respondeu só uma.
//
// A IDEIA CENTRAL É COMPOSIÇÃO, NÃO CÓPIA. A metade de IA entra POR REFERÊNCIA
// ao instrumento do pacote: nada é copiado, nada é reescrito, e o manifesto
// SHA256 do pacote continua conferindo o que sempre conferiu. Quando o conjunto
// enxuto de IA existir (decisão de conteúdo, sessão de 25/09), ele é um pacote
// novo — e este arquivo não muda uma linha. É por isso que a quantidade de itens
// não aparece em lugar nenhum aqui como número.
//
// O V1 DA LIDERANÇA NÃO É TOCADO. Continua rodando, por evento e com token, no
// app antigo. Este é caminho novo, ao lado — a regra da casa.
//
// FRONTEIRA: este módulo mora FORA de `frontend/`. Ele enxerga `score` das
// alternativas de liderança e o `instrumento` inteiro de IA. O que vai ao
// navegador é só `apresentacaoPublica()`.
//
// UMA MUDANÇA DE POSTURA QUE PRECISA SER DECIDIDA, e está registrada em
// screener/unificado/README.md: o rhia é ANÔNIMO — só captura contato no portão,
// no fim. O formulário único pede nome, empresa e cargo no COMEÇO, porque o
// cálculo do CDL depende de porte e nível de decisão. Isso muda o aviso de
// privacidade e a história de retenção, e por isso o formulário único nasce como
// vínculo próprio, com aviso próprio. O link público do rhia segue anônimo.

import { instrumento as instrumentoIA } from "../rhia/definicao.mjs";
import itensLideranca from "./lideranca-itens.json" with { type: "json" };
import { calcularContrato, paraPublico } from "../rhia/logica.mjs";
import { calcularResultado } from "../lideranca/motor.mjs";
import { cruzar, sinteseCruzada } from "../relatorio-unico/cruzamento.mjs";

/**
 * O PERFIL — o que a liderança sempre pediu no começo, e que a conta precisa.
 *
 * `nivel` e `porte` não são burocracia de cadastro: são as duas entradas do CDL
 * (o custo estimado das disfunções). Sem eles não há faixa em reais, e a metade
 * de liderança perde o número que mais move conversa.
 *
 * `setor` não entra em conta nenhuma hoje — é mantido porque o V1 o coleta e
 * porque segmentar a base depois sem ele seria impossível.
 */
export const PERFIL = Object.freeze([
  { id: "nome", tipo: "texto", rotulo: "Seu nome", obrigatorio: true, maximo: 120 },
  { id: "empresa", tipo: "texto", rotulo: "Empresa", obrigatorio: true, maximo: 120 },
  { id: "cargo", tipo: "texto", rotulo: "Cargo", obrigatorio: true, maximo: 120 },
  {
    id: "nivel", tipo: "escolha", rotulo: "Seu nível na empresa", obrigatorio: true,
    opcoes: [
      { id: "A", rotulo: "Analista / Júnior / Pleno" },
      { id: "C", rotulo: "Coordenador / Sênior / Especialista" },
      { id: "G", rotulo: "Gerente / Diretor" },
      { id: "X", rotulo: "C-Level / Sócio" },
    ],
  },
  {
    id: "porte", tipo: "escolha", rotulo: "Porte da empresa", obrigatorio: true,
    opcoes: [
      { id: "S1", rotulo: "Até 50 colaboradores" },
      { id: "S2", rotulo: "51 a 250 colaboradores" },
      { id: "S3", rotulo: "251 a 1.000 colaboradores" },
      { id: "S4", rotulo: "Mais de 1.000 colaboradores" },
    ],
  },
  {
    id: "setor", tipo: "escolha", rotulo: "Setor", obrigatorio: true,
    opcoes: [
      { id: "V1", rotulo: "Tecnologia & Inovação" }, { id: "V2", rotulo: "Financeiro & Fintech" },
      { id: "V3", rotulo: "Varejo & Consumo" }, { id: "V4", rotulo: "Indústria & Manufatura" },
      { id: "V5", rotulo: "Serviços Profissionais" }, { id: "V6", rotulo: "Saúde & Farma" },
      { id: "V7", rotulo: "Educação" }, { id: "V8", rotulo: "Setor Público" },
      { id: "V9", rotulo: "Outros" },
    ],
  },
]);

/** Prefixo dos itens de liderança no formulário único, para nunca colidirem
 *  com os do pacote de IA — que usam EST01, GOV01, CTX01 e afins. */
export const PREFIXO_LIDERANCA = "LID_";

const idUnificado = (item) => PREFIXO_LIDERANCA + item.id;
const ehDeLideranca = (id) => typeof id === "string" && id.startsWith(PREFIXO_LIDERANCA);

/**
 * A ORDEM DOS BLOCOS, e por que é esta.
 *
 * 1. Perfil — precisa vir antes de tudo: sem porte e nível não há CDL.
 * 2. Contexto — as três do pacote de IA, que fixam a área sobre a qual a pessoa
 *    vai responder o resto. Perguntar isso depois seria perguntar tarde demais.
 * 3. Liderança — dez itens curtos, de escala simples. É a metade mais leve, e
 *    vem primeiro porque quem começa por algo que anda tende a terminar.
 * 4. IA — a metade longa, feita quando a pessoa já entrou no ritmo.
 */
export function montarInstrumento({ ia = instrumentoIA, lideranca = itensLideranca } = {}) {
  const contexto = ia.items.filter((i) => i.kind === "context");
  const deIA = ia.items.filter((i) => i.kind !== "context");
  const deLideranca = lideranca.items.map((i) => ({ ...i, id: idUnificado(i) }));

  return {
    perfil: PERFIL,
    blocos: [
      { id: "contexto", titulo: "Sobre a sua área", itens: contexto },
      { id: "lideranca", titulo: "Liderança", itens: deLideranca },
      { id: "ia", titulo: "RH e IA", itens: deIA },
    ],
    // Contagens derivadas, nunca cravadas: encurtar a metade de IA é trocar o
    // pacote, e tudo aqui acompanha sozinho.
    totais: {
      perfil: PERFIL.length,
      contexto: contexto.length,
      lideranca: deLideranca.length,
      ia: deIA.length,
      itens: contexto.length + deLideranca.length + deIA.length,
    },
    fontes: {
      ia: { instrument_id: ia.instrument_id, instrument_version: ia.instrument_version },
      lideranca: { instrument_id: lideranca.instrument_id, instrument_version: lideranca.instrument_version },
    },
  };
}

/** Identidade do instrumento unificado no banco. */
export const CODIGO_UNIFICADO = "boomit_formulario_unico";

/**
 * A definição no formato que o banco guarda e que as RPC conferem.
 *
 * Duas exigências, e as duas vêm de código que já está em produção:
 *  - `items` PLANO, cada um com `options[].id` — é contra isto que
 *    `screener_rhia_op_save_response` valida, e não se mexe nela;
 *  - `perfil` como array de campos com `opcoes[].id` — é contra isto que
 *    `screener_rhia_op_salvar_perfil` valida.
 *
 * Os `score` de liderança VÃO para o banco, como os internos do pacote de IA já
 * vão: a definição guardada é privada, e quem projeta o que o navegador vê é a
 * edge. O que nunca pode acontecer é o score chegar à tela — ver
 * `apresentacaoPublica`.
 */
export function definicaoParaBanco({ ia = instrumentoIA, lideranca = itensLideranca, versao = "1.0.0" } = {}) {
  const instr = montarInstrumento({ ia, lideranca });
  return {
    instrument_id: CODIGO_UNIFICADO,
    instrument_version: versao,
    language: ia.language ?? "pt-BR",
    title: "Diagnóstico de cenário — liderança, RH e IA",
    perfil: instr.perfil,
    // A ordem dos blocos é parte da definição: quem responde vê nesta sequência.
    blocos: instr.blocos.map((b) => ({ id: b.id, titulo: b.titulo, itens: b.itens.map((i) => i.id) })),
    items: instr.blocos.flatMap((b) => b.itens),
    fontes: instr.fontes,
  };
}

/**
 * O que o navegador pode ver: enunciado e alternativas, sem `score` nenhum.
 *
 * A metade de IA já tem o seu próprio caminho de publicação no pacote e não é
 * tocada aqui; o que esta função tira é o `score` das alternativas de liderança,
 * que no app antigo viajava até o navegador — e foi assim que, por meses,
 * qualquer pessoa com o console aberto escolheu o próprio resultado.
 */
export function apresentacaoPublica(instr = montarInstrumento()) {
  const limparItem = (it) => ({
    id: it.id,
    prompt: it.prompt,
    ...(it.dimension ? { dimension: it.dimension } : {}),
    ...(it.lens ? { lens: it.lens } : {}),
    options: (it.options || []).map((o) => ({ id: o.id, label: o.label })),
  });
  return {
    perfil: instr.perfil,
    blocos: instr.blocos.map((b) => ({ id: b.id, titulo: b.titulo, itens: b.itens.map(limparItem) })),
    totais: instr.totais,
  };
}

/**
 * A apresentação do formulário único, NO MESMO CONTRATO que o front já consome.
 *
 * Esta é a decisão que evita um segundo front. `frontend/rhia.mjs` monta a tela a
 * partir de `{ instrument, groups, items }`, com `items[].group`, `order`,
 * `prompt` e `options[{id,label}]` — e filtra o contexto pelo grupo. Se a
 * apresentação unificada obedecer a esse contrato, a pilha de perguntas, a
 * retomada, o progresso e a navegação por teclado funcionam sem uma linha nova.
 *
 * O que É novo vai num campo novo: `perfil`. O front só mostra a tela de perfil
 * quando ele vem — e o instrumento do link público não o tem. O código entra
 * inerte e o DADO decide, como a migration.
 *
 * Nenhum `score` atravessa: as alternativas saem com id e rótulo, e o ponto é
 * resolvido no servidor por `separarRespostas`.
 */
export function apresentacaoUnificada({ ia = instrumentoIA, lideranca = itensLideranca } = {}) {
  const instr = montarInstrumento({ ia, lideranca });
  const nomeDimIA = new Map((ia.dimensions ?? []).map((d) => [d.id, d.name]));
  const nomeDimLid = new Map((lideranca.dimensoes ?? []).map((d) => [d.code, d.name]));

  let ordem = 0;
  const items = instr.blocos.flatMap((bloco) => bloco.itens.map((it) => {
    ordem += 1;
    const pub = { id: it.id, order: ordem, kind: it.kind, group: bloco.id, prompt: it.prompt };
    // O nome da dimensão é informativo e não aparece no alto da pergunta (ver a
    // nota em telaQuestoes): vai junto porque a revisão e o resultado o usam.
    const nome = bloco.id === "lideranca" ? nomeDimLid.get(it.dimension) : nomeDimIA.get(it.dimension);
    if (nome) pub.dimension_name = nome;
    pub.options = (it.options || []).map((o) => ({ id: o.id, label: o.label }));
    if (it.conditional_field) pub.conditional_field = structuredClone(it.conditional_field);
    return pub;
  }));

  return {
    instrument: {
      id: CODIGO_UNIFICADO,
      version: "1.0.0",
      title: "Diagnóstico de cenário",
      purpose: ia.purpose,
      disclaimer: ia.disclaimer,
      // Derivado, nunca cravado: encurtar a metade de IA tem de encurtar isto junto.
      estimated_minutes: estimativaEmMinutos(instr.totais.itens),
    },
    groups: [
      { code: "contexto", name: "Contexto" },
      { code: "lideranca", name: "Liderança" },
      { code: "ia", name: "RH e IA" },
    ],
    perfil: instr.perfil,
    items,
    totais: instr.totais,
  };
}

/** Faixa em minutos a partir da contagem de itens, arredondada para fora. */
export function estimativaEmMinutos(itens, porMinuto = 3) {
  const base = Math.max(1, Math.round(itens / porMinuto));
  return `${base}–${base + 3}`;
}

/**
 * O perfil está completo? O front pergunta antes de deixar seguir, e o servidor
 * pergunta de novo — a resposta aqui é conveniência, não autoridade.
 */
export function perfilCompleto(valores, campos = PERFIL) {
  const faltam = [];
  for (const campo of campos) {
    if (!campo.obrigatorio) continue;
    const v = valores ? valores[campo.id] : null;
    const texto = typeof v === "string" ? v.trim() : "";
    if (!texto) { faltam.push(campo.id); continue; }
    if (campo.tipo === "escolha" && !(campo.opcoes || []).some((o) => o.id === texto)) {
      faltam.push(campo.id); continue;
    }
    if (campo.tipo === "texto" && campo.maximo && texto.length > campo.maximo) faltam.push(campo.id);
  }
  return { ok: faltam.length === 0, faltam };
}

/**
 * Separa as respostas do formulário único no que cada motor espera.
 *
 * Os dois motores continuam existindo inteiros e intocados: o do pacote de IA e
 * o da liderança. Este módulo não recalcula nada — ele só entrega a cada um o
 * que é dele. Uma terceira implementação da mesma conta é como as fórmulas se
 * separam sem ninguém perceber.
 */
export function separarRespostas(respostas, { lideranca = itensLideranca } = {}) {
  const porId = new Map(lideranca.items.map((i) => [idUnificado(i), i]));
  const linhasLideranca = [];
  const paraIA = {};
  const desconhecidas = [];

  for (const [id, valor] of Object.entries(respostas || {})) {
    if (!ehDeLideranca(id)) { paraIA[id] = valor; continue; }
    const item = porId.get(id);
    if (!item) { desconhecidas.push(id); continue; }
    // O navegador manda o ID da alternativa; o PONTO é resolvido aqui, no
    // servidor, contra a definição privada.
    const opcao = (item.options || []).find((o) => o.id === valor);
    if (!opcao) { desconhecidas.push(id); continue; }
    linhasLideranca.push({ dimensao: item.dimension, lente: item.lens, valor: opcao.score });
  }
  return { lideranca: linhasLideranca, ia: paraIA, desconhecidas };
}

/** O perfil no formato que o motor da liderança espera. */
export const perfilParaMotor = (perfil) => ({
  tamanho: perfil?.porte ?? null,
  persona: perfil?.nivel ?? null,
});

/**
 * A metade de liderança NO MODELO PÚBLICO — o que pode chegar ao navegador.
 *
 * Duas coisas mudam em relação ao que o motor devolve:
 *
 * 1. A ESCALA. O motor trabalha em 1–5, que é a régua interna do instrumento. O
 *    que sai é 0–100, por multiplicação exata — a mesma escala da metade de IA e
 *    da leitura cruzada. Réguas diferentes no mesmo documento é como se criam
 *    comparações que ninguém fez.
 * 2. OS NOMES. O navegador não tem a definição de liderança (ela é privada, e é
 *    ela que guarda os pontos), então o nome de cada dimensão viaja junto.
 *
 * O `gap` entre as duas lentes vai como número, não como julgamento: "você vê
 * mais do que a empresa sustenta" é leitura, e leitura é do documento.
 */
export function paraPublicoLideranca(res, { lideranca = itensLideranca } = {}) {
  if (!res || res.status !== "OK") {
    return { status: res?.status ?? "INCOMPLETO", faltantes: res?.faltantes ?? [] };
  }
  const nomes = new Map((lideranca.dimensoes ?? []).map((d) => [d.code, d.name]));
  const cem = (v) => (Number.isFinite(v) ? Math.round(v * 20) : null);

  return {
    status: "OK",
    maturidade: {
      letra: res.maturidade.letra,
      valor: res.maturidade.score100,
      label: res.maturidade.label,
      diagnostico: res.maturidade.diagnostico,
    },
    risco: { valor: res.risco_estrategico, nivel: nivelDeRisco(res.risco_estrategico) },
    cdl: { min: res.cdl.min, max: res.cdl.max },
    dimensoes: Object.entries(res.scores).map(([code, v]) => ({
      codigo: code,
      nome: nomes.get(code) ?? code,
      pessoa: cem(v.pessoa),
      empresa: cem(v.empresa),
      media: cem(v.media),
      distancia: cem(Math.abs(v.gap)),
    })),
  };
}

/** Faixa do risco estratégico, em palavra. A mesma régua do e-mail de fecho. */
export function nivelDeRisco(valor) {
  if (!Number.isFinite(valor)) return null;
  if (valor >= 60) return "alto";
  if (valor >= 40) return "moderado";
  return "baixo";
}

/**
 * O resultado das duas metades e a relação entre elas.
 *
 * Devolve as duas SEPARADAS e o cruzamento ao lado — nunca um índice combinado.
 * Um número que somasse as duas seria número novo, sem instrumento que o
 * sustente, e ninguém decidiu o peso de cada metade. `relatorio-unico` já recusa
 * isso e tem teste para a recusa; aqui é a mesma recusa, no mesmo lugar.
 */
export function calcularUnificado({ perfil, respostas, ia = instrumentoIA, lideranca = itensLideranca }) {
  const separadas = separarRespostas(respostas, { lideranca });

  const resLideranca = calcularResultado({
    respostas: separadas.lideranca,
    respondente: perfilParaMotor(perfil),
  });

  let pubIA = null;
  try {
    pubIA = paraPublico(calcularContrato({ instrumento: ia, respostas: separadas.ia }));
  } catch {
    pubIA = null; // metade de IA incompleta não derruba a metade que está pronta
  }

  // As duas metades NORMALIZADAS, no formato que `relatorio-unico` já contratou —
  // e as MESMAS instâncias vão para o cruzamento e para a síntese. Passar o
  // resultado bruto de cada motor aqui não dá erro: dá um texto cheio de
  // "undefined", que é pior, porque parece que funcionou.
  const metadeLideranca = resLideranca.status === "OK"
    ? {
      letra: resLideranca.maturidade.letra,
      score100: resLideranca.maturidade.score100,
      label: resLideranca.maturidade.label ?? null,
    }
    : null;
  // O degrau da escada mora em `positioning.stage` no modelo público do pacote;
  // não existe campo `degrau` no topo. Sem isto, a síntese simplesmente OMITE a
  // frase da metade de IA — em silêncio.
  const metadeIA = pubIA && pubIA.status !== "INSUFFICIENT" && pubIA.metricas
    ? {
      indice: pubIA.metricas.indice,
      degrau: pubIA.positioning?.stage ? { nome: pubIA.positioning.stage } : null,
    }
    : null;

  const cruzamento = cruzar(metadeLideranca, metadeIA);

  return {
    perfil: perfil ?? null,
    lideranca: resLideranca,
    // O que o documento renderiza é o modelo PÚBLICO: 0–100, com os nomes das
    // dimensões junto. `lideranca` (cru, em 1–5) fica para quem calcula.
    liderancaPublica: paraPublicoLideranca(resLideranca, { lideranca }),
    ia: pubIA,
    cruzamento,
    sintese: cruzamento ? sinteseCruzada({ lideranca: metadeLideranca, ia: metadeIA, cruzamento }) : null,
    completo: resLideranca.status === "OK" && !!pubIA && pubIA.status !== "INSUFFICIENT",
  };
}
