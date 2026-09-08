# Edge roteadora do screener — contratos (corte 3)

Escrita + testes, **sem deploy**. A rota não é exposta ainda.

## Princípios
- O navegador nunca recebe `service_role`, pontos, estágios (E1–E4), pesos, regras,
  gabarito nem respostas individuais. Só a **projeção pública sanitizada** e o
  **`PublicResultV1`**.
- O token de sessão é **gerado no servidor** (aleatoriedade criptográfica) e
  devolvido uma única vez; o banco guarda **apenas o hash** (SHA-256 hex 64).
- O token trafega **sempre no header `x-session-token`** (ou no corpo, em POST),
  **nunca na query string**: o gateway registra a URL inteira nos logs de acesso,
  e o token na query vazaria (comprovado no branch). A credencial de prévia vai
  no header `x-preview-key`.
- Toda operação revalida **estado do vínculo, vigência e sessão**, e é escopada por
  `binding_id` (a sessão aponta para o vínculo, não para um slug solto).
- Cálculo e snapshot acontecem **na edge** (motor determinístico), nunca no cliente.

## Rotas
| Rota | Cria sessão? | Entrada | Saída |
|---|---|---|---|
| `GET /start` | não | `event_slug` (+ credencial se prévia) | apresentação + aviso de privacidade + estado |
| `POST /start` | sim | `event_slug`, ciência do aviso (+ credencial se prévia) | `session_id`, **token** (uma vez), projeção sanitizada |
| `GET /session` | não (retoma) | `token` | projeção sanitizada + respostas já dadas (por id opaco) + progresso |
| `PUT /response` | não | `token`, `item_id` opaco, `option_id` opaco | ok/estado; **nunca** aceita `stage_code`/pontos |
| `POST /submit` | não (fecha) | `token` | `PublicResultV1` (atômico, idempotente) |
| `GET /result` | não | `token` | `PublicResultV1` sanitizado |
| `POST /lead` | não | `token`, `email` (+`nome`,`marketing_opt_in`) | `{ok}` — captura lead (degustação) |

`POST /lead` (degustação pública): único caminho de escrita da PII. Chama a 7ª função
`screener_op_capturar_lead` (`SECURITY DEFINER`, migration `20260905120000`, **não
aplicada**), que exige sessão **submetida** e válida, credencial de prévia se
`internal_preview`, respeita `lead_capture_mode` do vínculo (`none` recusa),
normaliza o e-mail e faz upsert por `session_id` (1 lead por sessão). A edge nunca
faz INSERT direto; `screener_runtime` não tem acesso à tabela `screener_leads`.

`PUT /response`: a edge traduz `option_id`→(item, stage) pelo **mapping** (edge-only)
da projeção da sessão. IDs de outro instrumento/sessão são rejeitados.

`POST /submit`: valida integralidade (30 itens em E1–E4 ou N/A), calcula o
`ScoreResultV1` na edge, grava snapshot e fecha a sessão **numa transação**. Idempotente:
repetir devolve o **mesmo** snapshot (via `unique(session_id, instrument_checksum,
input_checksum, scoring_version, report_version)`), sem duplicar nem recalcular.

## `PublicResultV1` (o que a API pública devolve)
Derivado do `ScoreResultV1` interno. **Mantém os resultados agregados** da
devolutiva (pontuação de EXIBIÇÃO 0–100 por dimensão/eixo/índice, cobertura,
gaps, quadrante, gate, prioridades, narrativas). **Remove** basis points, código
de estágio (E1–E4), pesos, `provisional_cut_bp`, regra de conversão e respostas
individuais.

```
PublicResultV1 = {
  contract_version: "PublicResultV1",
  assessment_unit: { name },
  respondent_scope: { organization_label },            // ex.: "individual_perception"
  coverage: { individual, organization, ai },          // "alta" | "media" | "insuficiente"
  individual:   { overall: null,                        // indivíduo sem nota geral
                  dimensions: [{ name, display_score:0..100|null, band_label|null }] },
  organization: { index_display:0..100|null, band_label|null,
                  dimensions: [{ name, display_score, band_label|null }] },
  ai:           { index_display:0..100|null, band_label|null,
                  dimensions: [{ name, display_score, band_label|null }], governance },
  alignment:    [{ dimension_name, direction, magnitude }],     // sem bp
  matrix:       { available, quadrant|null, quadrant_label|null,
                  quadrant_message|null, governance_overlay, provisional_note },
  priorities:   [{ rank, scope, dimension_name, action }],      // sem bp
  notes: [ "escopo/uso", ... ]
}
```
`display_score` = 0–100 de EXIBIÇÃO (round bp/100); nunca expõe o bp cru.
`band_label` vem dos rótulos do instrumento. Cobertura: ≥80% alta, ≥50% media,
senão insuficiente. O indivíduo não tem nota geral, mas cada uma das cinco
dimensões tem resultado mensurável.

