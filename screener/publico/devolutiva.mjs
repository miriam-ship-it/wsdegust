// =============================================================
// DIAGNÓSTICO BOOMIT · devolutiva executiva
//
// Monta as páginas do relatório a partir do resultado do motor. Puro: entra
// resultado, sai estrutura. Quem desenha é o renderizador — tela e PDF consomem
// a MESMA estrutura, e é isso que impede os dois divergirem com o tempo.
//
// A sequência de cada leitura é a aprovada:
//   evidência relatada → hipótese diagnóstica → consequência possível →
//   verificação necessária → prioridade.
//
// 🔒 O respondente nunca lê código. Nem "EST01", nem "E1", nem "GOV02". O que
//    chega é a pergunta, a alternativa literal marcada e o estágio em português.
//
// 🔒 Número não entra em prosa explicativa. Ele aparece onde é dado — no
//    indicador, na nota da dimensão — e a prosa diz o que ele significa.
//
// 🔒 Percepção individual não vira fato organizacional. Toda leitura de
//    contexto é explicitamente a percepção de UMA pessoa, e a hipótese é
//    apresentada como hipótese.
// =============================================================

import { definicao, item } from "./definicao.mjs";
import {
  ESPECIALIDADES, ESTAGIOS, LEITURA, LEITURA_DE_BLOCO,
  ROTULO_CONTEXTO, ROTULO_DEGRAU,
} from "./conteudo-devolutiva.mjs";

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
  const op = it.opcoes.find((o) => o.codigo === respostas?.[codigo]);
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
    // O código do estágio NÃO entra: nenhum renderizador o usa, e deixá-lo aqui
    // só cria uma porta para "E2" aparecer numa tela. O que fica é o rótulo
    // em português.
    evidencia: { pergunta: ev.pergunta, resposta_literal: ev.texto, rotulo: ROTULO_DEGRAU[p.degrau] },
    hipotese: leitura.hipotese,
    consequencia: leitura.consequencia,
    verificacao: leitura.verificacao,
    especialidade: { chave: leitura.especialidade, nome: ESPECIALIDADES[leitura.especialidade] },
  };
}

