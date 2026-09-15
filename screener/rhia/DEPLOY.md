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
 where papel.rolname='screener_owner' and membro.rolname=current_user
   and (m.inherit_option or m.set_option);   -- esperado: 0
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

### Passo 2b — `search_path` fixo · 14/09/2026 · **passou**

Aplicada com `supabase db push --linked` (dry-run antes, só ela na fila).

| Verificação | Observado |
|---|---|
| `screener_snapshot_impede_update` | `search_path=""` |
| `screener_rhia_snapshot_impede_update` | `search_path=""` |
| Funções `screener_*` ainda sem `search_path` | 0 |
| Advisor `function_search_path_mutable` | **2 → 0** |
| Dados do V1 | sessões e snapshots seguem em zero |

**Um susto que virou lição sobre a própria verificação.** A consulta de membership
que eu tinha escrito aqui devolveu **1**, e não 0. Investiguei antes de concluir
qualquer coisa, e a membership que restou **não é a da migration**:

- o `grantor` dela é `supabase_admin`, não o papel que roda a migration;
- ela tem `admin_option = true` e, decisivo, `inherit_option = false` e
  `set_option = false` — o `postgres` não herda privilégio do `screener_owner`
  nem consegue `set role` para ele;
- o mesmo formato de linha existe para `screener_runtime`, que **nenhuma**
  migration nossa concede ou revoga.

É o registro que o Postgres 17 grava quando `supabase_admin` cria o papel, lá na
`20260903120000`. Predata o Passo 2b. A membership que a migration pega (com
`inherit`/`set`) foi devolvida, como o teste comportamental prova.

**A consulta do roteiro era grossa demais** — contava qualquer membership em vez
da que a migration cria. Corrigida abaixo, para não dar o mesmo susto na próxima:

```sql
select count(*) from pg_auth_members m
  join pg_roles papel  on papel.oid  = m.roleid
  join pg_roles membro on membro.oid = m.member
 where papel.rolname='screener_owner' and membro.rolname=current_user
   and (m.inherit_option or m.set_option);   -- esperado: 0
```

**Critério do Passo 2b: bateu.** Próximo é o Passo 3.

---

### Passo 3 — secrets da edge · 14/09/2026 · **passou**

**Force HTTPS confirmado antes de escolher a origem.** O Netlify reportava a URL
primária como `http://`, então testei o comportamento real em vez de confiar no
campo: `http://diagnosticoboomit.netlify.app/` responde **301** para
`https://…`. Com o redirecionamento ativo, cadastrar **só** a origem `https` é
seguro — ninguém chega à edge com uma `Origin` em `http`.

| Secret | Valor | Estado |
|---|---|---|
| `SCREENER_CORS_ORIGINS` | `https://diagnosticoboomit.netlify.app` | definido |
| `SCREENER_RATE_KEY_SECRET` | 32 bytes aleatórios em hex (64 caracteres) | definido |

**Como a chave foi tratada.** Gerada com `randomBytes(32)` e escrita **direto**
num arquivo `.env` temporário no scratchpad, sem passar por linha de comando,
por variável de ambiente exportada ou por saída de terminal. O CLI leu o arquivo
(`supabase secrets set --env-file`) e o arquivo foi apagado em seguida. O valor
não existe em nenhum lugar legível, e não é recuperável: se um dia for preciso,
gera-se outra. Rotacionar essa chave só invalida os baldes de rate limit
existentes — ela é material de HMAC interno da edge, não credencial de acesso.

**Verificação:** `supabase secrets list` mostra os dois pelo nome e por digest,
nunca pelo valor. `SCREENER_DB_POOLER_URL`, do V1, segue intacto desde 04/09.

**Ainda não estão em efeito.** A edge só lê os secrets quando é redeployada —
é o Passo 4. Até lá o comportamento em produção não mudou.

---

### Passo 4 — edge redeployada · 14/09/2026 · **passou**

Baseline antes: função `screener` **versão 2**, de 04/09, sem as rotas do
diagnóstico — provado por `GET /rhia/start` responder **404** antes do deploy.
Essa é a referência de rollback.

Deploy com `supabase functions deploy screener`. O CLI empacotou os módulos
fora de `supabase/functions/` que a função importa: handlers V1 e rhia, motor,
lógica, e o JSON do instrumento.

