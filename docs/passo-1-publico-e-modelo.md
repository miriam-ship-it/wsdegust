# Passo 1 — Desenho de Público e Modelo do Assessment

**Projeto:** Assessment Interativo de Liderança e Gestão
**Contexto:** Programa de Capacitação Multi-Empresa
**Tema central:** Liderança e Gestão (multi-nível)
**Formato de entrega:** Web app + PDF instantâneo
**Benchmark:** Anônimo agregado por cohort
**Data:** 12/05/2026

---

## 1. Visão geral do produto

O assessment é um diagnóstico de **maturidade em liderança e gestão** que opera em duas camadas simultaneamente:

1. **Camada Pessoa** — auto-percepção do respondente sobre as próprias competências de liderança (calibrada ao nível hierárquico).
2. **Camada Empresa** — percepção do respondente sobre a maturidade de liderança da organização.

A força do modelo está no **gap entre as duas camadas** e no **gap entre níveis hierárquicos da mesma empresa** — é aí que aparecem os pontos cegos, conflitos de cultura e oportunidades reais de desenvolvimento.

### Pilares de excelência

| Pilar | Como entrega valor |
| :---- | :----------------- |
| **Relevância por persona** | Mesma dimensão, perguntas calibradas. Um analista não responde "como você desenvolve sucessores"; um CEO não responde "você se sente ouvido pelo seu gestor". |
| **Insight do gap** | O diferencial não é o score absoluto — é o delta entre percepção pessoal e organizacional, e entre camadas hierárquicas. |
| **Benchmark de cohort** | Empresa vê onde está no quartil do programa, sem expor concorrentes. |
| **Acionabilidade** | Cada output tem um próximo passo: PDI para indivíduo, plano de desenvolvimento de área para gestor, agenda estratégica para C-level. |
| **Velocidade** | ≤5 min de preenchimento. Resultado em ≤10s após submit. |

---

## 2. Mapa de personas (4 níveis)

Cada persona tem perfil distinto de **dor**, **decisão** que toma, **moeda de valor** e **gatilhos de engajamento** com o resultado.

### 2.1 Analista / Júnior / Pleno

- **Dor:** "Não sei o que precisa mudar em mim para crescer."
- **Decisões que toma:** Próprio desenvolvimento, escolha de aprendizagem, postura no time.
- **Moeda de valor:** PDI claro, espelho objetivo das competências, validação de pontos fortes.
- **O que esperam ver no relatório:** Diagnóstico de auto-liderança, influência sem autoridade, aprendizagem ativa, comportamentos observáveis.
- **CTA dominante:** Trilhas de aprendizagem, mentoria, projetos cross.

### 2.2 Coordenador / Sênior / Especialista

- **Dor:** "Sou referência técnica mas estou aprendendo a liderar pessoas — onde estou no caminho?"
- **Decisões que toma:** Coordenação de squads, mentoria de juniores, prioridades técnicas.
- **Moeda de valor:** Diagnóstico da transição de IC (individual contributor) para líder, gestão de pares, primeira camada de gestão.
- **O que esperam ver:** Liderança técnica, feedback estruturado, gestão de projeto, comunicação cross-área.
- **CTA dominante:** Formação em primeira liderança, sponsoring, leitura crítica.

### 2.3 Gerente / Diretor

- **Dor:** "Tenho clareza da estratégia da empresa? Minha área está entregando o que pode?"
- **Decisões que toma:** Alocação de recurso, contratação, prioridades táticas, gestão de orçamento.
- **Moeda de valor:** Diagnóstico de maturidade da área, gap com a diretoria, ROI das iniciativas.
- **O que esperam ver:** Liderança de líderes, gestão por indicadores, alinhamento com C-level, desenvolvimento de talentos.
- **CTA dominante:** Programa de liderança executiva, coaching, agenda estratégica.

### 2.4 C-Level / Sócio

- **Dor:** "Estou liderando uma organização preparada para o próximo ciclo?"
- **Decisões que toma:** Estratégia, cultura, sucessão, capital, M&A.
- **Moeda de valor:** Maturidade organizacional, posicionamento no cohort, gargalos sistêmicos, leitura cultural.
- **O que esperam ver:** Cultura, sucessão, board readiness, escalabilidade, alinhamento de camadas.
- **CTA dominante:** Conselho consultivo, retreat executivo, programa de sucessão.

