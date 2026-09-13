# Roteiro de deploy — Diagnóstico Boomit RH, Desenvolvimento e IA (degustação pública)

> **Estado:** construído e testado; **nada em produção**. Este roteiro só é
> executado com autorização explícita da dona do produto, **passo a passo**.
>
> **Princípios (não negociáveis):** nada em produção sem autorização por passo;
> preflight **read-only** antes de cada escrita; migration só por ferramenta que
> respeita o ledger (`supabase db push` ou `apply_migration` do MCP); senha do
> banco nunca em claro; a ordem importa (aplicar a migration antes de ativar o
> que depende dela); qualquer divergência no preflight interrompe o roteiro.

## Alvo e fatos

- **Projeto Supabase:** Ibmec `klnpnjumogojspubyabi` (tabelas `screener_*`; as
  novas são `screener_rhia_*`).
- **Edge:** função `screener` —
  `https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener`. O `index.ts`
  versionado já roteia `/rhia/*` (7 rotas).
- **Vínculo público (da carga `20260913120000`):** slug `boomit-degustacao-rh-ia`,
  `public_pilot`, sem credencial de prévia, `lead_capture_mode =
  required_before_result`, retenção 180 dias (sessão) / 365 dias (lead),
  `branding {}`.
- **Instrumento:** `boomit_rh_ia_maturity_v1` / `1.0.0-rc.1`, gravado inativo
  em `screener_instrument_versions` com o JSON verbatim e checksum sha256 da
  serialização canônica.
- **Frontend:** Netlify publica `frontend/`. Página: `frontend/rhia.html`, que
  lê `window.SCREENER_RHIA_CONFIG = { EDGE_URL, ANON_KEY }` e usa
  `?evento=boomit-degustacao-rh-ia` como padrão.

### Migrations (aplicam em ORDEM pelo ledger)

Já em produção: `20260902143339` (tabelas), `20260902150000` (carga V1),
`20260903120000` (RPC + papéis). **Pendentes**, na ordem em que o ledger aplica:

| # | Migration | O que faz | Necessária para o rhia |
|---|---|---|---|
| 04 | `20260904120000_screener_rate_limit` | tabelas/funções de rate limit + job `pg_cron` (inativo na edge até o secret) | **Sim** — link público exige rate |
| 05 | `20260905120000_screener_op_lead` | função de lead do **V1** (aditiva, inerte no V1) | Não, mas entra junto: é anterior no ledger |
| 12 | `20260912120000_screener_rhia_tabelas_e_rpc` | 4 tabelas `screener_rhia_*` + 7 RPC + gate de lead | **Sim** |
| 13 | `20260913120000_screener_rhia_carga_publica` | instrumento rhia (inativo) + vínculo público | **Sim** |

> O ledger é sequencial: aplicar até a 13 aplica também 04, 05 e 12. A 05 é
> aditiva e não ativa nada no V1; não é possível pulá-la. A 04 **habilita
> `pg_cron`** no projeto (alteração global) e falha se a extensão não estiver
> disponível — consta no dry-run.

### Secrets da edge

| Secret | Estado | Observação |
|---|---|---|
| `SCREENER_DB_POOLER_URL` | já setado (V1) | papel `screener_runtime`, transaction pooler |
| `SCREENER_CORS_ORIGINS` | **a definir** | origem EXATA do frontend (Netlify), https, sem wildcard; CSV se houver mais de uma |
| `SCREENER_RATE_KEY_SECRET` | **a definir** | a presença ATIVA o rate limiting (fail-closed); definir só depois da migration 04 |

---

## Passo 0 — Preflight read-only (não muda nada)

Confirmar que o estado real bate com o esperado antes de qualquer escrita.

- **Migrations pendentes** são exatamente 04, 05, 12 e 13, nada além:
  MCP `list_migrations` ou CLI `supabase migration list`.
- **Nenhum objeto `screener_rhia_*` existe** (greenfield):
  ```sql
  select count(*) from information_schema.tables
   where table_schema = 'public' and table_name like 'screener_rhia_%';   -- esperado: 0
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'screener_rhia_op_%';    -- esperado: 0
  ```
- **O slug público está livre** e **o instrumento não existe**:
  ```sql
  select count(*) from public.screener_event_bindings
   where event_slug = 'boomit-degustacao-rh-ia';                          -- esperado: 0
  select count(*) from public.screener_instrument_versions
   where instrument_code = 'boomit_rh_ia_maturity_v1';                    -- esperado: 0
  ```
- **Papéis da fronteira presentes** (`screener_owner` NOLOGIN, `screener_runtime`
  LOGIN), como deixados pela 03:
  ```sql
  select rolname, rolcanlogin from pg_roles where rolname in ('screener_owner','screener_runtime');
  ```
