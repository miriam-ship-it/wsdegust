# Prompt mestre para o Claude

Copie tudo abaixo e anexe a pasta/ZIP deste pacote ao Claude.

---

Você é responsável por construir a versão funcional e pronta para piloto do **Diagnóstico Boomit — RH, Desenvolvimento e IA**. Não entregue apenas um plano, wireframe ou trechos de código: implemente, execute, teste, corrija e entregue o projeto completo em ZIP.

## 0. Skills obrigatórias

Antes de agir, leia integralmente e use as skills **Boomit Design** e **Boomit UI** disponíveis no seu ambiente. Registre no README quais decisões vieram de cada skill. Se uma delas não estiver instalada, informe a ausência de forma objetiva e aplique os tokens e requisitos deste pacote sem inventar uma identidade paralela.

## 1. Fontes de verdade — ordem de precedência

1. `instrumento-rh-ia-v1.json`: conteúdo literal das 30 questões. Não reescreva perguntas nem alternativas.
2. `src/output-engine-v2.mjs`: algoritmo determinístico de referência.
3. `src/output-definition-v2.mjs`: nomenclatura e biblioteca editorial.
4. `ARQUITETURA-DEVOLUTIVA-V2.md`: experiência e interpretação.
5. `src/result-contract-v2.schema.json`: contrato da saída.
6. `CHECKLIST-DE-ACEITE.md`: definição de pronto.

Em conflito, preserve primeiro o instrumento literal e depois o motor. Não crie outra taxonomia de IA, maturidade ou governança.

## 2. Objetivo do produto

Construir uma experiência digital elegante, rápida e confiável que entregue:

> Uma leitura orientativa, baseada em evidências comportamentais autodeclaradas, sobre como a área integra estratégia, dados, conhecimento sobre pessoas e adoção responsável de IA para orientar decisões de desenvolvimento e gerar valor organizacional.

O público principal são gestores de RH, mas CEOs, proprietários, líderes de negócio e especialistas também devem responder e receber material relevante. O participante escolhe sua posição, mas analisa uma **área**. Reforce no onboarding: “Responda pensando na mesma área do início ao fim.”

## 3. Restrições inegociáveis

- Exatamente 30 questões: 3 contexto, 24 escalares, 3 gates.
- CTX01=OTHER abre `CTX01_OTHER_TEXT`, obrigatório, 2–120 caracteres. Ao trocar de opção, ocultar e limpar o texto.
- Não exibir notas por dimensão, pontos, percentuais, radar, pesos ou códigos internos.
- Não tratar autorrelato como diagnóstico conclusivo, avaliação pessoal, benchmark ou prova de ROI.
- Governança é gate separado e nunca soma ou subtrai pontos do posicionamento.
- NIST AI RMF usa **Governar, Mapear, Medir e Gerenciar** como funções complementares e recorrentes, nunca como quatro estágios.
- Os cinco degraus públicos são, nesta ordem: Operacional Ágil; Gestor Tático; Estrategista de Escala; Arquiteto de Soluções; Criador de Tecnologia.
- “Criador de Tecnologia” não exige tecnologia proprietária, modelo próprio nem agentes de IA.
- O motor é determinístico e local. Não use LLM para pontuar ou redigir o resultado.
- Não invente estatísticas, benchmarks, percentis ou comparações com mercado.
- Não altere silenciosamente pesos, cortes ou limiares.

## 4. Implementação técnica

Se houver projeto existente, preserve o stack e mudanças do usuário. Caso contrário, crie um projeto web estático modular, preferencialmente Vite + JavaScript ES modules + CSS, sem framework desnecessário.

Requisitos:

- `npm install`, `npm run dev`, `npm run build`, `npm run preview` e `npm test` devem funcionar.
- Inclua README com comandos exatos e URL local.
- O projeto deve abrir por servidor local; não prometa suporte a `file://` para módulos ES.
- Mostre uma mensagem de erro útil na própria página se a inicialização falhar; nunca deixe tela branca.
- Importe ou adapte o motor fornecido sem mudar sua semântica.
- Estado das respostas em estrutura única; persistência local versionada; botão “recomeçar” com confirmação.
- Nenhum dado pessoal deve sair do navegador por padrão.
- Imprimir/salvar PDF via stylesheet de impressão; não cortar cartões ou esconder disclaimer.
- Analytics apenas como adaptador desligado por padrão e sem texto livre.
- Rotas ou estados: abertura, contexto, questões, revisão, resultado e erro.
- URL direta do resultado sem estado deve redirecionar à abertura/revisão, não quebrar.

## 5. Fluxo de interface

### Abertura

- Marca e título.
- Promessa em linguagem simples.
- “Leva cerca de 8–10 minutos.”
- Aviso: hipótese orientativa baseada em autorrelato.
- Unidade: mesma área do começo ao fim.
- CTA “Começar leitura”.

### Contexto

- Exibir CTX01, CTX02 e CTX03 exatamente como no JSON.
- Papel muda apenas a lente do texto final.
- Alcance e autoridade compõem referência; se divergirem >=2, não afirmar lacuna.

### Questões

- Uma pergunta por tela em mobile; em desktop, mantenha foco e baixa carga cognitiva.
- Mostrar dimensão em linguagem humana, mas não explicar a pontuação.
- Cartões de alternativas, seleção por teclado, foco visível e botão avançar.
- NA sempre disponível onde definido.
- Progresso real por questões respondidas; permitir voltar.
- Não usar sliders: alternativas são evidências observáveis e devem permanecer literais.