### 2.5 Matriz de calibração persona × dimensão

| Dimensão | Analista | Coordenador | Gerente | C-Level |
| :------- | :------- | :---------- | :------ | :------ |
| Visão & Direcionamento | Execução & clareza | Tradução para o time | Cascateamento & priorização | Definição & sucessão |
| Pessoas & Desenvolvimento | Auto-desenvolvimento | Mentoria de pares | Desenvolvimento de líderes | Cultura & talent strategy |
| Decisão & Accountability | Autonomia em escopo | Decisão técnica & risco | Decisão tática & dados | Decisão estratégica & board |
| Comportamento & Influência | Influência sem autoridade | Comunicação cross | Liderança política | Voz pública & legado |
| Performance & Resultados | Entrega individual | OKRs do squad | OKRs da área & ROI | NSM & resultado da cia |

---

## 2-B. Granulação por Tamanho e Segmento

Persona sozinha não basta. A maturidade de liderança esperada de um Gerente em **scale-up de 30 pessoas** é diferente da esperada em um **corporate de 5.000**. O mesmo vale para indústria: liderança em **fintech** opera em ciclo diferente de liderança em **varejo tradicional**. O modelo precisa segmentar em três eixos simultâneos — **Persona × Tamanho × Segmento** — para que benchmark, recomendação e cópia da devolutiva façam sentido.

### 2-B.1 Buckets de tamanho (4 faixas)

Buckets calibrados para o contexto LATAM, com base em literatura de organizational design (Greiner, Salim Ismail) e benchmarks de pesquisas de gestão (Korn Ferry, Great Place to Work).

| Bucket | Faixa de colaboradores | Características de liderança dominantes |
| :----- | :--------------------- | :--------------------------------------- |
| **S1 — Startup/Early** | ≤ 50 | Fundadores ainda operando, hierarquia plana, decisão centralizada, processo informal. Liderança = exemplo direto. |
| **S2 — Scale-up** | 51 – 250 | Primeira camada de gestão formal, dor de "perda de cultura", profissionalização de processos. Liderança = construir estrutura. |
| **S3 — Mid-market** | 251 – 1.000 | Múltiplas camadas, BUs definidas, governança formal. Liderança = alinhar camadas e priorizar. |
| **S4 — Corporate** | > 1.000 | Matriz, comitês, board, holding. Liderança = cultura, sucessão, ESG, M&A. |

Cada bucket carrega **expectativas distintas de maturidade por dimensão** — uma startup com score 3.0 em "Decisão & Accountability" é saudável (decisão rápida, ainda centralizada); um corporate com mesmo 3.0 está em sinal vermelho.

### 2-B.2 Segmentos (8 verticais + opcional)

Lista enxuta de 8 segmentos que cobre >90% dos respondentes esperados em programa multi-empresa LATAM, mais opção aberta:

| Código | Segmento | Drivers de liderança específicos |
| :----- | :------- | :------------------------------- |
| **V1** | Tech / SaaS / AdTech | Velocidade, produto, talento escasso, remoto |
| **V2** | Financeiro / Fintech / Bancos | Compliance, risco, dado, ciclo regulatório |
| **V3** | Varejo & Consumo | Operação, sazonalidade, escala, customer-centricity |
| **V4** | Indústria & Manufatura | Segurança, produtividade, sindical, capex |
| **V5** | Serviços Profissionais (consultoria, agência, jurídico) | Talento sênior, billable, gestão de cliente |
| **V6** | Saúde & Farma | Regulação, ética, multi-stakeholder, plantão |
| **V7** | Educação | Missão, ciclos longos, financiamento, regulatório |
| **V8** | Setor Público & Terceiro Setor | Governança, accountability pública, ciclo político |
| V9 | Outro / Misto | Captura long-tail; sem benchmark vertical, só por tamanho |

### 2-B.3 Impacto nos componentes do modelo

A granulação tripla **Persona × Tamanho × Segmento** entra em quatro pontos críticos:

1. **Calibração de perguntas** — algumas perguntas têm wording adaptado por segmento (ex: "agilidade de decisão" em V2 Financeiro pondera compliance; em V1 Tech pondera time-to-market). Não muda a dimensão, refina a âncora.
2. **Pesos de dimensão por segmento** — em V2 Financeiro, D3 (Decisão & Accountability) pesa mais no score geral; em V1 Tech, D5 (Performance) pesa mais. Pesos default + ajuste por segmento detalhado no Passo 4.
3. **Benchmark multi-cut** — comparação não é só "vs cohort geral", é "vs cohort + mesmo tamanho + mesmo segmento" quando há amostra suficiente.
4. **Recomendação contextualizada** — PDI e plano de ação puxam de biblioteca segmentada (um CEO de fintech S2 não recebe a mesma recomendação que CEO de varejo S4).

### 2-B.4 Captura de tamanho e segmento (UX)

Coletado na tela de identificação, **antes** das 13 perguntas. Duas perguntas-relâmpago de dropdown:

- "Qual o porte aproximado da sua empresa?" → S1/S2/S3/S4
- "Em qual segmento sua empresa atua?" → V1…V9

Não conta como pergunta do assessment (não soma ao limite de ≤5 min). Importante: **persona, tamanho e segmento são metadados** que orientam o engine, não fatores que entram no cálculo do score absoluto. Score continua na mesma escala 1-5 para garantir comparabilidade.

### 2-B.5 Fonte do benchmark — **dados de mercado**, não respondentes da plataforma

Decisão arquitetural crítica: o benchmark segmentado **não** é calculado a partir dos respondentes da plataforma. Ele puxa de uma **biblioteca curada de dados de mercado** (estudos públicos, pesquisas setoriais, relatórios de consultoria). Isso é o que dá credibilidade ao "vs mercado" e elimina três problemas estruturais:

| Problema do benchmark interno | Como o benchmark de mercado resolve |
| :---------------------------- | :----------------------------------- |
| **Cold start** — primeiras empresas sem ninguém para comparar | Dia 1 já entrega comparativo robusto |
| **Amostra distorcida** — empresas que entram em programa de T&D não são representativas do mercado | Dado externo reflete o universo real, não auto-seleção |
| **Auto-referência** — empresa se compara com cohort do mesmo evento, percentil sem significado | Empresa se compara com universo de fato — leitura "estamos no Q3 do varejo brasileiro" tem peso |

### 2-B.6 Biblioteca de fontes de mercado (catálogo curado)

Dados de benchmark virão de uma **tabela de referência interna** (`benchmark_catalog`) populada a partir de fontes externas validadas. Cada linha = uma referência de score esperado por dimensão × tamanho × segmento, com metadado da fonte.

Fontes prioritárias por categoria:

| Categoria | Fontes candidatas | Cobertura |
| :-------- | :---------------- | :-------- |
| **Maturidade de liderança global** | McKinsey Organizational Health Index, Korn Ferry Leadership Architect, Gallup State of the Global Workplace, Deloitte Human Capital Trends | Cross-setorial, viés EUA/EU |
| **Brasil/LATAM** | FIA Pesquisa de Engajamento, FGV-EAESP, GPTW Brasil, ABRH, Page Group Salary & Talent | Cobertura BR robusta, LATAM parcial |
| **Setoriais** | Anbima (V2 Financeiro), Abrasce (V3 Varejo), CNI (V4 Indústria), Anahp (V6 Saúde), Inep (V7 Educação) | Específico por vertical |
| **SMB e Startup** | Sebrae, Endeavor, Distrito, ACE | Cobertura S1/S2 |
| **Tech/SaaS** | First Round Capital State of Startups, Lenny's Newsletter, OpenView SaaS Benchmarks | V1 específico |

Cada referência no catálogo carrega: `dimensao`, `persona`, `tamanho`, `segmento`, `score_mediano`, `quartil_1`, `quartil_3`, `fonte`, `ano`, `n_amostra_origem`, `nivel_confianca` (alto/médio/baixo).

### 2-B.7 Estratégia para lacunas de dado

Nem toda combinação Persona × Tamanho × Segmento terá fonte direta. Hierarquia de fallback:

| Disponibilidade | Estratégia |
| :-------------- | :--------- |
| Fonte direta para o cut exato | Usa direto, exibe nome da fonte |
| Fonte para 2 dos 3 cuts (ex: Persona × Segmento, sem cortar por tamanho) | Usa proxy, sinaliza "benchmark setorial geral" |
| Apenas Persona disponível | Usa benchmark global de liderança por persona, sinaliza "referência global" |
| Sem fonte | Exibe leitura qualitativa baseada no score absoluto, sem percentil |

Indicador visual de **nível de confiança da fonte** sempre exibido junto ao número (estrelas ou ícone), para o respondente saber se está olhando dado robusto ou proxy.

### 2-B.8 O que sobra para os dados próprios da plataforma

Respostas coletadas na plataforma **continuam tendo valor**, mas para outros usos — não para o benchmark de mercado:

1. **Análise intra-empresa** — gaps Pessoa × Empresa e gap cross-hierárquico (seções 4.2 e 4.3).
2. **Comparativo opcional "vs outras empresas neste programa"** — exibido como sinal secundário, claramente rotulado como "amostra do programa", separado do benchmark de mercado.
3. **Calibração futura do catálogo** — após N respostas validadas, dados próprios podem ser cruzados com benchmark de mercado para identificar desvios e melhorar a curadoria (input para iteração anual do catálogo, nunca substitui a fonte original).
4. **Inteligência comercial agregada** — leituras agregadas e anonimizadas para o promotor do programa (qualificação de leads, identificação de tendências).

### 2-B.9 Manutenção do catálogo

- **Revisão anual obrigatória** — todas as fontes >18 meses são re-avaliadas.
- **Curadoria por especialista** — fontes não entram automaticamente; precisam de validação metodológica (amostra, método, viés).
- **Versionamento** — cada release do catálogo tem versão e changelog; relatórios guardam qual versão do catálogo foi usada (reprodutibilidade).
- **Disclosure** — relatório final cita as fontes na última página. Transparência metodológica é parte do produto.

---

## 3. Modelo conceitual — 5 dimensões de Liderança e Gestão

Cada dimensão é avaliada em **dupla lente** (Pessoa × Empresa) e calibrada por persona. As 5 dimensões foram selecionadas pelo cruzamento de três fontes: literatura clássica (Kotter, Goleman, Drucker), frameworks contemporâneos (Korn Ferry, McKinsey Organizational Health Index) e a realidade de programas multi-empresa em LATAM.

### D1 — Visão e Direcionamento Estratégico

- **O que mede:** clareza, comunicação e cascateamento da visão; capacidade de traduzir estratégia em ação no nível do respondente.
- **Por que importa:** sem alinhamento de direção, todas as outras dimensões viram ruído.
- **Sinal de alta maturidade:** cada camada articula coerentemente o "porquê" do que faz e como conecta ao todo.
- **Bandeira vermelha:** gap >1.5 entre C-level e analista na mesma empresa.

### D2 — Gestão de Pessoas e Desenvolvimento

- **O que mede:** feedback, mentoria, plano de carreira, sucessão, engajamento, segurança psicológica.
- **Por que importa:** liderança sem desenvolvimento de pessoas é gestão de tarefa, não de gente.
- **Sinal de alta maturidade:** existência de rituais formais de feedback + mentoria informal funcionando.
- **Bandeira vermelha:** alto score Empresa + baixo score Pessoa = liderança performática, não vivida.

### D3 — Tomada de Decisão e Accountability

- **O que mede:** uso de dados, velocidade de decisão, autonomia delegada, gestão de risco, accountability sobre resultado.
- **Por que importa:** decisão lenta ou centralizada é o maior dreno de talento em organizações em crescimento.
- **Sinal de alta maturidade:** decisões tomadas no menor nível possível com clareza de critério.
- **Bandeira vermelha:** gerentes com baixa percepção de autonomia + C-level com alta percepção de delegação = ilusão de descentralização.

### D4 — Comportamento e Influência (Soft Skills de Liderança)

