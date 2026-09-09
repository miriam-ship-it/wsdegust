# Racional de cálculo — Diagnóstico de nível de maturidade em IA (V2)

Documento técnico e metodológico. Explica, com precisão, como uma resposta vira um nível — e por que cada nível significa o que significa. A fonte da verdade é o instrumento (`instrumento-ia-v2.mjs`) e o motor de cálculo; este texto descreve o que eles implementam, não uma regra paralela.

Público: Miriam e Carol. Base conceitual: Guia da Carol, "Estratégia de Implantação de IA com Foco em ROI".

---

## 1. Visão geral

**A escada.** A maturidade em IA não é uma nota solta: é uma posição numa escada de quatro degraus. Nível 1 Operacional Ágil, Nível 2 Gestor Tático, Nível 3 Estrategista de Escala, Nível 4 Arquiteto de IA. Cada degrau descreve um patamar diferente do que a IA faz pela área — de ganho individual de produtividade (N1) até IA no núcleo do negócio como vantagem proprietária (N4). Você não "tira uma pontuação"; você ocupa um degrau.

**Os dois eixos.** A posição na escada cruza duas capacidades distintas. O eixo **Técnico** mede o quê e como a IA é usada: alcance do uso (Q1), dados e integração (Q2), governança dos usos (Q3). O eixo **Liderança** mede se existe quem direcione, meça, redesenhe e sustente esse valor: direção estratégica (Q4), medição de ROI (Q5), estrutura e cargos (Q6), prontidão do líder (Q7), pessoas e mudança (Q8). São capacidades que andam em ritmos diferentes: dá para comprar ferramenta rápido; liderança para extrair valor leva mais tempo.

**A média ponderada.** O nível efetivo combina os dois eixos numa posição única, mas eles não pesam igual: a **liderança pesa 0,6 e a técnica 0,4**. A escolha vem do Guia da Carol — é a liderança que direciona, mede e sustenta o valor; ferramenta sem quem extraia retorno não faz o degrau subir. Então a posição parte de `0,4·T + 0,6·L`, arredondada ao degrau mais próximo.

**O teto de liderança.** Sobre a média ainda vale a regra central do Guia: "não coloque agente de Nível 3 numa área de liderança Nível 1". O uso técnico pode estar momentaneamente à frente, mas não se sustenta mais de um degrau acima da liderança que o comporta. Por isso, depois da ponderação, o nível efetivo é limitado pela liderança mais uma folga de um degrau — a técnica puxa (e a ponderação já dá mais voz à liderança), mas não descola.

---

## 2. Passo a passo do cálculo

### 2.1 Pontuação dos itens

São 8 questões que definem o nível. Cada uma tem 4 alternativas — uma por nível, valor **1 a 4** — mais a opção **"Não sei / não se aplica"**. A alternativa escolhida vale o número do seu nível: marcar a opção de Nível 3 na Q1 lança o valor 3 para aquele item.

Há ainda 1 questão de **senioridade**. Ela não pontua o nível; define o **esperado** (ver 2.6).

### 2.2 Exclusão do "Não sei"

"Não sei" é **excluído do cálculo — não vira zero**. Um item respondido com "Não sei" simplesmente não entra na média do eixo, como se a pergunta não tivesse sido feita àquela pessoa. Isso é deliberado: transformar "não sei" em zero puniria a honestidade e rebaixaria o nível por desinformação, não por imaturidade real. O item sai da conta e sai também da contagem de cobertura.

### 2.3 Cobertura mínima por eixo

Como "Não sei" tira itens da conta, cada eixo precisa de um mínimo de itens válidos para que a média signifique algo:

- **Técnico:** ≥ 2 de 3 itens válidos.
- **Liderança:** ≥ 3 de 5 itens válidos.

Se um eixo fica abaixo do mínimo, o resultado daquele eixo é **"cobertura insuficiente"** — não se força um número sobre base fraca. Nesse caso o diagnóstico sinaliza que faltou informação, em vez de entregar um nível pouco confiável.

### 2.4 Médias por eixo

Com os itens válidos:

- **T** = média dos itens técnicos válidos (Q1, Q2, Q3).
- **L** = média dos itens de liderança válidos (Q4 a Q8).