| Verificação | Esperado | Observado |
|---|---|---|
| `GET /rhia/start`, origem certa | 200 com 30 itens | **200**, 30 itens, `lead_capture_mode: required_before_result` |
| Origem não autorizada | 403 | **403** |
| Origem em `http` | 403 | **403** |
| Slug inexistente | 404 | **404** |
| Rota inexistente | 404 | **404** |

**A resposta pública não carrega interno.** As opções de cada item têm
exatamente duas chaves, `id` e `label` — nada de peso, ponto, faceta ou escala.
Os itens trazem `id, order, kind, group, dimension_name, prompt, options`.

Uma ressalva honesta sobre os ids `E1`–`E4`: eles **estão** na resposta, e
precisam estar — é o identificador que o navegador devolve ao responder. Não é
vazamento: eles não revelam pontuação, e os próprios enunciados já são
ordenados, porque é assim que uma escala de maturidade se lê. O que é segredo —
pontos, pesos, cortes e o mapeamento para degraus — não aparece. A proibição de
`E1`–`E4` vale para o **arquivo estático publicado** e para a **tela de
resultado**, e as duas seguem cobertas por teste.

**O V1 continua fechado, e isso é desenho, não regressão.** `GET /start` no
vínculo real `preview-interno-ia-v1` responde 404. A causa é determinística:
o vínculo está `internal_preview` **sem credencial cadastrada**, e
`screener_priv_previa_ok` exige `p_hash is not null` — com hash nulo ela sempre
devolve falso, o `get_binding` devolve null e o handler traduz para 404. Estado
inalterado desde a carga do V1, em 02/09.

> **Falha de método que eu cometi aqui:** não testei as rotas do V1 **antes** do
> deploy, então não tinha um A/B para comparar. Resolvi por leitura do código e
> do estado do vínculo, que é prova suficiente neste caso — mas o preflight do
> Passo 4 deveria ter incluído um toque nas rotas do V1, e passa a incluir.

**Rollback:** redeploy da versão anterior da função, ou o kill switch no vínculo,
que é mais rápido.

---

### Passo 5 — rate limiting ativo · 14/09/2026 · **passou**

Rajada de `POST /rhia/start` do mesmo IP, com consentimento válido:

| Requisições | Resposta |
|---|---|
| 1 a 10 | **201**, sessão criada |
| 11 e 12 | **429** `muitas_requisicoes`, `retry_after_seconds` ≈ 3235 |

O contador no banco registrou `start_preview = 12` na janela — conta todas,
autoriza as 10 primeiras. A política é 10 por hora por IP, em janela alinhada
à hora, e o `retry_after` devolvido bate com o tempo que falta para virar.

**O que isto custou em produção, dito sem rodeio.** A contagem só incrementa
**depois** do consentimento validado e **antes** da criação da sessão, então não
existe caminho que prove o limite sem criar sessão. Foram criadas **10 sessões
de teste**, entre 14:06:01 e 14:06:05, com **zero** respostas, leads e
snapshots. São inequivocamente artefato meu: nenhuma sessão real nasce sem
resposta nenhuma em quatro segundos. Ficam registradas aqui para não se
confundirem com funil real, e a exclusão delas depende de autorização — apagar
linha de produção é destrutivo, mesmo quando a linha é lixo conhecido.

**Efeito colateral que atrapalha o Passo 7.** O IP desta máquina fica limitado
para *criar sessão* por cerca de 54 minutos. O smoke ponta a ponta precisa
criar uma. Duas saídas: esperar a janela virar, ou rodar o smoke de outra rede
(celular no 4G, por exemplo) — que, aliás, é o teste mais fiel, porque é o
caminho de quem vai receber o link.

**Um efeito lateral menor, já contabilizado.** Os testes de rota do Passo 4
deixaram `previa_invalida = 3` (o limite é 5 por 10 minutos). Não bloqueou nada
e a janela vira sozinha, mas vale saber que tocar rotas fechadas também consome
cota.

---

### Limpeza das sessões de teste · 14/09/2026 · **feita**

As 10 sessões da rajada do Passo 5 foram apagadas, sob autorização. Duas coisas
merecem registro.

