# Enxugar a metade de IA — o que dá, o que não dá, e o que eu preciso de vocês

> Rascunho para validação na sessão de conteúdo de **25/09**, com a Carolina.
> Nada aqui está decidido nem implementado.

## A resposta curta

**Não dá para cortar itens por dimensão.** Não é uma questão de rigor
metodológico a ser ponderada — o motor do pacote **para de produzir leitura**.

Eu precisei medir para descobrir isso, e o resultado contradiz o que eu tinha
dito antes. Eu afirmei que "a quantidade de itens é dado, não código". Isso vale
para a camada que eu escrevi — o formulário único deriva tudo da definição, sem
número cravado. **Não vale para o motor do pacote**, que tem duas regras fixas no
código.

## O que foi medido

Rodando o motor real com o instrumento encurtado:

| Itens por dimensão | Total | Todo mundo responde tudo | Um único "não se aplica" por dimensão |
|---|---|---|---|
| **4** (hoje) | 24 | Evidência **ampla** | Evidência **limitada**, leitura sai |
| **3** | 18 | Evidência **limitada**, sempre | **Sem leitura nenhuma** |
| **2** | 12 | **Sem leitura nenhuma** | **Sem leitura nenhuma** |

"Sem leitura nenhuma" quer dizer: a pessoa responde o formulário inteiro e recebe
a tela de *evidência insuficiente*. Não é um resultado pior — é a ausência de
resultado.

## Por que — as duas regras cravadas no motor

**Uma dimensão só vale com 3 respostas ou mais.** Com 4 itens, ela sobrevive a um
"não se aplica". Com 3, qualquer "não se aplica" a invalida — e basta **uma**
dimensão inválida para o índice inteiro deixar de existir. Com 2, ela nunca é
válida, nem com tudo respondido.

**Os limiares de evidência são contagens fixas: 24 e 21.** Com 18 itens, o máximo
possível é 18 — abaixo de 21. Toda devolutiva anunciaria "evidência limitada",
para todo mundo, para sempre.

**E o "não se aplica" não é hipótese:** os **24 itens pontuados oferecem essa
alternativa**. Ela existe de propósito, para quem responde sobre uma área em que
aquela prática não cabe.

## Um fato que muda onde se corta, se um dia se cortar

O índice pondera **35% liderança, 35% processos, 30% IA** — e o eixo de IA é uma
dimensão só. Por item:

| Dimensão | Peso da dimensão | Peso de cada item |
|---|---|---|
| Redesenho do trabalho e adoção de IA | 30% | **7,5%** |
| Estratégia e valor · Influência e liderança | 17,5% cada | 4,4% |
| Talentos · Performance · Dados | 11,7% cada | 2,9% |

Um item de IA pesa **2,6 vezes** um item de Talentos. Cortar "na média" tira mais
de onde menos custa em minutos e mais custa em medida.

## O que sobra como opção real

**1. Duas sentadas, não um formulário menor.** A retomada já existe e funciona: a
pessoa sai e volta no ponto em que parou. Zero risco ao instrumento, zero
trabalho novo. É a única opção que não paga nada.

**2. Cortar fora da metade de IA.** As 3 de contexto fixam a área sobre a qual a
pessoa responde — tirá-las faz o resto perder o perímetro. As 10 de liderança são
5 dimensões × 2 lentes, e é a **distância entre as lentes** que produz o melhor
achado daquela metade; cortar uma lente mata isso. Nenhum dos dois cortes me
parece bom, mas os dois são possíveis sem quebrar motor nenhum.

**3. Um instrumento novo, mais curto, com os limiares recalibrados.** É a opção
honesta se o tamanho for mesmo inaceitável. Não é um corte: é desenho de
instrumento — novos itens, nova regra de validade, novos limiares, e uma decisão
sobre o que se perde de comparabilidade com quem já respondeu. Pauta de 25/09,
não de uma tarde.

**4. Aceitar 40 respostas.** São cerca de 13 a 16 minutos. O diagnóstico de
liderança que já rodou com 108 pessoas pede 10 respostas mais 6 campos de perfil;
o de IA sozinho pede 30.

## O que eu recomendo

**Duas sentadas, e o instrumento intacto.** É reversível, não custa medida, e
deixa a conversa sobre tamanho para onde ela pertence — o desenho do instrumento,
com a Carolina, olhando o que cada item mede.

Se a decisão for encurtar de verdade, que seja a opção 3, assumida como projeto
de instrumento. Encurtar por dentro do motor atual não produz um diagnóstico mais
curto: produz um diagnóstico que não responde.

## O que eu preciso de vocês em 25/09

1. **A decisão sobre tamanho**, entre as quatro acima.
2. Se for a opção 3: **quais facetas sobrevivem**. Cada dimensão cobre quatro
   (por exemplo, em Dados: a pergunta de decisão, a qualidade do dado, o
   raciocínio analítico e a tradução em ação). Reduzir exige escolher o que
   deixa de ser medido — e essa escolha é de conteúdo, não minha.
3. **O aviso de privacidade do formulário único.** A identificação passou a vir
   no começo, e o aviso atual promete anonimato até o portão. Isto bloqueia a
   primeira pessoa real, independentemente do tamanho.

## As facetas, para a conversa de conteúdo

| Dimensão | As quatro facetas |
|---|---|
| Estratégia e valor | tradução da estratégia · leitura de negócio · escolha de portfólio · ciclo de valor |
| Inteligência de talentos | visibilidade de skills · decisões de talento · redesenho da força · planejamento |
| Performance e desenvolvimento | metas e expectativas · feedback e coaching · desenho do desenvolvimento · diagnóstico de performance |
| Influência e liderança | coragem e influência · gestão da mudança · assessoria executiva · responsabilização |
| Dados e decisão | pergunta de decisão · qualidade do dado · raciocínio analítico · tradução em insight |
| Redesenho e adoção de IA | portfólio de IA · redesenho do trabalho · capacidade de IA · decisão humano-IA |

Fora dessas 24 existem 3 de governança (que formam o portão de elegibilidade, não
entram no índice) e 3 de contexto.
