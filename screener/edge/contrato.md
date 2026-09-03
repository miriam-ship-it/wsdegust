# Edge roteadora do screener — contratos (corte 3)

Escrita + testes, **sem deploy**. A rota não é exposta ainda.

## Princípios
- O navegador nunca recebe `service_role`, pontos, estágios (E1–E4), pesos, regras,
  gabarito nem respostas individuais. Só a **projeção pública sanitizada** e o
  **`PublicResultV1`**.
- O token de sessão é **gerado no servidor** (aleatoriedade criptográfica) e
  devolvido uma única vez; o banco guarda **apenas o hash** (SHA-256 hex 64).
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

## `PublicResultV1` (sanitizado — o que a API pública devolve)
Derivado do `ScoreResultV1` interno; **sem** `score_bp`, sem código de estágio
(E1–E4), sem pesos, sem regras, sem respostas individuais, sem `provisional_cut_bp`.
Só rótulos e qualitativos.

```
PublicResultV1 = {
  contract_version: "PublicResultV1",
  assessment_unit: { name },
  respondent_scope: { organization_label },            // ex.: "individual_perception"
  coverage: { individual, organization, ai },          // "alta" | "media" | "insuficiente"
  individual:   { dimensions: [{ name, band_label|null }] },   // sem overall
  organization: { band_label|null, dimensions: [{ name, band_label|null }] },
  ai:           { band_label|null, dimensions: [{ name, band_label|null }],
                  governance },                          // "blocked|conditioned|eligible|insufficient"
  alignment:    [{ dimension_name, direction, magnitude }],     // sem bp
  matrix:       { available, quadrant|null, quadrant_label|null,
                  quadrant_message|null, governance_overlay, provisional_note },
  priorities:   [{ rank, scope, dimension_name, action }],      // sem bp
  notes: [ "escopo/uso", ... ]
}
```
`band_label` vem dos rótulos do instrumento (Reativo ausente / Informal parcial /
Definido repetível / Gerenciado sustentado). Cobertura qualitativa: ≥80% alta,
≥50% media, senão insuficiente. Nenhum número de ponto é exposto.

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

## Fora de escopo do corte 3
Deploy, exposição da rota, ativação (`public_pilot`), `screener.html`, painel,
edição do legado. Nada disso é tocado.