**A primeira tentativa foi RECUSADA pelo banco** — `permission denied for table
screener_rhia_sessions`. Isso é a fronteira funcionando: as tabelas pertencem ao
`screener_owner`, que não concede privilégio a ninguém, e o `postgres` é membro
**sem herança e sem `set role`** (exatamente o que o Passo 2b verificou). Não
existe caminho direto até essas tabelas; só as RPC chegam lá, e não há RPC de
exclusão.

**A exclusão exigiu a mesma membership temporária das migrations**, aberta e
devolvida na mesma chamada. O filtro foi conferido antes: listou as 10, todas
`open`, todas com zero respostas, zero snapshots e zero leads, na janela de
quatro segundos. Depois: `screener_rhia_sessions` em **0**, respostas, leads e
snapshots em 0, V1 em 0, e a membership fechada (0).

---

### Passo 6 — frontend publicado · 14/09/2026 · **passou**

`main` avançou de `f5c20bf` para `72ab5fd` em **fast-forward** (75 commits,
sem merge commit — `main` era ancestral do branch e não tinha mudado). Build
verde imediatamente antes: 208/208.

| Verificação | Observado |
|---|---|
| `https://diagnosticoboomit.netlify.app/rhia.html` | **200** (404 na primeira tentativa, ainda buildando) |
| `<title>` | Diagnóstico Boomit — RH, Desenvolvimento e IA |
| `EDGE_URL` na página | a função `screener` do projeto certo |
| `rhia.mjs`, `rhia.css`, `tokens.css`, logo | 200 |
| `screener.test.mjs` | **404** — a decisão D3 valeu |
| Instrumento no JS estático | **0 ocorrências** de código, id de item ou enunciado |

**O link público está no ar:**
`https://diagnosticoboomit.netlify.app/rhia.html`

---

### Correção urgente — o limite tratava uma SALA como abuso · 14/09/2026

**Encontrado no primeiro uso real, pela dona do produto**, que abriu o link e
recebeu "Muitas tentativas em pouco tempo".

**A causa.** `start_preview` era 10 por hora **por IP**. A política foi escrita
quando o único vínculo era uma prévia interna, com poucas pessoas e credencial.
O vínculo público é outra coisa: link aberto, distribuído, e quem o abre está
quase sempre atrás de um IP compartilhado — o wifi do workshop, a rede do Ibmec,
o NAT da operadora no celular. Com 10/hora por IP, **a 11ª pessoa da mesma sala
era barrada**. O controle não estava contendo abuso: estava barrando o público.
A rajada do Passo 5 consumiu a cota e escancarou o problema mais cedo.

**Destravamento imediato:** contadores da janela zerados (`delete from
screener_rate_limit`), com a membership temporária aberta e devolvida na mesma
chamada.

**Correção de causa:** `20260914150000_screener_rate_limite_para_link_publico`.
`start_preview` passa a **5000/hora por IP** — alto o bastante para uma sala
inteira, e ainda assim um teto que um script em série estoura em minutos. O que
**não** mudou, de propósito: `autosave` (120/h), `submit` (10/h) e `consulta`
(60/h) seguem iguais, porque são chaveados pelo **token da sessão** e nunca
punem uma pessoa pelo que a sala fez — é onde a proteção de fato mora. E
`previa_invalida` (5 por 10 min) segue igual, porque é força bruta de
credencial e o vínculo público não tem credencial.

> **Um erro meu, pego antes de aplicar.** Ao reescrever a função com
> `create or replace`, eu havia trocado a validação da chave (de regex de hex
> para simples comprimento — mais fraca) e a coleta amortizada (de 50 linhas com
> `skip locked` para um `delete` sem limite, que varreria a tabela a cada
> chamada). Conferi linha a linha contra a `20260904120000` e restaurei as duas.
> **`create or replace` é exatamente a hora em que se reescreve sem querer o que
> não se queria tocar.**

| Verificação em produção | Observado |
|---|---|
| Teto de `start_preview` | **5000** |
| Tetos de `submit` / `autosave` / `consulta` | 10 / 120 / 60, inalterados |
| Validação da chave por regex de hex | preservada |
| Coleta amortizada com `skip locked` | preservada |
| `SECURITY DEFINER`, `search_path=''`, dono | sim, sim, `screener_owner` |
| EXECUTE | só `screener_runtime`; `anon` e `service_role` **false** |
| Resíduo do teste da própria migration | 0 |
| Membership temporária | devolvida |

