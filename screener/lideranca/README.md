# Motor da liderança

O cálculo do Diagnóstico Estratégico de Liderança, que antes vivia no navegador
e agora vive no servidor.

## O que era, e por que mudou

A edge `gate-and-send` recebia letra de maturidade, score, CDL em reais e risco
percentual **prontos** no corpo da requisição, e gravava sem conferir. Na
prática, quem abrisse o console do navegador escolhia o próprio resultado — e a
Boomit gerava e enviava por e-mail um PDF, com a sua marca, carregando aquele
número.

Não foi preciso mudar o cliente para consertar: as respostas já estão na tabela
`respostas` com `dimensao`, `lente` e `valor`, gravadas uma a uma enquanto a
pessoa responde. A edge passou a recalcular da fonte.

## O defeito que a mudança expôs

Existiam **duas fórmulas de CDL e duas de risco** rodando ao mesmo tempo: uma na
tela e outra no corpo da requisição — e portanto no PDF enviado. Para o mesmo
respondente (porte S1, C-level, score 3,7):

| | CDL | Risco |
|---|---|---|
| Na tela | R$ 39.000 a R$ 91.000 | 32% |
| No PDF enviado | R$ 62.400 a R$ 273.000 | 26% |

Os valores do PDF batem com relatórios já entregues a clientes. A pessoa via um
número na tela e recebia outro por e-mail, e o do e-mail virou documento.

**A canônica passou a ser a do PDF.** Não por ser melhor: é a que já foi
entregue, e trocá-la faria os relatórios novos discordarem dos antigos sem
ninguém ter decidido isso. A outra está registrada no cabeçalho de
[`motor.mjs`](./motor.mjs) para que a escolha seja explícita quando for revista.

## Onde cada coisa vive

| | |
|---|---|
| A matemática, uma vez só | [`motor.mjs`](./motor.mjs) — puro, sem DOM e sem rede |
| Quem manda | a edge `gate-and-send`, que recalcula e ignora o que vem de fora |
| A tela | `frontend/index.html` reproduz as mesmas fórmulas só para não discordar do documento |

A tela ainda calcula localmente porque o resultado aparece antes da resposta do
servidor. As três cópias das fórmulas (tela, envio e servidor) estão marcadas
com aviso: **enquanto houver mais de uma, elas podem voltar a divergir.** O
caminho definitivo é a tela renderizar a partir da resposta do servidor, e está
anotado como próximo passo.

## O que mais mudou junto

- **Respostas incompletas** produziam `NaN` silencioso, que viraria "R$ NaN" num
  PDF enviado ao cliente. A edge agora responde **409** com a lista do que falta.
- **Os gráficos do PDF** (radar, componentes, competências, régua) liam o
  `scores_json` do corpo da requisição. Passaram a ler o do relatório, que é o do
  servidor — trocar só a letra e o CDL deixaria metade do documento ainda
  desenhada com número vindo do navegador.
- **O que o cliente afirma** continua gravado, como auditoria, junto com a lista
  de divergências. Não alimenta relatório nenhum.

## Testes

`npm test` inclui `motor.test.mjs`. O que mais importa ali é o **teste de
paridade**: ele reproduz um relatório real (score 74, CDL de R$ 62.400 a
R$ 273.000, risco 26%). Se cair, o servidor passou a produzir documento
diferente do que a empresa já entregou — e isso não pode acontecer por acidente.

## Registro de aplicação

| Data | O que |
|---|---|
| 15/09/2026 | `gate-and-send` redeployada, **versão 14 → 15**. Preflight e verificação: token inexistente devolve 404 (prova que o módulo carregou — import quebrado daria 500), entrada inválida segue em 400, método errado em 405. Rollback: redeploy da versão 14 (`ezbr_sha256` `625c12da…`). |

## Próximo passo

A tela renderizar a partir da resposta do servidor, eliminando as cópias das
fórmulas no cliente. Exige a edge devolver o resultado calculado no corpo da
resposta e o cliente esperar por ela antes de desenhar.
