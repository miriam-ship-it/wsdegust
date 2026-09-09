// =============================================================
// SCREENER_IA_V2 — Diagnóstico de nível de maturidade em IA (4 níveis)
//
// Reformulação do bloco de IA seguindo o Guia da Carol ("Estratégia de
// Implantação de IA com Foco em ROI"): a maturidade é uma POSIÇÃO NUMA ESCADA
// (Nível 1–4) que cruza DOIS EIXOS — capacidade TÉCNICA de uso da IA × maturidade
// da LIDERANÇA para extrair valor. A liderança funciona como TETO ("não coloque
// agente de Nível 3 numa área de liderança Nível 1").
//
// Módulo NOVO e isolado (não toca o instrumento V1). Puro: sem I/O de runtime.
//
// Anti-viés (desenho de analista):
//  - escala ANCORADA EM COMPORTAMENTO (não "concordo/discordo") → sem aquiescência;
//  - nenhuma opção é "a certa" (todos os níveis neutros e legítimos) → sem
//    desejabilidade/assertividade;
//  - foco em prática observada, não intenção;
//  - "Não sei" explícito e FORA do cálculo (não vira zero);
//  - âncora factual (pede evidência: inventário, linha de base, política);
//  - raiz variada (você/o líder × a área/empresa) → reduz método comum.
//  A ordem das opções é apresentada do menor ao maior nível; o front DEVE
//  embaralhar (mantendo "Não sei" por último) — ver §ordem no doc de racional.
// =============================================================

/** Os 4 níveis da escada (nomes do Guia da Carol). */
export const NIVEIS = [
  { n: 1, code: "OPERACIONAL_AGIL", name: "Operacional Ágil",
    resumo: "IA em tarefas individuais; ganho de produtividade pessoal; o processo não muda." },
  { n: 2, code: "GESTOR_TATICO", name: "Gestor Tático",
    resumo: "IA embutida em processos da área; processos visíveis; decisão por dados; margem." },
  { n: 3, code: "ESTRATEGISTA_ESCALA", name: "Estrategista de Escala",
    resumo: "IA sustenta decisões estratégicas e novas receitas; escala." },
  { n: 4, code: "ARQUITETO_IA", name: "Arquiteto de IA",
    resumo: "IA no núcleo do negócio, solução proprietária; força híbrida pessoas + agentes." },
];

/** Senioridade → nível ESPERADO (calibrável; ponto de partida para o piloto). */
export const SENIORIDADE = [
  { code: "analista", label: "Analista / operacional — executo tarefas", esperado: 1 },
  { code: "especialista", label: "Especialista / sênior — referência técnica, sem gestão", esperado: 2 },
  { code: "gerencia", label: "Coordenação / gerência — lidero pessoas e/ou processos", esperado: 3 },
  { code: "diretoria", label: "Diretoria / C-level — defino estratégia", esperado: 4 },
];

/** Eixos que a posição combina. */
export const EIXOS = {
  tecnico: { code: "tecnico", name: "Uso técnico da IA", papel: "o quê/como a IA é usada" },
  lideranca: { code: "lideranca", name: "Maturidade da liderança", papel: "direciona, mede, redesenha e sustenta o valor" },
};

const na = { na: true, text: "Não sei / não se aplica." };

/**
 * Questões que definem o nível. Cada uma tem 4 alternativas (uma por nível) + NA.
 * `axis` = tecnico | lideranca. `dimension` = rótulo curto para a devolutiva.
 * A opção de nível 1 absorve o piso reativo/ausente (uso quase inexistente).
 */
