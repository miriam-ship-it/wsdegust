# Roteiro de deploy — Diagnóstico Boomit RH, Desenvolvimento e IA (degustação pública)

> **Estado em 13/09/2026:** construído, testado e commitado. **Nada em
> produção.** Este roteiro é executado **um passo por vez**, cada passo com
> autorização explícita sua.

## Princípios (não negociáveis)

1. **Nada em produção sem sua autorização, por passo.** Autorizar o Passo 2 não
   autoriza o Passo 3.
2. **Preflight read-only antes de cada escrita.** Divergência entre o esperado e
   o real interrompe o roteiro — não se "conserta seguindo".
3. **Migration só por ferramenta que respeita o ledger** (`supabase db push` ou
   `apply_migration` do MCP). Nunca SQL solto criando objeto.
4. **A senha do banco nunca aparece em claro**, em nenhum comando, log ou
   arquivo.
5. **A ordem importa.** A migration vem antes do secret que depende dela; o
   secret vem antes do redeploy que o lê.
6. **O V1 é intocável.** Nada neste roteiro altera objeto, função ou página do
   screener V1 que já está em produção.

> **Exceção ao princípio 6, aberta em 14/09/2026.** Um princípio que se dobra em
> silêncio deixa de valer; um que registra a exceção continua valendo. Por isso:
> o **Passo 2b** altera **uma** função do V1,
> `public.screener_snapshot_impede_update`, para fixar `search_path = ''`. É
> endurecimento, não mudança de comportamento — a função não é `SECURITY
> DEFINER`, o corpo é um único `raise exception` com string literal, e o teste
> comportamental prova que o trigger continua recusando o UPDATE depois do ALTER.
> A alternativa era deixar a metade do V1 eternamente pendente no advisor. Nada
> além desta função é tocado no V1.

---

## Como você autoriza

Para cada passo eu faço sempre a mesma sequência, e ela **para** onde está
escrito parar:

1. **Eu mostro** o que o passo vai mudar, o comando exato e o que espero ver
   depois.
2. **Você responde** `pode o passo N` (ou nega, ou pede ajuste). **Sem isso eu
   não executo.**
3. **Eu executo** só aquele passo.
4. **Eu mostro a verificação** — a saída real, não a esperada — e digo se o
   critério bateu.
5. **Eu paro** e espero a próxima autorização.

Se a verificação não bater, eu **não** avanço nem tento contornar: eu te mostro
a divergência e o rollback disponível.

Os passos 0 e 1 não escrevem nada em produção (0 é leitura, 1 já está feito).
A primeira escrita real é o **Passo 2**.

---

## Antes de começar, preciso de três decisões suas

Estas não dão para eu decidir sozinha, e duas delas mudam o que vai ao ar.

### D1 — O site é o `diagnosticoboomit`?

Achei seis projetos na sua conta Netlify. O que corresponde a este repositório é
**`diagnosticoboomit`**, e a evidência é direta: o `<title>` publicado em
`https://diagnosticoboomit.netlify.app/` é exatamente o mesmo de
`frontend/index.html` deste repo, e o `/admin.html` responde 200. Os outros
cinco não servem nenhum arquivo deste `frontend/`.

Se confirmar, o **link público da degustação** será:

```
https://diagnosticoboomit.netlify.app/rhia.html
```

O slug `boomit-degustacao-rh-ia` já é o padrão do app, então não precisa de
query string. `?evento=boomit-degustacao-rh-ia` continua funcionando se você
quiser um link explícito.

### D2 — Forçar HTTPS no site (recomendo sim)

O Netlify informa a URL primária do `diagnosticoboomit` como **`http://`**, e
não `https://`. O HTTPS funciona (testei, responde 200), mas se o **Force HTTPS**
estiver desligado, quem abrir o link em `http://` manda
`Origin: http://diagnosticoboomit.netlify.app`, que **não** vai estar na
allowlist — e recebe 403 da edge, sem entender por quê.

Duas saídas, e eu recomendo a primeira:

- **Ligar Force HTTPS** no site e cadastrar **só** a origem `https://`. Mais
  seguro e é a prática certa.
- Cadastrar as duas origens na allowlist. Funciona, mas mantém tráfego em claro.

### D3 — O merge publica também as páginas do V1

