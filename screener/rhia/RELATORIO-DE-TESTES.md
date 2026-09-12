# Relatório de testes — Diagnóstico Boomit RH + IA v2 ("rhia")

Executado em 12/09/2026, no worktree `ia-maturity-diagnostic-module-54e0fb`.
Node v24.19.0. Nada foi aplicado a produção: as migrations são arquivos no
repositório e todo teste de banco roda contra um Postgres efêmero (pglite).

> **Segunda rodada (12/09, pós-revisão adversarial).** Quatro revisores
> independentes (fronteira, fidelidade metodológica, UI/a11y, integração)
> refutaram afirmações da primeira versão deste relatório — inclusive a de
> "zero overflow a 320px" e a de cobertura dos casos uniformes E1/E2. As
> correções aplicadas estão na seção **Correções da revisão adversarial**, e as
> afirmações abaixo já são as da rodada corrigida.

## Comandos e resultados

| Comando | Testes | Passa | Falha | Skip |
|---|---:|---:|---:|---:|
| `npm test` (estáticos: rhia + regressão V1) | 207 | 207 | 0 | 0 |
| `npm run test:behavioral` (pglite) | 116 | 115 | 0 | 1 |
| `npm run test:dev` (dev server, HTTP real) | 5 | 5 | 0 | 0 |

O único `skip` é herdado do V1 (existia antes deste trabalho) e não pertence ao
rhia. Nenhuma falha.

### Por suíte — estáticos

| Suíte | Testes | O que prova |
|---|---:|---|
| `screener/rhia/definicao.test.mjs` | 13 | Apresentação pública com os 30 itens na ordem do JSON, sem `scale`/`facet`/pesos; literalidade de enunciados e alternativas; `conditional_field` de CTX01; `canonicalize` local idêntico ao do motor; `checksum()` igual ao `sha256` do motor; núcleo sem `node:`. |
| `screener/rhia/logica.test.mjs` | 18 | Validação item a item (opção por tipo, texto livre 2–120 sem caractere de controle), submissão completa, canônico determinístico, `respostasParaMotor`, `paraPublico` sem `internal` e sem pontos-base. |
| `screener/rhia/motor-casos.test.mjs` | 7 | Os casos obrigatórios do PROMPT §9 pela porta da casa (`calcularContrato`): E1, E2, E3 e E4 uniformes; IA muito à frente e muito atrás do sistema humano; papel não altera degrau, governança nem extremos. |
| `screener/rhia/pacote-integro.test.mjs` | 6 | Os dois guards do pacote passam a ser executáveis: os 11 sha256 do `MANIFESTO-SHA256.txt` conferem byte a byte, e o contrato do motor obedece ao `result-contract-v2.schema.json` nos três ramos (normal, `INSUFFICIENT`, modelo público). |
| `screener/rhia/frontend-rhia.test.mjs` | 34 | Helpers puros do app; cliente e cabeçalhos (credencial só em `x-preview-key`, token só em `x-session-token`, nunca na URL); persistência versionada, inclusive com armazenamento que lança; render do resultado sem códigos internos no DOM. **Vive fora de `frontend/`** — o Netlify publica aquele diretório inteiro e este teste carrega o motor privado. |
| `screener/rhia/fronteira-rhia.test.mjs` | 5 | O diretório publicado (`frontend/`, do `netlify.toml`) não contém enunciados, ids de item nem o código do instrumento; nenhum arquivo publicado carrega pontos-base, código de estágio ou eixo interno; nenhum importa de fora do publish dir; nenhum arquivo de teste novo mora lá dentro. |
| `screener/loader/gerar-carga-rhia.test.mjs` | 11 | Carga gerada sem drift com a migration commitada; checksum igual ao da edge e ao do motor; guardas explícitas, sem `ON CONFLICT`. |
| `screener/rhia/pacote/tests/output-engine-v2.test.mjs` | 8 | O motor do pacote, intacto — importado, não reescrito. |
| `scripts/dev-rhia.test.mjs` | 5 | Dev server: injeção da configuração, estático, carga do repositório no ar, fluxo completo por HTTP com portão, e recusa de resposta inválida pelo servidor. |

Os demais testes de `npm test` são a regressão do V1 (motor, edge, loader e
frontend V1), que continuam verdes — inclusive
`screener/motor/fronteira-de-publicacao.test.mjs`, que voltou ao texto original
(ver correção 3).

### Por suíte — comportamentais (pglite, Postgres real)

As três suítes do rhia somam **56 testes**, todos verdes:

| Suíte | Testes |
|---|---:|
| `rhia-rpc.behavioral.test.mjs` | 19 |
| `edge-rhia.behavioral.test.mjs` | 29 |
| `carga-rhia.behavioral.test.mjs` | 8 |