export const QUESTOES = [
  { code: "Q1", axis: "tecnico", dimension: "Alcance do uso",
    prompt: "Como a IA é usada hoje na sua área?",
    options: [
      { level: 1, text: "Quase não é usada; quando ocorre, é para tarefas individuais (redigir, resumir, pesquisar), sem mudar o processo." },
      { level: 2, text: "Está embutida em processos da área, com fluxo e responsáveis definidos." },
      { level: 3, text: "Sustenta decisões estratégicas e novas fontes de receita ou escala." },
      { level: 4, text: "Está no núcleo do produto/serviço, como solução proprietária que diferencia a empresa." },
      na,
    ] },
  { code: "Q2", axis: "tecnico", dimension: "Dados e integração",
    prompt: "Sobre os dados e sistemas que a IA usa:",
    options: [
      { level: 1, text: "Não há dados organizados nem integração; o uso é pontual, com dados soltos ou manuais." },
      { level: 2, text: "Há dados com qualidade e acesso definidos, integrados aos casos prioritários." },
      { level: 3, text: "Dados e arquitetura sustentam vários casos, com monitoramento e ciclo de vida." },
      { level: 4, text: "Existe uma plataforma de dados/IA própria, base de vantagem competitiva." },
      na,
    ] },
  { code: "Q3", axis: "tecnico", dimension: "Governança dos usos",
    prompt: "Sobre regra, autonomia e responsabilidade da IA:",
    options: [
      { level: 1, text: "Não há regra nem registro; cada um usa como quer." },
      { level: 2, text: "Há política, papéis e limites de autonomia definidos para os usos." },
      { level: 3, text: "Há auditoria, métricas de qualidade e processo de incidentes ativos." },
      { level: 4, text: "Governança madura integra ética, compliance e ciclo de vida dos agentes ao negócio." },
      na,
    ] },
  { code: "Q4", axis: "lideranca", dimension: "Direção estratégica",
    prompt: "Como a liderança decide onde usar IA?",
    options: [
      { level: 1, text: "Não decide; o uso surge por iniciativa individual, sem conexão com a estratégia." },
      { level: 2, text: "Conecta os usos de IA às prioridades da área ou da empresa." },
      { level: 3, text: "Usa IA para destravar metas estratégicas e abrir novas frentes de valor." },
      { level: 4, text: "Antecipa movimentos de mercado e cria barreiras competitivas com IA." },
      na,
    ] },
  { code: "Q5", axis: "lideranca", dimension: "Medição de valor (ROI)",
    prompt: "Como se mede o resultado dos usos de IA?",
    options: [
      { level: 1, text: "Não se mede; fala-se por percepção geral." },
      { level: 2, text: "Há linha de base, indicadores e um responsável pelo acompanhamento." },
      { level: 3, text: "Benefícios, custos e riscos são revistos e orientam decisões de continuar ou ampliar." },
      { level: 4, text: "O valor da IA é gerido como carteira, ligado a receita/margem no plano de negócio." },
      na,
    ] },
  { code: "Q6", axis: "lideranca", dimension: "Estrutura e cargos",
    prompt: "Diante da IA, o que acontece com cargos e competências?",
    options: [
      { level: 1, text: "Nada muda; a estrutura segue igual, mesmo com IA em uso." },
      { level: 2, text: "Cargos e competências começam a ser reclassificados (o que é feito com IA vs. sem IA)." },
      { level: 3, text: "Há redesenho de área com requalificação e recolocação conduzidos." },
      { level: 4, text: "A estrutura é desenhada para uma força híbrida (pessoas + agentes), com papéis de orquestração." },
      na,
    ] },
  { code: "Q7", axis: "lideranca", dimension: "Prontidão do líder",
    prompt: "Como o líder da área costuma conduzir decisões e problemas?",
    options: [
      { level: 1, text: "Decide por intuição, ignora dados e tende a repetir os mesmos erros." },
      { level: 2, text: "Usa dados, cria processos documentados e busca a causa raiz dos problemas." },
      { level: 3, text: "Além disso, experimenta ferramentas novas e desenvolve o time para a mudança." },
      { level: 4, text: "Orquestra pessoas e agentes, antecipa cenários e forma outros líderes." },
      na,
    ] },
  { code: "Q8", axis: "lideranca", dimension: "Pessoas e mudança",
    prompt: "Como a área lida com o efeito da IA nas pessoas?",
    options: [
      { level: 1, text: "Não se fala sobre isso; o tema gera medo ou resistência." },
      { level: 2, text: "Há comunicação e treinamento nas ferramentas." },
      { level: 3, text: "Há trilhas de requalificação e transição conduzidas com transparência." },
      { level: 4, text: "A colaboração humano-agente faz parte da cultura, com papéis e desenvolvimento contínuos." },
      na,
    ] },
];

/** Configuração de cálculo (ver motor-v2 e o doc de racional). */
export const SCORING = {
  niveis_min: 1, niveis_max: 4,
  cobertura_min: { tecnico: 2, lideranca: 3 }, // itens válidos exigidos por eixo
  // Combinação PONDERADA + TETO: nível = round( peso_T·T + peso_L·L ), mas nunca
  // mais de `folga_lideranca` degraus acima da liderança (regra do Guia da Carol).
  // A liderança pesa mais (é ela que extrai o valor). Pesos ajustáveis.
  pesos: { tecnico: 0.4, lideranca: 0.6 },
  folga_lideranca: 1,
  gap_fragil: 2, // se round(T) − round(L) ≥ isto → "adoção frágil"
};

export const INSTRUMENTO_IA_V2 = {
  code: "SCREENER_IA_V2",
  version: "2.0.0",
  name: "Diagnóstico de nível de maturidade em IA",
  niveis: NIVEIS,
  senioridade: SENIORIDADE,
  eixos: EIXOS,
  questoes: QUESTOES,
  scoring: SCORING,
};