/**
 * Cenários de solução Boomit. Um por prioridade, no máximo três, e SÓ quando a
 * prioridade tem item que a sustenta. Especialidade repetida é agrupada — três
 * cenários apontando para a mesma frente viram um cenário com três sinais, que
 * é o que ele de fato é.
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
      "Um cenário possível de trabalho parte das dificuldades de liderança efetivamente observadas, define a mudança de atuação esperada e acompanha a aplicação no trabalho — em vez de tema geral de formação.",
    pessoas:
      "Um cenário possível de trabalho conecta as iniciativas de pessoas a objetivos de negócio declarados, com responsável, evidência e comparação entre resultado e investimento.",
    processos:
      "Um cenário possível de trabalho torna visíveis os processos críticos — etapas, interfaces, exceções, donos — e mede fluxo, retrabalho e espera antes de qualquer intervenção ou automação.",
    ia: "Um cenário possível de trabalho separa a decisão sobre onde aplicar IA da implantação, define critérios de continuidade e redesenha o trabalho em vez de apenas somar a ferramenta à rotina.",
    clone:
      "Um cenário possível de trabalho encapsula conhecimento crítico que hoje vive na experiência de poucas pessoas, tornando-o consultável sem depender de disponibilidade individual.",
    upskilling:
      "Um cenário possível de trabalho leva a preparação para o papel real, com prática no trabalho e evidência de aplicação — não apenas registro de participação.",
    reskilling:
      "Um cenário possível de trabalho traduz os cenários de negócio em capacidades necessárias e organiza mobilidade e requalificação antes da janela em que contratar é a única saída.",
    organizacao:
      "Um cenário possível de trabalho revisa papéis, interfaces e níveis de decisão à luz do trabalho que efetivamente mudou, incluindo o destino da capacidade liberada.",
  }[chave];
}

/** Leitura da maturidade geral. Sem citar número: o indicador já o mostra. */
export function leituraDaEmpresa(pub) {
  const p = pub.empresa.pontos;
  if (p == null) {
    return {
      titulo: "Cobertura Insuficiente para uma Leitura Geral",
      paragrafos: [
        "As dimensões respondidas não reuniram cobertura suficiente para compor um índice geral. Isso é informação sobre o alcance da observação, não sobre a maturidade da organização.",
      ],
    };
  }
  if (p <= 25) {
    return {
      titulo: "Prática Ainda Acionada por Demanda",
      paragrafos: [
        "A operação descrita responde quando alguém puxa. Não há, na maior parte das dimensões, uma forma reconhecível a que recorrer quando a pessoa de referência não está.",
        "É o patamar em que automatizar tende a produzir resultado instável: a ferramenta encontra processo que muda a cada execução, e o ganho não se sustenta entre um ciclo e outro.",
      ],
    };
  }
  if (p <= 50) {
    return {
      titulo: "Prática Reconhecível, Ainda Dependente de Pessoas",
      paragrafos: [
        "A operação descrita já saiu do improviso: há forma reconhecível na maneira de conduzir o trabalho e de tratar processos. O que sustenta esse resultado, porém, varia conforme quem está na posição — funciona enquanto as mesmas pessoas estiverem lá, e oscila quando elas mudam.",
        "É o patamar em que a organização tem base suficiente para automatizar e ainda não tem a estrutura que decide o que automatizar, com que critério e o que permanece humano.",
      ],
    };
  }
  if (p <= 75) {
    return {
      titulo: "Prática Definida e Sustentada por Padrão Comum",
      paragrafos: [
        "A operação descrita tem forma definida, responsáveis nomeados e tende a se repetir independentemente de quem conduz. A continuidade deixa de depender de memória individual.",
        "É o patamar em que automatizar amplia o que já funciona — e em que a qualidade da decisão sobre onde aplicar passa a valer mais do que a escolha da ferramenta.",
      ],
    };
  }
  return {
    titulo: "Prática Revisada pelo Resultado que Produz",
    paragrafos: [
      "A operação descrita é acompanhada pela evidência que gera: há critério para manter, corrigir ou interromper, e a revisão acontece antes de o desvio aparecer no fechamento.",
      "É o patamar em que a discussão deixa de ser sobre adotar e passa a ser sobre o que a organização quer construir — inclusive o que decide não fazer.",
    ],
  };
}

function descricaoDoNivel(n) {
  return {
    1: "A inteligência artificial aparece nas respostas como automação de tarefas: ferramentas em uso, ganhos percebidos, decisão tomada caso a caso. É um nível real e não é pouco — mas é o primeiro.",
    2: "A inteligência artificial já é aplicada com olho no processo, e o ganho aparece como margem: faz-se o que já se fazia com menos desperdício. A decisão sobre onde aplicar, porém, ainda não sai da própria área.",
    3: "A inteligência artificial já sustenta escolhas que mudam o que a organização entrega, e não apenas como entrega. A leitura atravessa áreas, e o ganho deixa de ser só eficiência.",
    4: "A inteligência artificial entra na formulação da estratégia, conectando decisão e execução. O desenho do trabalho é revisto junto com a ferramenta, e não depois dela.",
    5: "A organização desenvolve a própria tecnologia e trata a inteligência artificial como capacidade interna, não como ferramenta contratada.",
  }[n];
}