- `rhia-rpc.behavioral.test.mjs` — as 7 funções `SECURITY DEFINER`: fluxo completo
  com `CTX01=OTHER` (31 linhas de resposta), canônico do SQL idêntico ao da edge,
  `respostas_mudaram`, idempotência, imutabilidade do snapshot, validação contra a
  definição gravada, texto livre (curto, longo, com caractere de controle, limites
  inclusivos), gate de lead **nos dois modos**, credencial de prévia, e a fronteira de
  privilégio (`screener_runtime` só com `EXECUTE` nas 7 — incluída a
  `screener_rhia_op_get_binding` —, zero acesso às tabelas, `service_role` sem nada).
- `edge-rhia.behavioral.test.mjs` — as 7 rotas `/rhia/*`: apresentação pública,
  consentimento, ciclo de vida do token, autosave idempotente, submissão, portão de
  lead (`required_before_result`) e modo `optional_after_submit`, evidência
  insuficiente, `internal_preview` com e sem credencial, o aparo de caractere de
  controle no lead (e a prova de que o texto do Postgres não vaza), e a prova de que o
  corpo público não carrega pontos-base, pesos, códigos de estágio nem as respostas.
- `carga-rhia.behavioral.test.mjs` — a carga cria o instrumento e o vínculo público,
  é idempotente, recusa checksum e configuração divergentes, e o vínculo criado
  dirige a edge sem credencial.

## Cobertura dos testes obrigatórios (PROMPT §9)

| Exigência | Onde é coberta |
|---|---|
| Contagem e literalidade das 30 questões | `definicao.test.mjs`; `edge-rhia.behavioral` (enunciados comparados ao JSON); `pacote-integro.test.mjs` (o JSON não foi alterado) |
| E1/E2/E3/E4 uniformes | `motor-casos.test.mjs` (os quatro, com degrau + governança + restrição esperados); E3 também em `pacote/tests/output-engine-v2.test.mjs` |
| 2 NA na mesma dimensão impede síntese | `pacote/tests`; `frontend-rhia.test.mjs` (tela de evidência insuficiente); `edge-rhia.behavioral` (status `INSUFFICIENT`) |
| 1 NA por dimensão ainda permite síntese | `pacote/tests`; `frontend-rhia.test.mjs` |
| Referência inconclusiva | `pacote/tests` (`calculateReference` divergente); `frontend-rhia.test.mjs` |
| Alta capacidade + gate crítico | `pacote/tests` (nível preservado, escala bloqueada); `frontend-rhia.test.mjs` |
| IA à frente e IA atrás do sistema humano | `motor-casos.test.mjs` (`AI_AHEAD_OF_MANAGEMENT` e `HUMAN_SYSTEM_AHEAD_OF_AI`); o caso "à frente" também no `pacote/tests` |
| Perfil equilibrado sem extremo artificial | `motor-casos.test.mjs` (nos uniformes, `supporters`/`limiters`/`tensions` vazios) — com a ressalva de `selectExtremes` registrada em [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md) §4 |
| CTX01 "Outro" completo | `logica.test.mjs`, `frontend-rhia.test.mjs`, `rhia-rpc.behavioral`, `edge-rhia.behavioral`, `dev-rhia.test.mjs` e verificação no navegador |
| Persistência, retorno, reinício | `frontend-rhia.test.mjs` (store em memória e store que lança); retomada via `GET /rhia/session` em `edge-rhia.behavioral` |
| Impressão | `@media print` verificado no navegador (bloco presente, medida de leitura preservada); **não há teste automatizado de layout impresso** |
| Ausência de notas/códigos no DOM público | `frontend-rhia.test.mjs` (render do resultado), `edge-rhia.behavioral`, `fronteira-rhia.test.mjs` (varredura do publish dir), e varredura do DOM no navegador |
| Nenhum erro no console no fluxo feliz | verificado no navegador |

O aceite item a item do `CHECKLIST-DE-ACEITE.md` do pacote (33 itens, com
veredito e prova) está em [ACEITE.md](./ACEITE.md).

## Verificação no navegador (12/09, refeita após as correções)

Dev server em `http://localhost:4600/rhia.html`, fluxo percorrido do início ao fim:

- **Abertura** — marca, promessa, "cerca de 8–10 minutos", aviso de hipótese
  orientativa e a instrução de manter a mesma área.
- **Contexto** — as 3 perguntas literais. `CTX01 = Outro papel` abre o campo de
  texto; texto de 1 caractere é recusado ("Use pelo menos 2 caracteres.") e a tela
  não avança; ao trocar de opção o campo **some**; ao voltar para "Outro" ele
  reaparece **vazio**.
