# Relatório de testes — Diagnóstico Boomit RH + IA v2 ("rhia")

Executado em 12/09/2026, no worktree `ia-maturity-diagnostic-module-54e0fb`.
Node v24.19.0. Nada foi aplicado a produção: as migrations são arquivos no
repositório e todo teste de banco roda contra um Postgres efêmero (pglite).

## Comandos e resultados

| Comando | Testes | Passa | Falha | Skip |
|---|---:|---:|---:|---:|
| `npm test` (estáticos: rhia + regressão V1) | 190 | 190 | 0 | 0 |
| `npm run test:behavioral` (pglite) | 115 | 114 | 0 | 1 |
| `npm run test:dev` (dev server, HTTP real) | 5 | 5 | 0 | 0 |

O único `skip` é herdado do V1 (existia antes deste trabalho) e não pertence ao
rhia. Nenhuma falha.

### Por suíte — estáticos

| Suíte | Testes | O que prova |
|---|---:|---|
| `screener/rhia/definicao.test.mjs` | 13 | Apresentação pública com os 30 itens na ordem do JSON, sem `scale`/`facet`/pesos; literalidade de enunciados e alternativas; `conditional_field` de CTX01; `canonicalize` local idêntico ao do motor; `checksum()` igual ao `sha256` do motor; núcleo sem `node:`. |
| `screener/rhia/logica.test.mjs` | 18 | Validação item a item (opção por tipo, texto livre 2–120 sem caractere de controle), submissão completa, canônico determinístico, `respostasParaMotor`, `paraPublico` sem `internal` e sem pontos-base. |
| `screener/rhia/fronteira-rhia.test.mjs` | 2 | O diretório publicado (`frontend/`, do `netlify.toml`) não contém enunciados, ids de item nem o código do instrumento — as questões chegam pela edge. |
| `frontend/rhia.test.mjs` | 33 | Helpers puros do app; cliente e cabeçalhos (credencial só em `x-preview-key`, token só em `x-session-token`, nunca na URL); persistência versionada, inclusive com armazenamento que lança; render do resultado sem códigos internos no DOM. |
| `screener/loader/gerar-carga-rhia.test.mjs` | 11 | Carga gerada sem drift com a migration commitada; checksum igual ao da edge e ao do motor; guardas explícitas, sem `ON CONFLICT`. |
| `screener/rhia/pacote/tests/output-engine-v2.test.mjs` | 8 | O motor do pacote, intacto — importado, não reescrito. |
| `scripts/dev-rhia.test.mjs` | 5 | Dev server: injeção da configuração, estático, carga do repositório no ar, fluxo completo por HTTP com portão, e recusa de resposta inválida pelo servidor. |

Os demais testes de `npm test` são a regressão do V1 (motor, edge, loader e
frontend V1), que continuam verdes.

### Por suíte — comportamentais (pglite, Postgres real)

As três suítes do rhia somam **55 testes**, todos verdes:

- `rhia-rpc.behavioral.test.mjs` — as 7 funções `SECURITY DEFINER`: fluxo completo
  com `CTX01=OTHER` (31 linhas de resposta), canônico do SQL idêntico ao da edge,
  `respostas_mudaram`, idempotência, imutabilidade do snapshot, validação contra a
  definição gravada, texto livre (curto, longo, com caractere de controle, limites
  inclusivos), gate de lead, credencial de prévia, e a fronteira de privilégio
  (`screener_runtime` só com `EXECUTE`, zero acesso às tabelas, `service_role` sem nada).
- `edge-rhia.behavioral.test.mjs` — as 7 rotas `/rhia/*`: apresentação pública,
  consentimento, ciclo de vida do token, autosave idempotente, submissão, portão de
  lead (`required_before_result`) e modo `optional_after_submit`, evidência
  insuficiente, `internal_preview` com e sem credencial, e a prova de que o corpo
  público não carrega pontos-base, pesos, códigos de estágio nem as respostas.
- `carga-rhia.behavioral.test.mjs` — a carga cria o instrumento e o vínculo público,
  é idempotente, recusa checksum e configuração divergentes, e o vínculo criado
  dirige a edge sem credencial.

## Cobertura dos testes obrigatórios (PROMPT §9)

