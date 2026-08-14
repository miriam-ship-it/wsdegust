# Passo 3 — 13 Perguntas Calibradas por Persona

**Versão:** `q-v1.0`
**Data:** 12/05/2026
**Estrutura:** 10 perguntas core (5 dimensões × 2 lentes) + 3 perguntas de calibração

Cada respondente vê exatamente 13 perguntas. As 10 core são **calibradas por persona** (mesma dimensão e lente, wording adaptado). As 3 de calibração são iguais para todos.

---

## 1. Perguntas Core (10 por persona)

### D1 — Visão e Direcionamento Estratégico

| Persona | Lente Pessoa | Lente Empresa |
| :------ | :----------- | :------------ |
| **Analista** | "Eu entendo como meu trabalho contribui para os objetivos estratégicos da empresa." | "A estratégia da empresa é comunicada de forma clara e cascateada até o nível operacional." |
| **Coordenador** | "Eu traduzo a estratégia da empresa em prioridades concretas para meu time." | "A estratégia chega de forma traduzível e operacionalizável aos coordenadores." |
| **Gerente** | "Eu cascateio a estratégia para minha área com metas e indicadores claros." | "A diretoria comunica a estratégia com clareza e alinhamento entre as áreas." |
| **C-Level** | "Eu defino e revisito periodicamente a visão estratégica com meus pares." | "A estratégia está formalizada, é viva e tem buy-in de toda a liderança." |

### D2 — Gestão de Pessoas e Desenvolvimento

| Persona | Lente Pessoa | Lente Empresa |
| :------ | :----------- | :------------ |
| **Analista** | "Eu busco ativamente feedback e ajo sobre ele para meu desenvolvimento." | "Recebo feedback estruturado e tenho clareza sobre meu plano de desenvolvimento." |
| **Coordenador** | "Eu dou feedback estruturado e mentoro juniores ou pares no meu domínio." | "A empresa investe na formação dos coordenadores como primeira camada de liderança." |
| **Gerente** | "Eu tenho plano de desenvolvimento ativo e revisitado para cada membro da minha equipe." | "A empresa tem ritual estruturado de feedback, plano de carreira e sucessão." |
| **C-Level** | "Eu tenho plano de sucessão mapeado para todas as posições críticas da organização." | "A empresa trata desenvolvimento de pessoas como pilar estratégico, não apenas operacional." |

### D3 — Tomada de Decisão e Accountability

| Persona | Lente Pessoa | Lente Empresa |
| :------ | :----------- | :------------ |
| **Analista** | "Eu tenho autonomia para tomar decisões dentro do meu escopo e respondo pelos resultados." | "Decisões na empresa são tomadas no menor nível possível, com critério claro." |
| **Coordenador** | "Eu uso dados para fundamentar minhas decisões técnicas e operacionais." | "A empresa apoia decisões rápidas baseadas em dados, sem aprovação excessiva." |
| **Gerente** | "Eu decido com base em indicadores e respondo claramente pelos resultados da minha área." | "A empresa tem ritual de revisão de KPIs e responsabilização clara por resultados." |
| **C-Level** | "Eu decido estrategicamente com critério claro, mesmo sob ambiguidade." | "A empresa tem governança que permite decisões rápidas e accountability em todos os níveis." |

### D4 — Comportamento e Influência

| Persona | Lente Pessoa | Lente Empresa |
| :------ | :----------- | :------------ |
| **Analista** | "Eu consigo influenciar colegas e parceiros mesmo sem ter autoridade formal sobre eles." | "A empresa tem cultura de comunicação aberta e feedback honesto entre pares." |
| **Coordenador** | "Eu sustento conversas difíceis com pares e líderes sem deteriorar a relação." | "Líderes da empresa demonstram inteligência emocional e gestão de conflito eficaz." |
| **Gerente** | "Eu lidero por influência, não só por autoridade hierárquica." | "A cultura promove psicossegurança e feedback construtivo entre todos." |
| **C-Level** | "Eu modelo o comportamento que espero ver na cultura da empresa." | "A empresa tem cultura coerente entre discurso e prática, viva em todos os níveis." |

### D5 — Cultura de Performance e Resultados

| Persona | Lente Pessoa | Lente Empresa |
| :------ | :----------- | :------------ |
| **Analista** | "Eu tenho metas claras e acompanho meu desempenho contra elas." | "A empresa tem ritmo claro de acompanhamento de metas e melhoria contínua." |
| **Coordenador** | "Eu rodo OKRs ou metas de squad com disciplina de execução." | "A empresa tem cultura de execução com revisão recorrente de metas e ajustes." |
| **Gerente** | "Eu rodo OKRs da minha área e demonstro ROI das iniciativas que lidero." | "A empresa tem cultura de execução com revisão de KPIs e ajuste de rota frequente." |
| **C-Level** | "Eu acompanho os indicadores-chave da empresa com cadência e disciplina." | "A empresa tem North Star Metric clara e cultura de performance em todos os níveis." |

---

## 2. Escala Likert 1-5 com âncoras

Toda pergunta core usa a mesma escala:

| Valor | Âncora |
| :---- | :----- |
| **1** | Discordo totalmente — não é a realidade |
| **2** | Discordo — raramente acontece |
| **3** | Neutro — acontece de forma inconsistente |
| **4** | Concordo — acontece frequentemente |
| **5** | Concordo totalmente — é a realidade consistente |

---

## 3. Perguntas de calibração (3, iguais para todos)

| # | Pergunta | Tipo |
| :- | :------- | :--- |
| C1 | "Qual seu nível de confiança nas respostas que você acabou de dar?" | Likert 1-5 |
| C2 | "Há quanto tempo você está na sua posição atual?" | Dropdown: <1 ano / 1-3 anos / 3-7 anos / >7 anos |
| C3 | "O quanto você pretende aplicar os aprendizados deste diagnóstico?" | Likert 1-5 |

A pergunta C1 entra no cálculo como **ponderador de confiança** (não altera score, mas marca o relatório com selo "alta/média/baixa confiança").

A pergunta C2 entra como **contexto de senioridade** para o motor de recomendação (≤1 ano = recomendações mais introdutórias).

A pergunta C3 entra como **lead score** complementar — sinal de intenção forte para o operador priorizar contato.

---

## 4. Ordem de apresentação

Para evitar viés de halo entre Pessoa/Empresa de uma mesma dimensão, a ordem das 10 core é **embaralhada por seed do respondente** (reprodutível):

```
seed = uuid_para_int(respondente.id) % 10000
ordem = shuffle([D1-pessoa, D1-empresa, D2-pessoa, ..., D5-empresa], seed)
```

As 3 calibração ficam **sempre ao final**, na ordem fixa C1 → C2 → C3.

---

## 5. Total

- **13 perguntas por respondente**
- **Tempo estimado:** 4-5 minutos (≤30s por pergunta core, ≤10s por calibração)
- **Schema:** todas armazenadas como `Resposta` no Django (lente pessoa/empresa, dimensao, valor 1-5)
