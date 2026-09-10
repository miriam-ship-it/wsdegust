# Roteiro de deploy — Screener IA V2 (degustação pública, isca de lead)

> **Estado:** o V2 está construído, testado e **nada está em produção**. Este é o
> roteiro para colocá-lo no ar quando autorizado. **HELD até a Carol validar o
> instrumento em 25/09.**
>
> **Princípios (não negociáveis):** nada em produção sem autorização explícita, por
> passo; preflight **read-only** antes de cada mudança; migration só por CLI/ferramenta
> que respeita o ledger; a senha do banco nunca em claro (verifier SCRAM / secret);
> a ordem dos passos importa (aplicar migration antes de ativar o que depende dela).

## Alvo e fatos

- **Projeto Supabase:** Ibmec `klnpnjumogojspubyabi` (tabelas `screener_*`/`screener_v2_*`).
- **Edge:** função `screener` — URL `https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener`. O `index.ts` **já traz** as rotas `/v2/*` (7).
- **Vínculo público (da carga `20260907120000`):** slug `boomit-degustacao-ia-v2`,
  `public_pilot`, **sem credencial**, lead `required_before_result` (portão),
  retenção sessão 180d / lead 365d.
- **Frontend:** Netlify publica `frontend/`. Página do V2: `frontend/screener-v2.html`.

### Migrations (aplicam em ORDEM pelo ledger)

Já em produção: `…143339` (tabelas), `…150000` (carga V1), `…120000/03` (rpc+papéis).
**Pendentes**, na ordem em que o ledger aplica:

| # | Migration | O que faz | Necessária p/ o V2 público |
|---|---|---|---|
| 04 | `20260904120000_screener_rate_limit` | tabelas/funções de rate limit (inativo até secret) | **Sim** (link público exige rate) |
| 05 | `20260905120000_screener_op_lead` | função de lead do **V1** (aditivo, inerte no V1) | Não, mas é aplicada junto (é anterior) |
| 06 | `20260906120000_screener_v2_tabelas_e_rpc` | tabelas `screener_v2_*` + 6 RPC + gate de lead | **Sim** |
| 07 | `20260907120000_screener_v2_carga_publica` | instrumento V2 + vínculo público | **Sim** |

> Aplicar até a 07 aplica também a 04, 05 e 06 (são anteriores). A 05 (lead V1) é
> aditiva e inerte — não ativa nada no V1. Se preferir não tocar o V1 agora, isso
> **não é possível pulando a 05** (o ledger é sequencial); a 05 é segura de aplicar.

### Secrets da edge

| Secret | Estado | Observação |
|---|---|---|
| `SCREENER_DB_POOLER_URL` | já setado (V1) | papel `screener_runtime`, transaction pooler, senha via verifier |
| `SCREENER_CORS_ORIGINS` | **a definir** | origem EXATA do frontend (Netlify), sem wildcard, https |
| `SCREENER_RATE_KEY_SECRET` | **a definir** | presença ATIVA o rate limiting (fail-closed) |

---

## Passo 0 — Preflight read-only (não muda nada)

Objetivo: confirmar que o estado real bate com o esperado antes de qualquer escrita.

- **Migrations pendentes** são exatamente 04, 05, 06, 07 e nada além:
  - MCP: `list_migrations`. CLI: `supabase migration list`.
- **Nenhum objeto `screener_v2_*` existe ainda** (greenfield do V2):
  ```sql
  select count(*) from information_schema.tables
  where table_schema='public' and table_name like 'screener_v2_%';   -- esperado: 0
  ```
- **O slug público está livre** (não há vínculo `boomit-degustacao-ia-v2`):
  ```sql
  select count(*) from public.screener_event_bindings
  where event_slug='boomit-degustacao-ia-v2';                        -- esperado: 0
  ```
- **Zero dado operacional** que a apply possa afetar (sessões/leads V2 não existem):
  a tabela ainda não existe → nada a perder.
- **Advisors de segurança** sem alertas novos: MCP `get_advisors` (security).

Critério de sucesso: as 4 checagens batem. Se qualquer uma divergir, **pare** e investigue.

