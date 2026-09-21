// =============================================================
// DIAGNÓSTICO BOOMIT · 40 itens — motor determinístico
//
// Entra: { CTX01: 'P3', EST01: 'E2', ..., GOV03: 'G2' }
// Sai:   ResultadoV1 — puro, sem DOM, sem rede, sem relógio.
//
// AS REGRAS APROVADAS, uma a uma:
//   · CTX01–CTX03 NÃO pontuam. São perfil, e só orientam a linguagem da
//     devolutiva (papel, alcance, autoridade).
//   · E1–E4 pontuam. O mapa numérico é PROVISÓRIO enquanto o documento
//     aprovado não definir os valores — ver `definicao.notaPublicavel()`.
//   · N/A fica FORA do numerador E do denominador. Não é baixa maturidade:
//     é ausência de exposição. Bloco sem cobertura mínima não recebe nota e a
//     devolutiva não atribui degrau conclusivo a ele.
//   · GOV01–GOV03 são GATE. A pior condição entre os três condiciona a leitura
//     de prontidão e NÃO é compensada por resultado alto nos outros blocos.
//   · A nota geral é média ponderada, 20% para cada um dos cinco blocos
//     pontuados. É proposta de piloto, não validação psicométrica.
//   · Liderança permanece em DUAS LENTES (Pessoa e Organização). O motor nunca
//     colapsa as duas numa média que esconda o desalinhamento.
// =============================================================

import { definicao, itensAtivos, item, notaPublicavel, versoes } from "./definicao.mjs";

/** Os quatro degraus que pontuam, na ordem da progressão. */
export const DEGRAUS = ["E1", "E2", "E3", "E4"];
/** As três condições de governança, da pior para a melhor. */
export const CONDICOES_GOV = ["G1", "G2", "G3"];

export const ROTULO_GOV = {
  G1: {
    rotulo: "Exige tratamento antes de ampliar",
    leitura:
      "Há prática essencial de governança ausente. Enquanto isso não for tratado, ampliar o uso de IA aumenta a exposição — independentemente do resultado nos demais blocos.",
  },
  G2: {
    rotulo: "Condicionada",
    leitura:
      "Existe cuidado, mas ele depende de pessoas e de momento. Ampliar o uso é possível com salvaguardas explícitas e com os controles consolidados em paralelo.",
  },
  G3: {
    rotulo: "Controles reconhecíveis",
    leitura:
      "Os controles mínimos são reconhecíveis. Isso sustenta ampliar o uso com acompanhamento, e não dispensa revisão periódica.",
  },
};

/** Respostas de contexto, com o texto literal da alternativa escolhida. */
export function perfil(respostas, def = definicao()) {
  const out = {};
  for (const it of def.itens.filter((i) => i.bloco === "CTX")) {
    const escolhido = respostas?.[it.codigo];
    const op = it.opcoes.find((o) => o.codigo === escolhido);
    out[it.codigo] = op ? { opcao: op.codigo, texto: op.texto } : null;
  }
  return out;
}

/** Itens pontuáveis de um bloco (exclui CTX e GOV por construção). */
function itensDoBloco(blocoId, def) {
  return itensAtivos(def).filter((i) => i.bloco === blocoId && i.pontua);
}

/**
 * Cobertura e distribuição de degraus de um conjunto de itens.
 * N/A entra em `na` e sai do denominador — é o coração da regra aprovada.
 */
export function cobertura(codigos, respostas, def = definicao()) {
  let respondidos = 0, na = 0;
  const distribuicao = { E1: 0, E2: 0, E3: 0, E4: 0 };
  const porDegrau = { E1: [], E2: [], E3: [], E4: [] };
  for (const cod of codigos) {
    const r = respostas?.[cod];
    if (!r) continue;
    if (r === "NA") { na += 1; continue; }
    if (!DEGRAUS.includes(r)) continue;
    respondidos += 1;
    distribuicao[r] += 1;
    porDegrau[r].push(cod);
  }
  const total = codigos.length;
  return {
    total,
    considerados: respondidos,
    na,
    sem_resposta: total - respondidos - na,
    pct: total ? respondidos / total : 0,
    distribuicao,
    por_degrau: porDegrau,
  };
}

/** Pontos 0–100 de um conjunto, pelo mapa PROVISÓRIO. `null` sem cobertura. */
export function pontosProvisorios(cov, def = definicao()) {
  if (!cov.considerados) return null;
  const mapa = def.pontuacao.mapa_provisorio;
  let soma = 0;
  for (const d of DEGRAUS) soma += mapa[d] * cov.distribuicao[d];
  return Math.round((soma / cov.considerados) * 10) / 10;
}