O nível de cada eixo é o arredondamento da média:

- **Nível Técnico = round(T)**
- **Nível Liderança = round(L)**

O arredondamento é o comum (0,5 para cima). A média preserva a informação de cada item; o arredondamento devolve a leitura à escada de degraus inteiros.

### 2.5 Média ponderada e teto de liderança

O nível efetivo combina os dois eixos numa média ponderada e depois aplica o teto:

```
Ponderada     = 0,4·T + 0,6·L          (liderança pesa mais)
Nível efetivo = clamp( min( round(Ponderada), round(L) + 1 ), 1, 4 )
```

Leitura da fórmula:

1. `0,4·T + 0,6·L` — a posição combinada, usando as **médias** (não os arredondamentos) de cada eixo, com a liderança pesando 0,6 e a técnica 0,4. `round(Ponderada)` a devolve à escada de degraus inteiros.
2. `round(L) + 1` — o teto: a liderança sustenta até um degrau acima dela.
3. `min( round(Ponderada), round(L) + 1 )` — o efetivo é o menor entre a posição ponderada e o que a liderança comporta. Quando a técnica está muito à frente, a ponderação já a segura em parte (a liderança pesa mais); o teto corta o que sobrar.
4. `clamp( … , 1, 4 )` — trava o resultado dentro da escala de 1 a 4.

Exemplo do corte: T = 4, L = 1 → ponderada = 0,4·4 + 0,6·1 = 2,2 → round 2; teto = 1 + 1 = 2 → min(2, 2) = 2. A área usa IA em patamar técnico 4, mas sem liderança que sustente; o efetivo é 2 — a ponderação já puxa para baixo e o teto confirma.

**Nota sobre o teto nos pesos atuais.** Com a liderança pesando 0,6, a regra da Carol ("não coloque agente de Nível 3 numa liderança Nível 1") já é cumprida **pela própria ponderação**: como `ponderada − L = 0,4·(T − L)`, a distância da técnica adiantada vale no máximo 1,2 degrau, e a média arredondada nunca ultrapassa `round(L) + 1`. Ou seja, nos pesos de hoje o teto **não chega a cortar** — a técnica alta já é segurada pelo peso maior da liderança. O teto permanece na fórmula de propósito, como **trilho de segurança**: se um dia a calibração der mais voz à técnica (ex.: pesos 0,5/0,5), é ele que impede a técnica de descolar da liderança. Decisão de calibração registrada — manter os pesos 0,4/0,6 com o teto como salvaguarda dormente.

### 2.6 Esperado por senioridade

A questão de senioridade define o nível **esperado** para aquela pessoa (calibrável — ponto de partida para o piloto):

| Senioridade | Esperado |
|---|---|
| Analista / operacional | 1 |
| Especialista / sênior | 2 |
| Coordenação / gerência | 3 |
| Diretoria / C-level | 4 |

O esperado não altera o nível efetivo; serve de régua para lê-lo. Espera-se mais de quem define estratégia do que de quem executa tarefas.

### 2.7 Gap

```
Gap = Nível efetivo − Esperado
```

- **Gap ≤ −1 → abaixo** do esperado.
- **Gap = 0 → no** esperado.
- **Gap ≥ +1 → acima** do esperado.

O gap é o que transforma um nível absoluto em leitura acionável: um N2 é ótimo para um especialista e um alerta para um diretor.

### 2.8 Sinais

Além do nível, dois sinais qualificam a relação entre os eixos:

- **Adoção frágil** — se `round(T) − round(L) ≥ 2`: a técnica está à frente da liderança que a sustentaria. Uso avançado sem direção, medição ou estrutura tende a não se manter.
- **Liderança a destravar** — se `round(L) > round(T)`: a liderança comporta mais do que a área efetivamente usa. Há espaço pronto para avançar a técnica.

### 2.9 Exibição 0–100

Para barra ou anel, o nível vira percentual linear:

```
display = (Nível − 1) / 3 × 100
```

- N1 = 0
- N2 ≈ 33
- N3 ≈ 67
- N4 = 100

É só apresentação — o cálculo vive em degraus de 1 a 4; o 0–100 existe para a leitura visual.