A fronteira se provou de novo no caminho: **nem consegui chamar a função** para
verificar (`permission denied for function`), porque só o runtime pode
executá-la. A conferência foi pelo catálogo.

**Teste que passa a existir:** `uma sala inteira atrás do MESMO IP não é
bloqueada` — 40 sessões do mesmo IP, todas 201. O teste antigo afirmava a
política que quebrou o produto; foi substituído, não remendado.

Não exigiu redeploy da edge: a política vive no banco.

---

### Passo 7 — smoke ponta a ponta · 14/09/2026 · **passou (45/45)**

Rodado **contra produção**, em duas camadas independentes.

**Camada de rede — 28 verificações.** Chamadas diretas à edge, sem navegador, que
é o único jeito de provar que o portão não depende do front:

- `GET /rhia/start` 200 com 30 itens; `POST /rhia/start` 201 com o token
  devolvido uma única vez.
- Texto livre: 1 caractere **recusado pelo servidor** (400), texto válido aceito.
  Autosave gravou 31 (30 itens + o texto).
- Opção fora do gabarito **recusada** (400).
- `GET /rhia/session` retoma com as respostas salvas e sem nada interno.
- **O portão:** `POST /rhia/submit` devolveu **exatamente** `{lead_required,
  submitted}` — nada de posicionamento, degrau, governança ou disclaimer. E
  `GET /rhia/result` **antes** do lead respondeu **403 `lead_required`**, com
  corpo que não vaza uma palavra da devolutiva. Depois do lead, 200.
- O corpo do resultado não contém `3333`, `6667`, `10000`, sufixo `_bp`,
  `internal`, `answers`, `weights`, `weakestBp`, nem código `E1`–`E4` ou
  `P1`–`P5`. Versão `2.0.0-pilot`.
- Origem não autorizada: 403.

**Camada de navegador — 17 verificações.** Chrome headless no site publicado:

- Abertura com o título **"Diagnóstico de cenário"** e o botão de começar.
- Contexto: "Outro" abre o campo de texto, e trocar de opção o esconde.
- **Recarregar no meio retoma no mesmo ponto** — "Pergunta 9 de 30" antes e
  depois do reload, com as respostas de volta.
- Revisão lista as 30 e **não mostra código** de escala nem de estágio.
- **O portão, agora pela interface:** ao enviar, pede o contato e a devolutiva
  **não** aparece. Depois do lead, aparece.
- Devolutiva com a escada de 5 degraus, **um único** em destaque, o fecho que
  liga ao workshop, e nenhum código ou ponto-base no texto.
- **320px sem rolagem lateral:** excesso 0px, medido na devolutiva real.

**Banco:** 1 snapshot por sessão submetida, versão `2.0.0-pilot`, degrau
preenchido. O snapshot guarda o **contrato inteiro** (com `internal`) — quem
projeta só a parte pública é a edge, que é exatamente o desenho. V1 em zero.

**Dados de teste deixados em produção.** Três sessões minhas, identificáveis
pelos leads `smoke+passo7@` e `smoke+navegador@`:

| Sessão | Hora | O que é |
|---|---|---|
| `4d2da497` | 15:52 | smoke de rede (submetida, com lead) |
| `c953ce13` | 15:53 | verificação de retomada (aberta, 3 respostas) |
| `44a2fd34` | 15:55 | smoke de navegador (submetida, com lead) |

> **Uma sessão às 15:51 NÃO é minha** — foi criada antes de eu começar, tem uma
> resposta e nenhum lead. É de quem abriu o link. Fica **intocada**. Se eu
> tivesse limpado por janela de tempo, como fiz no Passo 5, teria apagado o
> primeiro uso real do produto. A lição: limpar por **identidade do artefato**
> (o lead de teste, o id), nunca por tempo.

---

### Passo 8 — purga por retenção · 14/09/2026 · **aplicado**

Migration `20260914170000_screener_rhia_purga_por_retencao`. **Revisada antes do
apply, e REPROVADA na primeira versão** por um defeito que teria falhado em
produção — ver abaixo, porque é a parte mais instrutiva deste passo.

