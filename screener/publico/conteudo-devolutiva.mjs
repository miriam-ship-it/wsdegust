// =============================================================
// DIAGNÓSTICO BOOMIT · conteúdo autoral da devolutiva
//
// Um registro por item pontuável. A EVIDÊNCIA nunca mora aqui: ela é o texto
// literal da alternativa que a pessoa marcou, lido da definição. O que mora
// aqui é a leitura — hipótese, consequência possível, verificação — e a
// especialidade Boomit que o cenário toca.
//
// REGRAS DE ESCRITA (voz Boomit + briefing do Screener Público):
//   · Nenhum tratamento direto. O sujeito é o indicador, o processo, a área
//     ou o papel — nunca a pessoa.
//   · Nenhum rótulo de pessoa, nem elogio, nem defeito.
//   · Nenhuma causa afirmada. A hipótese é apresentada COMO hipótese.
//   · A especialidade Boomit só aparece quando o item que a sustenta foi
//     efetivamente respondido no degrau baixo. Não se fabrica fragilidade
//     para justificar oferta.
// =============================================================

/** As especialidades reais da Boomit. Nenhuma outra pode ser citada. */
export const ESPECIALIDADES = {
  lideranca: "Liderança e mentoria",
  pessoas: "Estratégia de pessoas",
  processos: "Redesenho de processos",
  ia: "Estratégia de IA",
  clone: "Clone IA",
  upskilling: "Upskilling",
  reskilling: "Reskilling",
  organizacao: "Redesenho organizacional",
};

/**
 * codigo → { hipotese, consequencia, verificacao, especialidade }
 *
 * `hipotese` abre sempre em linguagem condicional, como o briefing exige.
 * `verificacao` é a evidência que confirma ou refuta — nunca uma promessa.
 */
