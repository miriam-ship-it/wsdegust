# O que falta no motor para a devolutiva que queremos

**Para:** Carolina, como dona do instrumento aprovado
**De:** time de produto do Diagnóstico Boomit RH + IA
**Data:** 14/09/2026
**Sobre:** `boomit_rh_ia_maturity_v1` v`1.0.0-rc.1` e o contrato de devolutiva `2.0.0-pilot`

---

## Por que este documento existe

A devolutiva foi especificada em treze partes. Sete já estão no ar, uma foi
construída esta semana na camada de apresentação, e **quatro dependem de mudar o
motor** — que é seu, não nosso.

O pacote aprovado é importado sem uma vírgula de alteração, e há um teste que
confere os onze arquivos byte a byte contra o manifesto de hashes. Isso é
proposital: garante que o que roda em produção é o que você aprovou. A
consequência é que nada nesta lista pode ser resolvido por nós.

Também há um motivo de método, e ele é mais importante que o técnico. Poderíamos
inventar os campos que faltam na tela — sugerir um responsável por ação, estimar
um indicador de adoção, detalhar o gate em seis partes. **Não vamos.** Seria
exatamente o que o princípio do instrumento proíbe: a riqueza tem de vir da
interpretação das relações entre evidências, nunca de aumentar a certeza da
linguagem. Um campo preenchido pela interface é certeza fabricada.

---

## O que já existe, e é mais do que parece

Registrado aqui para que a conversa parta do lugar certo.

| Parte especificada | Estado | Onde |
|---|---|---|
| Assinatura do posicionamento | **pronto** | 7 padrões no motor |
| Contradições internas | **pronto** | 6 regras de tensão |
| Leitura contextual do papel | **pronto** | `roleLens` |
| Rota NIST priorizada | **pronto** | função + instrução, em ordem |
| Indicadores recomendados | **pronto** | até 3, ligados à tensão |
| Perguntas executivas | **pronto** | 3, derivadas do padrão |
| Critério de reavaliação | **parcial** | um texto, não os 4 subitens |
| Síntese executiva | **feito em 14/09** | composto do contrato, sem motor novo |

Sobre os dois primeiros, vale explicitar porque respondem direto à pergunta
"duas pessoas no mesmo degrau receberiam devolutivas diferentes?". **Já
recebem.**

As sete assinaturas: evolução equilibrada; IA à frente da gestão; sistema humano
à frente da IA; liderança à frente dos processos; processos sem mobilização;
integração emergente; potencial limitado por governança.

As seis tensões, comparadas à tabela de contradições especificada:

| Contradição pedida | Regra que já existe |
|---|---|
| Estratégia acima de Desenvolvimento | estratégia sem ciclo de desenvolvimento |
| Dados acima de Influência | evidência sem influência |
| IA acima de Talentos | tecnologia à frente da capacidade |
| Desenvolvimento acima de Estratégia | desenvolvimento sem valor demonstrado |
| Liderança acima de Processos | assinatura própria |
| Processos acima de Governança | tratado pelo gate, com prioridade visual |

---

## Os quatro pedidos

### 1. Três sustentadores e três limitadores, não dois

**Hoje:** o contrato fixa `maxItems: 2` em `supporters` e em `limiters`.
**Pedido:** 3 e 3.
**Por quê:** com seis dimensões, dois destaques deixam de fora uma frente que
muitas vezes é a decisiva. O terceiro item é o que separa "a área tem uma
força" de "a área tem um perfil".
**Custo para vocês:** ajustar o limiar de seleção e o `maxItems` do schema. A
regra de corte (±833 pontos-base sobre a média) provavelmente precisa de uma
segunda faixa, senão o terceiro item entra fraco e a leitura perde força em vez
de ganhar.
**Custo para nós:** nenhum. A tela já itera o array.

---

### 2. Gate de governança em seis partes

**Hoje:** o motor emite `id`, `label`, `text`, mais a restrição de escala.
**Pedido:** status; condição acionada; por que ela importa; o que fica
temporariamente impedido; ação de contenção; e **qual evidência libera a
continuidade**.
**Por quê:** os três primeiros já saem hoje, misturados no `text`. Os três
últimos não existem, e são justamente os acionáveis. Sem "o que libera", o gate
informa um bloqueio e não oferece saída — o participante sabe que parou, e não o
que fazer para destravar.
**Custo para vocês:** escrever quatro textos por estado de gate (crítico,
atenção, monitorado, estabelecido, insuficiente), ou seja, cerca de vinte
trechos curtos. É redação, não lógica: a condição já é calculada.
**Custo para nós:** um bloco de tela novo.

