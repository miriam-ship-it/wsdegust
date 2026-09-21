// =============================================================
// DIAGNÓSTICO BOOMIT · devolutiva executiva
//
// Monta as SETE páginas do relatório a partir do resultado do motor. Puro:
// entra resultado, sai estrutura. Quem desenha é o renderizador (tela e PDF
// consomem a MESMA estrutura — é o que impede a tela e o e-mail divergirem).
//
// A sequência de cada leitura é a aprovada:
//   evidência relatada → hipótese diagnóstica → consequência possível →
//   verificação necessária → prioridade.
//
// 🔒 Percepção individual não vira fato organizacional. Toda leitura de
//    contexto organizacional é explicitamente a percepção de UMA pessoa, e a
//    hipótese é apresentada como hipótese.
// =============================================================

import { definicao, item } from "./definicao.mjs";
import { ESPECIALIDADES, LEITURA, LEITURA_DE_BLOCO, ROTULO_DEGRAU } from "./conteudo-devolutiva.mjs";

const NOME_BLOCO = {
  EST: "Estratégia do negócio e pessoas",
  LID: "Liderança e funcionalidade",
  PRO: "Processos e dados",
  IA: "Decisão e implementação de IA",
  FUT: "Competências, capacidade e organização futura",
};

/** O texto literal da alternativa marcada — a evidência, sem paráfrase. */
export function evidenciaLiteral(codigo, respostas, def = definicao()) {
  const it = item(codigo, def);
  if (!it) return null;
  const escolhido = respostas?.[codigo];
  const op = it.opcoes.find((o) => o.codigo === escolhido);
  if (!op) return null;
  return { codigo, pergunta: it.pergunta, opcao: op.codigo, texto: op.texto, bloco: it.bloco, lente: it.lente };
}

/** Uma prioridade completa, na sequência aprovada. */
export function montarPrioridade(p, respostas, def = definicao()) {
  const ev = evidenciaLiteral(p.codigo, respostas, def);
  const leitura = LEITURA[p.codigo];
  if (!ev || !leitura) return null;
  return {
    codigo: p.codigo,
    bloco: p.bloco,
    bloco_nome: NOME_BLOCO[p.bloco],
    lente: ev.lente,
    degrau: p.degrau,
    evidencia: {
      pergunta: ev.pergunta,
      resposta_literal: ev.texto,
      rotulo: ROTULO_DEGRAU[p.degrau],
    },
    hipotese: leitura.hipotese,
    consequencia: leitura.consequencia,
    verificacao: leitura.verificacao,
    especialidade: { chave: leitura.especialidade, nome: ESPECIALIDADES[leitura.especialidade] },
  };
}

/**
 * Cenários de solução Boomit. Um por prioridade, no máximo três, e SÓ quando
 * a prioridade tem item que a sustenta. Especialidade repetida é agrupada —
 * três cenários apontando para a mesma frente viram um cenário com três
 * sinais, que é o que ele de fato é.
 */
export function cenariosBoomit(prioridades) {
  const porEspecialidade = new Map();
  for (const p of prioridades) {
    const k = p.especialidade.chave;
    if (!porEspecialidade.has(k)) porEspecialidade.set(k, { especialidade: p.especialidade, sinais: [] });
    porEspecialidade.get(k).sinais.push({
      codigo: p.codigo,
      bloco_nome: p.bloco_nome,
      resposta_literal: p.evidencia.resposta_literal,
      hipotese: p.hipotese,
      verificacao: p.verificacao,
    });
  }
  return [...porEspecialidade.values()].slice(0, 3).map((c) => ({
    especialidade: c.especialidade,
    sinais: c.sinais,
    cenario_de_transformacao: cenarioDeTransformacao(c.especialidade.chave),
    proximo_passo:
      "Uma conversa de leitura conjunta destes sinais, ou um piloto delimitado em um processo, permite testar a hipótese antes de qualquer investimento maior.",
    evidencia_que_decide: c.sinais.map((s) => s.verificacao),
  }));
}

/** O que precisaria ser construído, por especialidade. Descritivo, não oferta. */
function cenarioDeTransformacao(chave) {
  return {
    lideranca:
      "Um cenário possível de transformação parte das dificuldades de liderança efetivamente observadas, define a mudança de atuação esperada e acompanha a aplicação no trabalho — em vez de tema geral de formação.",
    pessoas:
      "Um cenário possível de transformação conecta as iniciativas de pessoas a objetivos de negócio declarados, com responsável, evidência e comparação entre resultado e investimento.",
    processos:
      "Um cenário possível de transformação torna visíveis os processos críticos — etapas, interfaces, exceções, donos — e mede fluxo, retrabalho e espera antes de qualquer intervenção ou automação.",
    ia: "Um cenário possível de transformação separa a decisão sobre onde aplicar IA da implantação, define critérios de continuidade e redesenha o trabalho em vez de apenas somar a ferramenta à rotina.",
    clone:
      "Um cenário possível de transformação encapsula conhecimento crítico que hoje vive na experiência de poucas pessoas, tornando-o consultável sem depender de disponibilidade individual.",
    upskilling:
      "Um cenário possível de transformação leva a preparação para o papel real, com prática no trabalho e evidência de aplicação — não apenas registro de participação.",
    reskilling:
      "Um cenário possível de transformação traduz os cenários de negócio em capacidades necessárias e organiza mobilidade e requalificação antes da janela em que contratar é a única saída.",
    organizacao:
      "Um cenário possível de transformação revisa papéis, interfaces e níveis de decisão à luz do trabalho que efetivamente mudou, incluindo o destino da capacidade liberada.",
  }[chave];
}