**O que passa a acontecer.** Job diário `boomit_screener_rhia_purga_v1`, às 03:17
UTC. Os prazos vêm do vínculo; **vínculo sem retenção declarada não é purgado**.

| Verificação em produção | Observado |
|---|---|
| Dono da função | `screener_owner` |
| `SECURITY DEFINER` / `search_path` | sim / `""` |
| EXECUTE para `anon`, `authenticated`, `service_role`, `screener_runtime` | **false** nos quatro |
| Executor do cron | `postgres`, **com** EXECUTE |
| Agendamento | `17 3 * * *`, ativo |
| CREATE no schema para `screener_owner` (era transitório) | **devolvido** |
| Membership temporária | devolvida |
| Execução real, como `postgres` | rodou; devolveu tudo zero; a sessão viva ficou intacta |

Essa última linha é a que importa: é a **única** prova de que a função foi criada
com o dono certo e alcança as tabelas. Hoje é no-op, porque a primeira exclusão
real só acontece por volta de março de 2027.

#### O defeito bloqueante, e por que meus testes não o pegaram

Faltava conceder `create on schema public` a `screener_owner` em volta do
`ALTER ... OWNER`. Sem isso o ALTER falha com `permission denied for schema
public`. As migrations 03, 04, 05 e 12 todas fazem esse par grant/revoke
transitório; a minha era a única que não.

**Os oito testes comportamentais passavam mesmo assim, e o motivo é uma armadilha
que vale registrar:** no pglite o usuário é **superusuário**, e o Postgres pula a
checagem "o novo dono precisa de CREATE no schema". No Supabase o `postgres`
**não** é superusuário. O revisor reproduziu a falha criando um papel não
superusuário e aplicando linha a linha.

A lição: **teste em pglite não cobre caminho de privilégio**, porque o privilégio
do executor é diferente. Onde a migration mexe em propriedade ou em GRANT, a
prova tem de ser o padrão já usado pelas migrations anteriores, não o teste verde.

#### As outras sete correções

| # | O que estava errado |
|---|---|
| 2 | `create or replace` numa função nova. Substituiria uma homônima **mantendo o dono antigo** — e `SECURITY DEFINER` com dono errado falha calada dentro do cron. Virou `create function`. |
| 3 | Os dois `delete` de sessão eram idênticos e a soma jogava fora a distinção. Agora devolvem `sessoes_sem_contato` e `sessoes_liberadas_pelo_contato` separados. |
| 4 | Os `coalesce(180/365)` faziam a função inventar política para vínculo que calou. Saíram. |
| 5 | `to postgres` cravado virou `to current_user`, e a guarda do executor foi para dentro do bloco do cron, checando `v_job.username`. |
| 6 | O cabeçalho errava a ordem real de exclusão e chamava de **anônima** a sessão que sobrevive entre 180 e 365 dias. Ela não é: continua ligada à PII pelo `session_id` único do lead. Corrigido aqui, em `LIMITES-METODOLOGICOS.md` e num `comment on function`. |
| 7 | O rollback do cabeçalho omitia a membership, sem a qual o `drop function` falha. |
| 8 | Migration e teste commitados **antes** do apply. |

Mais dois testes, um deles fechando o buraco: a função pertence a
`screener_owner`; e vínculo sem retenção declarada não é purgado.

#### O risco que fica, e é de operação

A purga roda numa transação só: qualquer erro aborta tudo, sem apagar nada e sem
avisar ninguém. Como a primeira exclusão real é em março de 2027, uma purga
quebrada ficaria invisível até lá. **Pendência de operação:** conferir
`cron.job_run_details` periodicamente, ou gravar o resumo JSON que a função já
devolve numa tabela de rastro.

---

### Ponte com a liderança — migration aplicada · 15/09/2026 · **aplicada na segunda tentativa**

Migration `20260915120000_screener_rhia_ponte_com_lideranca.sql`, commit
`c9584e6`. Autorizada pela Miriam depois de **três rodadas de revisão** — a
primeira reprovou (a ponte enxergaria zero linhas por RLS, e a purga noturna
abortaria), as outras duas aprovaram com ressalvas, todas corrigidas antes do
apply.

**A primeira tentativa falhou, e nada ficou no banco.**

```
ERROR: no possible grantors (SQLSTATE XX000)
At statement: 47 -> revoke screener_owner from current_user
```