/** Um bloco pontuado, com cobertura, distribuição e pontos provisórios. */
export function avaliarBloco(blocoId, respostas, def = definicao()) {
  const meta = def.blocos.find((b) => b.id === blocoId);
  const itens = itensDoBloco(blocoId, def);
  const cov = cobertura(itens.map((i) => i.codigo), respostas, def);
  const suficiente = cov.pct >= def.pontuacao.cobertura_minima_do_bloco;
  return {
    id: blocoId,
    nome: meta.nome,
    peso: meta.peso,
    cobertura: cov,
    suficiente,
    pontos_provisorios: suficiente ? pontosProvisorios(cov, def) : null,
  };
}

/**
 * Liderança nas DUAS lentes. O sufixo P/O do código é o que separa — é assim
 * que o documento aprovado organiza os dez itens (LID01P…LID05O).
 */
export function lentesDeLideranca(respostas, def = definicao()) {
  const itens = itensDoBloco("LID", def);
  const pessoa = itens.filter((i) => i.codigo.endsWith("P")).map((i) => i.codigo);
  const org = itens.filter((i) => i.codigo.endsWith("O")).map((i) => i.codigo);
  const cp = cobertura(pessoa, respostas, def);
  const co = cobertura(org, respostas, def);
  const pp = pontosProvisorios(cp, def);
  const po = pontosProvisorios(co, def);
  let direcao = "insuficiente";
  if (pp != null && po != null) {
    const dif = pp - po;
    if (Math.abs(dif) < 12) direcao = "proximas";
    else direcao = dif > 0 ? "pessoa_a_frente" : "organizacao_a_frente";
  }
  return {
    pessoa: { cobertura: cp, pontos_provisorios: pp },
    organizacao: { cobertura: co, pontos_provisorios: po },
    direcao,
  };
}

/** O gate: a PIOR condição entre GOV01–GOV03 governa. */
export function gateDeGovernanca(respostas, def = definicao()) {
  const itens = def.itens.filter((i) => i.gate && i.ativo);
  const respondidos = itens
    .map((i) => ({ codigo: i.codigo, valor: respostas?.[i.codigo] }))
    .filter((x) => CONDICOES_GOV.includes(x.valor));
  if (!respondidos.length) {
    return { gate: null, rotulo: "Cobertura insuficiente", leitura:
      "Não há itens de governança respondidos em número suficiente para ler o gate.", itens: {} };
  }
  let pior = respondidos[0];
  for (const x of respondidos) {
    if (CONDICOES_GOV.indexOf(x.valor) < CONDICOES_GOV.indexOf(pior.valor)) pior = x;
  }
  const mapa = {};
  for (const x of respondidos) mapa[x.codigo] = x.valor;
  return {
    gate: pior.valor,
    item_determinante: pior.codigo,
    rotulo: ROTULO_GOV[pior.valor].rotulo,
    leitura: ROTULO_GOV[pior.valor].leitura,
    itens: mapa,
    cobertura: { total: itens.length, considerados: respondidos.length },
  };
}

/**
 * Nota geral PROVISÓRIA: média ponderada dos cinco blocos pontuados, 20% cada.
 * Bloco sem cobertura suficiente sai da conta e os pesos são renormalizados —
 * a alternativa (tratar ausência como zero) violaria a regra do N/A.
 */
export function geralProvisorio(blocos) {
  const validos = blocos.filter((b) => b.pontos_provisorios != null);
  if (!validos.length) return { pontos_provisorios: null, blocos_considerados: [], blocos_sem_nota: blocos.map((b) => b.id) };
  const pesoTotal = validos.reduce((s, b) => s + b.peso, 0);
  const soma = validos.reduce((s, b) => s + b.pontos_provisorios * b.peso, 0);
  return {
    pontos_provisorios: Math.round((soma / pesoTotal) * 10) / 10,
    blocos_considerados: validos.map((b) => b.id),
    blocos_sem_nota: blocos.filter((b) => b.pontos_provisorios == null).map((b) => b.id),
  };
}

/**
 * Até três prioridades, por EVIDÊNCIA e não por nota: itens respondidos no
 * degrau mais baixo vêm primeiro (E1 antes de E2), e no máximo uma por bloco,
 * para a devolutiva não virar uma lista de um problema só.
 */
