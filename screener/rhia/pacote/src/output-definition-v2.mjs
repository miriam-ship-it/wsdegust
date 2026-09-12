export const VERSION = "2.0.0-pilot";

export const DIMENSIONS = {
  EST: { name: "Estratégia e valor para o negócio", axis: "leadership" },
  TAL: { name: "Talento e capacidades", axis: "process" },
  DES: { name: "Desenvolvimento e aprendizagem", axis: "process" },
  INF: { name: "Influência e mobilização", axis: "leadership" },
  DAD: { name: "Dados e evidências", axis: "process" },
  IA: { name: "Adoção responsável de IA", axis: "ai" }
};

export const STAGES = [
  {
    id: "P1", index: 1, min: 0, max: 1999, name: "Operacional Ágil",
    headline: "Responder melhor é o ganho disponível agora.",
    reading: "A área concentra energia em demandas imediatas. Há iniciativas úteis, mas conexão com prioridades, aprendizagem e evidências ainda depende de pessoas e ocasiões específicas.",
    next: "Escolher um problema recorrente, explicitar o resultado esperado e testar um ciclo curto com responsável, evidência e revisão."
  },
  {
    id: "P2", index: 2, min: 2000, max: 3999, name: "Gestor Tático",
    headline: "A execução começa a ganhar método.",
    reading: "Práticas repetíveis e alguns indicadores já aparecem, porém decisões e aprendizagem ainda não formam um sistema consistente de gestão.",
    next: "Transformar boas iniciativas em rotina: critério de priorização, registro de decisão, indicador e cadência de revisão."
  },
  {
    id: "P3", index: 3, min: 4000, max: 5999, name: "Estrategista de Escala",
    headline: "O desafio deixa de ser fazer e passa a ser escalar com evidência.",
    reading: "Estratégia, processos de pessoas e dados começam a operar de forma integrada. O valor está em ampliar consistência sem perder contexto e segurança.",
    next: "Consolidar padrões mínimos, comparar resultados entre contextos e interromper o que não produz aprendizagem ou valor."
  },
  {
    id: "P4", index: 4, min: 6000, max: 7999, name: "Arquiteto de Soluções",
    headline: "A área desenha sistemas, não apenas iniciativas.",
    reading: "Decisões combinam prioridades, capacidades, evidências e riscos. Soluções são desenhadas para diferentes públicos e acompanhadas ao longo do ciclo.",
    next: "Fortalecer governança adaptativa, interoperabilidade e métricas de adoção, resultado, equidade e risco."
  },
  {
    id: "P5", index: 5, min: 8000, max: 10000, name: "Criador de Tecnologia",
    headline: "Tecnologia e desenho organizacional tornam-se capacidades de transformação.",
    reading: "A área combina conhecimento de pessoas, dados e IA para criar ou compor soluções de alto valor, com experimentação, medição e governança contínuas.",
    next: "Criar mecanismos de aprendizagem do portfólio, revisão independente de risco e transferência responsável de capacidades.",
    clarification: "Este nível não exige tecnologia proprietária, modelos próprios ou agentes de IA. Exige capacidade consistente de desenhar, integrar, validar e governar soluções adequadas ao contexto."
  }
];

export const GAP_OUTPUTS = {
  AHEAD: { label: "Capacidade observada à frente da referência", text: "As práticas relatadas parecem superar o alcance formal informado. A oportunidade é converter essa capacidade em influência, mandato e impacto sustentável." },
  ALIGNED: { label: "Capacidade e referência alinhadas", text: "As práticas relatadas são coerentes com o alcance e a autoridade informados. O próximo salto depende de ampliar consistência, impacto e aprendizagem." },
  ONE_BELOW: { label: "Um degrau entre capacidade e referência", text: "Existe uma distância administrável entre o que a posição demanda e o que as práticas hoje sustentam. Uma prioridade bem escolhida pode reduzir essa distância." },
  TWO_OR_MORE_BELOW: { label: "Distância estrutural em relação à referência", text: "A diferença sugere necessidade de foco: tentar avançar em tudo tende a dispersar energia. É recomendável construir fundamentos antes de ampliar a complexidade." },
  UNCERTAIN: { label: "Referência de posição inconclusiva", text: "Alcance e autoridade informados apontam para referências diferentes. O resultado descreve as práticas da área, mas não afirma uma lacuna de papel." }
};