- **`pg_cron` disponível** (a 04 exige):
  ```sql
  select name, installed_version from pg_available_extensions where name = 'pg_cron';
  ```
- **Advisors de segurança** sem alerta novo: MCP `get_advisors` (security).
- **Build local verde:** `npm run build` e `npm run test:behavioral` na raiz do
  worktree, e o checksum da carga confere com o da edge
  (`screener/loader/gerar-carga-rhia.test.mjs` cobre).

Critério: todas as checagens batem. Qualquer divergência → parar e investigar.

---

## Passo 1 — Página de produção apontando para a edge (código, sem prod)

`frontend/rhia.html` precisa do objeto de configuração com a URL real da edge e a
chave anon do projeto (a anon key é pública por desenho; a autorização é do
handler e das RPC):

```html
<script>
  window.SCREENER_RHIA_CONFIG = {
    EDGE_URL: "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener",
    ANON_KEY: "<anon key do projeto>",
    autostart: true
  };
</script>
```

Sem credencial de prévia: o link é público. Verificação: `npm test` e
`npm run build` verdes; `npm run dev` roda o fluxo inteiro contra o pglite
(o portão retém o resultado e o revela após o lead).
Commit no branch; entra em produção só no Passo 6.

Rollback: reverter o commit (nada foi a prod).

---

## Passo 2 — Aplicar as migrations (04 → 13)

Ferramenta que respeita o ledger: MCP `apply_migration` (uma a uma, na ordem)
ou CLI `supabase db push`. A 12 começa com `grant screener_owner to
current_user` — mesmo contexto já validado na 03.

Verificação read-only após aplicar:

```sql
-- 4 tabelas rhia, dono screener_owner, RLS ligado
select c.relname, r.rolname as owner, c.relrowsecurity
  from pg_class c join pg_roles r on r.oid = c.relowner
 where c.relname like 'screener_rhia_%' and c.relkind = 'r' order by 1;

-- 7 funções rhia, EXECUTE só para screener_runtime
select p.proname, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'screener_rhia_op_%' order by 1;
select p.proname, has_function_privilege('screener_runtime', p.oid, 'execute') as runtime,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'screener_rhia_op_%';
--> runtime = true, service_role = false em todas

-- instrumento inativo com o checksum esperado
select instrument_code, instrument_version, status, checksum
  from public.screener_instrument_versions
 where instrument_code = 'boomit_rh_ia_maturity_v1';

-- vínculo público, sem credencial
select event_slug, status, lead_capture_mode, session_retention_days, lead_retention_days,
       preview_credential_hash
  from public.screener_event_bindings where event_slug = 'boomit-degustacao-rh-ia';
--> public_pilot | required_before_result | 180 | 365 | (null)

-- job de rate limiting agendado (da 04)
select jobname, schedule, active from cron.job where jobname = 'boomit_screener_rate_gc_v1';
```

Critério: 4 tabelas com dono `screener_owner` e RLS; 7 funções `prosecdef`,
EXECUTE só no runtime; instrumento com o checksum que o teste da carga imprime;
vínculo público com credencial nula; job do cron ativo.

Rollback: as migrations são aditivas. Para tirar o evento do ar sem dropar
nada, kill switch (fim do documento). Drop de objetos só com autorização e
migration própria.

---

## Passo 3 — Secrets da edge (CORS + rate)

- `SCREENER_CORS_ORIGINS` = origem EXATA do frontend publicado (`https://<site>`
  ou o domínio final). Sem wildcard, https. Se a URL temporária do Netlify for
  usada no smoke, ela também precisa constar.
- `SCREENER_RATE_KEY_SECRET` = chave forte gerada fora do banco. Definir
  **depois** da 04 aplicada: a presença ativa o caminho `preview_authorize` +
  `rate_check` (fail-closed: sem a migration, a edge responderia 503, nunca
  "aberto").

Verificação: secrets listados na função (sem valor em log). A edge ainda não foi
redeployada; próximo passo.

---

## Passo 4 — Redeploy da edge

MCP `deploy_edge_function` (função `screener`) ou CLI `supabase functions deploy
screener`. `verify_jwt = false` já versionado (a autorização é do handler).

Verificação, com a função no ar:

```bash
# GET público /rhia/start → 200 com 30 itens, sem credencial
curl -s -H "Origin: <origem-do-frontend>" \
  "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener/rhia/start?event_slug=boomit-degustacao-rh-ia" \
  | head -c 600
# Origem não autorizada → 403
curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://exemplo-nao-autorizado.com" \
  "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener/rhia/start?event_slug=boomit-degustacao-rh-ia"
```

