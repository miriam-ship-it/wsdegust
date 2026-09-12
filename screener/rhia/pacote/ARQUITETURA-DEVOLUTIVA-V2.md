# Arquitetura integral da devolutiva v2

## 1. Promessa ao participante

Uma leitura orientativa, baseada em evidências comportamentais autodeclaradas, sobre como a área integra estratégia, dados, conhecimento sobre pessoas e adoção responsável de IA para orientar decisões de desenvolvimento e gerar valor organizacional.

O instrumento pode ser respondido por liderança de RH, CEO/proprietário, liderança de negócio, especialista ou outro papel. A unidade analisada continua sendo **a área escolhida como referência durante todo o preenchimento**.

## 2. O que o resultado pode e não pode afirmar

Pode formular hipóteses sobre padrões de prática, coerência entre frentes, condição de governança e prioridades de experimentação. Não pode provar competência individual, potencial, adequação ao cargo, ROI, causalidade, maturidade de toda a empresa ou posição frente ao mercado.

O texto deve usar: “as respostas sugerem”, “há indícios”, “parece”, “hipótese”, “vale verificar”. Evitar: “você é”, “sua empresa está”, “comprovamos”, “diagnóstico definitivo”, “benchmark”.

## 3. Modelo de evidência

| Componente | Quantidade | Uso |
|---|---:|---|
| Contexto | 3 | papel, alcance e autoridade; não pontua |
| Escalares | 24 | seis dimensões com quatro itens; compõem o posicionamento |
| Governança | 3 | privacidade/dados, supervisão humana e validação; gate independente |

Escala interna: E1=0, E2=3333, E3=6667, E4=10000 pontos-base; NA=nulo. Uma dimensão é válida com pelo menos três de quatro respostas. Os pontos-base são internos e nunca aparecem ao participante.

Suficiência: 24 respostas válidas = ampla; 21–23 = adequada; 18–20 = limitada, desde que todas as dimensões sejam válidas; qualquer dimensão inválida impede a síntese.

## 4. Composição do posicionamento

Eixos internos:

- Liderança = média de Estratégia e Influência.
- Processos = média de Talento, Desenvolvimento e Dados.
- IA = Adoção responsável de IA.

Índice interno = 35% Liderança + 35% Processos + 30% IA.

| Faixa interna | Referência pública |
|---:|---|
| 0–19,99 | Operacional Ágil |
| 20–39,99 | Gestor Tático |
| 40–59,99 | Estrategista de Escala |
| 60–79,99 | Arquiteto de Soluções |
| 80–100 | Criador de Tecnologia |

Os cinco degraus são uma referência conhecida do público da palestra. Não são certificação, cargo, ranking de valor pessoal nem sequência obrigatória. O nível superior descreve capacidade de criar ou compor soluções — não exige propriedade tecnológica, modelo próprio ou agentes.

## 5. Referência de atuação e distância

Alcance: SELF=1, TEAM=2, AREA=3, MULTI_AREA=4, ENTERPRISE=5. Autoridade: INFORM=1, RECOMMEND=2, CO_DECIDE=3, DECIDE_SCOPE=4, DECIDE_ENTERPRISE=5.

Referência = arredondamento da média entre alcance e autoridade. Se os dois índices divergirem em dois ou mais pontos, a referência é inconclusiva e nenhuma lacuna é afirmada.

Distância: capacidade acima, alinhada, um degrau abaixo, dois ou mais degraus abaixo, ou inconclusiva. O texto completo vive em `src/output-definition-v2.mjs`.

## 6. Assinatura de posicionamento

A assinatura resume a relação entre Liderança, Processos e IA, sem mostrar notas:

- Evolução equilibrada: amplitude entre eixos menor que 10 pontos percentuais.
- IA à frente do sistema de gestão: IA pelo menos 15 pontos acima da média humana.
- Sistema humano pronto para acelerar IA: média humana pelo menos 15 pontos acima de IA.
- Direção forte, processo ainda irregular: Liderança pelo menos 15 pontos acima de Processos.
- Processo consistente, mobilização limitada: Processos pelo menos 15 pontos acima de Liderança.
- Integração em construção: nenhum padrão dominante.
- Potencial limitado por governança: sobreposição obrigatória quando o gate é crítico.

## 7. Sustentadores, limitadores e tensões