O Passo 6 leva 66 commits para a `main`. Além do diagnóstico novo, isso publica
pela primeira vez **as páginas do screener V1** (`screener.html`, `screener.mjs`,
`screener.css`) e o arquivo **`frontend/screener.test.mjs`**.

O V1 continua protegido por credencial de prévia, então publicar a página não
abre o instrumento. Mas são arquivos que passam a ser buscáveis. Me diga se
prefere que eu, antes do merge:

- deixe como está (o V1 fica publicado, porém fechado por credencial); ou
- mova `frontend/screener.test.mjs` para fora do diretório publicado — é um
  arquivo de teste, não tem função nenhuma no ar. **Recomendo mover.**

---

## Alvo e fatos

- **Projeto Supabase:** `klnpnjumogojspubyabi`. Tabelas novas: `screener_rhia_*`.
- **Edge:** função `screener` em
  `https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener`. O `index.ts`
  versionado já roteia as **7 rotas** `/rhia/*`.
- **Frontend:** Netlify publica `frontend/` (`netlify.toml`). Página:
  `frontend/rhia.html`.
- **Vínculo público** (vem da carga `20260913120000`): slug
  `boomit-degustacao-rh-ia`, status `public_pilot`, **sem credencial de prévia**,
  `lead_capture_mode = required_before_result`, retenção 180 dias (sessão) e
  365 dias (lead).
- **Instrumento:** `boomit_rh_ia_maturity_v1` versão `1.0.0-rc.1`, gravado
  **inativo**, com o JSON verbatim e checksum sha256 da serialização canônica.
- **Devolutiva:** versão `2.0.0-pilot`.

### Migrations pendentes (o ledger aplica em ordem)

| # | Migration | O que faz | Precisa para o rhia |
|---|---|---|---|
| 04 | `20260904120000_screener_rate_limit` | tabelas e funções de rate limit + job `pg_cron` | **Sim** — link público exige rate |
| 05 | `20260905120000_screener_op_lead` | função de lead do **V1** (aditiva, inerte) | Não, mas é anterior no ledger |
| 12 | `20260912120000_screener_rhia_tabelas_e_rpc` | 4 tabelas `screener_rhia_*` + 7 RPC + gate de lead | **Sim** |
| 13 | `20260913120000_screener_rhia_carga_publica` | instrumento rhia (inativo) + vínculo público | **Sim** |

> O ledger é sequencial: chegar na 13 aplica também 04, 05 e 12. Não dá para
> pular a 05. A **04 habilita `pg_cron`** no projeto, que é alteração global —
> por isso ela aparece no preflight.

### Secrets da edge

| Secret | Estado | Observação |
|---|---|---|
| `SCREENER_DB_POOLER_URL` | já existe (V1) | papel `screener_runtime`, transaction pooler |
| `SCREENER_CORS_ORIGINS` | **a definir no Passo 3** | depende de D1 e D2 |
| `SCREENER_RATE_KEY_SECRET` | **a definir no Passo 3** | a simples presença **ativa** o rate limiting (fail-closed) |

---

## Passo 0 — Preflight read-only

**Não muda nada.** Confirma que o estado real do banco é o que este roteiro
pressupõe. Se qualquer item divergir, o roteiro para aqui.

- **Migrations pendentes são exatamente 04, 05, 12 e 13**, nada além:
  `list_migrations` (MCP) ou `supabase migration list`.
- **Greenfield rhia** — nenhum objeto nosso já existe:
  ```sql
  select count(*) from information_schema.tables
   where table_schema = 'public' and table_name like 'screener_rhia_%';   -- esperado: 0
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'screener_rhia_op_%';    -- esperado: 0
  ```
- **Slug livre e instrumento inexistente:**
  ```sql
  select count(*) from public.screener_event_bindings
   where event_slug = 'boomit-degustacao-rh-ia';                          -- esperado: 0
  select count(*) from public.screener_instrument_versions
   where instrument_code = 'boomit_rh_ia_maturity_v1';                    -- esperado: 0
  ```
- **Papéis da fronteira presentes**, como a migration 03 deixou:
  ```sql
  select rolname, rolcanlogin from pg_roles
   where rolname in ('screener_owner','screener_runtime');
  --> screener_owner: false (NOLOGIN) | screener_runtime: true (LOGIN)
  ```
- **`pg_cron` disponível** (a 04 exige):
  ```sql
  select name, installed_version from pg_available_extensions where name = 'pg_cron';
  ```