/** Resumo executivo. Sem nota quando a nota não é publicável. */
function resumoExecutivo(pub, prioridades) {
  const n = prioridades.length;
  const blocos = [...new Set(prioridades.map((p) => p.bloco_nome))];
  const linhas = [];
  linhas.push(
    `O instrumento registrou ${pub.cobertura.considerados} itens respondidos com posição e ${pub.cobertura.na} marcados como sem exposição suficiente. Os itens sem exposição ficam fora do cálculo e não representam baixa maturidade.`
  );
  if (n) {
    linhas.push(
      `Os principais pontos de atenção deste ciclo concentram-se em ${blocos.join(", ")}. Cada um é apresentado adiante com a resposta que o sustenta, a hipótese correspondente e a verificação que a confirma ou refuta.`
    );
  } else {
    linhas.push(
      "Nenhum item foi respondido nos dois degraus iniciais da progressão. A leitura adiante descreve as práticas relatadas e as condições de governança."
    );
  }
  linhas.push(
    `A leitura de governança é ${pub.governanca.rotulo.toLowerCase()} e condiciona a interpretação de prontidão, sem ser compensada pelos demais blocos.`
  );
  return linhas;
}

/** A leitura de um bloco: distribuição relatada, sem atribuir degrau conclusivo sem cobertura. */
function leituraDeBloco(b) {
  const meta = LEITURA_DE_BLOCO[b.id];
  const d = b.distribuicao;
  const base = {
    id: b.id,
    titulo: meta.titulo,
    foco: meta.foco,
    considerados: b.considerados,
    na: b.na,
    distribuicao: d,
    pontos: b.pontos,
  };
  if (!b.suficiente) {
    return {
      ...base,
      suficiente: false,
      leitura:
        "Este bloco não reuniu cobertura suficiente neste ciclo: a maior parte dos itens ficou sem exposição declarada. Não se atribui aqui um degrau conclusivo — a ausência de cobertura é informação sobre o alcance da observação, não sobre a maturidade da organização.",
    };
  }
  const iniciais = d.E1 + d.E2;
  const consolidadas = d.E3 + d.E4;
  return {
    ...base,
    suficiente: true,
    leitura:
      `Das ${b.considerados} respostas com posição neste bloco, ${consolidadas} descrevem práticas definidas ou gerenciadas e ${iniciais} descrevem práticas ainda não estabelecidas ou informais. ` +
      (iniciais > consolidadas
        ? "A concentração nos degraus iniciais indica onde a prática ainda depende de pessoas e de momento."
        : consolidadas > iniciais
        ? "A concentração nos degraus superiores indica prática reconhecível, o que sustenta ampliar escopo com acompanhamento."
        : "A distribuição equilibrada entre os degraus indica prática que varia conforme a frente observada."),
  };
}

/** A leitura das duas lentes de liderança. Nunca colapsa numa média. */
function leituraDeLideranca(lid) {
  const dir = {
    pessoa_a_frente:
      "A atuação individual relatada descreve práticas mais consolidadas do que as atribuídas à sustentação organizacional. Esse desalinhamento é sinal para conversa: costuma indicar esforço individual compensando ausência de padrão comum — e não é prova de causalidade.",
    organizacao_a_frente:
      "A sustentação organizacional relatada descreve práticas mais consolidadas do que as atribuídas à atuação individual. Esse desalinhamento é sinal para conversa e costuma indicar estrutura disponível ainda pouco utilizada no papel.",
    proximas:
      "As duas lentes descrevem práticas em patamar próximo. O alinhamento entre atuação individual e sustentação organizacional reduz o risco de leitura distorcida de qualquer uma delas.",
    insuficiente:
      "Uma das lentes não reuniu cobertura suficiente neste ciclo. A comparação entre atuação individual e sustentação organizacional não é apresentada, para não sugerir desalinhamento onde há ausência de observação.",
  }[lid.direcao];
  return {
    titulo: "Liderança em Duas Lentes",
    direcao: lid.direcao,
    pessoa: lid.pessoa,
    organizacao: lid.organizacao,
    leitura: dir,
    nota:
      "As duas lentes permanecem separadas por desenho. Reduzi-las a um único número esconderia justamente o desalinhamento que interessa à conversa.",
  };
}