- **O que mede:** inteligência emocional, comunicação, gestão de conflito, resiliência, capacidade de influenciar sem autoridade formal.
- **Por que importa:** competência comportamental é o multiplicador (ou o limitador) de todas as outras dimensões.
- **Sinal de alta maturidade:** líderes que sustentam conversa difícil sem perder a relação.
- **Bandeira vermelha:** baixo score nesta dimensão em qualquer camada — indica déficit de cultura de feedback.

### D5 — Cultura de Performance e Resultados

- **O que mede:** clareza de metas, ritual de acompanhamento, gestão por indicadores, melhoria contínua, accountability coletiva.
- **Por que importa:** liderança sem disciplina de resultado vira coaching de café.
- **Sinal de alta maturidade:** OKRs/KPIs vivos, revisados, conectados a ação.
- **Bandeira vermelha:** alto score em dimensões "soft" + baixo em D5 = organização agradável que não entrega.

### 3.1 Por que 5 dimensões (e não 7 ou 10)

Cinco é o ponto de equilíbrio entre **profundidade analítica** (radar legível, gap visível) e **fadiga do respondente** (≤5 min de preenchimento). Cada dimensão recebe 2 perguntas no questionário base (1 lente Pessoa + 1 lente Empresa), totalizando **10 perguntas core + 2-3 perguntas de calibração por persona** = 12-13 perguntas totais. Dentro do limite proposto.

---

## 4. Lógica de dupla análise — o coração do modelo

### 4.1 Estrutura matricial Pessoa × Empresa

Cada dimensão Dᵢ gera dois scores independentes:

- **Pᵢ** = score Pessoa na dimensão i (auto-percepção do respondente sobre si mesmo como líder/liderado).
- **Eᵢ** = score Empresa na dimensão i (percepção do respondente sobre a organização).

A análise olha 4 quadrantes possíveis:

| | Empresa Alta | Empresa Baixa |
| :--- | :----------- | :------------ |
| **Pessoa Alta** | **Sinergia** — pessoa madura em empresa madura. Risco baixo. Recomendação: estiramento, sucessão, projetos estratégicos. | **Tensão produtiva** — pessoa madura em empresa imatura. Risco de turnover. Recomendação: capacitar para influenciar, criar redes de aliados internos. |
| **Pessoa Baixa** | **Oportunidade de desenvolvimento** — empresa madura puxa a pessoa. Risco médio (se demora a engajar). Recomendação: PDI agressivo, mentoria. | **Risco sistêmico** — pessoa imatura em empresa imatura. Risco alto. Recomendação: intervenção em ambos os níveis simultaneamente. |

### 4.2 Gap Pessoa × Empresa (por dimensão e geral)

**Gapᵢ = Pᵢ − Eᵢ**

- `Gapᵢ > 0`: respondente se vê acima da cultura da empresa nessa dimensão (potencial frustração ou talento sub-utilizado).
- `Gapᵢ ≈ 0`: alinhamento.
- `Gapᵢ < 0`: empresa cobra mais do que o respondente entrega (risco de exposição ou oportunidade de PDI).

### 4.3 Gap cross-nível (dentro da mesma empresa, agregado anonimizado)

Para empresas com ≥3 respondentes em camadas diferentes, calcula-se:

**GapHierárquicoᵢ = média(Eᵢ entre C-level) − média(Eᵢ entre Analista/Coord)**

Esse é o **insight de ouro** da entrega para C-levels: mostra onde a liderança da empresa enxerga uma realidade que a base não enxerga (ou vice-versa). É o "espelho" que justifica o programa de T&D.

### 4.3-B Gap vs. benchmark de mercado

Além dos gaps internos, cada empresa recebe gaps de mercado por dimensão, **calculados contra o catálogo curado de dados externos** (seções 2-B.5 e 2-B.6), nunca contra outros respondentes da plataforma:

- **GapMercadoSegmentoᵢ** = Eᵢ − mediana de mercado para (Persona × Tamanho × Segmento) no catálogo
- **GapMercadoTamanhoᵢ** = Eᵢ − mediana de mercado para (Persona × Tamanho), fallback quando não há fonte segmentada
- **GapMercadoGlobalᵢ** = Eᵢ − mediana global por Persona, último fallback

A devolutiva exibe o **gap de maior especificidade disponível** no catálogo, com o nome da fonte e indicador de confiança ao lado. Lógica de priorização e fallback detalhada no Passo 4.