export const LEITURA = {
  // ---------- Estratégia do negócio e pessoas ----------
  EST01: {
    hipotese: "Um cenário possível é o de uma agenda de pessoas acionada por demanda, sem prioridade comum acordada com o negócio.",
    consequencia: "Nesse cenário, o esforço de desenvolvimento tende a se dispersar e o resultado fica difícil de defender em fórum de decisão.",
    verificacao: "Vale verificar se as iniciativas do último ciclo têm objetivo de negócio declarado, responsável nomeado e resultado acompanhado.",
    especialidade: "pessoas",
  },
  EST02: {
    hipotese: "O cenário descrito pode indicar decisões sobre pessoas sustentadas por percepção, sem evidência do trabalho realizado.",
    consequencia: "Decisão sem evidência tende a se repetir com o mesmo resultado, e a discussão volta ao mesmo ponto no ciclo seguinte.",
    verificacao: "Vale verificar quais evidências estiveram na mesa nas três últimas decisões relevantes de desempenho ou desenvolvimento.",
    especialidade: "pessoas",
  },
  EST03: {
    hipotese: "Um cenário possível é o de priorização por urgência, em que a renúncia não é explicitada.",
    consequencia: "Sem renúncia explícita, o orçamento se distribui para preservar iniciativas, e nenhuma recebe massa suficiente para produzir efeito observável.",
    verificacao: "Vale verificar o que foi eliminado na última rodada de priorização e com que critério.",
    especialidade: "pessoas",
  },
  EST04: {
    hipotese: "O relato pode indicar acompanhamento que termina na entrega, sem confronto entre resultado e investimento.",
    consequencia: "Nesse cenário, iniciativas que não produzem efeito permanecem no orçamento por ausência de evidência para interrompê-las.",
    verificacao: "Vale verificar se existe comparação antes e depois em ao menos uma iniciativa encerrada no último ano.",
    especialidade: "pessoas",
  },
  EST05: {
    hipotese: "Um cenário possível é o da agenda de pessoas entrando depois da decisão estratégica, na fase de execução.",
    consequencia: "Impacto humano identificado tarde costuma ser tratado como resistência, e não como restrição de capacidade prevista.",
    verificacao: "Vale verificar em que etapa a capacidade das equipes foi considerada na última decisão estratégica relevante.",
    especialidade: "organizacao",
  },
  EST06: {
    hipotese: "O cenário descrito pode indicar preparação de liderança por demanda ou por tema geral, sem diagnóstico comum das dificuldades observadas.",
    consequencia: "Preparação desconectada da dificuldade real tende a produzir satisfação alta e mudança baixa na atuação.",
    verificacao: "Vale verificar se a última ação de desenvolvimento de liderança partiu de dificuldade observada e se a aplicação foi acompanhada.",
    especialidade: "lideranca",
  },

  // ---------- Liderança e funcionalidade · lente Pessoa ----------
  LID01P: {
    hipotese: "Um cenário possível é o de ajuste de plano sem renegociação dos compromissos que a mudança afeta.",
    consequencia: "O compromisso anterior permanece de pé junto com o novo, e a capacidade real passa a ser a variável de ajuste.",
    verificacao: "Vale verificar o que saiu da lista na última mudança de prioridade, e com quem isso foi acordado.",
    especialidade: "lideranca",
  },
  LID02P: {
    hipotese: "O relato pode indicar conversas de desenvolvimento que terminam em impressão, sem mudança combinada e sem data de retomada.",
    consequencia: "Sem retomada marcada, a conversa não produz evidência de progresso e tende a se repetir com o mesmo conteúdo.",
    verificacao: "Vale verificar se a última conversa de desenvolvimento definiu uma prática a observar e uma data para revisitá-la.",
    especialidade: "lideranca",
  },
  LID03P: {
    hipotese: "Um cenário possível é o de decisão adiada à espera de dado completo, ou fechada por concordância em vez de critério.",
    consequencia: "O custo do adiamento raramente é contabilizado, e a decisão tardia chega quando as alternativas já se reduziram.",
    verificacao: "Vale verificar, numa decisão recente com prazo curto, quais suposições foram explicitadas e quando a revisão foi combinada.",
    especialidade: "lideranca",
  },
  LID04P: {
    hipotese: "O cenário descrito pode indicar conversas difíceis conduzidas sem critério preparado ou adiadas enquanto possível.",
    consequencia: "O tema adiado costuma retornar com custo maior, e a ausência de acompanhamento faz o acordo se dissolver.",
    verificacao: "Vale verificar quantas das conversas difíceis do último ano tiveram acordo registrado e retomada.",
    especialidade: "lideranca",
  },
  LID05P: {
    hipotese: "Um cenário possível é o de acompanhamento de indicadores acionado por prestação de contas, e não por condução do trabalho.",
    consequencia: "Indicador consultado depois do desvio informa, mas não permite corrigir a tempo.",
    verificacao: "Vale verificar quais sinais permitiriam agir antes do desvio e se eles estão disponíveis na cadência atual.",
    especialidade: "lideranca",
  },

  // ---------- Liderança e funcionalidade · lente Organização ----------
  LID01O: {
    hipotese: "Um cenário possível é o de mudança de prioridade comunicada sem redefinição das prioridades anteriores.",
    consequencia: "Cada área resolve o conflito de capacidade por conta própria, e a execução passa a divergir entre as áreas.",
    verificacao: "Vale verificar se a última mudança estratégica veio acompanhada do que deixou de ser prioridade.",
    especialidade: "organizacao",
  },
  LID02O: {
    hipotese: "O relato pode indicar queda de desempenho tratada como esforço individual, ou conforme o critério de cada liderança.",
    consequencia: "Sem padrão comum, casos semelhantes recebem tratamentos distintos, e a decisão fica difícil de sustentar.",
    verificacao: "Vale verificar se existe investigação de causa, plano com prazo e evidência esperada nos casos recentes.",
    especialidade: "lideranca",
  },
  LID03O: {
    hipotese: "Um cenário possível é o de direitos de decisão pouco explícitos, com responsabilidade distribuída entre níveis de aprovação.",
    consequencia: "Decisão sem dono definido tende a oscilar conforme quem está na sala, e a revisão não acontece.",
    verificacao: "Vale verificar, em três decisões relevantes recentes, quem decidiu, com que critério e quando foi revista.",
    especialidade: "organizacao",
  },
  LID04O: {
    hipotese: "O cenário descrito pode indicar que o custo de discordar varia conforme a pessoa, o momento ou o fórum.",
    consequencia: "Quando o dissenso tem custo variável, a informação que corrigiria a decisão deixa de circular antes dela.",
    verificacao: "Vale verificar o que aconteceu nas últimas vezes em que uma discordância relevante foi trazida em reunião.",
    especialidade: "lideranca",
  },
  LID05O: {
    hipotese: "Um cenário possível é o de metas existentes com acompanhamento irregular entre áreas.",
    consequencia: "Acompanhamento que não gera correção transforma o ritual em registro, e o desvio só aparece no fechamento.",
    verificacao: "Vale verificar quantas correções de rota documentadas ocorreram no último ciclo e em que fórum.",
    especialidade: "organizacao",
  },

  // ---------- Processos e dados ----------
  PRO01: {
    hipotese: "Um cenário possível é o de conhecimento de processo concentrado na experiência das pessoas.",
    consequencia: "Processo que vive na memória de quem executa não suporta automação, redesenho nem substituição planejada.",
    verificacao: "Vale verificar se os processos mais frequentes têm etapas, entradas, saídas, exceções e responsáveis acessíveis.",
    especialidade: "processos",
  },
  PRO02: {
    hipotese: "O relato pode indicar propriedade de processo assumida por quem resolve o problema, sem papéis e interfaces explícitos.",
    consequencia: "Sem dono definido, a melhoria depende de iniciativa individual e as interfaces entre áreas ficam sem responsável.",
    verificacao: "Vale verificar quem responde hoje pelo desempenho ponta a ponta dos dois processos mais críticos.",
    especialidade: "processos",
  },
  PRO03: {
    hipotese: "Um cenário possível é o de gargalos tratados quando geram reclamação, com melhoria local.",
    consequencia: "Melhoria local costuma deslocar a fila em vez de reduzi-la, e o retrabalho reaparece na etapa seguinte.",
    verificacao: "Vale verificar tempo de espera, retrabalho e passagens entre áreas no processo com mais reclamações.",
    especialidade: "processos",
  },
  PRO04: {
    hipotese: "O cenário descrito pode indicar dados usados conforme disponíveis, sem verificação comum de definição e origem.",
    consequencia: "Dado sem definição acordada produz discussão sobre o número, e não sobre a decisão.",
    verificacao: "Vale verificar se os indicadores usados em decisão têm definição, origem, atualização e responsável declarados.",
    especialidade: "processos",
  },
  PRO05: {
    hipotese: "Um cenário possível é o de análise iniciada pela ferramenta ou pelo dado disponível, sem pergunta decisória definida.",
    consequencia: "Análise sem pergunta entrega descrição, e a decisão continua sendo tomada por outro caminho.",
    verificacao: "Vale verificar se a última análise relevante declarava qual decisão apoiaria e qual critério de sucesso adotava.",
    especialidade: "processos",
  },
  PRO06: {
    hipotese: "O relato pode indicar mudança de processo iniciada pela solução desejada, sem descrição do estado atual.",
    consequencia: "Sem estado atual descrito, o efeito da mudança não pode ser medido e o desenho novo herda os problemas do antigo.",
    verificacao: "Vale verificar se a última mudança de processo registrou estado atual, estado futuro e efeitos esperados.",
    especialidade: "processos",
  },

  // ---------- Decisão e implementação de IA ----------
  IA01: {
    hipotese: "Um cenário possível é o de tema de IA identificado sem decisão, responsável ou caminho definido. A decisão consciente de não aplicar IA, quando sustentada por análise e com revisão prevista, é posição distinta da inação.",
    consequencia: "Sem decisão registrada, a adoção acontece de forma dispersa nas pontas, fora de critério e fora de controle.",
    verificacao: "Vale verificar se existe registro de decisão sobre IA — de aplicar ou de não aplicar — com responsável e data de revisão.",
    especialidade: "ia",
  },
  IA02: {
    hipotese: "O cenário descrito pode indicar escolha de aplicação de IA partindo da ferramenta disponível, sem análise do processo.",
    consequencia: "Ferramenta escolhida antes do processo tende a automatizar a etapa errada e a preservar o gargalo real.",
    verificacao: "Vale verificar, no último caso de uso considerado, se processo, dados, riscos e alternativas foram comparados antes da decisão.",
    especialidade: "ia",
  },
  IA03: {
    hipotese: "Um cenário possível é o de implantação técnica sem redesenho do processo, dos papéis e dos controles.",
    consequencia: "Quando o trabalho não é redesenhado, a ferramenta se soma à rotina em vez de substituir etapas, e o ganho não aparece.",
    verificacao: "Vale verificar se a última implantação definiu processo, papéis, treinamento, controles e acompanhamento de uso.",
    especialidade: "ia",
  },
  IA04: {
    hipotese: "O relato pode indicar divisão informal de trabalho entre pessoas, sistemas e agentes, com limites e revisão variáveis.",
    consequencia: "Sem limite declarado, a responsabilidade pelo resultado fica ambígua justamente quando o erro aparece.",
    verificacao: "Vale verificar, num processo com IA em uso, o que permanece humano, quem revisa e onde a decisão fica registrada.",
    especialidade: "ia",
  },
  IA05: {
    hipotese: "Um cenário possível é o de preparação limitada a comunicar a ferramenta ou a treinamento geral, sem prática no papel real.",
    consequencia: "Treinamento fora do trabalho real produz adoção declarada e uso baixo, e o risco migra para o uso não assistido.",
    verificacao: "Vale verificar a adoção efetiva e a qualidade do uso entre quem passou pela última capacitação.",
    especialidade: "upskilling",
  },
  IA06: {
    hipotese: "O cenário descrito pode indicar resultado de IA avaliado por entrega da ferramenta ou por volume de uso.",
    consequencia: "Volume de uso não distingue uso que melhora o trabalho de uso que apenas o desloca.",
    verificacao: "Vale verificar quais critérios definiriam ampliar, corrigir, restringir ou interromper uma aplicação em curso.",
    especialidade: "ia",
  },

  // ---------- Competências, capacidade e organização futura ----------
  FUT01: {
    hipotese: "Um cenário possível é o de identificação de competências apoiada em cargo, currículo ou percepção de liderança.",
    consequencia: "Capacidade estimada sem evidência do trabalho realizado produz alocação e desenvolvimento em alvo impreciso.",
    verificacao: "Vale verificar quais evidências sustentaram as três últimas indicações para projeto, promoção ou desenvolvimento.",
    especialidade: "pessoas",
  },
  FUT02: {
    hipotese: "O relato pode indicar decisões de talento dependentes de indicação ou percepção de uma única liderança.",
    consequencia: "Sem calibração, a decisão reproduz proximidade, e a prontidão real permanece desconhecida.",
    verificacao: "Vale verificar se as decisões recentes de mobilidade tiveram critério explícito, múltiplas evidências e registro.",
    especialidade: "pessoas",
  },
  FUT03: {
    hipotese: "Um cenário possível é o de necessidade de capacidade percebida quando a vaga abre ou a entrega já está comprometida.",
    consequencia: "Capacidade identificada tarde deixa contratar como única saída, na janela em que ela é mais cara e mais lenta.",
    verificacao: "Vale verificar se os cenários de negócio dos próximos doze meses estão traduzidos em capacidades e lacunas.",
    especialidade: "reskilling",
  },
  FUT04: {
    hipotese: "O cenário descrito pode indicar preparação acionada quando a demanda nova já precisa ser executada, ou resolvida por oferta de conteúdo.",
    consequencia: "Conteúdo oferecido sem lacuna priorizada e sem prática no trabalho raramente muda a forma de trabalhar.",
    verificacao: "Vale verificar se há evidência de aplicação no trabalho — e não apenas de participação — nas ações recentes.",
    especialidade: "upskilling",
  },
  FUT05: {
    hipotese: "Um cenário possível é o de tempo liberado por automação convertido diretamente em redução, ou redistribuído sem revisar demanda e capacidades.",
    consequencia: "Sem análise do trabalho remanescente, a capacidade liberada é reabsorvida e o ganho previsto não se confirma.",
    verificacao: "Vale verificar, onde houve automação, o que aconteceu com o tempo liberado e com as tarefas que permaneceram.",
    especialidade: "organizacao",
  },
  FUT06: {
    hipotese: "O relato pode indicar estrutura organizacional ainda não discutida diante das mudanças de estratégia, trabalho, processos ou IA. A ausência de discussão é, ela mesma, resposta diagnóstica.",
    consequencia: "Estrutura mantida enquanto o trabalho muda tende a concentrar decisão onde a informação já não está.",
    verificacao: "Vale verificar em que fórum e com que insumo a estrutura foi discutida pela última vez.",
    especialidade: "organizacao",
  },
};