export const SIGNATURES = {
  BALANCED: { label: "Evolução equilibrada", text: "Liderança, processos e IA avançam em ritmo semelhante. A prioridade é aumentar a qualidade do sistema como um todo." },
  AI_AHEAD_OF_MANAGEMENT: { label: "IA à frente do sistema de gestão", text: "A experimentação com IA parece avançar mais rápido que os mecanismos de estratégia, desenvolvimento e influência. Há risco de pilotos sem incorporação sustentável." },
  HUMAN_SYSTEM_AHEAD_OF_AI: { label: "Sistema humano pronto para acelerar IA", text: "Estratégia e processos de pessoas parecem mais maduros que a adoção de IA. A área dispõe de base para avançar por casos de uso claros e governados." },
  LEADERSHIP_AHEAD_OF_PROCESS: { label: "Direção forte, processo ainda irregular", text: "Há leitura estratégica e capacidade de mobilização, mas os processos não sustentam a mesma consistência na execução." },
  PROCESS_WITHOUT_MOBILIZATION: { label: "Processo consistente, mobilização limitada", text: "As práticas têm método e evidência, porém ainda não influenciam decisões e prioridades na mesma intensidade." },
  EMERGING_INTEGRATION: { label: "Integração em construção", text: "Há sinais complementares de evolução, sem uma assimetria dominante. O ganho está em conectar decisões, aprendizagem, dados e IA em um ciclo explícito." },
  GOVERNANCE_BLOCKED: { label: "Potencial limitado por governança", text: "Existem capacidades aproveitáveis, mas a condição de governança impede expansão responsável até que o risco seja contido." }
};

export const TENSIONS = {
  STRATEGY_EXECUTION_GAP: { high: "EST", low: "DES", label: "Estratégia sem ciclo de desenvolvimento", text: "A direção estratégica aparece com mais força que a conversão em desenvolvimento acompanhado." },
  AI_CAPABILITY_GAP: { high: "IA", low: "TAL", label: "Adoção de IA sem capacidade distribuída", text: "A prática de IA avança mais rápido que a preparação das pessoas para utilizá-la com autonomia e critério." },
  EVIDENCE_INFLUENCE_GAP: { high: "DAD", low: "INF", label: "Evidência sem influência", text: "A área produz ou usa dados, mas ainda tem dificuldade para convertê-los em compromisso e decisão." },
  DEVELOPMENT_VALUE_GAP: { high: "DES", low: "EST", label: "Desenvolvimento pouco conectado ao valor", text: "A aprendizagem parece mais estruturada que sua conexão explícita com prioridades do negócio." },
  MOBILIZATION_EVIDENCE_GAP: { high: "INF", low: "DAD", label: "Mobilização com pouca evidência", text: "A capacidade de engajar supera a disciplina de medir, comparar e revisar decisões." },
  TALENT_TECH_GAP: { high: "TAL", low: "IA", label: "Talento à frente da adoção tecnológica", text: "A gestão de capacidades está mais estruturada que o uso responsável de IA para potencializá-la." }
};

export const GOVERNANCE = {
  CRITICAL: { rank: 1, label: "Condição crítica", text: "Há evidência de prática que pode expor pessoas ou a organização. Suspender a expansão, conter o risco e definir controles mínimos precede qualquer escala." },
  ATTENTION: { rank: 2, label: "Atenção necessária", text: "Existem orientações, mas sua aplicação ainda é informal ou inconsistente. Somente experimentos controlados devem avançar." },
  MONITORED: { rank: 3, label: "Controles monitorados", text: "Há controles básicos observáveis. O próximo passo é verificar aplicação, incidentes, exceções e aprendizado." },
  ESTABLISHED: { rank: 4, label: "Governança estabelecida", text: "Controles, rastreabilidade e revisão aparecem integrados à prática. Isso habilita escala responsável, sem eliminar a necessidade de monitoramento." },
  INSUFFICIENT: { rank: 0, label: "Informação insuficiente", text: "As respostas não permitem verificar a condição mínima de governança. Não se recomenda ampliar o uso antes de esclarecer dados, decisão humana e validação." }
};

