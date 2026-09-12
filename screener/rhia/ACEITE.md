# Aceite — item a item do `CHECKLIST-DE-ACEITE.md` do pacote

O PROMPT §11 define o `CHECKLIST-DE-ACEITE.md` como *definition of done*. O
arquivo do pacote não pode ser editado (ele é verbatim e o sha256 é conferido em
`pacote-integro.test.mjs`), então a assinatura mora **aqui**: uma linha por item,
com o veredito e a prova.

Três vereditos possíveis:

- **COMPROVADO** — há comando, teste ou medição que prova. A prova está citada.
- **COMPROVADO POR INSPEÇÃO** — verificado no navegador ou no código, sem teste
  automatizado que o trave. Cada um desses é um risco de regressão declarado.
- **DIVERGÊNCIA AUTORIZADA** — o item não é alcançável na arquitetura decidida
  pela dona do produto (pacote + servidor da casa). O link aponta a decisão.

Comandos citados: `npm test` (estáticos), `npm run test:behavioral` (pglite),
`npm run test:dev` (dev server por HTTP), `npm run build` (testes + fronteira).
Medições no navegador: dev server em `http://localhost:4600/rhia.html`.

São 33 itens (10 + 8 + 7 + 8).

## Conteúdo e método

| # | Item | Veredito | Prova |
|---|---|---|---|
| 1 | As 30 questões vêm literalmente de `instrumento-rh-ia-v1.json` | COMPROVADO | `definicao.test.mjs` (enunciados e alternativas idênticos ao JSON); `edge-rhia.behavioral` compara a apresentação da rota com o JSON; `pacote-integro.test.mjs` prova que o JSON não foi alterado (sha256 do manifesto) |
| 2 | CTX01=OTHER abre texto obrigatório e o limpa quando a opção muda | COMPROVADO | `frontend-rhia.test.mjs` (`validarTextoOutro`, `textoAposTrocarOpcao`, `contextoCompleto`); `logica.test.mjs` (`texto_obrigatorio`); `rhia-rpc.behavioral` (validação no banco); `dev-rhia.test.mjs` (fluxo HTTP) |
| 3 | A tela orienta a manter a mesma área como referência | COMPROVADO POR INSPEÇÃO | Texto na abertura ("Responda pensando na mesma área do início ao fim") e na nota de transparência do contexto — `frontend/rhia.mjs`, `telaAbertura`/`telaContexto`; conferido no navegador |
| 4 | 3 contexto + 24 escalares + 3 gates; nenhuma questão adicional | COMPROVADO | `pacote/tests/output-engine-v2.test.mjs` (1º teste); `definicao.test.mjs` (30 itens na ordem, por grupo) |
| 5 | Cada dimensão exige 3/4 respostas válidas | COMPROVADO | `pacote/tests/output-engine-v2.test.mjs` ("cada dimensão exige três respostas válidas") |
| 6 | Pesos: 35% Liderança, 35% Processos, 30% IA | COMPROVADO | `pacote/tests` ("funções puras calculam eixos, posição e governança") + `pacote-integro.test.mjs` (o motor é byte a byte o do pacote) |
| 7 | Cortes e arredondamentos seguem o motor de referência | COMPROVADO | idem item 6; `motor-casos.test.mjs` confere os cinco degraus pela porta que a edge usa |
| 8 | Gate usa pior condição e não integra a nota | COMPROVADO | `pacote/tests` ("gate crítico bloqueia escala mesmo com alta capacidade"); `motor-casos.test.mjs` (E1/E2/E4 uniformes: governança muda, degrau não) |
| 9 | NIST aparece como ciclo de instrução, não como escada | COMPROVADO | `frontend-rhia.test.mjs` (a ordem das seções exige "funções complementares e recorrentes, não estágios"; a marcação é `<ol class="rh-ciclo">`, sem setas de progresso) |
| 10 | "Criador de Tecnologia" não exige propriedade, modelo próprio ou agentes | COMPROVADO | `frontend-rhia.test.mjs` ("a ressalva do quinto degrau é exibida SEMPRE"): a nota acompanha a escada em qualquer perfil, e no quinto degrau vale o texto do motor |