## Fronteira de segurança: colunas de credencial + papéis + RPC `SECURITY DEFINER`
Migration `20260903120000_screener_rpc_e_papeis.sql`. A edge pública **não conecta
como `postgres` amplo** e **não faz SQL direto** — toda leitura/escrita passa por 6
funções, **a fronteira**, que verificam tudo.

**Credencial é dado de segurança, fora de `branding`.** Colunas dedicadas no vínculo:
`preview_credential_hash`, `preview_expires_at`, `preview_revoked_at`. CHECKs: hash
`^[0-9a-f]{64}$`; coerência (expiração/revogação exigem hash); **`branding` não pode
conter** nenhuma dessas chaves. A projeção pública (get_binding/resume/get_result)
**nunca** retorna essas colunas — só devolve `branding` (livre de credencial). A
**chave crua não chega ao Postgres**: a edge calcula `sha256` e envia só o hash.

- **`screener_owner`** — `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS`. Dono de **todos** os objetos `screener_*` (6 tabelas,
  a sequence, a trigger de imutabilidade, o helper e as 6 funções). Contexto mínimo
  dos DEFINER — não é `postgres`, não vê o legado. Sem membership com papéis amplos.
- **`screener_runtime`** — iguais bloqueios, mas `LOGIN`. Papel embutido na
  `SUPABASE_DB_POOLER_URL`. Só `USAGE` no schema + `EXECUTE` nas 6 funções.
  **Nenhum privilégio direto** de tabela, sequence ou legado. Senha só fora da
  migration (secret).
- **6 funções** `screener_op_*` (`SECURITY DEFINER`, `search_path=''`, objetos
  `public.*` qualificados, **sem SQL dinâmica**). Helper privado
  `screener_priv_previa_ok` (recebe o hash; não concedido a ninguém) confere hash ×
  revogação × expiração.

Cada função verifica: vínculo/status/vigência · token/expiração/revogação · sessão
aberta antes da escrita · **credencial de prévia** (internal_preview) · pertencimento
ao instrumento (item ∈ definição; estágio válido) · checksum canônico na finalização
(`collate "C"`) · idempotência e trava `for update`.

### Matriz de privilégios sobre objetos `screener_*` (provada em pglite)
| Objeto / ação | `screener_owner` | `screener_runtime` | `service_role` | `anon`/`authenticated` | `PUBLIC` |
|---|---|---|---|---|---|
| `USAGE` no schema `public` | ✅ (dono) | ✅ | herdado do schema¹ | herdado¹ | herdado¹ |
| `EXECUTE` nas 6 `screener_op_*` | ✅ (dono) | ✅ | ❌ | ❌ | ❌ |
| `EXECUTE` em `screener_priv_previa_ok` | ✅ (dono) | ❌ | ❌ | ❌ | ❌ |
| SELECT/INSERT/UPDATE/DELETE nas 6 tabelas `screener_*` | ✅ (dono) | ❌ | ❌ | ❌ | ❌ |
| Sequence `screener_responses_id_seq` | ✅ (dono) | ❌ | ❌ | ❌ | ❌ |

¹ `USAGE` em `public` é do schema (padrão do Postgres), não confere acesso a objeto algum — todo objeto `screener_*` está revogado acima. Tabelas legadas: `screener_runtime` não recebe grant algum (sem acesso). Nenhuma célula ambígua: só `screener_owner` (via DEFINER) e `screener_runtime` (só EXECUTE das 6) tocam o domínio; `service_role` tem **zero**.

### Inventário de ownership (tudo → `screener_owner`)
Tabelas: `screener_instrument_versions`, `screener_event_bindings`, `screener_sessions`,
`screener_responses`, `screener_result_snapshots`, `screener_leads`. Sequence:
`screener_responses_id_seq`. Trigger fn: `screener_snapshot_impede_update`. Funções:
`screener_priv_previa_ok` + as 6 `screener_op_*`. (Transferência por **lista fechada**,
não por prefixo; grants/revokes por **assinatura completa**.)