export const NIST_FUNCTIONS = {
  GOVERN: { name: "Governar", instruction: "Definir papéis, limites, aprovações, registro de decisões, prestação de contas e resposta a incidentes." },
  MAP: { name: "Mapear", instruction: "Descrever contexto, pessoas afetadas, dados, finalidade, benefícios, riscos e alternativas não baseadas em IA." },
  MEASURE: { name: "Medir", instruction: "Testar qualidade, utilidade, vieses, privacidade, segurança, adoção e efeitos esperados e não esperados." },
  MANAGE: { name: "Gerenciar", instruction: "Priorizar riscos, decidir continuar, corrigir ou interromper, monitorar mudanças e comunicar responsabilidades." }
};

export const ROLE_LENSES = {
  HR_LEADER: "Use a leitura para priorizar o portfólio de pessoas, pactuar decisões com o negócio e desenvolver capacidades na equipe.",
  CEO_OWNER: "Use a leitura para avaliar se a área de pessoas dispõe de mandato, dados e governança para gerar valor e sustentar transformação.",
  BUSINESS_LEADER: "Use a leitura para qualificar a parceria com RH, explicitar problemas de negócio e compartilhar responsabilidade pelos resultados de pessoas.",
  SPECIALIST: "Use a leitura para tornar sua contribuição mais conectada à decisão, à evidência e à adoção responsável no contexto real.",
  OTHER: "Use a leitura a partir de sua esfera de atuação, distinguindo o que você pode decidir, influenciar e levar para pactuação."
};

export const DIMENSION_GUIDANCE = {
  EST: { strength: "prioridades de pessoas conectadas ao negócio", risk: "iniciativas sem escolha explícita de valor", action: "formular uma hipótese de valor e um critério de renúncia", indicator: "percentual de prioridades de pessoas com resultado de negócio e critério de sucesso explícitos" },
  TAL: { strength: "capacidades críticas tratadas como decisão de negócio", risk: "lacunas de capacidade tratadas apenas por percepção", action: "mapear uma capacidade crítica, evidência atual e alternativa de desenvolvimento", indicator: "cobertura das capacidades críticas com evidência e plano ativo" },
  DES: { strength: "desenvolvimento acompanhado por aplicação e resultado", risk: "aprendizagem desconectada do trabalho", action: "ligar uma ação de desenvolvimento a comportamento, aplicação e resultado esperado", indicator: "taxa de aplicação observada após ciclos de desenvolvimento" },
  INF: { strength: "evidências convertidas em compromisso e decisão", risk: "RH consultado tarde ou apenas para executar", action: "levar uma decisão de pessoas com opções, evidências, riscos e recomendação", indicator: "decisões relevantes de pessoas nas quais RH participa antes da definição da solução" },
  DAD: { strength: "dados usados para decidir e revisar", risk: "métricas de atividade confundidas com impacto", action: "definir linha de base, indicador de resultado e cadência de revisão", indicator: "percentual de iniciativas revisadas por resultado, não apenas entrega" },
  IA: { strength: "IA integrada ao trabalho com supervisão e aprendizagem", risk: "uso disperso, pouco verificável ou desconectado de valor", action: "selecionar um caso de uso, mapear risco e testar com supervisão humana", indicator: "casos de uso com finalidade, responsável, validação e decisão de continuidade registradas" }
};

export const EXECUTIVE_QUESTIONS = [
  "Qual decisão de pessoas precisa melhorar — e que evidência mostrará que melhorou?",
  "Que capacidade da área hoje depende de uma pessoa e precisa tornar-se processo?",
  "Onde a IA reduz fricção sem empobrecer julgamento, vínculo ou responsabilidade?",
  "Que risco impediria a expansão de um caso de uso, mesmo diante de ganhos aparentes?",
  "O que deixaremos de fazer para concentrar recursos na prioridade escolhida?"
];

export const DISCLAIMER = "Esta devolutiva é uma hipótese orientativa baseada nas evidências comportamentais autodeclaradas neste preenchimento. Não é diagnóstico conclusivo, avaliação individual, auditoria, benchmark de mercado ou prova de causalidade. Recomenda-se confrontá-la com dados, documentos, observação e perspectivas de outras pessoas.";