export function prioridades(respostas, def = definicao(), limite = 3) {
  const candidatos = [];
  for (const it of itensAtivos(def)) {
    if (!it.pontua) continue;
    const r = respostas?.[it.codigo];
    if (r !== "E1" && r !== "E2") continue;
    candidatos.push({ codigo: it.codigo, bloco: it.bloco, lente: it.lente, degrau: r, ordem: it.ordem });
  }
  candidatos.sort((a, b) => (a.degrau === b.degrau ? a.ordem - b.ordem : a.degrau === "E1" ? -1 : 1));
  const vistos = new Set();
  const out = [];
  for (const c of candidatos) {
    if (vistos.has(c.bloco)) continue;
    vistos.add(c.bloco);
    out.push(c);
    if (out.length === limite) break;
  }
  return out;
}

/**
 * O resultado completo. PRIVADO — é o que vai para `relatorios.scores_json`.
 * O que o respondente vê é `publicar()`.
 */
export function calcular(respostas, def = definicao()) {
  const pontuados = def.blocos.filter((b) => b.tipo === "pontuado").map((b) => avaliarBloco(b.id, respostas, def));
  const todos = itensAtivos(def).filter((i) => i.pontua).map((i) => i.codigo);
  return {
    versoes: versoes(),
    nota_publicavel: notaPublicavel(def),
    provisorio: !notaPublicavel(def),
    perfil: perfil(respostas, def),
    cobertura_geral: cobertura(todos, respostas, def),
    blocos: pontuados,
    lideranca: lentesDeLideranca(respostas, def),
    governanca: gateDeGovernanca(respostas, def),
    geral: geralProvisorio(pontuados),
    prioridades: prioridades(respostas, def),
    respostas_brutas: { ...respostas },
  };
}

/**
 * A projeção que o navegador, o PDF e o e-mail recebem.
 *
 * 🔒 Enquanto E1–E4 não for confirmado, TODA pontuação numérica é removida —
 *    geral, por bloco e por lente. O que sobra é descrição das próprias
 *    respostas (quantos itens em cada degrau), o gate de governança (regra
 *    aprovada, que não depende de número) e as prioridades por evidência.
 *    Isso permite entregar devolutiva sem publicar uma nota não validada.
 */
export function publicar(resultado) {
  const publicavel = resultado.nota_publicavel === true;
  const semNota = (o) => (publicavel ? o : null);
  return {
    versao_questionario: resultado.versoes.questionario,
    nota_publicavel: publicavel,
    aviso_pontuacao: publicavel
      ? null
      : "A escala numérica de maturidade deste instrumento ainda está em validação. Esta devolutiva apresenta o que suas respostas indicam, sem atribuir uma nota final.",
    perfil: resultado.perfil,
    cobertura: {
      considerados: resultado.cobertura_geral.considerados,
      na: resultado.cobertura_geral.na,
      total: resultado.cobertura_geral.total,
    },
    geral: { pontos: semNota(resultado.geral.pontos_provisorios), blocos_sem_nota: resultado.geral.blocos_sem_nota },
    blocos: resultado.blocos.map((b) => ({
      id: b.id,
      nome: b.nome,
      suficiente: b.suficiente,
      pontos: semNota(b.pontos_provisorios),
      distribuicao: b.cobertura.distribuicao,
      na: b.cobertura.na,
      considerados: b.cobertura.considerados,
    })),
    lideranca: {
      direcao: resultado.lideranca.direcao,
      pessoa: {
        distribuicao: resultado.lideranca.pessoa.cobertura.distribuicao,
        considerados: resultado.lideranca.pessoa.cobertura.considerados,
        pontos: semNota(resultado.lideranca.pessoa.pontos_provisorios),
      },
      organizacao: {
        distribuicao: resultado.lideranca.organizacao.cobertura.distribuicao,
        considerados: resultado.lideranca.organizacao.cobertura.considerados,
        pontos: semNota(resultado.lideranca.organizacao.pontos_provisorios),
      },
    },
    governanca: {
      gate: resultado.governanca.gate,
      rotulo: resultado.governanca.rotulo,
      leitura: resultado.governanca.leitura,
      item_determinante: resultado.governanca.item_determinante ?? null,
    },
    prioridades: resultado.prioridades.map((p) => ({ codigo: p.codigo, bloco: p.bloco, degrau: p.degrau })),
  };
}