## Devolutiva

| # | Item | Veredito | Prova |
|---|---|---|---|
| 11 | Exibe degrau, referência/distância, assinatura, evidências, governança, NIST e plano | COMPROVADO | `frontend-rhia.test.mjs` (perfil rico: a ordem das 13 seções é assertada uma a uma) |
| 12 | No máximo 2 sustentadores, 2 limitadores e 2 tensões | COMPROVADO | `pacote-integro.test.mjs` (schema `maxItems: 2` validado contra contratos reais); `frontend-rhia.test.mjs` |
| 13 | Não exibe notas por dimensão, radar, pontos-base, códigos ou pesos | COMPROVADO | `frontend-rhia.test.mjs` (`assertSemVazamento` no DOM renderizado); `edge-rhia.behavioral` (corpo da rota); `fronteira-rhia.test.mjs` (artefato publicado); medição no navegador |
| 14 | Resultado usa linguagem probabilística e contém disclaimer | COMPROVADO | `frontend-rhia.test.mjs` (o disclaimer do motor aparece íntegro; o cabeçalho diz "hipótese orientativa"); os textos são os do pacote, verbatim |
| 15 | Gate crítico bloqueia escala e domina a orientação | COMPROVADO | `frontend-rhia.test.mjs` (gate crítico: `rh-gate--prioridade`, "Escala bloqueada", "condição que domina a decisão"); `motor-casos.test.mjs` (E1 uniforme → CRITICAL + NO_SCALE) |
| 16 | Informação insuficiente não força um posicionamento | COMPROVADO | `frontend-rhia.test.mjs` (`renderInsuficiente`: sem escada, com `missingMessage`); `logica.test.mjs`; `edge-rhia.behavioral` (status `INSUFFICIENT`) |
| 17 | Plano de 30–60–90 dias contém evidência verificável de conclusão | COMPROVADO | `frontend-rhia.test.mjs` (tabela com 3 linhas e a coluna "Evidência de conclusão") |
| 18 | Linguagem se adapta ao papel sem alterar o cálculo | COMPROVADO | `motor-casos.test.mjs` ("o papel muda só a lente do texto"): variando o papel, degrau, governança, restrição, extremos, tensões, referência e distância ficam idênticos e só `roleLens` muda |

## Produto e interface

| # | Item | Veredito | Prova |
|---|---|---|---|
| 19 | Mobile-first, teclado, foco visível, contraste AA e redução de movimento | COMPROVADO POR INSPEÇÃO | Medição no navegador a 320/375/414/900px: zero overflow horizontal (o título da abertura ganhou `clamp()` — ver DECISOES 1.7); foco sobrevive à repintura (verificado por tecla real e por clique); `radiogroup` nomeado pelo enunciado; `prefers-reduced-motion` e alvo de 44px no CSS, travados por `frontend-rhia.test.mjs` (o teste reprova bold e hex solto e exige os blocos `@media print`/`prefers-reduced-motion`). **Não há teste automatizado de layout** |
| 20 | Atualizar/reabrir preserva respostas localmente | DIVERGÊNCIA AUTORIZADA | O localStorage guarda só `{token, pos, tela}`; as respostas voltam do servidor por `GET /rhia/session` — [DECISOES.md](./DECISOES.md) 2.1 e 2.4, [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md) §4. O efeito para o participante (atualizar e reabrir não perdem nada) está coberto por `frontend-rhia.test.mjs` (persistência) e `dev-rhia.test.mjs` (retomada por HTTP) |
| 21 | Voltar não perde respostas; progresso é correto | COMPROVADO | `frontend-rhia.test.mjs` (`progresso`, `primeiraNaoRespondida`, `itensFaltantes`, `telaDoHash`); `edge-rhia.behavioral` (autosave idempotente e retomada) |
| 22 | PDF/impressão não corta seções essenciais | COMPROVADO POR INSPEÇÃO | `@media print` com `break-inside: avoid` em todos os blocos, cabeçalho com data e versão, medida de leitura de 40em (conferida no CSSOM do navegador); `frontend-rhia.test.mjs` exige o bloco. **Não há verificação de quebra de página em PDF real** — limitação registrada no RELATORIO |
| 23 | Não há dependência obrigatória de backend ou LLM | DIVERGÊNCIA AUTORIZADA | Sem LLM em ponto nenhum (o motor é determinístico). O backend **é** obrigatório por decisão da dona do produto: as 30 questões chegam pela edge e o motor roda no servidor, para não publicar o instrumento no artefato estático — [DECISOES.md](./DECISOES.md) 2.1–2.3 |
| 24 | Sem erros no console; funciona por servidor local estático | DIVERGÊNCIA AUTORIZADA (parte) | Console limpo no fluxo feliz (verificado no navegador). "Só estático" não se aplica pela mesma decisão do item 23: `scripts/preview-static.mjs` serve a casca e avisa que sem a edge o formulário não carrega; o equivalente local é `npm run dev` (estático + edge + banco efêmero) |
| 25 | Estados vazio, carregando, erro e insuficiente estão desenhados | COMPROVADO | `frontend-rhia.test.mjs` (`renderResultado(null)` não quebra; `renderInsuficiente`; `descreverErro`/`mensagemErro` por status); telas de carregando e erro em `frontend/rhia.mjs`, verificadas no navegador |