/** Leitura por bloco — usada quando o bloco tem cobertura, no corpo do relatório. */
export const LEITURA_DE_BLOCO = {
  EST: {
    titulo: "Conexão entre Gente, Gestão e Negócio",
    foco: "como a agenda de pessoas se liga às prioridades do negócio, ao valor e ao retorno",
  },
  LID: {
    titulo: "Liderança em Duas Lentes",
    foco: "a atuação individual e a sustentação organizacional da liderança, lidas separadamente",
  },
  PRO: {
    titulo: "Processos, Dados e Papéis",
    foco: "visibilidade dos processos, qualidade dos dados e propriedade das decisões",
  },
  IA: {
    titulo: "Decisão e Implementação de IA",
    foco: "a decisão sobre aplicar IA e o que acontece com o trabalho depois dela",
  },
  FUT: {
    titulo: "Competências, Capacidade e Organização Futura",
    foco: "identificação de capacidades, preparação e desenho da organização diante da mudança",
  },
};

/** Rótulo do degrau, para a linha de evidência. Descritivo, sem juízo. */
export const ROTULO_DEGRAU = {
  E1: "prática ainda não estabelecida",
  E2: "prática existente, informal ou parcial",
  E3: "prática definida e repetível",
  E4: "prática gerenciada e revisada por evidência",
};