Até dois sustentadores ficam 8,33 pontos ou mais acima do índice interno. Até dois limitadores ficam 8,33 pontos ou mais abaixo. Se não houver candidatos, mas a amplitude entre dimensões for relevante, usa-se apenas o extremo. Se a amplitude for menor que 8,33 pontos, não se inventa diferenciação.

São exibidas no máximo duas tensões com diferença mínima de 25 pontos:

| Evidência mais forte | Evidência mais fraca | Leitura |
|---|---|---|
| Estratégia | Desenvolvimento | Estratégia sem ciclo de desenvolvimento |
| IA | Talento | Adoção de IA sem capacidade distribuída |
| Dados | Influência | Evidência sem influência |
| Desenvolvimento | Estratégia | Desenvolvimento pouco conectado ao valor |
| Influência | Dados | Mobilização com pouca evidência |
| Talento | IA | Talento à frente da adoção tecnológica |

## 8. Gate de governança

Usa o pior resultado entre os três gates, por princípio de precaução:

- E1 em qualquer gate: condição crítica; bloquear escala e priorizar contenção.
- Nenhum E1 e ao menos um E2: atenção; apenas experimentos controlados.
- Todos E3 ou melhores e ao menos um E3: controles monitorados.
- Todos E4: governança estabelecida.
- Qualquer NA: informação insuficiente; esclarecer antes de ampliar.

O gate nunca reduz artificialmente o degrau calculado. Ele aparece como condição de avanço e pode substituir a assinatura por “Potencial limitado por governança”.

## 9. NIST como framework de instrução

- P1: Mapear + Governar.
- P2: Mapear + Medir.
- P3: Medir + Gerenciar.
- P4: Governar + Gerenciar, remapeando o contexto quando houver mudança.
- P5: as quatro funções em ciclo contínuo.
- Gate crítico ou insuficiente: Governar + Mapear, com proibição de escala.
- Gate em atenção: Governar + Mapear + Medir, somente em ambiente controlado.

As funções são complementares e recorrentes; não são estágios de maturidade.

## 10. Anatomia obrigatória da tela de resultado

1. Cabeçalho: “Sua leitura orientativa” + aviso curto de autorrelato.
2. Degrau atual em uma escada visual de cinco posições.
3. Referência de atuação e distância, ou aviso de referência inconclusiva.
4. Assinatura de posicionamento.
5. Até dois sustentadores e até dois limitadores, descritos qualitativamente.
6. Até duas tensões relevantes; ocultar o bloco se não houver.
7. Gate de governança, sempre visível e com prioridade visual quando crítico.
8. Rota NIST personalizada.
9. Plano de 30–60–90 dias com ação e evidência de conclusão.
10. Até três indicadores recomendados.
11. Três perguntas para conversa executiva.
12. Critério de reavaliação e disclaimer completo.

Não exibir radar, barras ou números por dimensão. Não exibir códigos internos, pontos-base, pesos ou respostas individuais. A escada de cinco referências pode ser exibida, desde que não pareça ranking de pessoas.

## 11. Fluxo da experiência

- Abertura: promessa, duração estimada, privacidade e escolha consciente da área analisada.
- Contexto: CTX01–CTX03. Em CTX01=OTHER, abrir texto obrigatório de 2–120 caracteres e limpar quando ocultado.
- Questionário: uma questão por tela ou blocos curtos; progresso real; todas as alternativas literais; NA disponível.
- Revisão: permitir voltar e alterar sem perder respostas.
- Resultado: calculado localmente e determinístico.
- Exportação: imprimir/salvar PDF sem cortar cartões, com data, versão e disclaimer.

## 12. Analytics mínimos, sem conteúdo sensível

Eventos: assessment_started, context_completed, question_answered (somente ID e opção), assessment_completed, result_viewed, pdf_requested, reassessment_clicked. Não enviar o texto livre de “Outro” nem respostas a terceiros sem consentimento e base definida. Separar analytics de produto do registro identificável.

## 13. Calibração posterior ao piloto

Antes de chamar a escala de validada: entrevistas cognitivas com perfis diferentes; análise de NA e abandono; distribuição por item/dimensão; consistência interna apenas como sinal exploratório; relação com evidências externas; teste-reteste; revisão de viés e acessibilidade; recalibração explícita de pesos e cortes. Não ajustar silenciosamente a regra após respostas reais.