- **Advisors de segurança** sem alerta novo: `get_advisors` (security).
- **Build local verde**, na raiz do worktree:
  ```bash
  npm run build && npm run test:behavioral
  ```

**Critério:** todos batem. **Qualquer divergência → parar e investigar.**

---

## Passo 1 — Página de produção ligada à edge · **JÁ FEITO**

`frontend/rhia.html` já carrega a configuração real, commitada:

```html
window.SCREENER_RHIA_CONFIG = {
  EDGE_URL: "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener",
  ANON_KEY: "<chave anon do projeto — pública por desenho, role=anon>"
}
```

A chave anon é pública por desenho: a autorização é do handler e das RPC, não
dela. Isso foi verificado na varredura de segredos (nenhum `service_role`,
todos os JWT decodificam como `role=anon`).

**Nada a autorizar aqui.** O arquivo só vai ao ar no Passo 6.

---

## Passo 2 — Aplicar as migrations 04, 05, 12 e 13 · **primeira escrita**

Ferramenta: `apply_migration` (MCP), uma a uma e na ordem, ou
`supabase db push`. A 12 abre com `grant screener_owner to current_user`, no
mesmo contexto já validado pela 03.

Verificação read-only depois de aplicar:

```sql
-- 4 tabelas rhia, dono screener_owner, RLS ligado
select c.relname, r.rolname as owner, c.relrowsecurity
  from pg_class c join pg_roles r on r.oid = c.relowner
 where c.relname like 'screener_rhia_%' and c.relkind = 'r' order by 1;

-- 7 funções, SECURITY DEFINER, EXECUTE só para o runtime
select p.proname, p.prosecdef,
       has_function_privilege('screener_runtime', p.oid, 'execute') as runtime,
       has_function_privilege('service_role',     p.oid, 'execute') as service_role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'screener_rhia_op_%' order by 1;
--> prosecdef = true, runtime = true, service_role = false, nas 7

-- instrumento inativo, com o checksum esperado
select instrument_code, instrument_version, status, checksum
  from public.screener_instrument_versions
 where instrument_code = 'boomit_rh_ia_maturity_v1';

-- vínculo público, sem credencial
select event_slug, status, lead_capture_mode,
       session_retention_days, lead_retention_days, preview_credential_hash
  from public.screener_event_bindings where event_slug = 'boomit-degustacao-rh-ia';
--> public_pilot | required_before_result | 180 | 365 | (null)

-- job de coleta do rate limit (vem da 04)
select jobname, schedule, active from cron.job
 where jobname = 'boomit_screener_rate_gc_v1';
```

**Critério:** 4 tabelas com dono `screener_owner` e RLS ligado; 7 funções
`SECURITY DEFINER` com EXECUTE só no runtime e **nenhum** para `service_role`;
checksum idêntico ao que `gerar-carga-rhia.test.mjs` imprime; vínculo com
credencial nula; job do cron ativo.

**Rollback:** as migrations são aditivas e o evento ainda não está acessível
(a edge só ganha as rotas no Passo 4). Para fechar sem dropar nada, use o kill
switch no fim deste documento. Drop de objeto exige autorização e migration
própria.

---

## Passo 2b — `search_path` fixo nas funções de trigger · **escrita em banco**

**Migration:** `20260914120000_screener_search_path_nos_triggers.sql`.
**Revisada** pelo revisor de migration da casa antes de qualquer apply, que
reprovou a primeira versão por uma linha faltando (a membership de
`screener_owner` não era devolvida). Corrigido.

**O que muda.** Fixa `search_path = ''` em `screener_snapshot_impede_update`
(V1) e `screener_rhia_snapshot_impede_update` (rhia). Fecha o achado
`function_search_path_mutable` do advisor, que hoje aponta as duas. **Abre a
exceção ao princípio 6** — ver a emenda no topo deste documento.

**Por que é seguro.** Nenhuma das duas é `SECURITY DEFINER`, as duas pertencem a
`screener_owner`, e o corpo de cada uma é uma única instrução `raise exception`
com string literal: nada que dependa de `search_path` (`pg_catalog` segue
implícito). O comportamento observável não muda.

**Preflight read-only:**

```sql
select p.proname, p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(nenhum)') as config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname like 'screener%snapshot_impede_update';
--> as 2, security_definer = false, config = (nenhum)
```

