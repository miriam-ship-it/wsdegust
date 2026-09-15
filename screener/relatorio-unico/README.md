# Relatório único — os dois diagnósticos num documento só

## O que está pronto

A **leitura cruzada** ([`cruzamento.mjs`](./cruzamento.mjs)): o que os dois
diagnósticos dizem **juntos**. É a única coisa que justifica um documento único
— se fosse só empilhar um relatório depois do outro, bastaria grampear os PDFs.

Três padrões, escolhidos pela distância entre as duas medidas:

| Padrão | Quando | O que significa |
|---|---|---|
| Liderança e IA no mesmo patamar | distância < 15 | Nenhuma metade puxa a outra; avançar exige mover as duas |
| Liderança à frente da adoção | liderança 15+ acima | Há estrutura de decisão para um avanço que não aconteceu — o cenário mais favorável |
| Adoção à frente da liderança | IA 15+ acima | A tecnologia anda mais rápido que quem decide sobre ela — o que mais exige atenção |

O corte de 15 pontos é **o mesmo** que o motor de IA usa para declarar
assinatura (1500 pontos-base de 10000). Dois cortes diferentes para a mesma
ideia é como se criam contradições entre as metades de um documento.

### O que ele deliberadamente NÃO faz

- **Não cria um índice combinado.** Seria um número novo, sem instrumento que o
  sustente, e ninguém decidiu o peso de cada metade. Há teste que falha se
  alguém acrescentar um campo com cara de índice geral.
- **Não diz qual metade vale mais.**
- **Não compara com mercado.** Nenhum dos dois instrumentos coleta isso.
- **Não produz leitura com meia medida.** Falta uma das metades, devolve `null`.

### O que tornou isso possível

Os dois lados falam na mesma escala 0–100. O de liderança sempre falou (score
× 20); o de IA passou a falar em 14/09. Sem isso, comparar seria comparar régua
com termômetro.

### Demonstrado com dado real

Com um respondente real de liderança do banco (estágio B, 68 de 100), a leitura
cruzada muda de padrão conforme a metade de IA:

| Metade de IA | Leitura cruzada |
|---|---|
| 33 de 100 (Gestor Tático) | Liderança à frente — distância 35 |
| 80 de 100 (Criador de Tecnologia) | Mesmo patamar — distância 12 |

## O que BLOQUEIA o documento único, e não é layout

**Ninguém respondeu os dois.** Medido no banco em 15/09:

| | |
|---|---|
| Respondentes de liderança | 108 (94 com e-mail, 93 relatórios) |
| Leads do diagnóstico de IA | 3 |
| Pessoas nos dois | **0** |
| Ponte entre as tabelas | **não existe** |

As duas metades nascem de fluxos separados, com identidades separadas: a
liderança identifica por `respondentes.token_sessao`, com nome, empresa, cargo,
porte e nível declarados no início; o de IA é anônimo e só captura contato no
portão, no fim.

Construir o renderizador do documento antes de decidir **como as duas metades se
encontram** seria construir sobre areia: a decisão muda o que o documento recebe,
quando ele existe e para quem.

## As três saídas

### (a) Ligar por e-mail — barata, e retroativa

O de IA já captura e-mail no portão; a liderança já tem `email`. Uma coluna de
ligação e um casamento por e-mail normalizado bastam.
**A favor:** funciona para quem já respondeu um dos dois, sem mudar fluxo.
**Contra:** o e-mail do portão de IA é digitado no fim e pode não ser o mesmo
(pessoal × corporativo). Casamento por e-mail erra em silêncio.

### (b) Um fluxo só — mais limpa para quem responde, maior para construir

Um questionário que faz as 10 de liderança e as 30 de IA na mesma sessão.
**A favor:** uma identidade, um documento, sem casamento nenhum.
**Contra:** 40 itens numa sentada; é outro produto, não a soma de dois. E o de
IA é link público aberto, enquanto o de liderança é por evento com token.

### (c) Link carregando o token — o meio-termo

Quem termina a liderança recebe o link do de IA **já com o token da sessão
dele**, e as duas metades gravam na mesma pessoa.
**A favor:** identidade garantida, sem casamento por e-mail e sem questionário
de 40 itens. Aproveita os dois fluxos como estão.
**Contra:** só funciona para quem faz a liderança primeiro; quem chega pelo link
público de IA continua sem a outra metade.

**Recomendação: (c), com (a) como rede.** O token garante a ligação de quem
segue o caminho completo, e o casamento por e-mail recupera quem chegou pelos
dois lados em momentos diferentes — sinalizando a ligação como "provável", nunca
como certa.

## Próximo passo, depois da decisão

1. ~~A ponte no banco~~ — **aplicada em 15/09** (registro em
   [`DEPLOY.md`](../rhia/DEPLOY.md)), depois de três rodadas de revisão. Duas regras que a
   revisão obrigou a mudar, e que valem para quem for ler o documento:
   - **ambiguidade é divergência, não contagem.** Duas linhas com o mesmo
     e-mail são a mesma pessoa em dois eventos, não duas pessoas; só nome ou
     empresa divergentes indicam caixa compartilhada. Sem divergência, liga à
     linha mais recente — e ainda assim como *provável*;
   - **a ponte não lê `respondentes` por grant.** A tabela tem RLS e nenhuma
     policy alcança `screener_owner`: a leitura passa por duas funções de
     pergunta fechada, donas do lado de lá, que devolvem id e contagens —
     nunca nome ou empresa em texto.
2. ~~A emissão do convite e o consumo dele~~ — escritos, testados e **inertes no
   ar até dois secrets serem definidos**. O caminho inteiro e os passos para
   ligar estão em [`screener/ponte/`](../ponte/README.md).
3. O renderizador do documento: capa com a pessoa, síntese cruzada, as duas
   partes e o fecho. As duas metades já produzem seus blocos; o que falta é a
   costura e um lugar só para o CSS de impressão.
4. Um caminho de geração: hoje o PDF de liderança sai por `browserless` na edge
   `gate-and-send` e o de IA sai pela impressão do navegador. O documento único
   precisa de **um** caminho, e o da edge é o que já entrega por e-mail.