### Revisão

- Lista compacta das 30 respostas, agrupadas em Contexto, Práticas e Governança.
- Permitir editar qualquer item.
- Não revelar score ao revisar.

### Resultado

Compor exatamente nesta prioridade:

1. “Sua leitura orientativa” e qualidade da evidência.
2. Escada visual de cinco referências, destacando apenas o degrau atual.
3. Referência de atuação e distância; estado inconclusivo quando aplicável.
4. Assinatura de posicionamento.
5. Até dois sustentadores e dois limitadores qualitativos.
6. Até duas tensões; ocultar seção vazia.
7. Gate de governança sempre visível; crítico/insuficiente deve dominar a decisão.
8. Rota NIST personalizada, apresentada como ciclo de ação.
9. Plano 30–60–90 dias, cada etapa com ação e evidência verificável.
10. Até três indicadores recomendados.
11. Três perguntas para conversa executiva.
12. Reavaliação em 90 dias e disclaimer integral.
13. CTAs: imprimir/salvar PDF, rever respostas, recomeçar.

O degrau não pode ser apresentado como medalha. Evite linguagem celebratória automática. O resultado precisa soar sóbrio, humano, estratégico e acionável.

## 6. Cálculo obrigatório

Implemente os mesmos resultados do arquivo `src/output-engine-v2.mjs`:

- E1=0; E2=3333; E3=6667; E4=10000; NA=nulo.
- Dimensão válida com no mínimo 3/4 itens.
- Liderança = média(EST, INF).
- Processos = média(TAL, DES, DAD).
- IA = IA.
- Índice = arredondar(0,35×Liderança + 0,35×Processos + 0,30×IA).
- P1 0–1999; P2 2000–3999; P3 4000–5999; P4 6000–7999; P5 8000–10000.
- Referência = arredondar((alcance + autoridade)/2); divergência >=2 = inconclusiva.
- Sustentador/limitador: desvio >=833 pontos-base; amplitude total <833 = nenhum extremo.
- Tensão: diferença >=2500; no máximo duas, ordenadas por magnitude e ID.
- Assinaturas: limiar de 1500 entre eixos; equilíbrio com amplitude <1000.
- Gate: pior resposta entre GOV01–GOV03; qualquer NA = insuficiente.

Não faça aproximações com floats exibidos. Use inteiros em pontos-base internamente.

## 7. Direção visual Boomit

Use Boomit Design e Boomit UI como fonte de verdade. A experiência deve parecer uma ferramenta executiva da Boomit, não um formulário genérico nem um dashboard de BI.

- Hierarquia tipográfica forte, espaço generoso, textos curtos por bloco.
- Contraste e legibilidade acima de decoração.
- Cor de destaque para decisão e progresso; alertas de governança com semântica própria.
- Escada de cinco referências visualmente clara, responsiva e não competitiva.
- Cartões de evidência com rótulos verbais, nunca números ocultamente “gamificados”.
- Movimento discreto, respeitando `prefers-reduced-motion`.
- Responsivo de 320 px a telas largas.
- WCAG 2.2 AA: contraste, teclado, leitores de tela, labels, regiões de erro e foco.
- Use os tokens existentes, se fornecidos. Não introduza fontes ou cores externas sem justificativa.

## 8. Estados que precisam existir

- inicial; resposta selecionada; validação; salvamento local; retomada; revisão;
- evidência insuficiente; referência inconclusiva; governança crítica; governança insuficiente;
- resultado sem tensões; impressão; erro de inicialização; armazenamento indisponível.

Falha de localStorage deve degradar com elegância: o questionário continua na sessão e avisa que não será retomado depois.

## 9. Testes

Mantenha os testes fornecidos e acrescente testes de interface. Cobrir no mínimo:

- contagem e literalidade das 30 questões;
- E1/E2/E3/E4 uniformes;
- 2 NA na mesma dimensão impede síntese;
- 1 NA por dimensão ainda permite síntese;
- referência inconclusiva;
- alta capacidade + gate crítico = nível preservado, escala bloqueada;
- IA à frente e atrás do sistema humano;
- perfil equilibrado sem sustentador/limitador artificial;
- CTX01 Outro completo;
- persistência, retorno, reinício e impressão;
- ausência de notas/códigos no DOM público;
- nenhum erro no console no fluxo feliz.

Antes de entregar, execute testes, build e preview real no navegador em mobile e desktop. Corrija toda tela branca, overflow, corte na impressão e falha de teclado.

## 10. Entregáveis

Entregue:

1. Projeto completo e executável.
2. ZIP final sem `node_modules`, caches ou arquivos secretos.
3. README com instalação, execução, build, teste e arquitetura.
4. `DECISOES.md` com decisões de UI e rastreabilidade às skills Boomit.
5. `LIMITES-METODOLOGICOS.md` com o que o screener não afirma e agenda de validação.
6. Relatório de testes com comandos executados e resultados.
7. Uma captura desktop e uma mobile das telas de abertura, questão e resultado.

## 11. Definition of done

Considere pronto somente quando todos os itens de `CHECKLIST-DE-ACEITE.md` estiverem marcados e comprovados. Se encontrar ambiguidade não bloqueante, siga o motor e documente a decisão. Não altere conteúdo aprovado para “melhorar a UX”.

Comece inspecionando os arquivos, depois implemente. Ao final, informe objetivamente: o que foi criado, testes executados, limitações remanescentes e localização do ZIP.

---