**Comando:** `npx supabase db push --linked` — a mesma ferramenta do Passo 2,
pelo mesmo motivo (preserva a versão do nome do arquivo no ledger). Rodar o
`--dry-run` antes.

**Verificação:**

```sql
-- as duas com search_path VAZIO
select p.proname, array_to_string(p.proconfig, ',') as config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname like 'screener%snapshot_impede_update';

-- a membership temporária foi devolvida
select count(*) from pg_auth_members m
  join pg_roles papel  on papel.oid  = m.roleid
  join pg_roles membro on membro.oid = m.member
 where papel.rolname='screener_owner' and membro.rolname=current_user;   -- esperado: 0
```

E os advisors: `function_search_path_mutable` tem de sair de 2 para **0**.

**Critério:** as duas com `search_path=""`, membership devolvida, advisor zerado
nesse achado, e o V1 sem nenhuma outra alteração.

**Rollback** (completo, porque o `reset` sozinho não basta — `ALTER FUNCTION`
exige ser dono):

```sql
grant screener_owner to current_user;
alter function public.screener_snapshot_impede_update()      reset search_path;
alter function public.screener_rhia_snapshot_impede_update() reset search_path;
revoke screener_owner from current_user;
```

**Cobertura de teste.** Três testes comportamentais novos em
`screener/loader/behavioral/rhia-rpc.behavioral.test.mjs`: as duas funções ficam
com `search_path` **vazio** (não um qualquer — `set search_path = public`
silenciaria o advisor sem fechar a lacuna); o snapshot **continua imutável**, com
a mesma mensagem de recusa; e a **membership é devolvida**. A própria migration
carrega uma guarda que falha se qualquer dessas condições de catálogo não valer.

---

## Passo 3 — Secrets da edge

- `SCREENER_CORS_ORIGINS` — a origem **exata** do frontend, conforme D1 e D2.
  Sem wildcard. Se D2 for "ligar Force HTTPS":
  `https://diagnosticoboomit.netlify.app`
- `SCREENER_RATE_KEY_SECRET` — chave forte gerada **fora** do banco. Definir só
  **depois** da 04 aplicada: a presença dela ativa `preview_authorize` +
  `rate_check`, que é fail-closed (sem a migration a edge responderia 503, nunca
  "aberto").

**Verificação:** os dois secrets aparecem listados na função, sem valor em log.

**Rollback:** remover o secret. Sem `SCREENER_RATE_KEY_SECRET` o rate limiting
desliga; sem `SCREENER_CORS_ORIGINS` nenhuma origem é aceita.

---

## Passo 4 — Redeploy da edge

`deploy_edge_function` (MCP) na função `screener`, ou
`supabase functions deploy screener`. O `verify_jwt = false` já está versionado
— a autorização é do handler, não do JWT.

Verificação com a função no ar:

```bash
# público, sem credencial → 200 com 30 itens
curl -s -H "Origin: https://diagnosticoboomit.netlify.app" \
  "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener/rhia/start?event_slug=boomit-degustacao-rh-ia" \
  | head -c 600

# origem não autorizada → 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://exemplo-nao-autorizado.com" \
  "https://klnpnjumogojspubyabi.supabase.co/functions/v1/screener/rhia/start?event_slug=boomit-degustacao-rh-ia"
```

**Critério:** 200 com 30 entradas em `items` e `lead_capture_mode` presente para
a origem certa; 403 para outra. A resposta **não contém** `scale`, `facet`,
`weights` nem `bp`.

**Rollback:** redeploy da versão anterior da função, ou kill switch no vínculo.

---

## Passo 5 — Confirmar o rate limiting ativo

Com a 04 aplicada, o secret definido e a edge redeployada, uma rajada de
`POST /rhia/start` do mesmo IP passa a responder `429` com
`retry_after_seconds` depois do limite; uso normal continua 200. A edge só
guarda um HMAC opaco — nunca IP nem token em claro.

**Critério:** 429 sob rajada, 200 em uso normal.

---

## Passo 6 — Publicar o frontend (merge para `main`)

Merge do branch `claude/ia-maturity-diagnostic-module-54e0fb` para `main`; o
Netlify publica `frontend/`. São **66 commits** — veja D3 sobre o que mais
entra no ar junto.