---

## 3. Racional de cada nível

Cada nível descreve um par técnica × liderança em equilíbrio. A escada sobe quando os dois eixos sobem juntos; o teto existe justamente para lembrar que a técnica sozinha não faz o degrau se sustentar.

### Nível 1 — Operacional Ágil

**O que significa.** IA em tarefas individuais — redigir, resumir, pesquisar. Ganho de produtividade pessoal; o processo não muda. No técnico, o uso é pontual, sem dados organizados e sem regra. Na liderança, o uso surge por iniciativa individual, sem conexão com a estratégia e sem medição.

**Por que a liderança importa.** É o piso. Uma área com liderança N1 que compra uma ferramenta avançada não vira N3 — a ponderação (liderança 0,6) segura o efetivo em N2, e o sinal de adoção frágil aparece se a distância entre os eixos for de dois degraus.

**Transição para o N2.** Sai do N1 quando a IA deixa de ser hábito pessoal e passa a estar embutida num processo da área, com fluxo e responsável — e quando a liderança começa a conectar esse uso a uma prioridade.

### Nível 2 — Gestor Tático

**O que significa.** IA embutida nos processos da área: fluxo definido, responsáveis, decisão por dados, ganho de margem. No técnico, há dados com qualidade e acesso definidos e política de uso com papéis. Na liderança, os usos estão conectados às prioridades e existe linha de base com indicador e responsável pelo acompanhamento.

**Por que a liderança importa.** É o degrau mais comum de "adoção frágil": a área compra capacidade técnica de N3/N4, mas a liderança ainda decide e mede por percepção. Com a liderança pesando 0,6, a ponderação segura o efetivo em N2 até que a medição e a direção alcancem o uso.

**Transição para o N3.** Sai do N2 quando a IA passa a sustentar decisões estratégicas e novas frentes de valor — e quando a liderança revisa benefícios, custos e riscos para decidir continuar ou ampliar, com redesenho de área começando.

### Nível 3 — Estrategista de Escala

**O que significa.** IA sustenta decisões estratégicas e novas fontes de receita ou escala. No técnico, dados e arquitetura sustentam vários casos, com monitoramento e ciclo de vida, auditoria e métricas de qualidade. Na liderança, a IA destrava metas estratégicas, o valor é revisto para orientar ampliação, e há redesenho de área com requalificação conduzida.

**Por que a liderança importa.** Como a liderança pesa 0,6 na ponderação, chegar ao N3 exige liderança consistente: com liderança em N1, a média não alcança o degrau 3 por mais alta que esteja a técnica (o teto ainda a limitaria a N2). É o nível em que técnica e liderança precisam andar realmente juntas: escala sem governança e sem estrutura não se sustenta.

**Transição para o N4.** Sai do N3 quando a IA entra no núcleo do produto como solução proprietária que diferencia a empresa — e quando a liderança gere o valor da IA como carteira ligada a receita/margem e desenha a estrutura para uma força híbrida de pessoas e agentes.

### Nível 4 — Arquiteto de IA

**O que significa.** IA no núcleo do negócio, solução proprietária, força híbrida de pessoas e agentes. No técnico, existe plataforma de dados/IA própria como base de vantagem competitiva, com governança madura integrando ética, compliance e ciclo de vida dos agentes. Na liderança, a estratégia antecipa movimentos de mercado e cria barreiras competitivas; a estrutura é desenhada para orquestração humano-agente.

**Por que a liderança importa.** É o topo — clamp em 4. Chegar aqui exige liderança de ponta (round(L) ≥ 3, na prática próxima de N4): sem liderança madura, a ponderação não alcança o degrau 4 por mais avançada que seja a técnica. Ninguém sustenta IA no núcleo do negócio com liderança que não antecipa mercado nem gere valor como carteira.

**Transição.** Não há próximo degrau; a evolução no N4 é aprofundamento — mais barreiras competitivas, mais maturidade de governança, mais orquestração.

### Tabela síntese