---

## Passo 1 — Ligar a HTML de produção ao servidor (código, sem prod)

Objetivo: em produção o frontend calcula na EDGE (não no cliente) e usa o portão.
Hoje `screener-v2.html` roda em modo DEMO (cálculo no cliente). A página de produção
precisa injetar o transporte + o env, ANTES do módulo:

```html
<script type="module">
  import { criarTransporteV2 } from "./transporte-v2.mjs";
  window.SCREENER_V2_CONFIG = {
    leadMode: "required_before_result",
    transporte: criarTransporteV2({
      baseUrl: "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener",
      eventSlug: "boomit-degustacao-ia-v2",
      // SEM previewKey — o link é público
    }),
  };
</script>
<script type="module" src="screener-v2.mjs"></script>
```

- **Verificação:** `node --test frontend/transporte-v2.test.mjs` verde; smoke local
  do fluxo (o portão retém o resultado e o revela após o lead).
- **Commit** no branch; entra em produção só no Passo 6 (merge→main).
- Rollback: reverter o commit (nada foi a prod ainda).

> Decisão em aberto: publicar como página nova (ex.: `degustacao-ia.html`) ou
> reaproveitar `screener-v2.html`. Recomendo **página própria de produção** para não
> confundir com a demo.

---

## Passo 2 — Aplicar as migrations (04 → 07)

Objetivo: criar as tabelas/funções V2 + rate + o vínculo público.

- Ferramenta que respeita o ledger. MCP: `apply_migration` (uma a uma, na ordem) ou
  CLI `supabase db push`.
- **Ordem:** 04, 05, 06, 07 (o ledger garante).
- A `20260906120000` recria/atribui papéis com `grant screener_owner to current_user`
  no topo — exige o mesmo contexto do V1 (postgres membro do dono do schema); é o
  mesmo padrão já validado na `20260903120000`.

Verificação (read-only, após aplicar):
```sql
-- 4 tabelas V2 criadas
select table_name from information_schema.tables
where table_schema='public' and table_name like 'screener_v2_%' order by 1;
-- 6 funções V2, EXECUTE só para screener_runtime
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'screener_v2_op_%' order by 1;
-- vínculo público criado, inativo até a edge/frontend
select event_slug, status, lead_capture_mode, session_retention_days, lead_retention_days,
       preview_credential_hash
from public.screener_event_bindings where event_slug='boomit-degustacao-ia-v2';
--> public_pilot | required_before_result | 180 | 365 | (null)
```
Critério: 4 tabelas, 6 funções, vínculo público com credencial nula.

Rollback: as migrations são aditivas. Para "desligar" o evento sem dropar nada, use o
**kill switch** (fim do doc). Drop de objetos só com autorização e migration própria.

---

## Passo 3 — Secrets da edge (CORS + rate)

- `SCREENER_CORS_ORIGINS` = origem EXATA do frontend publicado (ex.:
  `https://<site>.netlify.app` ou o domínio final). **Sem wildcard, https.** Se usar
  URL temporária da Netlify, ela também precisa constar.
- `SCREENER_RATE_KEY_SECRET` = chave forte gerada fora do banco (a presença ATIVA o
  rate limiting; fail-closed). Definir **depois** da migration 04 já aplicada.

Verificação: secrets listados na função (sem valor em log). Ainda não redeployado —
próximo passo.

---

## Passo 4 — Redeploy da edge

Objetivo: publicar a função com as rotas `/v2/*` e lendo os novos secrets.

- MCP: `deploy_edge_function` (função `screener`). CLI: `supabase functions deploy screener`.
- `verify_jwt=false` já versionado (screener é público; a autorização é do handler).

Verificação (a função no ar):
```bash
# GET público /v2/start → 200 com as 8 questões (link público, sem credencial)
curl -s -H "Origin: <origem-do-frontend>" \
  "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener/v2/start?event_slug=boomit-degustacao-ia-v2" | head
# Origem não autorizada → 403
curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://exemplo-nao-autorizado.com" \
  "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener/v2/start?event_slug=boomit-degustacao-ia-v2"   # 403
```
Critério: `/v2/start` responde 200 (com questões) para a origem certa; 403 para outra.