**Verificação:** o deploy do Netlify concluiu e
`https://diagnosticoboomit.netlify.app/rhia.html` abre em janela anônima.

**Rollback:** reverter o merge (o Netlify republica o anterior) ou kill switch
no vínculo, que é mais rápido e não mexe no histórico.

---

## Passo 7 — Smoke test público, ponta a ponta

No link público, em janela anônima, sem credencial:

1. Abre direto, com a tela de abertura e o botão de começar.
2. Contexto: a opção "Outro" abre o campo de texto, exige de 2 a 120
   caracteres, e trocar de opção limpa o campo.
3. Responde as 30 questões; o "Salvo" aparece a cada resposta.
4. Atualiza a página no meio: retoma na mesma questão, com as respostas
   anteriores (vieram de `GET /rhia/session`).
5. A revisão lista as 30 respostas em três grupos, sem nenhuma nota nem código.
6. **Prova do portão, na aba Network:** a resposta de `POST /rhia/submit` traz
   só `{ submitted: true, lead_required: true }`, e `GET /rhia/result` antes do
   lead responde **403 `lead_required`**.
7. Envia o lead (e-mail obrigatório) → `GET /rhia/result` responde 200 e a
   devolutiva aparece: capa, mapa de leitura e **10 ou 11 seções numeradas**
   (11 quando há tensão a relatar; a seção de tensões some quando não há). A
   escada é a seção 01, com um único degrau destacado, e o gate de governança
   está visível.
8. O corpo de `GET /rhia/result` **não contém** `bp`, `3333`, `6667`, `10000`,
   `internal`, `answers`, `E1`…`E4` nem `P1`…`P5`.
9. Banco:
   ```sql
   select count(*) from public.screener_rhia_leads;              -- +1
   select count(*) from public.screener_rhia_result_snapshots;   -- +1
   select result->'public'->>'version'
     from public.screener_rhia_result_snapshots
    order by created_at desc limit 1;                            -- 2.0.0-pilot
   ```
10. Nenhum segredo em log: a edge nunca registra token nem credencial.
11. Celular (320px) e desktop, tema claro e escuro, sem rolagem lateral.
    Compare com as capturas versionadas em [capturas/](./capturas) — elas foram
    geradas pelo fluxo de verdade e medidas em 0px de excesso horizontal.
12. Imprimir ou salvar PDF: sai com data, versão e disclaimer, sem cortar
    cartão no meio. Compare com
    [capturas/devolutiva-impressa.pdf](./capturas/devolutiva-impressa.pdf),
    que tem 7 páginas.
13. Origem não autorizada continua bloqueada.

**Critério:** os 13 passam. Qualquer falha → kill switch e investigar antes de
divulgar o link.

---

## Passo 8 — Purga por retenção

O vínculo **declara** retenção (sessão 180 dias, lead 365 dias), mas declarar
não apaga: a purga precisa de um job. O `pg_cron` passa a estar instalado pela
04.

Antes de volume real, uma migration própria agenda a exclusão de sessões e
leads rhia fora da janela — respostas saem por cascata, snapshots seguem a
sessão. Revisada como qualquer migration.

Não bloqueia o lançamento com volume baixo, mas é **compromisso de privacidade
assumido**, registrado em [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md).
Se você autorizar os passos 2 a 7 e deixar o 8 para depois, ele vira pendência
com prazo — não item esquecido.

---

## Kill switch

Tira o evento do ar **sem dropar nada**. Quem já submeteu e já deixou o lead
continua conseguindo ler o resultado:

```sql
update public.screener_event_bindings
   set status = 'closed'
 where event_slug = 'boomit-degustacao-rh-ia';
```

`closed` faz as RPC recusarem sessão nova e qualquer escrita (`indisponivel`),
preservando o `get_result` de quem já passou. Para reabrir, volta para
`public_pilot`. Os dois são escrita no vínculo, então os dois passam por
autorização.

---

## Registro de execução

### Decisões, autorizadas em 14/09/2026

- **D1** — site confirmado: `diagnosticoboomit`. Link público será
  `https://diagnosticoboomit.netlify.app/rhia.html`.
- **D2** — ligar Force HTTPS no site e cadastrar **só** a origem
  `https://diagnosticoboomit.netlify.app` no `SCREENER_CORS_ORIGINS` (Passo 3).