---

### 3. Plano 30-60-90 com os campos que tornam a ação executável

**Hoje:** cada etapa tem `horizon`, `action`, `evidence`.
**Pedido:** acrescentar verbo destacado, entrega, responsável sugerido, partes
envolvidas, indicador de adoção, indicador de resultado e risco.
**Por quê:** é a diferença entre um plano que se lê e um plano que se pactua.
Um plano sem responsável e sem indicador não sobrevive à primeira reunião de
diretoria.
**A ressalva que precisa da sua decisão:** "responsável sugerido" e "partes
envolvidas" dependem do contexto organizacional, e o instrumento só coleta
papel, alcance e autoridade do respondente. Duas saídas:
- **(a)** sugerir por **função** e não por pessoa, derivando do papel declarado.
  Exemplo: "liderança da área com a área de dados". Seguro e útil.
- **(b)** deixar o campo em branco para o participante preencher, o que
  transforma a devolutiva em rascunho de trabalho.
Sugerimos **(a)**, com **(b)** para as partes envolvidas.
**Custo para vocês:** é o pedido mais caro. São sete campos por etapa, três
etapas, e a combinação varia com o degrau e a tensão. Mesmo com blocos
validados, é o maior volume de redação da lista.
**Custo para nós:** reformular a tabela do plano.

---

### 4. Critério de reavaliação em quatro subitens

**Hoje:** um texto corrido.
**Pedido:** quais evidências precisam mudar; em quanto tempo faz sentido
reaplicar; o que deve ser verificado **fora** do autorrelato; quem deveria
participar da validação.
**Por quê:** o terceiro subitem é o mais valioso e o mais honesto. É onde o
instrumento diz, com todas as letras, o que ele **não** consegue enxergar
sozinho — e isso aumenta a credibilidade do resto.
**Custo para vocês:** quatro textos curtos por degrau, cinco degraus. Vinte
trechos.
**Custo para nós:** dividir um parágrafo em quatro linhas.

---

## Um item que não é pedido ao motor, é decisão sua de método

A especificação pede que a **escada mostre também a posição de referência e a
distância**. Isso hoje é **proibido** pelo material aprovado: a arquitetura da
devolutiva determina que só o degrau atual seja destacado, porque um segundo
destaque na escada lê como "onde você deveria estar" — e o instrumento afirma
que os cinco degraus são referências de atuação, não um ranking.

A regra está implementada e **travada por teste**: a devolutiva falha o build se
um segundo destaque aparecer. A distância e a transição necessária já saem, em
prosa, no bloco logo abaixo da escada.

Reverter é possível e é decisão sua. Só precisa ser explícita, porque desfaz uma
regra escrita e testada — não é um ajuste de layout.

---

## Sugestão de ordem

Se houver que escolher, esta é a ordem por valor entregue sobre esforço:

1. **Gate em seis partes** — maior ganho por linha escrita, e é o bloco que hoje
   informa sem oferecer saída.
2. **Reavaliação em quatro subitens** — barato, e aumenta a credibilidade de
   todo o resto ao declarar o limite.
3. **Terceiro sustentador e terceiro limitador** — barato em redação, mas exige
   cuidado com o limiar para não enfraquecer a leitura.
4. **Plano completo** — o mais caro. Talvez valha fatiar: verbo, entrega e
   indicador de adoção primeiro; responsável, envolvidos, risco e indicador de
   resultado depois.

---

## O que precisamos de volta

Para qualquer um dos quatro: **uma versão nova do pacote**, com o `instrument_version`
incrementado. Nós carregamos como versão nova ao lado da atual, sem sobrescrever
nada — a de hoje continua servindo quem já respondeu, e a nova passa a valer
para quem entrar depois. Nenhuma devolutiva já emitida muda de conteúdo.

O tempo do nosso lado, depois que o pacote chegar: **um a dois dias** para
qualquer um dos quatro, incluindo teste e publicação. O caminho está construído
e já foi percorrido.
