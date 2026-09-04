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

## Fronteira de segurança: papéis + RPC `SECURITY DEFINER`
Migration `20260903120000_screener_rpc_e_papeis.sql`. A edge pública **não conecta
como `postgres` amplo** e **não faz SQL direto** — toda leitura/escrita passa por 6
funções. **As funções são a fronteira**: elas mesmas verificam tudo; a edge repete a
checagem de credencial como defesa em profundidade.

- **`screener_owner`** — `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS`. Dono de **todos** os objetos `screener_*` (tabelas,
  sequences, funções e a trigger de imutabilidade). Contexto (mínimo) dos DEFINER —
  não é `postgres`, não vê o legado.
- **`screener_runtime`** — iguais bloqueios, mas `LOGIN`. Papel embutido na
  `SUPABASE_DB_POOLER_URL`. Só `USAGE` no schema + `EXECUTE` nas 6 funções.
  **Nenhum privilégio direto** de tabela, sequence ou objeto legado. Senha só fora
  da migration (secret).
- **6 funções** `screener_op_*` (`SECURITY DEFINER`, `search_path=''`, objetos
  `public.*` qualificados, **sem SQL dinâmica**; `EXECUTE` revogado de
  `public/anon/authenticated/service_role`, concedido só a `screener_runtime`). Um
  helper privado `screener_priv_previa_ok` (não concedido a ninguém) confere a
  credencial de prévia hasheando a chave crua (`sha256`) contra o hash do vínculo +
  revogação + expiração.

Cada função verifica: vínculo/status/vigência · token/expiração/revogação · sessão
aberta antes da escrita · **credencial de prévia** (internal_preview) · pertencimento
ao instrumento (item ∈ definição; estágio válido) · checksum canônico na finalização
(`collate "C"`) · idempotência e trava `for update`.

### Matriz de privilégios (provada em pglite)
| Objeto / ação | `screener_runtime` | `anon`/`authenticated`/`service_role` | `public` |
|---|---|---|---|
| `USAGE` no schema `public` | ✅ | — | — |
| `EXECUTE` nas 6 `screener_op_*` | ✅ | ❌ (revogado) | ❌ (revogado) |
| `EXECUTE` em `screener_priv_previa_ok` | ❌ | ❌ | ❌ |
| SELECT/INSERT/UPDATE/DELETE em tabelas `screener_*` | ❌ | (grants do schema) | ❌ |
| Sequences `screener_*` | ❌ | — | — |
| Tabelas legadas (`eventos`…) | ❌ | (grants próprios) | — |
| Função administrativa não concedida | ❌ | — | ❌ |

Testes chamando as funções **direto como `screener_runtime`, contornando a edge**,
falham para: sessão inexistente/alheia, token inválido, item fora do instrumento,
estágio inválido, resposta após submissão, prévia sem autorização (ausente/errada/
expirada/revogada) e vínculo fechado. `SET ROLE` prova privilégio, **não** prova
autenticação pelo pooler — isso é obrigatório no 2º branch (conectar de fato como
`screener_runtime` com senha temporária e confirmar `current_user`).

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

## Credencial de prévia (revogável)
`internal_preview` exige header `x-preview-key`. A edge compara `sha256(x-preview-key)`
com um hash esperado (env `SCREENER_PREVIEW_KEY_SHA256` ou
`binding.branding.preview_credential_sha256`). Revogável por rotação do env / update
do vínculo. Ausente ou divergente → 403 em todas as rotas.

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

Ainda pendente (nesta ordem, sob autorização): (1) validar o modelo de papéis+RPC
num **segundo branch efêmero** — que hoje só está provado em pglite; (2) aplicar a
migration à produção; (3) criar a senha do `screener_runtime` fora da migration e
injetar `SUPABASE_DB_POOLER_URL` (papel `screener_runtime`) como secret;
(4) `verify_jwt` conforme a política; (5) `screener.html`.

## Fora de escopo do corte 3
Deploy, exposição da rota, ativação (`public_pilot`), `screener.html`, painel,
edição do legado. Nada disso é tocado.