- **D3** — `frontend/screener.test.mjs` **movido** para
  `screener/motor/frontend-screener.test.mjs`. O diretório publicado não tem
  mais nenhum arquivo de teste, e a exceção herdada saiu de
  `fronteira-rhia.test.mjs`: a regra agora é absoluta.

### Passo 0 — preflight read-only · 14/09/2026 · **passou**

| Checagem | Esperado | Observado |
|---|---|---|
| Migrations aplicadas | 9 | 9 |
| Migrations pendentes | 04, 05, 12, 13 | 04, 05, 12, 13 — nada além |
| Tabelas `screener_rhia_*` | 0 | 0 |
| Funções `screener_rhia_op_*` | 0 | 0 |
| Vínculo `boomit-degustacao-rh-ia` | 0 | 0 |
| Instrumento `boomit_rh_ia_maturity_v1` | 0 | 0 |
| `screener_owner` NOLOGIN | presente | presente |
| `screener_runtime` LOGIN | presente | presente |
| `pg_cron` disponível | sim | 1.6.4 disponível, ainda não instalado |
| `npm run build` | verde | verde |
| `npm test` | verde | 208/208 |
| `npm run test:behavioral` | verde | 117 passam, 1 pulado (herdado do V1) |

**Linha de base do V1**, para provar depois que o Passo 2 não o tocou:

| | |
|---|---|
| Tabelas `screener_*` | 6 |
| RPC `screener_op_*` | 6 |
| Vínculos / instrumentos | 1 / 1 |
| Sessões, respostas, leads, snapshots | 0, 0, 0, 0 |
| Tabelas de rate limit | 0 (a 04 cria) |

**Advisors de segurança — linha de base.** Nenhum alerta é do rhia, porque nada
do rhia existe ainda. Os que aparecem são pré-existentes e ficam registrados
para comparação depois do Passo 2:

- `rls_enabled_no_policy` (INFO) nas 6 tabelas `screener_*`. **É o desenho, não
  um defeito:** RLS ligado sem policy é negação total, e o acesso acontece só
  pelas RPC `SECURITY DEFINER` do `screener_owner`. As 4 tabelas rhia vão
  aparecer aqui pelo mesmo motivo.
- `function_search_path_mutable` (WARN) em `screener_snapshot_impede_update`,
  do V1. Verificado: **não é `SECURITY DEFINER`** (roda como quem invoca) e
  pertence ao `screener_owner`, então não há caminho de escalada. Fica como
  pendência de higiene do V1, não bloqueia. As 7 RPC do rhia já nascem com
  `search_path = ''`.
- `auth_allow_anonymous_sign_ins` (WARN) em `admin_eventos`, `eventos`,
  `relatorios`, `respondentes`, `respostas` — tabelas do painel antigo, fora
  deste roteiro.
- `auth_leaked_password_protection` desabilitado — ajuste de Auth, fora deste
  roteiro.

**Critério do Passo 0: bateu em tudo.** Liberado para o Passo 2 quando você
autorizar.

---

### Passo 2 — migrations aplicadas · 14/09/2026 · **passou**

**Ferramenta: `supabase db push --linked`, não o `apply_migration` do MCP.**
O motivo importa: o `apply_migration` recebe só um *nome* e grava no ledger uma
versão com o carimbo de hora **do momento da aplicação**. As nossas migrations
têm versão fixa no nome do arquivo (`20260904120000`…), então o ledger remoto
ficaria com versões diferentes das locais e o repositório apareceria como
"pendente" para sempre. O `db push` preserva a versão do arquivo — é o que
mantém o repositório como fonte executável.

Dry-run antes de escrever confirmou exatamente as quatro, na ordem. Aplicadas:
`20260904120000`, `20260905120000`, `20260912120000`, `20260913120000`.

| Verificação | Esperado | Observado |
|---|---|---|
| Tabelas `screener_rhia_*` | 4, dono `screener_owner`, RLS ligado | 4, `screener_owner`, RLS ligado, 0 policies |
| RPC `screener_rhia_op_*` | 7, `SECURITY DEFINER`, `search_path=''` | 7, todas, todas |
| EXECUTE nas 7 RPC | só `screener_runtime` | runtime true; `service_role`, `anon`, `authenticated` **false** |
| Privilégio de TABELA do runtime | 0 | 0 |
| Instrumento | inativo, checksum da carga | `1.0.0-rc.1`, `inactive`, `1195451e…3456f81` |
| Vínculo | público, sem credencial | `public_pilot` / `required_before_result` / 180/365 / credencial nula |
| Job do rate limit | agendado e ativo | `boomit_screener_rate_gc_v1`, `*/15 * * * *`, ativo |