## Testes obrigatórios

| # | Item | Veredito | Prova |
|---|---|---|---|
| 26 | `node --test tests/output-engine-v2.test.mjs` passa | COMPROVADO | Roda dentro de `npm test` (glob `screener/rhia/pacote/tests/*.test.mjs`): 8 testes verdes |
| 27 | E1, E2, E3 e E4 uniformes | COMPROVADO | `motor-casos.test.mjs` (os quatro; E3 também no pacote). Antes desta rodada só E3 existia — a tabela do RELATORIO afirmava cobertura que não havia |
| 28 | Um ou dois NA na mesma dimensão | COMPROVADO | `frontend-rhia.test.mjs` (1 NA por dimensão → evidência "limitada"; 2 NA na mesma dimensão → `INSUFFICIENT`); `pacote/tests`; `edge-rhia.behavioral` |
| 29 | Referência inconclusiva por divergência de alcance/autoridade | COMPROVADO | `pacote/tests` ("referência fica inconclusiva…"); `frontend-rhia.test.mjs` (a tela diz "Referência de posição inconclusiva" e não marca degrau) |
| 30 | Capacidade alta + gate crítico | COMPROVADO | `pacote/tests` ("gate crítico bloqueia escala mesmo com alta capacidade"); `frontend-rhia.test.mjs` (a tela do gate crítico) |
| 31 | IA muito à frente e IA muito atrás | COMPROVADO | `motor-casos.test.mjs` (`AI_AHEAD_OF_MANAGEMENT` e `HUMAN_SYSTEM_AHEAD_OF_AI`); o caso "à frente" também está no pacote |
| 32 | Resultado equilibrado sem falsos extremos | COMPROVADO | `motor-casos.test.mjs` (uniformes: `supporters`/`limiters`/`tensions` vazios); `frontend-rhia.test.mjs` (a tela diz que a evolução é homogênea). Ressalva metodológica: quando a amplitude chega a 833 o motor destaca a dimensão mais extrema ainda que abaixo do limiar — divergência registrada em [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md) §4 |
| 33 | CTX01 "Outro": mostrar, validar, persistir e limpar | COMPROVADO | `frontend-rhia.test.mjs`; `logica.test.mjs`; `rhia-rpc.behavioral` (limites 2–120, caractere de controle); `edge-rhia.behavioral`; `dev-rhia.test.mjs` |

## Resumo

- 27 itens **COMPROVADOS** por teste automatizado.
- 3 itens **COMPROVADOS POR INSPEÇÃO** (3, 19, 22) — sem teste que trave a
  regressão; conferir à mão antes de cada publicação.
- 3 itens em **DIVERGÊNCIA AUTORIZADA** (20, 23, 24) — todos consequência da
  mesma decisão de arquitetura (pacote + servidor da casa), registrada em
  DECISOES 2.1–2.4 antes desta verificação.

A *definition of done* do PROMPT §11 está assinável nestes termos: nenhum item
em aberto, nenhuma divergência sem decisão escrita.