Adicionalmente, e **claramente separado**, a empresa pode ver um sinal secundário "vs outras empresas neste programa" — rotulado como amostra do programa, nunca apresentado como benchmark de mercado.

### 4.4 Bandeiras (flags) — gatilhos visuais

| Cor | Critério | Mensagem |
| :-- | :------- | :------- |
| 🟢 Verde | `Gapᵢ` ∈ [−0.5, +0.5] e `Eᵢ` ≥ 3.5 | Alinhamento saudável |
| 🟡 Amarela | `|Gapᵢ|` ∈ (0.5, 1.0] OU `Eᵢ` ∈ [2.5, 3.5) | Atenção — abrir conversa |
| 🔴 Vermelha | `|Gapᵢ|` > 1.0 OU `Eᵢ` < 2.5 OU `GapHierárquicoᵢ` > 1.5 | Crítica — intervenção recomendada |

### 4.5 Custo da Desconexão (heurística)

Indicador qualitativo/semi-quantitativo que estima impacto da imaturidade em cada dimensão. Fórmula proposta (refinada no Passo 4):

**Custoᵢ ≈ pesoᵢ(segmento) × (5 − Eᵢ) × multiplicadorPersona × fatorTamanho**

Onde:

- `pesoᵢ(segmento)` é o peso financeiro da dimensão calibrado por segmento (ex: D5 Performance pesa mais em V1 Tech; D3 Decisão pesa mais em V2 Financeiro pela exposição regulatória).
- `multiplicadorPersona` reflete o range de impacto da decisão da persona (C-level = 10x, Gerente = 4x, Coordenador = 2x, Analista = 1x).
- `fatorTamanho` escala o impacto absoluto por porte (S1 ≈ 1x, S2 ≈ 3x, S3 ≈ 8x, S4 ≈ 20x) — o mesmo gap em uma corporate vale ordens de magnitude mais em R$.

Apresentado como **faixa** (ex: "entre R$ 150k e R$ 400k/ano"), nunca número exato, para preservar credibilidade. Para segmentos sem driver financeiro claro (V8 Setor Público), substitui por indicador de impacto qualitativo (alto/médio/baixo).

---

## 5. Lógica adaptativa por persona

A mesma dimensão gera perguntas diferentes por persona — mas o score final fica em escala única (1-5) para permitir comparação cross-nível dentro da empresa.

### Exemplo: Dimensão D2 (Gestão de Pessoas e Desenvolvimento), lente Pessoa

| Persona | Pergunta calibrada |
| :------ | :------------------ |
| Analista | "Eu busco ativamente feedback e ajo sobre ele." |
| Coordenador | "Eu dou feedback estruturado aos pares e juniores que mentoro." |
| Gerente | "Eu tenho plano de desenvolvimento ativo para cada membro da minha equipe direta." |
| C-Level | "Eu tenho plano de sucessão mapeado para as posições críticas da organização." |

A pergunta muda, o score se preserva, a comparação entre camadas continua válida porque todas medem "maturidade em desenvolvimento de pessoas" no contexto de cada papel.

---

## 6. Princípios de design do questionário (insumo para o Passo 3)

1. **Toda pergunta tem par Pessoa/Empresa.** Sem exceção. Esse é o diferencial.
2. **Escala Likert 1-5 com âncoras escritas.** Não "concordo/discordo" abstrato — cada nível tem comportamento observável descrito.
3. **Sem opção "neutra" implícita.** A escala 1-5 tem ponto médio (3), mas as âncoras forçam o respondente a posicionar comportamento, não opinião.
4. **Sem "não se aplica".** Em caso de impossibilidade real, a pergunta é substituída por outra equivalente para aquela persona.
5. **Ordem aleatorizada dentro de cada bloco de dimensão.** Evita viés de halo entre Pessoa e Empresa.
6. **Pergunta de calibração no final.** "O quanto você se sente confortável com a sua resposta acima?" — usada para ponderar confiança no score, não para mudar o score.

---

## 7. Insights do modelo que justificam o investimento

O que esse desenho permite que um assessment tradicional **não** permite:

1. **Diagnóstico em estéreo:** percepção individual + percepção organizacional na mesma pergunta.
2. **Mapa de pontos cegos da liderança:** onde C-level e base enxergam realidades diferentes.
3. **Benchmark de mercado curado:** posição da empresa contra dados externos validados (não contra outros respondentes), com fonte e nível de confiança transparentes desde o dia 1.
4. **PDI gerado por algoritmo, não por consultor:** recomendação acionável vinculada a cada gap, em segundos.
5. **Custo da Desconexão narrado:** transforma o relatório de "interessante" em "preciso agir agora".
6. **Lead qualification para o promotor:** cada empresa termina o assessment com necessidade explícita mapeada — abertura comercial imediata.

---

## 8. Riscos e mitigações (a endereçar nos próximos passos)

| Risco | Mitigação |
| :---- | :-------- |
| Auto-percepção enviesada (Dunning-Kruger) | Pergunta de calibração de confiança + comparação cross-nível dentro da empresa |
| Empresa com 1 respondente apenas | Devolutiva ainda funciona, mas omite o gap hierárquico — sinaliza isso no relatório |
| Lacuna de dado no catálogo (cut sem fonte direta) | Hierarquia de fallback da seção 2-B.7; sempre exibir nível de confiança da fonte |
| Fonte de mercado desatualizada | Revisão anual obrigatória; nenhuma fonte >18 meses sem re-validação |
| Viés de fonte global em contexto LATAM | Priorizar fontes BR/LATAM no catálogo; sinalizar quando dado é apenas global |
| Curadoria do catálogo como ponto único de falha | Versionamento + changelog; segunda revisão por especialista antes de release |
| Confusão entre "benchmark de mercado" e "amostra do programa" | Separação visual e textual clara no relatório; rótulos explícitos |
| Segmento "Outro" cresce demais | Revisão trimestral da taxonomia; promover novo segmento quando V9 passar de 15% das respostas |
| Auto-declaração de tamanho/segmento errada | Validação contra base externa (LinkedIn/Receita Federal por CNPJ) na qualificação pós-feira |
| Fadiga do respondente | Cap de 13 perguntas + 2 metadados, barra de progresso, tempo médio ≤5 min validado em piloto |
| Compliance LGPD | Consentimento explícito, dados pessoais separados das respostas, anonimização para benchmark |

---

## 9. Próximos passos (para sua aprovação)

Antes de avançar para o **Passo 2 — Arquitetura técnica**, preciso da sua validação sobre:

1. **As 5 dimensões fazem sentido para o tema do programa?** Quer ajustar alguma, fundir, separar?
2. **A matriz de personas está completa?** Há algum perfil que falte (ex: RH/People dedicado, founder técnico)?
3. **Os 4 buckets de tamanho (S1–S4) estão com cortes adequados** para o público esperado? Quer subdividir (ex: separar 1–10 de 11–50 em S1)?
4. **A taxonomia de 8 segmentos (V1–V8)** cobre o que o programa atende, ou precisa adicionar/fundir verticais?
5. **Fontes de mercado prioritárias** — alguma da lista da seção 2-B.6 já temos contrato/assinatura/acesso? Há fonte interna Boomit (estudos próprios) para incluir?
6. **Estratégia de aquisição de fontes pagas** (Korn Ferry, McKinsey OHI, GPTW dataset) — orçamento previsto ou começamos só com fontes públicas/free?
7. **A lógica de bandeiras (verde/amarela/vermelha) está com cortes adequados** ou quer afrouxar/apertar?
8. **O "Custo da Desconexão" deve ser apresentado em R$** (heurística com fatorTamanho) ou apenas em escala qualitativa (alto/médio/baixo)?

Com isso aprovado, o **Passo 2** desenha a arquitetura técnica (stack web app + PDF, schema do banco com tabela `benchmark_catalog` separada de `responses`, motor de fallback de fontes, integração CRM, hospedagem). Já posso recomendar de partida: **Next.js + Supabase + Vercel** para o web app, **Puppeteer/React-PDF** para o PDF instantâneo, e o catálogo de benchmark como tabela versionada com índices em (persona, tamanho, segmento) — ETL inicial de população das fontes priorizadas será uma sub-tarefa do Passo 2.