| Nível | Foco | Produtividade | Receita | Escala |
|---|---|---|---|---|
| 1 Operacional Ágil | Tarefa individual | Ganho pessoal, pontual | Não afeta receita | Não escala; o processo não muda |
| 2 Gestor Tático | Processo da área | Ganho de margem no processo | Protege/melhora margem | Escala dentro da área |
| 3 Estrategista de Escala | Decisão estratégica | Ganho sistêmico, entre áreas | Abre novas fontes de receita | Escala entre áreas e frentes |
| 4 Arquiteto de IA | Núcleo do negócio | Força híbrida pessoas + agentes | Receita proprietária e diferenciada | Vantagem competitiva sustentada |

---

## 4. Anti-viés

O instrumento foi desenhado para medir prática, não discurso. Quatro escolhas fazem esse trabalho:

- **Escala ancorada em comportamento.** As alternativas não são "concordo/discordo" — são descrições concretas de como a IA é usada ("está embutida em processos, com fluxo e responsáveis"). Sem uma direção "positiva" a concordar, o viés de **aquiescência** (tendência a dizer sim) perde onde se ancorar.
- **Nenhuma opção é "a certa".** Os quatro níveis são neutros e legítimos; um N1 honesto é um resultado válido, não uma reprovação. Isso reduz **desejabilidade social** — a pressão de marcar a resposta que parece mais avançada.
- **Foco em prática observada, não intenção.** As perguntas pedem o que a área faz hoje e âncora factual (inventário, linha de base, política), não o que se pretende fazer. Intenção infla; prática observada não.
- **"Não sei" fora da conta.** Quem não sabe pode dizer que não sabe sem penalidade — o item sai da média em vez de virar zero. Isso remove o incentivo a chutar para cima e mantém a média limpa de ruído.

Complementos de desenho que reforçam o mesmo: a **raiz varia** (às vezes pergunta sobre você, às vezes sobre o líder ou a área), o que reduz método comum; e a **ordem das alternativas deve ser embaralhada** na apresentação (mantendo "Não sei" por último), para que a posição não sinalize o nível.

---

## 5. Exemplos trabalhados

### Exemplo A — Técnica alta, liderança baixa (adoção frágil)

Uma coordenação comprou ferramentas potentes, mas sem medição nem redesenho.

- Técnico: Q1 = 4, Q2 = 3, Q3 = "Não sei". Válidos: 2 de 3 (cobre o mínimo). **T = (4 + 3) / 2 = 3,5 → round(T) = 4** (0,5 para cima).
- Liderança: Q4 = 1, Q5 = 1, Q6 = 2, Q7 = 1, Q8 = "Não sei". Válidos: 4 de 5 (cobre o mínimo). **L = (1 + 1 + 2 + 1) / 4 = 1,25 → round(L) = 1**.
- Ponderada: `0,4·3,5 + 0,6·1,25 = 1,4 + 0,75 = 2,15 → round 2`. Teto: `min( 2, 1 + 1 ) = 2`. `clamp(2,1,4) = 2`. **Nível efetivo = 2**. (A liderança pesa mais: já puxa o efetivo para 2, e o teto confirma.)
- Sinal: `round(T) − round(L) = 4 − 1 = 3 ≥ 2` → **adoção frágil**.
- Senioridade = coordenação → **esperado = 3**. **Gap = 2 − 3 = −1 → abaixo**.
- Leitura: a área usa IA em patamar 4, mas sem liderança que sustente. O efetivo é 2, abaixo do esperado para uma coordenação. O caminho não é comprar mais ferramenta — é destravar medição e direção.

### Exemplo B — Técnica e liderança medianas (equilíbrio)

Um especialista com uso de IA já embutido em processo e liderança começando a medir.

- Técnico: Q1 = 2, Q2 = 2, Q3 = 3. Válidos: 3 de 3. **T = 7 / 3 = 2,33 → round(T) = 2**.
- Liderança: Q4 = 2, Q5 = 2, Q6 = 2, Q7 = 3, Q8 = 2. Válidos: 5 de 5. **L = 11 / 5 = 2,2 → round(L) = 2**.
- Ponderada: `0,4·2,33 + 0,6·2,2 = 0,93 + 1,32 = 2,25 → round 2`. Teto: `min( 2, 2 + 1 ) = 2`. `clamp(2,1,4) = 2`. **Nível efetivo = 2**.
- Sinais: `round(T) − round(L) = 0` (sem adoção frágil); `round(L) = round(T)` (sem liderança a destravar).
- Senioridade = especialista → **esperado = 2**. **Gap = 2 − 2 = 0 → no esperado**.
- Leitura: os dois eixos andam juntos em N2 e a técnica está dentro do teto. Resultado consistente, no esperado para o cargo. Evolução saudável é subir os dois eixos juntos rumo ao N3.