| Exigência | Onde é coberta |
|---|---|
| Contagem e literalidade das 30 questões | `definicao.test.mjs`; `edge-rhia.behavioral` (enunciados comparados ao JSON) |
| E1/E2/E3/E4 uniformes | `pacote/tests/output-engine-v2.test.mjs` (E3 uniforme, E4 uniforme) e `edge-rhia.behavioral` |
| 2 NA na mesma dimensão impede síntese | `pacote/tests`; `edge-rhia.behavioral` (status `INSUFFICIENT`) |
| 1 NA por dimensão ainda permite síntese | `pacote/tests` |
| Referência inconclusiva | `pacote/tests` (`calculateReference` divergente) |
| Alta capacidade + gate crítico | `pacote/tests` (nível preservado, escala bloqueada) |
| IA à frente e IA atrás do sistema humano | `pacote/tests` (assinaturas) |
| Perfil equilibrado sem extremo artificial | `pacote/tests` |
| CTX01 "Outro" completo | `logica.test.mjs`, `rhia-rpc.behavioral`, `edge-rhia.behavioral`, `dev-rhia.test.mjs` e verificação no navegador |
| Persistência, retorno, reinício | `frontend/rhia.test.mjs` (store em memória e store que lança); retomada via `GET /rhia/session` em `edge-rhia.behavioral` |
| Impressão | `@media print` verificado no navegador (bloco presente); **não há teste automatizado de layout impresso** |
| Ausência de notas/códigos no DOM público | `frontend/rhia.test.mjs` (render do resultado), `edge-rhia.behavioral`, e varredura do DOM no navegador |
| Nenhum erro no console no fluxo feliz | verificado no navegador |

## Verificação no navegador (12/09)

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
- **Portão de lead** — o resultado não aparece; e-mail inválido é recusado
  ("Informe um e-mail válido."); com e-mail válido, a leitura é liberada.
- **Resultado** — as 11 seções na ordem da arquitetura, escada de cinco degraus com
  "Degrau atual" no terceiro (Estrategista de Escala).
- **Fronteira** — varredura do texto visível não encontrou `E1`–`E4`, `3333`,
  `6667`, `10000`, `P1`–`P5`, `weakestBp`, `leadership_bp` nem ids de item.
- **Mobile (320px)** — nenhum elemento ultrapassa a largura do documento; zero
  overflow horizontal. `prefers-reduced-motion` respeitado; bloco `@media print`
  presente.

## Correções feitas durante a verificação

1. **Vazamento de pontos-base no ramo `INSUFFICIENT`.** O motor do pacote, quando
   não há evidência para sintetizar, devolve os objetos `governance` e `evidence`
   inteiros — e eles carregam `weakestBp` (pontos-base), `rank`, `canSynthesize` e
   `validDimensions`. O ramo normal já projeta só o que é público. `paraPublico`
   passou a igualar os dois, sanitizando na nossa fronteira **sem alterar o motor**.
   O teste que contornava a lacuna virou estrito.
2. **`lead_capture_mode` ausente na abertura.** A `screener_op_get_binding` do V1
   (em produção, intocável) não projeta o campo, e o frontend precisa dele já na
   abertura para saber se há portão. Criamos `screener_rhia_op_get_binding` — função
   nova, na nossa migration, com o mesmo contrato mais o campo.
3. **Falso positivo no guard do protótipo legado.** `fronteira-de-publicacao.test.mjs`
   procurava a substring `ia.html` e reprovava `rhia.html`. O guard passou a exigir
   limite de palavra; a intenção (barrar o protótipo legado) está preservada.

## Limitações remanescentes

- **Impressão não é testada automaticamente.** O bloco `@media print` existe e foi
  inspecionado, mas não há verificação de quebra de página em PDF real. Conferir à
  mão antes do piloto.
- **Não houve rodada de revisão adversarial.** O workflow que a faria parou por
  limite de sessão; as lentes de fronteira, fidelidade metodológica, UI/a11y e
  integração ainda não foram executadas por revisores independentes.
- **Pesos, cortes e limiares são heurísticos de piloto** — ver
  [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md). Nada aqui constitui escala
  validada.
- **`npm run test:behavioral` exige `npm ci` uma vez** dentro de
  `screener/loader/behavioral` (é onde o pglite vive).
- **Nada foi aplicado a produção.** As migrations `20260912120000` e `20260913120000`
  são arquivos; o roteiro de aplicação está em [DEPLOY.md](./DEPLOY.md).