Rollback: redeploy da versão anterior da função (ou kill switch no vínculo).

---

## Passo 5 — Verificar o rate limiting ativo

- Com `SCREENER_RATE_KEY_SECRET` setado + migration 04 aplicada + edge redeployada,
  o caminho passa por `preview_authorize`/`rate_check` (só HMAC opaco, `cf-connecting-ip`).
- Verificação: rajada de `POST /v2/start` do mesmo IP deve retornar `429` com
  `retry_after_seconds` após o limite. Sem o secret ou sem a migration → o próprio
  desenho é fail-closed (503), nunca "aberto".

Critério: 429 sob rajada; 200 em uso normal.

---

## Passo 6 — Publicar o frontend (merge → main)

- `merge` do branch para `main` → Netlify publica `frontend/`.
- A página de produção (Passo 1) aponta para a edge + `boomit-degustacao-ia-v2`.

Verificação: abrir o link público num navegador anônimo e rodar o **smoke** abaixo.

---

## Passo 7 — Smoke test público (o teste de fumaça, ponta a ponta)

No link público, sem credencial:

1. Abre direto (200), mostra as 8 questões.
2. Responde senioridade + 8 questões; o autosave por resposta funciona.
3. No fim aparece o **portão** (nome/e-mail/opt-in).
4. **Fronteira:** com o devtools na aba de rede, a resposta do `POST /v2/submit`
   **não contém** o resultado (só `{ submitted, lead_required }`); `GET /v2/result`
   antes do lead responde **403 lead_required**.
5. Envia o lead → o resultado aparece (a devolutiva com a escada).
6. O lead foi gravado:
   ```sql
   select count(*) from public.screener_v2_leads;                    -- +1
   select count(*) from public.screener_v2_result_snapshots;         -- +1
   ```
7. Nenhum segredo em log (Postgres redige a senha; a edge nunca loga token/credencial).
8. Celular e desktop, claro e escuro, sem overflow horizontal.
9. Origem não autorizada é bloqueada (CORS 403).

Critério: todos os 9 passam. Qualquer falha → kill switch e investigar.

---

## Passo 8 — Retenção / purga (follow-up de higiene de dados)

O vínculo declara retenção (sessão 180d, lead 365d), mas a **purga** exige um job.
`pg_cron` está disponível no projeto e **não instalado**. Antes de volume real:
agendar a exclusão de sessões/leads V2 além da janela (migration própria com o job,
revisada como qualquer migration). Não bloqueia o lançamento com baixo volume, mas é
compromisso de privacidade a cumprir.

---

## Kill switch / rollback rápido

Para tirar o evento do ar **sem dropar dados** (a leitura do já submetido continua):
```sql
update public.screener_event_bindings
   set status='closed'
 where event_slug='boomit-degustacao-ia-v2';
```
`closed` faz `capacidades` recusar novas sessões e escritas (podeIniciar=false), mantendo
a leitura de resultados já gerados. Reabrir: voltar para `public_pilot`. Ambos são
escrita no vínculo — sob autorização.

---

## Checklist final (marque ao autorizar cada passo)

- [ ] Carol validou o instrumento (25/09) — curva, pesos, escopo.
- [ ] Passo 0 preflight read-only bateu.
- [ ] Passo 1 página de produção ligada ao transporte (commit).
- [ ] Passo 2 migrations 04–07 aplicadas; verificação bateu.
- [ ] Passo 3 `SCREENER_CORS_ORIGINS` + `SCREENER_RATE_KEY_SECRET` definidos.
- [ ] Passo 4 edge redeployada; `/v2/start` 200 origem certa / 403 outra.
- [ ] Passo 5 rate limiting ativo (429 sob rajada).
- [ ] Passo 6 frontend publicado (merge→main).
- [ ] Passo 7 smoke público completo (inclui a prova do portão na rede).
- [ ] Passo 8 job de purga agendado (ou registrado como pendência).
- [ ] Registrado no Asana com as evidências (commits, verificações).