/** Leitura do nível de IA, ancorada no contraste com a maturidade geral. */
export function leituraDeIA(pub) {
  const nivel = pub.ia.nivel;
  const ia = pub.ia.pontos;
  const emp = pub.empresa.pontos;
  if (!nivel) {
    return {
      titulo: "Cobertura Insuficiente para Ler o Uso de IA",
      nivel: null,
      paragrafos: [
        "As respostas sobre decisão e implementação de inteligência artificial não reuniram cobertura suficiente para posicionar a organização entre os cinco níveis.",
      ],
    };
  }
  const paragrafos = [descricaoDoNivel(nivel.n)];
  if (ia != null && emp != null) {
    if (emp - ia >= 10) {
      paragrafos.push(
        "O contraste com a maturidade geral da empresa é o dado central desta leitura. A organização é mais madura em quase tudo do que é em inteligência artificial, e isso significa que o limite não está na capacidade de operar: está na estrutura que deveria governar o uso."
      );
    } else if (ia - emp >= 10) {
      paragrafos.push(
        "O uso de inteligência artificial está à frente da maturidade geral da organização. É um cenário específico e mais arriscado do que parece: a ferramenta avança sobre processos e decisões que ainda não têm a forma que sustentaria esse avanço."
      );
    } else {
      paragrafos.push(
        "O uso de inteligência artificial acompanha a maturidade geral da organização. O avanço em um tende a esbarrar no outro, o que torna a decisão sobre onde aplicar mais importante do que a velocidade de adotar."
      );
    }
  }
  return { titulo: nivel.nome, nivel, paragrafos };
}

/** Leitura da distância entre as duas lentes. NUNCA cita os números. */
export function leituraDaDistancia(pub) {
  const d = pub.distancia_de_lentes;
  const base = {
    distancia: exibir(d.pontos),
    direcao: d.direcao,
    nota: "As duas lentes permanecem separadas por desenho. Reduzi-las a um único número esconderia justamente o afastamento que interessa à conversa.",
  };
  if (d.pontos == null) {
    return {
      ...base,
      titulo: "Cobertura Insuficiente nas Duas Lentes",
      paragrafos: [
        "Uma das lentes não reuniu cobertura suficiente neste ciclo. A comparação entre atuação individual e sustentação organizacional não é apresentada, para não sugerir afastamento onde há ausência de observação.",
      ],
    };
  }
  if (d.direcao === "proximas") {
    return {
      ...base,
      titulo: "Atuação e Contexto em Patamar Próximo",
      paragrafos: [
        "As práticas que dependem da própria conduta e as que dependem da organização são descritas em estágio semelhante. O que a pessoa faz e o que o contexto sustenta caminham juntos.",
        "Alinhamento assim reduz o risco de leitura distorcida de qualquer uma das duas, e costuma significar que o padrão comum já faz parte do trabalho — não apenas do discurso.",
      ],
    };
  }
  if (d.direcao === "pessoa_a_frente") {
    return {
      ...base,
      titulo: "Atuação Individual à Frente do Contexto",
      paragrafos: [
        "As práticas que dependem da própria conduta são descritas com forma reconhecível: há critério antes de decidir, há acompanhamento depois, há retomada combinada. Já as que dependem da organização — o padrão comum entre lideranças, o que acontece quando alguém discorda, como a queda de desempenho é tratada — aparecem em estágio bem anterior.",
        "Um afastamento assim costuma significar uma coisa só: o que funciona hoje é sustentado por esforço individual, e não por padrão comum. Isso funciona — e funciona enquanto as mesmas pessoas estiverem nas mesmas posições.",
        "O ponto sensível não é o desempenho de quem responde: é a fragilidade da continuidade. Prática que mora na pessoa sai da organização junto com ela — numa promoção, numa troca de área, numa saída. E o custo dessa saída só aparece depois, quando já não há a quem recorrer.",
      ],
    };
  }
  return {
    ...base,
    titulo: "Contexto à Frente da Atuação Descrita",
    paragrafos: [
      "As práticas atribuídas à organização são descritas com forma mais consolidada do que as que dependem da própria conduta. Há padrão comum disponível, e ele ainda é pouco usado no papel.",
      "Um afastamento nessa direção costuma indicar estrutura que existe e não chegou à rotina de quem decide — o que é um problema de adoção, e não de desenho.",
      "É a situação mais barata de resolver das duas, porque o que falta já está construído: falta percorrer o caminho entre a regra e a prática.",
    ],
  };
}