Critério: 200 com `items` de 30 entradas e `lead_capture_mode` presente para a
origem certa; 403 para outra; a resposta **não contém** `scale`, `facet`,
`weights` nem `bp`.

Rollback: redeploy da versão anterior da função, ou kill switch no vínculo.

---

## Passo 5 — Verificar o rate limiting ativo

Com o secret setado, a 04 aplicada e a edge redeployada, uma rajada de
`POST /rhia/start` do mesmo IP retorna `429` com `retry_after_seconds` após o
limite; uso normal continua 200. A edge só envia HMAC opaco (nunca IP ou token
em claro).

Critério: 429 sob rajada; 200 em uso normal.

---

## Passo 6 — Publicar o frontend (merge → main)

Merge do branch para `main`; o Netlify publica `frontend/`. `rhia.html` já
aponta para a edge (Passo 1). Verificação: abrir o link público em janela
anônima e rodar o smoke do Passo 7.

---

## Passo 7 — Smoke test público (ponta a ponta)

No link público, sem credencial:

1. Abre direto (200), tela de abertura com "Começar leitura".
2. Contexto: CTX01 = "Outro" abre o campo de texto, exige 2–120 caracteres, e
   trocar de opção limpa o campo.
3. Responde as 30 questões; o autosave por resposta aparece ("Salvo").
4. Atualiza a página no meio: retoma na mesma questão com as respostas
   anteriores (vieram de `GET /rhia/session`).
5. Revisão lista 30 respostas em três grupos, sem nenhuma nota ou código.
6. **Prova do portão na rede:** com o devtools na aba Network, a resposta do
   `POST /rhia/submit` contém só `{ submitted: true, lead_required: true }`;
   `GET /rhia/result` antes do lead responde **403 `lead_required`**.
7. Envia o lead (e-mail obrigatório) → `GET /rhia/result` responde 200 e a
   devolutiva aparece na ordem das 13 seções; o gate de governança está visível.
8. O corpo de `GET /rhia/result` **não contém** `bp`, `3333`, `6667`, `10000`,
   `internal`, `answers`, `E1`…`E4`, `P1`…`P5`.
9. Banco:
   ```sql
   select count(*) from public.screener_rhia_leads;               -- +1
   select count(*) from public.screener_rhia_result_snapshots;    -- +1
   select result->'public'->>'version' from public.screener_rhia_result_snapshots
    order by created_at desc limit 1;                              -- 2.0.0-pilot
   ```
10. Nenhum segredo em log (a edge nunca loga token ou credencial).
11. Celular (320px) e desktop, claro e escuro, sem overflow horizontal;
    imprimir mostra data, versão e disclaimer, sem cortar cards.
12. Origem não autorizada é bloqueada (CORS 403).

Critério: os 12 passam. Qualquer falha → kill switch e investigar.

---

## Passo 8 — Retenção / purga (higiene de dados)

O vínculo declara retenção (sessão 180 dias, lead 365 dias), mas a purga exige
um job. `pg_cron` passa a estar instalado pela 04. Antes de volume real: migration
própria que agenda a exclusão de sessões e leads rhia além da janela (e, por
cascata, respostas; snapshots seguem a sessão), revisada como qualquer migration.
Não bloqueia o lançamento com baixo volume, mas é compromisso de privacidade
registrado em [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md).

---

## Kill switch / rollback rápido

Para tirar o evento do ar **sem dropar dados** (a leitura do já submetido
continua):

```sql
update public.screener_event_bindings
   set status = 'closed'
 where event_slug = 'boomit-degustacao-rh-ia';
```

`closed` faz as RPC recusarem novas sessões e escritas (`indisponivel`),
mantendo `get_result` para quem já submeteu e já deixou o lead. Reabrir: voltar
para `public_pilot`. Ambos são escrita no vínculo — sob autorização.

---

## Checklist final (marcar ao autorizar cada passo)

- [ ] Dona do produto autorizou a colocação no ar da degustação rhia.
- [ ] Passo 0 — preflight read-only bateu.
- [ ] Passo 1 — `rhia.html` ligado à edge (commit).
- [ ] Passo 2 — migrations 04, 05, 12 e 13 aplicadas; verificação bateu.
- [ ] Passo 3 — `SCREENER_CORS_ORIGINS` e `SCREENER_RATE_KEY_SECRET` definidos.
- [ ] Passo 4 — edge redeployada; `/rhia/start` 200 / origem estranha 403.
- [ ] Passo 5 — 429 sob rajada.
- [ ] Passo 6 — merge → main; Netlify publicou.
- [ ] Passo 7 — smoke 12/12, incluindo a prova do portão na rede.
- [ ] Passo 8 — job de purga agendado (ou registrado como pendência com prazo).