/** Plano de 30, 60 e 90 dias — derivado das prioridades, sem prometer resultado. */
function plano(prioridades) {
  if (!prioridades.length) {
    return {
      titulo: "Próximos Passos",
      vazio: true,
      leitura:
        "Sem pontos de atenção nos degraus iniciais, o próximo passo útil é ampliar a observação: repetir o instrumento com outras pessoas do mesmo contexto permite distinguir percepção individual de padrão organizacional.",
      etapas: [],
    };
  }
  const p1 = prioridades[0];
  return {
    titulo: "Plano de 30, 60 e 90 Dias",
    vazio: false,
    etapas: [
      {
        janela: "30 dias",
        foco: "Verificar as hipóteses antes de decidir",
        acoes: prioridades.map((p) => p.verificacao),
      },
      {
        janela: "60 dias",
        foco: `Delimitar um piloto em ${p1.bloco_nome.toLowerCase()}`,
        acoes: [
          `Escolher um processo ou fórum único onde o sinal de ${p1.codigo} aparece, descrever o estado atual e definir a evidência que indicará mudança.`,
          "Nomear responsável e data de revisão, para que a decisão fique registrada mesmo que o resultado seja interromper.",
        ],
      },
      {
        janela: "90 dias",
        foco: "Comparar o observado com o esperado",
        acoes: [
          "Confrontar a evidência coletada com a hipótese inicial e registrar o que foi confirmado, refutado ou permanece em aberto.",
          "Decidir ampliar, corrigir ou interromper com base no que a evidência mostrou, e não na expectativa inicial.",
        ],
      },
    ],
  };
}

/**
 * A devolutiva completa, em sete páginas.
 * `pub` é a projeção pública do motor; `respostas` é o mapa bruto de respostas.
 */
export function montarDevolutiva(pub, respostas, contexto = {}, def = definicao()) {
  const prioridades = pub.prioridades
    .map((p) => montarPrioridade(p, respostas, def))
    .filter(Boolean);
  const blocos = pub.blocos.map(leituraDeBloco);
  const porId = Object.fromEntries(blocos.map((b) => [b.id, b]));

  return {
    versao_questionario: pub.versao_questionario,
    nota_publicavel: pub.nota_publicavel,
    aviso_pontuacao: pub.aviso_pontuacao,
    paginas: [
      {
        n: 1,
        titulo: "Resumo Executivo",
        capa: {
          evento: contexto.evento_nome ?? null,
          cliente: contexto.evento_cliente ?? null,
          respondente: contexto.nome ?? null,
          empresa: contexto.empresa ?? null,
          data: contexto.data ?? null,
        },
        perfil: pub.perfil,
        resumo: resumoExecutivo(pub, prioridades),
        aviso_de_interpretacao:
          "Esta leitura parte das respostas de uma pessoa sobre o próprio trabalho e sobre o contexto em que atua. Ela descreve percepção situada neste momento, não um retrato verificado da organização. As hipóteses apresentadas existem para serem testadas com evidência, e o instrumento não substitui diagnóstico conduzido com múltiplas fontes.",
      },
      {
        n: 2,
        titulo: "Resultado Geral e Leitura dos Blocos",
        nota_geral: pub.geral.pontos,
        sem_nota: !pub.nota_publicavel,
        blocos_sem_cobertura: pub.geral.blocos_sem_nota,
        blocos: blocos.map((b) => ({ id: b.id, titulo: b.titulo, considerados: b.considerados, na: b.na, distribuicao: b.distribuicao, suficiente: b.suficiente })),
      },
      {
        n: 3,
        titulo: "Estratégia, Pessoas e Liderança",
        blocos: [porId.EST, porId.LID].filter(Boolean),
        lideranca: leituraDeLideranca(pub.lideranca),
      },
      {
        n: 4,
        titulo: "Processos, Dados e IA",
        blocos: [porId.PRO, porId.IA].filter(Boolean),
      },
      {
        n: 5,
        titulo: "Competências, Capacidade e Futuro do Trabalho",
        blocos: [porId.FUT].filter(Boolean),
      },
      {
        n: 6,
        titulo: "Governança e Cenários de Solução",
        governanca: {
          gate: pub.governanca.gate,
          rotulo: pub.governanca.rotulo,
          leitura: pub.governanca.leitura,
          item_determinante: pub.governanca.item_determinante,
          nota: "A governança é lida como condição, e não como pontos. A pior condição entre os três itens governa a interpretação de prontidão e não é compensada por resultado alto nos demais blocos.",
        },
        prioridades,
        cenarios: cenariosBoomit(prioridades),
      },
      { n: 7, ...plano(prioridades) },
    ],
  };
}