Testes chamando as funções **direto como `screener_runtime`, contornando a edge**,
falham para: sessão inexistente/alheia, token inválido, item fora do instrumento,
estágio inválido, resposta após submissão, prévia sem autorização (ausente/errada/
expirada/revogada) e vínculo fechado.

### Validado em 2º branch efêmero do Supabase (04/09/2026)
Branch descartável (sem dados de prod, apagado ao fim; ~US$ 0,01). Provado contra o
Postgres/pooler reais, **conectando de fato como `screener_runtime`** (senha
temporária via verifier SCRAM, `prepare:false`, `max:1`): `select current_user` =
`screener_runtime`. As 6 operações por HTTP pela edge (que conecta como
`screener_runtime`); prévia bloqueada sem credencial; credencial expirada/revogada e
sessão expirada/revogada negadas; vínculo fechado e fora da vigência negados; 8
submits simultâneos → 1 snapshot; PUT concorrente não altera o pontuado; token bruto
não persistido; `PublicResultV1` 0–100 sem pontuação por alternativa. Conectado como
`screener_runtime`, negado SELECT/INSERT nas 6 tabelas, na sequence, no legado e no
helper; `service_role`/`anon`/`authenticated` sem EXECUTE e sem acesso. **Logs
limpos**: o Postgres redige a senha (`password '{REDACTED}'`); sem token bruto, chave
de prévia ou URL de banco.

Adaptações que o Supabase real exigiu (aplicadas na migration): atributos
superuser/replication/bypassrls **não** são setados explicitamente (exigem superuser;
já são o default seguro); `screener_owner` recebe `CREATE` **transitório** em `public`
(via `pg_database_owner`) para poder ser dono, revogado ao fim; o secret **não** pode
começar com `SUPABASE_` → **`SCREENER_DB_POOLER_URL`**. Achado do PG16: `CREATE ROLE`
deixa o criador (`postgres`) como **membro admin** dos papéis novos, que um `revoke`
simples não remove — mas isso é só administrativo: verificado que `postgres` **não**
herda nem consegue `SET ROLE` `screener_owner` (sem acesso a dados).

## Matriz de estados (vínculo × vigência × credencial)
`dentro_vigencia` = (`starts_at` nulo ou `now≥starts_at`) e (`ends_at` nulo ou `now≤ends_at`).

| status | credencial prévia | iniciar (`GET/POST /start`) | escrever (`PUT/POST`) | ler resultado (`/session`,`/result`) |
|---|---|---|---|---|
| `inactive` | — | ❌ | ❌ | ❌ |
| `internal_preview` | ausente | ❌ | ❌ | ❌ |
| `internal_preview` | presente | ✅ se `dentro_vigencia` | ✅ se `dentro_vigencia` | ✅ |
| `public_pilot` | — | ✅ se `dentro_vigencia` | ✅ se `dentro_vigencia` | ✅ |
| `published` | — | ✅ se `dentro_vigencia` | ✅ se `dentro_vigencia` | ✅ |
| `closed` | — (ou presente, se prévia) | ❌ | ❌ | ✅ (só leitura do já submetido) |
| fora da vigência | conforme status | ❌ | ❌ | ✅ |

- `inactive` e `internal_preview` sem credencial: **nenhuma operação** (conhecer o
  slug **não** concede acesso).
- `closed`/fora da vigência: bloqueiam **início e escrita**; permitem **leitura** do
  resultado já submetido enquanto a **sessão** estiver válida (não expirada/revogada).

## Credencial de prévia (revogável, em colunas dedicadas)
`internal_preview` exige header `x-preview-key`. A edge calcula `sha256` e envia **só
o hash** às funções; a **chave crua nunca vai ao Postgres**. As funções comparam com
`screener_event_bindings.preview_credential_hash` (coluna dedicada, **fora de
`branding`**) e checam `preview_expires_at`/`preview_revoked_at`. Revogável por update
do vínculo. Ausente/divergente/expirada/revogada → a função devolve null (leitura) ou
levanta (escrita) → **404** (o slug não concede acesso).