**Checksum conferido nos três lugares** e idêntico: o que o carregador calcula
localmente, o que está escrito na migration de carga e o que ficou gravado no
banco — `1195451e6d11c0f8245c04d4bdfacff4f86a8177a27aa5f224ab58fa33456f81`.

**V1 intocado.** Sessões, respostas, leads e snapshots do V1 seguem em zero. As
migrations 04 e 05 acrescentaram, do lado do V1, três funções
(`screener_op_preview_authorize`, `screener_op_rate_check`,
`screener_op_capturar_lead`) e a tabela `screener_rate_limit` — todas aditivas,
todas `SECURITY DEFINER` com `search_path=''`, e **inertes** até a edge passar a
chamá-las. Nenhuma função existente do V1 foi alterada **no Passo 2** — o Passo 2b,
escrito depois e ainda não aplicado, altera uma delas por endurecimento, sob a
exceção registrada no topo deste documento.

#### Advisors: o que mudou, e o que cada mudança é

| Achado | Antes | Depois | Leitura |
|---|---|---|---|
| `rls_enabled_no_policy` | 6 | 11 | **Esperado.** +4 tabelas rhia +1 de rate limit. RLS sem policy é negação total; o acesso é só pelas RPC. |
| `function_search_path_mutable` | 1 | 2 | **Introduzido por nós** — ver abaixo. |
| `auth_allow_anonymous_sign_ins` em `cron.*` | — | 2 | **Falso positivo verificado** — ver abaixo. |

**O achado que nós introduzimos.** A função de trigger
`screener_rhia_snapshot_impede_update` nasceu sem `search_path` fixo, espelhando
a mesma lacuna da equivalente do V1. Verificado: **não é `SECURITY DEFINER`**
(roda como quem invoca) e pertence ao `screener_owner`, então não há caminho de
escalada — mesma leitura que já valia para a do V1. Não bloqueia o roteiro.
A correção é uma linha (`alter function … set search_path = ''`) e, pela regra 3,
entra como **migration própria**, resolvendo as duas de uma vez. Fica proposta,
não aplicada.

**O falso positivo.** Instalar o `pg_cron` (migration 04) trouxe `cron.job` e
`cron.job_run_details` com policies que o linter marca como "acessíveis a
anônimo". Duas verificações mostram que não são: a policy é
`username = CURRENT_USER`, ou seja, cada papel só enxerga os próprios jobs; e,
mais decisivo, **nenhum** dos papéis `anon`, `authenticated`, `service_role` ou
`screener_runtime` tem `USAGE` no schema `cron` — eles não alcançam essas
tabelas de forma alguma.

**Critério do Passo 2: bateu em tudo.** Nenhum achado novo bloqueia. Próximo é o
Passo 3, e ele depende de você ter ligado o Force HTTPS (decisão D2).

---

## Checklist

- [x] D1 — site confirmado (`diagnosticoboomit`).
- [x] D2 — Force HTTPS + allowlist só em `https://`.
- [x] D3 — teste do V1 movido para fora do diretório publicado.
- [x] Passo 0 — preflight read-only bateu (14/09/2026).
- [x] Passo 1 — `rhia.html` ligado à edge (commitado, fora do ar).
- [x] Passo 2 — migrations 04, 05, 12 e 13 aplicadas (14/09/2026); verificação bateu.
- [ ] Passo 2b — `search_path` fixo nas duas funções de trigger (escrita e revisada; **não aplicada**).
- [ ] Passo 3 — `SCREENER_CORS_ORIGINS` e `SCREENER_RATE_KEY_SECRET` definidos.
- [ ] Passo 4 — edge redeployada; 200 na origem certa, 403 em outra.
- [ ] Passo 5 — 429 sob rajada.
- [ ] Passo 6 — merge para `main`; Netlify publicou.
- [ ] Passo 7 — smoke 13/13, incluindo a prova do portão na rede.
- [ ] Passo 8 — purga agendada, ou registrada como pendência com prazo.