- **Questões** — uma por tela, com o grupo e a dimensão em linguagem humana
  ("Práticas · Estratégia e valor para o negócio"), alternativas literais com NA,
  progresso real ("Pergunta 4 de 30").
- **Revisão** — 30 linhas em três grupos (Contexto, Práticas, Governança), todas
  editáveis, **sem nenhuma nota**.
- **Portão de lead** — o resultado não aparece; e-mail inválido é recusado com a
  mensagem **abaixo do campo**, ligada por `aria-describedby="sc-lead-email-erro"`,
  com `aria-invalid="true"` e o foco devolvido ao próprio campo; com e-mail válido,
  a leitura é liberada.
- **Resultado** — as 11 seções na ordem da arquitetura. Escada de cinco degraus com
  **um único destaque** (`is-atual` + "Degrau atual"); nenhum `is-ref` no DOM e a
  ressalva do quinto degrau ("não exige tecnologia proprietária, modelos próprios ou
  agentes de IA") impressa sob a escada em todos os perfis.
- **Fronteira** — varredura do texto visível do resultado não encontrou `E1`–`E4`,
  `3333`, `6667`, `10000`, `P1`–`P5`, `weakestBp`, `leadership_bp`, `process_bp`,
  `ai_bp` nem ids de item.
- **Acessibilidade** — `<main id="sc-app">` **não é mais live region**; os três
  radiogroups do contexto têm por nome acessível o **enunciado**
  (`aria-labelledby` → `rh-ctx-p-CTX01/02/03`), não "Alternativas"; e responder na
  tela de contexto **preserva o foco** (medido: antes `input[data-item=CTX01]`,
  depois o mesmo input — não o `<body>`).
- **Mobile** — medido a **320, 375 e 414px** na tela de abertura e a 320px em
  contexto, questões, portão e resultado: `documentElement.scrollWidth` igual ao
  `clientWidth` em todas, isto é, **zero overflow horizontal**. O título da abertura
  agora escala (28px a 320, 31,9px a 375, 35,2px a 414) em vez dos 48px fixos do V1.
  `prefers-reduced-motion` respeitado; bloco `@media print` presente, com a medida de
  leitura de 40em preservada no papel.

## Correções feitas durante a construção

1. **Vazamento de pontos-base no ramo `INSUFFICIENT`.** O motor do pacote, quando
   não há evidência para sintetizar, devolve os objetos `governance` e `evidence`
   inteiros — e eles carregam `weakestBp` (pontos-base), `rank`, `canSynthesize` e
   `validDimensions`. O ramo normal já projeta só o que é público. `paraPublico`
   passou a igualar os dois, sanitizando na nossa fronteira **sem alterar o motor**.
   O teste que contornava a lacuna virou estrito. `pacote-integro.test.mjs` agora
   prova que a sanitização aproxima o ramo do `result-contract-v2.schema.json`
   declarado pelo pacote, em vez de afastá-lo dele.
2. **`lead_capture_mode` ausente na abertura.** A `screener_op_get_binding` do V1
   (em produção, intocável) não projeta o campo, e o frontend precisa dele já na
   abertura para saber se há portão. Criamos `screener_rhia_op_get_binding` — função
   nova, na nossa migration, com o mesmo contrato mais o campo. São, portanto, **7**
   funções `screener_rhia_op_*`, e a 7ª entrou no teste de privilégios.
3. **Guard do protótipo legado — revertido ao original.** Durante a construção,
   `fronteira-de-publicacao.test.mjs` (V1) foi afrouxado para casar `ia.html` só com
   limite de palavra, porque reprovava a string `rhia.html` escrita dentro de
   `frontend/rhia.test.mjs`. Com o teste do front movido para fora do publish dir,
   nenhum arquivo publicado contém mais essa string: **o guard voltou ao
   `txt.includes("ia.html")` original** e o V1 ficou sem nenhuma alteração nossa.

## Correções da revisão adversarial (12/09)

| # | Achado | O que mudou |
|---|---|---|
| 1 | `frontend/rhia.test.mjs` era **publicado pelo Netlify** e carregava pontos-base, códigos de estágio, eixos internos e o caminho do motor privado | Movido para `screener/rhia/frontend-rhia.test.mjs`; `npm test` ajustado; três guards novos em `fronteira-rhia.test.mjs` (marcadores internos, import para fora do publish dir, arquivo de teste no publish dir) |
| 2 | `mapErroSql` devolvia o texto cru do Postgres em `detalhe` | Ramo padrão responde só `{error:"conflito"}`; o nome do lead é aparado de caracteres de controle antes da RPC e e-mail com controle é recusado como inválido |
| 3 | A escada destacava **dois** degraus (atual + referência), contra o PROMPT §5.2 | `is-ref`, `rh-escada__tag--ref` e "Também sua referência" removidos de `rhia.mjs` e `rhia.css`; `escadaComAtual` perdeu o parâmetro; teste e DECISOES 1.5 corrigidos |
| 4 | LIMITES §3 descrevia o limiar de sustentador/limitador como o do motor, mas `selectExtremes` destaca a mais extrema mesmo abaixo de 833 | Linha da tabela corrigida e divergência PROMPT §6 × motor registrada em LIMITES §4, com o caso numérico |
| 5 | Cinco das seis dimensões têm nome diferente no JSON e no motor | Ambiguidade registrada em DECISOES 2.6.1 (tabela de-para) e em LIMITES §4; nenhuma fonte reescrita |
| 6 | `screener_rhia_op_get_binding` fora do teste de privilégios | Acrescentada ao array; cabeçalho do arquivo, CONTRATO, README e DEPLOY passaram de "6" para "7 funções" |
| 7 | A ressalva do quinto degrau só aparecia a quem caía em P5 | `NOTA_QUINTO_DEGRAU` exibida sempre sob a escada (a palavra do motor quando ele a manda) |
| 8 | Overflow horizontal de 107px na abertura a 320px (título a 48px fixos do V1) | `.rh-hero .sc-hero__title` com `clamp()` só no rhia; medido a 320/375/414 |
| 9 | Responder no contexto jogava o foco no `<body>` | `pintar()` guarda a marca do elemento em foco e o devolve depois de trocar o DOM |
| 10 | `<main>` inteiro era `aria-live="polite"` | Removido; ficam os `role="status"`/`role="alert"` pontuais e o foco programático |
| 11 | Três radiogroups com o mesmo `aria-label="Alternativas"` | `aria-labelledby` apontando para o enunciado, no contexto e nas questões |
| 12 | Erro do portão de lead sem `aria-describedby`, acima do campo, sem foco | Erro do campo abaixo do campo, com id fixo, `aria-describedby` e foco devolvido |
| 13 | `@media print` zerava o `max-width` de 65ch da devolutiva | `max-width: 40em; margin: 0 auto` na impressão |
| 14 | Três testes obrigatórios do PROMPT §9 não existiam (E1, E2, IA atrás) e o relatório afirmava cobertura | `motor-casos.test.mjs` (7 testes, na suíte da casa — o arquivo do pacote não foi tocado); a tabela de cobertura acima foi corrigida |
| 15 | `CHECKLIST-DE-ACEITE.md` sem nenhum item ligado a prova | [ACEITE.md](./ACEITE.md): 33 itens com veredito (COMPROVADO / POR INSPEÇÃO / DIVERGÊNCIA AUTORIZADA) e prova citada |
| 16 | `MANIFESTO-SHA256.txt` e `result-contract-v2.schema.json` não eram usados por teste nenhum | `pacote-integro.test.mjs` executa os dois |
| 17 | `get_result` anunciava `lead_required` antes de haver snapshot, tornando o 404 `sem_resultado` inalcançável em produção | A RPC consulta o snapshot antes do portão; sem snapshot devolve `lead_required:false`. Os testes de RPC e de edge passaram a exercer **os dois modos**, inclusive `required_before_result` |

Achados recusados: nenhum. Nenhum dos 17 pedia reescrever questão, alterar a
semântica do motor do pacote, mexer em peso/corte/limiar ou tocar produção.

## Limitações remanescentes

- **Impressão não é testada automaticamente.** O bloco `@media print` existe e foi
  inspecionado, mas não há verificação de quebra de página em PDF real. Conferir à
  mão antes do piloto.
- **Três itens do checklist só têm prova por inspeção** (3, 19, 22 em
  [ACEITE.md](./ACEITE.md)) — sem teste que trave a regressão.
- **Três itens do checklist são divergência autorizada** (20, 23, 24): o app depende
  da edge para as questões, por decisão de arquitetura registrada em DECISOES 2.1.
- **Pesos, cortes e limiares são heurísticos de piloto** — ver
  [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md). Nada aqui constitui escala
  validada. Duas divergências do pacote consigo mesmo (limiar de extremos e nomes de
  dimensão) estão registradas lá e em DECISOES, não resolvidas por nós.
- **`npm run test:behavioral` exige `npm ci` uma vez** dentro de
  `screener/loader/behavioral` (é onde o pglite vive).
- **Nada foi aplicado a produção.** As migrations `20260912120000` e `20260913120000`
  são arquivos; o roteiro de aplicação está em [DEPLOY.md](./DEPLOY.md).