`RESET ROLE` não devolve o papel que estava valendo — devolve o papel de **login**
da sessão. O `supabase db push` conecta com um papel de login e depois assume
outro (ele imprime "Initialising login role..."), e cada `reset role` do arquivo
desfazia essa troca. Os comandos seguintes rodavam com a identidade errada, e o
último não achava a membership que devia revogar. **Lição para as próximas
migrations desta casa: devolva o papel pelo nome** — `current_user` guardado numa
variável dentro de bloco plpgsql, ou num `set_config` transacional no nível de
cima. Os tratadores de exceção das migrations já aplicadas têm a mesma armadilha
latente; nunca dispararam porque o caminho de exceção nunca correu.

Conferido **antes de qualquer outra ação** que a transação voltou atrás por
inteiro: nenhuma tabela criada, purga com o corpo original, migration fora do
ledger.

**Comando:** `npx supabase db push --linked` — dry-run antes, só ela na fila.

**Verificação pós-apply (toda de leitura):**

| O quê | Resultado |
|---|---|
| Ledger | `20260915120000` registrada |
| Tabelas da ponte | dono `screener_owner`, RLS ligada, **zero policy** |
| Auxiliares de leitura | dono `postgres` — o dono de `respondentes`, que é o que os faz escapar da RLS |
| RPCs | dono `screener_owner` |
| `anon` / `authenticated` / `service_role` | **nenhum** alcança as 4 RPC nem os 2 auxiliares |
| `screener_runtime` | alcança as 4 RPC; **zero** privilégio de tabela; **não** alcança os auxiliares |
| Purga | fase 3 presente; dono e ACL intactos (o `postgres` do cron manteve o EXECUTE) |
| Cron | `boomit_screener_rhia_purga_v1` @ `17 3 * * *`, ativo |
| CREATE em `public` | revogado (era transitório) |
| Membership transitória | revogada; sobrou só a residual de 03 |
| Grant em `respondentes` | **NENHUM** |

**A prova de que a ponte enxerga gente** é a guarda 7c da própria migration: ela
roda no apply contra os 94 respondentes com e-mail e aborta se o auxiliar,
atuando como `screener_owner`, vir zero linhas. Ela passou. Se a RLS ainda
estivesse filtrando tudo — o defeito que reprovou a primeira versão — o apply
teria parado ali.

**O que isto muda no comportamento vivo:** quase nada. Nenhuma edge chama as
quatro RPC ainda. A única mudança é a purga noturna passar a apagar convites
vencidos, de uma tabela que nasceu vazia.

**Próximo passo:** emitir o convite no fim do fluxo de liderança
(`gate-and-send`), com o `token_sessao` lido do cabeçalho `x-sessao`. A RPC não
aceita `respondente_id` — o id é derivado dentro do banco.

---

## Checklist

- [x] D1 — site confirmado (`diagnosticoboomit`).
- [x] D2 — Force HTTPS **confirmado ativo** (301 de http para https); allowlist só em `https://`.
- [x] D3 — teste do V1 movido para fora do diretório publicado.
- [x] Passo 0 — preflight read-only bateu (14/09/2026).
- [x] Passo 1 — `rhia.html` ligado à edge (commitado, fora do ar).
- [x] Passo 2 — migrations 04, 05, 12 e 13 aplicadas (14/09/2026); verificação bateu.
- [x] Passo 2b — `search_path` fixo nas duas funções de trigger (aplicado 14/09/2026); advisor zerado.
- [x] Passo 3 — `SCREENER_CORS_ORIGINS` e `SCREENER_RATE_KEY_SECRET` definidos (14/09/2026).
- [x] Passo 4 — edge redeployada (14/09/2026); 200 na origem certa, 403 em outra.
- [x] Passo 5 — 429 sob rajada (14/09/2026); as 10 sessões de teste foram apagadas sob autorização.
- [ ] Passo 6 — merge para `main`; Netlify publicou.
- [x] Passo 7 — smoke **45/45** (28 de rede + 17 de navegador), incluindo a prova do portão (14/09/2026).
- [x] Passo 8 — purga agendada e verificada em produção (14/09/2026).
- [x] Ponte com a liderança — migration aplicada e verificada (15/09/2026), depois de três rodadas de revisão.