### Exemplo C — Liderança acima da técnica (liderança a destravar)

Uma diretoria madura em direção e medição, mas com uso técnico ainda incipiente.

- Técnico: Q1 = 2, Q2 = 1, Q3 = "Não sei". Válidos: 2 de 3 (cobre o mínimo). **T = (2 + 1) / 2 = 1,5 → round(T) = 2** (0,5 para cima).
- Liderança: Q4 = 3, Q5 = 3, Q6 = 3, Q7 = 4, Q8 = 3. Válidos: 5 de 5. **L = 16 / 5 = 3,2 → round(L) = 3**.
- Ponderada: `0,4·1,5 + 0,6·3,2 = 0,6 + 1,92 = 2,52 → round 3`. Teto: `min( 3, 3 + 1 ) = 3`. `clamp(3,1,4) = 3`. **Nível efetivo = 3**. (A liderança madura, pesando 0,6, puxa o efetivo para 3 mesmo com a técnica incipiente — o teto não corta, porque a liderança comporta bem mais.)
- Sinal: `round(L) = 3 > round(T) = 2` → **liderança a destravar**. (`round(T) − round(L) = −1`, sem adoção frágil.)
- Senioridade = diretoria → **esperado = 4**. **Gap = 3 − 4 = −1 → abaixo**.
- Leitura: a liderança comporta bem mais do que a área usa e, no modelo ponderado, sustenta o efetivo em N3. O gap ainda é negativo para uma diretoria (esperado 4), mas o gargalo é claramente técnico, não de direção — há espaço pronto para avançar dados, integração e alcance do uso. Compare com o Exemplo A: mesma distância entre eixos, sinais opostos — lá a técnica adiantada é freada, aqui a liderança madura puxa.

---

## 6. Calibração

O que confirmar no piloto antes de tratar os cortes como fixos:

- **Corte por senioridade.** A tabela esperado (Analista 1, Especialista 2, Gerência 3, Diretoria 4) é o ponto de partida. Verificar, com os dados do piloto, se a distribuição de gaps por cargo faz sentido — se toda a diretoria aparece "abaixo", talvez o esperado de N4 esteja alto para o momento do mercado, não a amostra imatura.
- **Pesos dos eixos.** Cada item pesa igual dentro do eixo; entre eixos, a liderança pesa **0,6** e a técnica **0,4** na média que define o nível, e a liderança ainda é o teto. Esses pesos foram fixados na calibração (a liderança extrai o valor, então tem mais voz) e têm uma consequência conhecida: com 0,6, o teto de liderança não chega a cortar — a ponderação já o cumpre (ver §2.5). Confirmar no piloto se 0,4/0,6 reproduz bem os casos reais; se a intenção for que o teto volte a *morder* a técnica adiantada, é preciso aproximar os pesos (ex.: 0,5/0,5). Verificar também se algum item (por exemplo governança, Q3) merece peso diferente dentro do eixo.
- **Consistência interna.** Medir se os itens de cada eixo se movem juntos (os três técnicos entre si; os cinco de liderança entre si). Item que destoa do próprio eixo pode estar medindo outra coisa e precisa de revisão de redação.
- **Cobertura e "Não sei".** Acompanhar a taxa de "Não sei" por questão. Muita gente marcando "Não sei" numa pergunta é sinal de redação confusa ou de tema fora do repertório do respondente — e pode derrubar a cobertura mínima com frequência indesejada.
- **Folga do teto e limiar de adoção frágil.** A folga de um degrau e o limiar de dois degraus para "adoção frágil" são parâmetros (`folga_lideranca`, `gap_fragil`). Revisar se, na prática, um degrau de folga é o ponto certo entre acomodar a técnica adiantada e sinalizar risco.