/** Resumo executivo. Sem citar número. */
function resumoExecutivo(pub, prioridades) {
  const blocos = [...new Set(prioridades.map((p) => p.bloco_nome))];
  const linhas = [];
  const emp = pub.empresa.pontos;
  const ia = pub.ia.pontos;
  if (emp != null && ia != null && emp - ia >= 10) {
    linhas.push(
      "A base operacional está mais madura do que a estrutura que deveria governá-la. Processos e prática de gestão sustentam automação; a decisão sobre inteligência artificial ainda não acompanha."
    );
  } else {
    linhas.push(
      "A leitura descreve como a gestão de pessoas, a liderança, os processos e a decisão sobre inteligência artificial acontecem hoje, do ponto de vista de quem convive com eles."
    );
  }
  if (pub.cobertura.na) {
    linhas.push(
      "Algumas práticas ficaram marcadas como sem exposição suficiente. Elas saem do cálculo e não representam maturidade baixa: ausência de observação é informação sobre o alcance da leitura."
    );
  }
  if (blocos.length) {
    linhas.push(
      `Os principais pontos de atenção deste ciclo concentram-se em ${blocos.join(", ")}. Cada um é apresentado adiante com a resposta que o sustenta, a hipótese correspondente e a verificação que a confirma ou refuta.`
    );
  } else {
    linhas.push(
      "Nenhuma prática foi descrita nos dois estágios iniciais. A leitura adiante descreve o que foi relatado e as condições de governança."
    );
  }
  linhas.push(
    `A condição de governança deste ciclo — ${pub.governanca.rotulo} — condiciona a interpretação de prontidão e não é compensada pelas demais dimensões.`
  );
  return linhas;
}

/**
 * O número como ele é EXIBIDO: inteiro.
 *
 * 🔑 A precisão decimal continua no resultado privado (`scores_json`), que é o
 *    que se audita. Na devolutiva, "42,8 de 100" sugere uma precisão que o
 *    instrumento não tem — a escala nem foi validada ainda. Arredondar aqui,
 *    num lugar só, é o que impede a tela e o PDF divergirem no arredondamento.
 */
export const exibir = (n) => (n == null ? null : Math.round(n));

/** Concordância: "1 descreve", "2 descrevem". Zero é plural em pt-BR. */
const verbo = (n) => (n === 1 ? "descreve" : "descrevem");

/** A leitura de uma dimensão. */
function leituraDeBloco(b) {
  const meta = LEITURA_DE_BLOCO[b.id];
  const d = b.distribuicao;
  const base = {
    id: b.id, titulo: meta.titulo, foco: meta.foco,
    considerados: b.considerados, na: b.na, distribuicao: d, pontos: exibir(b.pontos),
  };
  if (!b.suficiente) {
    return {
      ...base,
      suficiente: false,
      leitura:
        "Esta dimensão não reuniu cobertura suficiente neste ciclo: a maior parte das práticas ficou sem exposição declarada. Não se atribui aqui uma leitura conclusiva — a ausência de cobertura é informação sobre o alcance da observação, não sobre a maturidade da organização.",
    };
  }
  const iniciais = d.E1 + d.E2;
  const consolidadas = d.E3 + d.E4;
  return {
    ...base,
    suficiente: true,
    leitura:
      `Das práticas descritas nesta dimensão, ${consolidadas} ${verbo(consolidadas)} um jeito já definido de fazer e ${iniciais} ${verbo(iniciais)} algo que ainda depende de quem conduz. ` +
      (iniciais > consolidadas
        ? "A concentração nos estágios iniciais mostra onde a prática ainda depende de pessoas e de momento."
        : consolidadas > iniciais
        ? "A concentração nos estágios mais consolidados indica prática reconhecível, o que sustenta ampliar escopo com acompanhamento."
        : "A distribuição equilibrada indica prática que varia conforme a frente observada."),
  };
}

