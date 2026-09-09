// Diagnóstico de nível de maturidade em IA (V2)
// Conteúdo narrativo da devolutiva — voz Boomit.
// A maturidade em IA é uma escada de 4 níveis que cruza dois eixos:
// TÉCNICO (o quê/como a IA é usada) × LIDERANÇA (direciona, mede, redesenha,
// sustenta valor). A liderança é o teto: não se sustenta um nível muito acima
// da liderança que o suporta.

export const NARRATIVAS = {
  niveis: {
    OPERACIONAL_AGIL: {
      sintese:
        "Você já usa IA para acelerar tarefas do dia a dia: redigir, resumir, pesquisar. O ganho é real, mas é pessoal — o tempo economizado fica com quem usa a ferramenta, e o processo em volta segue igual. É um ponto de partida sólido, não um ponto de chegada.",
      o_que_favorece:
        "A adoção já aconteceu na prática e existe familiaridade com a ferramenta. Falta transformar o hábito individual em rotina compartilhada.",
      ponto_de_atencao:
        "Sem uma direção que capture o tempo ganho, ele se dilui. A produtividade pessoal não vira resultado da área por conta própria.",
      primeiro_movimento:
        "Escolha uma tarefa que várias pessoas já fazem com IA e coloque-a dentro de um fluxo com dono e um indicador simples. É o primeiro passo para o ganho deixar de ser só seu.",
    },
    GESTOR_TATICO: {
      sintese:
        "Aqui a IA já está embutida em processos, não só em tarefas soltas. Os processos ficam visíveis, as decisões passam a se apoiar em dados e o ganho aparece na margem. Você deixou de ser executor para enxergar o sistema — o próximo horizonte é usar essa visão para decidir o que muda.",
      o_que_favorece:
        "Existe processo mapeado e leitura por dados, o que dá base para redesenhar em vez de só acelerar. A gestão já olha o todo, não a tarefa.",
      ponto_de_atencao:
        "O risco é a IA otimizar processos que talvez não devessem existir. Acelerar o que não funciona só produz o erro mais rápido.",
      primeiro_movimento:
        "Pegue um processo que hoje roda com IA e pergunte o que ele sustenta na estratégia. Redesenhe a partir da decisão que ele alimenta, não da tarefa que ele executa.",
    },
    ESTRATEGISTA_ESCALA: {
      sintese:
        "Neste nível a IA sustenta decisões estratégicas: entra em novas receitas, em expansão, em movimentos que escalam. Deixou de ser eficiência interna para virar alavanca de crescimento. O desafio muda de figura — não é mais usar melhor, é construir algo que os outros não conseguem copiar.",
      o_que_favorece:
        "A liderança já direciona a IA para onde o negócio cresce, e não só para onde ele economiza. Essa é a base para diferenciação real.",
      ponto_de_atencao:
        "Escala apoiada em ferramentas de mercado é escala que o concorrente também alcança. O que hoje é vantagem pode virar padrão amanhã.",
      primeiro_movimento:
        "Identifique onde a IA já sustenta receita e pergunte o que teria de ser proprietário para essa vantagem não ser replicável. É a ponte para o próximo nível.",
    },
    ARQUITETO_IA: {
      sintese:
        "A IA está no núcleo do que você entrega: solução proprietária que diferencia, uma força híbrida de pessoas e agentes trabalhando junta, barreiras competitivas que se sustentam no tempo. Este é o topo da escada. A questão deixa de ser chegar e passa a ser não escorregar.",
      o_que_favorece:
        "Existe diferenciação construída dentro de casa e uma liderança que gere pessoas e agentes como um só sistema. Poucos chegam aqui.",
      ponto_de_atencao:
        "Vantagem de topo não é permanente. Ela se mantém por profundidade e revisão contínua, não por ter chegado primeiro.",
      primeiro_movimento:
        "Trate a barreira que você construiu como algo que precisa ser reforçado, não guardado. Aprofunde onde já diferencia e requalifique as pessoas na mesma velocidade em que os agentes evoluem.",
    },
  },

  eixos: {
    tecnico: {
      forte:
        "O uso técnico da IA está à frente: a área já opera com ferramentas e casos que muita gente ainda não alcançou. O que sustenta esse uso é que precisa acompanhar.",
      fraco:
        "O uso técnico ainda é o degrau mais curto. Há espaço para levar a IA a mais tarefas e processos antes que a direção esbarre na ferramenta.",
    },
    lideranca: {
      forte:
        "A liderança direciona, mede e redesenha com clareza — o teto está alto. Há margem para o uso técnico crescer e ser sustentado sem perder o rumo.",
      fraco:
        "A liderança é hoje o fator que mais limita. Sem direção, medição e redesenho, o uso técnico não se sustenta por muito acima de onde a liderança alcança.",
    },
  },

  gap: {
    abaixo:
      "A leitura aponta um resultado abaixo do que a senioridade costuma sustentar. Não é um veredito sobre capacidade — é um sinal de que a maturidade em IA ainda não acompanhou o peso do cargo, e esse é um espaço concreto para avançar.",
    no:
      "O resultado está alinhado ao que se espera da senioridade. A maturidade em IA acompanha a posição — a leitura é de consistência, e o movimento seguinte é aprofundar, não corrigir.",
    acima:
      "A leitura aponta um resultado acima do esperado para a senioridade. É um indício de que a maturidade em IA já corre à frente do cargo — vale usar isso como referência para puxar a área, não como conforto.",
  },

  sinais: {
    adocao_fragil:
      "O uso técnico está pelo menos dois degraus à frente da liderança que deveria sustentá-lo. É uma adoção que anda por impulso próprio e tende a se perder quando falta direção — vale reforçar o teto antes de subir mais.",
    lideranca_a_destravar:
      "A liderança comporta mais do que a área usa hoje: há direção, medição e visão de sistema à espera de uso técnico à altura. O teto está alto e o espaço para crescer está do lado da adoção.",
  },

  plano30: {
    OPERACIONAL_AGIL: [
      "Escolha uma tarefa que a equipe já resolve com IA e transforme em rotina com dono, passo a passo e um indicador simples de acompanhamento.",
      "Marque um tempo semanal para a equipe trocar o que funcionou e padronizar os usos que se repetem, tirando o ganho da cabeça de cada um.",
      "Defina um resultado da área — e não pessoal — que o tempo economizado deveria melhorar, e comece a medir se ele está melhorando.",
    ],
    GESTOR_TATICO: [
      "Escolha um processo que já roda com IA e mapeie qual decisão estratégica ele alimenta, para redesenhar a partir dela e não da tarefa.",
      "Instale um indicador de margem ou eficiência nesse processo e revise-o com frequência, para a decisão seguir dado e não impressão.",
      "Antes de otimizar, questione se o processo deveria existir: elimine o que a IA só faria funcionar mais rápido sem precisar existir.",
    ],
    ESTRATEGISTA_ESCALA: [
      "Aponte onde a IA já sustenta receita ou expansão e defina o que precisaria ser proprietário para essa vantagem não ser replicável.",
      "Comece a montar a força híbrida: mapeie onde pessoas e agentes se dividem hoje e como o time se requalifica para operar junto.",
      "Trate a dependência de ferramentas de mercado como risco explícito e planeje onde construir dentro de casa o que diferencia.",
    ],
    ARQUITETO_IA: [
      "Reforce a barreira competitiva que já existe: escolha um ponto de diferenciação e aprofunde-o antes que o mercado alcance o nível.",
      "Faça da requalificação um ciclo contínuo, mantendo as pessoas evoluindo na mesma velocidade em que os agentes ganham capacidade.",
      "Revise periodicamente onde a vantagem se apoia, tratando o topo como posição a defender e não como conquista encerrada.",
    ],
  },
};