## Provado em branch efêmero do Supabase (03/09/2026)
Branch descartável (sem dados de produção, apagado ao fim; ~US$ 0,04). A edge foi
deployada **só no branch**; produção não foi tocada (sem função `screener`, sem
funções transacionais, zero dados). Verificado contra Postgres/Deno reais:
- `deno check` do wrapper + grafo de bundle (imports de fora da pasta entram); sem
  credencial literal no bundle.
- As **6 operações** por HTTP (start→session→response→submit→result), com
  `PublicResultV1` 0–100 e sem bp/estágio/checksum.
- **Concorrência**: 8 `submit` simultâneos → **1 snapshot**; `PUT` concorrente com
  `submit` **não altera** o conjunto pontuado; repetição idempotente.
- **Consentimento**: sem ciência → 400; versão de aviso fabricada → 409; servidor
  grava versão vigente + horário.
- **Credenciais**: sessão expirada/revogada → 410; token ausente/malformado/de
  outra sessão → 404; prévia expirada/revogada **por vínculo** → 404; token bruto
  **nunca** persistido (só o hash); token **não** vaza em log (vai no header).
- Funções `screener_save_response`/`finalize_submission`: `security invoker`,
  `search_path` fixo, `EXECUTE` revogado de anon/authenticated, concedido só a
  `service_role`.

Três defeitos que **só o banco real revelou** (o pglite mascarava) — corrigidos e
guardados por `regressao-adaptador.test.mjs`:
1. snapshot precisa do **objeto** do resultado (postgres.js codifica string JSON
   duas vezes → viola `screener_snap_result_obj`);
2. conectar pelo **transaction pooler** (Supavisor 6543, `max:1`), não pela direta
   (esgota slots sob concorrência de instâncias);
3. token de sessão **no header** `x-session-token`, nunca na query (vazava no log).

Feito: (1) modelo validado em 2º branch efêmero (04/09); (2) migration
`20260903120000` **aplicada à produção** via CLI em 04/09 (só ela; verificação
pós-apply verde; produção sem dados alterados, sem edge `screener`).

Ainda pendente (nesta ordem, sob autorização): (3) criar a senha SCRAM do
`screener_runtime` fora da migration + secret único **`SCREENER_DB_POOLER_URL`**
(o prefixo `SUPABASE_` é reservado) e deploy da edge ainda em `internal_preview`
(com `max:1`, `prepare:false`); (4) antes de `public_pilot`: **rate limiting,
limite de corpo, métodos permitidos e CORS restrito às origens do produto**;
(5) `screener.html`.

**`verify_jwt` — definido: `false`.** O screener é acessado por pessoas sem
identidade no Supabase Auth; exigir JWT impediria o início público. Nesse modo o
handler assume integralmente auth/autorização — já feito por credencial de prévia,
token de sessão, estado/vigência do vínculo e RPCs restritas. Uma chave pública
identifica a aplicação, não o usuário — não substitui o token de sessão. Será
aplicado como `[functions.screener] verify_jwt = false` no `config.toml` no passo
do deploy da edge (não nesta etapa).

## Deploy em produção (04/09/2026) — estado e precisões
Edge `screener` **ACTIVE em `internal_preview`**, `verify_jwt=false`, conectando como
`screener_runtime` pelo transaction pooler (secret `SCREENER_DB_POOLER_URL`). Smoke de
prod verde (só `GET /start`).

Precisões de registro:
- **`internal_preview` NÃO torna a edge privada.** Com `verify_jwt=false`, a **URL é
  acessível na rede**; o que fica bloqueado é o **acesso funcional**, pelas regras do
  screener (credencial de prévia, token, estado/vigência, RPCs restritas).
- O smoke de prod validou `GET /start` e seus metadados. A **projeção dos itens não
  foi reexecutada em prod** (exigiria `POST /start`, proibido) — segue coberta pela
  prova integral do branch. Cobertura deliberadamente limitada, não falha.

Incidente controlado de teste (logs): a credencial temporária de prévia apareceu numa
**query** de um teste que provava que a query é ignorada (404). Já **revogada e
apagada**, sem reutilização e sem risco residual conhecido; **padrão proibido** em
testes futuros. O `UPDATE` administrativo de seed registrou o **hash** (SHA-256) no
log — não é a chave pública do usuário, mas participa da autorização interna: a
**próxima carga de credencial deve ser parametrizada**, sem imprimir hash/statement.

## Fora de escopo do corte 3
Deploy, exposição da rota, ativação (`public_pilot`), `screener.html`, painel,
edição do legado. Nada disso é tocado.