/** Plano de 30, 60 e 90 dias — derivado das prioridades, sem prometer resultado. */
function plano(prioridades) {
  if (!prioridades.length) {
    return {
      titulo: "Próximos Passos",
      vazio: true,
      leitura:
        "Sem pontos de atenção nos estágios iniciais, o próximo passo útil é ampliar a observação: repetir o instrumento com outras pessoas do mesmo contexto permite distinguir percepção individual de padrão organizacional.",
      etapas: [],
    };
  }
  const p1 = prioridades[0];
  return {
    titulo: "Um Caminho de 30, 60 e 90 Dias",
    vazio: false,
    abertura:
      "A sequência é deliberadamente barata no começo. Nenhuma ação da primeira janela exige orçamento, ferramenta ou projeto — todas são de verificação, porque as leituras deste documento são hipóteses até que alguém as confronte com o que de fato aconteceu.",
    etapas: [
      { janela: "30 dias", foco: "Verificar as hipóteses antes de decidir", acoes: prioridades.map((p) => p.verificacao) },
      {
        janela: "60 dias",
        foco: `Delimitar um piloto em ${p1.bloco_nome.toLowerCase()}`,
        acoes: [
          "Escolher um processo ou fórum único onde o sinal aparece, descrever o estado atual e definir a evidência que indicará mudança.",
          "Decidir, por escrito e antes de automatizar, para onde vai o tempo que for liberado.",
          "Nomear responsável e data de revisão, para que a decisão fique registrada mesmo que o resultado seja interromper.",
        ],
      },
      {
        janela: "90 dias",
        foco: "Confrontar o observado com o esperado",
        acoes: [
          "Comparar a evidência coletada com a hipótese inicial e registrar o que foi confirmado, refutado ou permanece em aberto.",
          "Decidir ampliar, corrigir ou interromper com base no que a evidência mostrou — inclusive quando a decisão for interromper.",
        ],
      },
    ],
  };
}

/**
 * A devolutiva completa.
 * `pub` é a projeção pública do motor; `respostas` é o mapa bruto de respostas.
 */
export function montarDevolutiva(pub, respostas, contexto = {}, def = definicao()) {
  const prioridades = pub.prioridades.map((p) => montarPrioridade(p, respostas, def)).filter(Boolean);
  const blocos = pub.blocos.map(leituraDeBloco);
  const porId = Object.fromEntries(blocos.map((b) => [b.id, b]));

  return {
    versao_questionario: pub.versao_questionario,
    nota_publicavel: pub.nota_publicavel,
    escala: ESTAGIOS.map((e) => ({ nome: e.nome, desc: e.desc })),
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
        // Já rotulado e na ordem: quem renderiza nunca precisa conhecer o
        // código do item para saber o que aquela linha significa.
        contexto: Object.entries(ROTULO_CONTEXTO)
          .map(([codigo, rotulo]) => ({ rotulo, texto: pub.perfil?.[codigo]?.texto ?? null }))
          .filter((x) => x.texto),
        resumo: resumoExecutivo(pub, prioridades),
        aviso_de_interpretacao:
          "Esta leitura parte das respostas de uma pessoa sobre o próprio trabalho e sobre o contexto em que atua. Ela descreve percepção situada neste momento, não um retrato verificado da organização. As hipóteses apresentadas existem para serem testadas com evidência, e o instrumento não substitui diagnóstico conduzido com múltiplas fontes.",
      },
      {
        n: 2,
        titulo: "Índice de Maturidade da Empresa",
        indice: exibir(pub.empresa.pontos),
        leitura: leituraDaEmpresa(pub),
        derivados: [
          {
            nome: "Maturidade de Gestão",
            pontos: exibir(pub.derivados.gestao.pontos),
            desc: "Como se decide sobre pessoas, se prioriza, se acompanha resultado e se conduz o trabalho no dia a dia.",
          },
          {
            nome: "Maturidade de Processos",
            pontos: exibir(pub.derivados.processos.pontos),
            desc: "Visibilidade, propriedade, desempenho e redesenho dos processos, e a qualidade dos dados que alimentam decisão.",
          },
        ],
        nota:
          "Este índice descreve a maturidade geral da organização. A leitura de inteligência artificial não entra aqui — ela tem seção própria, porque misturá-las esconderia justamente o contraste que interessa.",
        nota_na: pub.cobertura.na
          ? "Práticas marcadas como sem exposição suficiente ficam fora do cálculo, no numerador e no denominador. Ausência de observação é informação sobre o alcance da leitura, não maturidade baixa."
          : null,
      },
      {
        n: 3,
        titulo: "Diagnóstico de IA",
        niveis: pub.ia.niveis,
        nivel_atual: pub.ia.nivel?.n ?? null,
        leitura: leituraDeIA(pub),
        fecho:
          "Subir de nível não é usar mais ferramenta. O primeiro se esgota quando as tarefas óbvias já foram automatizadas; o seguinte exige decidir onde aplicar com critério de processo, e o outro exige enxergar fora da própria área. É nessa passagem que decidir sobre inteligência artificial sem estrutura cobra o preço — porque a decisão passa a afetar áreas que não estavam na conversa.",
      },
      { n: 4, titulo: "Retrato por Dimensão", blocos },
      { n: 5, titulo: "Leitura em Duas Lentes", lentes: leituraDaDistancia(pub) },
      {
        n: 6,
        titulo: "Uso de IA e Estrutura de Uso",
        blocos: [porId.PRO, porId.IA].filter(Boolean),
        paragrafos: [
          "As respostas descrevem ferramentas em uso e ganhos percebidos. O que não aparece com a mesma clareza é quem decide onde aplicar, com que critério, o que permanece humano e o que define continuar ou interromper. São duas coisas diferentes, e a segunda é a que sustenta a primeira.",
          "Usar inteligência artificial hoje é acessível a qualquer área, com qualquer orçamento, sem autorização de ninguém. É justamente por ser acessível que o uso acontece antes da estrutura — e a diferença entre as organizações deixou de estar em usar. Está em ter processo descrito, papéis definidos, revisão humana nomeada e critério de parada.",
        ],
        nota:
          "A decisão consciente de não aplicar inteligência artificial, quando vem de análise de processos, riscos e benefícios, com justificativa registrada e data de revisão, é posição madura — e o método a trata como tal. O que a leitura distingue da maturidade é a ausência de decisão, não a decisão de não adotar.",
      },
      {
        n: 7,
        titulo: "O Destino do Tempo Liberado",
        blocos: [porId.FUT].filter(Boolean),
        paragrafos: [
          "Automação não devolve tarefa. Devolve tempo — e o lugar que era da rotina continua ali, vazio. Essa é a decisão que a maior parte das organizações não toma explicitamente, e que por isso acaba tomada por omissão.",
          "Quando uma ferramenta assume as atribuições repetitivas de uma área, o que sobra não é uma equipe menor: é a mesma equipe com uma janela de tempo aberta. Se ninguém decide o que entra nessa janela, ela é reabsorvida pela própria rotina em poucos meses — e o ganho previsto não se confirma, sem que nada visível tenha dado errado.",
        ],
        provocacao: {
          titulo: "Uma pergunta que vale fazer antes da próxima automação",
          pergunta:
            "Nas atribuições elegíveis para automação desta área, quando elas saírem da rotina: para onde vai o tempo, e quem decide isso?",
          notas: [
            "As três respostas que aparecem na prática são muito diferentes entre si — converter direto em redução de quadro, redistribuir entre as funções atuais, ou comparar tarefas, demanda futura e capacidade antes de decidir. Só a terceira preserva a escolha. As outras duas a entregam ao acaso, e uma delas trata como questão de custo o que é, na origem, uma questão de desenho.",
            "Há ainda o caso em que a atribuição some e o cargo perde função. A pessoa fica sem lugar na estrutura — não sem valor. Distinguir as duas coisas é o que separa um redesenho de um corte.",
          ],
        },
      },
      {
        n: 8,
        titulo: "Governança e Cenários de Solução",
        blocos: [porId.EST, porId.LID].filter(Boolean),
        governanca: {
          // idem: o renderizador usa `rotulo`, nunca o código do gate.
          rotulo: pub.governanca.rotulo,
          leitura: pub.governanca.leitura,
          nota:
            "A governança é lida como condição, e não como pontos. A condição mais frágil entre os três controles governa a interpretação de prontidão e não é compensada por índice alto nas demais dimensões.",
        },
        prioridades,
        cenarios: cenariosBoomit(prioridades),
      },
      { n: 9, ...plano(prioridades) },
    ],
  };
}
