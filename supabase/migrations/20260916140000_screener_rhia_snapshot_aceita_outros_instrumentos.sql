-- =============================================================
-- O SNAPSHOT PASSA A ACEITAR OUTRO INSTRUMENTO — sem deixar de conferir nada.
--
-- O QUE BLOQUEIA HOJE. `screener_rhia_snap_contract` exige que o contrato
-- guardado declare a versão `2.0.0-pilot`, que é a do modelo público do motor de
-- IA. O documento único tem outra forma e outra versão, então finalizar uma
-- sessão dele morre no CHECK.
--
-- ORDEM DE APLICAÇÃO — IMPORTANTE, e não é detalhe:
--
--     ESTA MIGRATION PRIMEIRO. O REDEPLOY DA EDGE DEPOIS.
--
-- O commit que traz esta migration também liga `podeFinalizar: true` para o
-- formulário único em `screener/edge/instrumentos.mjs`. Com a edge redeployada e
-- a migration NÃO aplicada, uma pessoa responde as 40 perguntas e leva 409 no
-- último clique — o CHECK antigo recusa o contrato, e a edge traduz isso em
-- "conflito", sem explicação. Hoje é latente (não existe vínculo do formulário
-- único no banco até a carga, depois de 25/09), mas a ordem tem de estar escrita
-- antes de alguém precisar dela.
--
-- O QUE ESTA MIGRATION NÃO FAZ: trocar a constante por uma LISTA de versões
-- aceitas. Seria repetir exatamente o erro que o `stage_code in ('E1'..'E4','NA')`
-- do V1 cometeu — transformar "acrescentar uma versão" em migration de tabela
-- compartilhada. Toda versão nova voltaria aqui.
--
-- O QUE ELA FAZ, e é mais estrito que o de hoje em uma coisa: amarra o JSON à
-- COLUNA. `report_version` já grava, na mesma linha, a versão do modelo que
-- produziu aquele resultado. A regra passa a ser "o contrato não pode MENTIR
-- sobre a própria versão".
--
--   antes:  result -> 'public' ->> 'version' = '2.0.0-pilot'
--   agora:  result -> 'public' ->> 'version' = report_version   (e nenhum vazio)
--
-- Em que isso é MAIS forte: hoje uma linha pode ter `report_version = 'x'` e o
-- JSON dizer `2.0.0-pilot`, e o banco aceita. Depois desta migration, não.
-- Em que é mais frouxo: qualquer versão passa a ser guardável — que é o ponto,
-- e é o que a coluna sempre existiu para registrar.
--
-- POR QUE `report_version` E NÃO `scoring_version`. São coisas diferentes com
-- todo o direito de divergir: uma é a versão do MODELO DE SAÍDA (o `VERSION` do
-- output-definition-v2, que é o que vai dentro do contrato), a outra é a versão
-- do CÁLCULO. Um motor 2.1 pode legitimamente emitir contrato 2.0. Amarrar o
-- JSON às duas proibiria essa divergência e congelaria duas colunas numa só —
-- e, pior, funcionaria por acidente enquanto a edge mandasse o mesmo valor para
-- as duas, passando a recusar linhas legítimas justamente no dia em que alguém
-- separasse as versões corretamente. As duas ganham a guarda de não-vazio, que é
-- outra coisa: forma, não coerência.
--
-- O `is not null` explícito continua fazendo o que o `coalesce` fazia: sem a
-- chave, o `->>` daria NULL, a comparação daria NULL, e o CHECK passaria em
-- silêncio. CHECK que avalia para NULL não dispara — é a mesma armadilha que já
-- apareceu duas vezes nesta trilha.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (o `set role` é devolvido pelo NOME aqui também — `reset role` volta
-- ao papel de LOGIN da sessão, e foi o que matou a ponte no apply de 15/09):
--
--   grant screener_owner to current_user;
--   select set_config('boomit.papel', current_user, false);
--   set role screener_owner;
--   alter table public.screener_rhia_result_snapshots
--     drop constraint screener_rhia_snap_contract,
--     drop constraint screener_rhia_snap_report_version,
--     drop constraint screener_rhia_snap_scoring_version,
--     add constraint screener_rhia_snap_contract
--       check (coalesce(result -> 'public' ->> 'version', '') = '2.0.0-pilot');
--   do $r$ begin execute format('set role %I', current_setting('boomit.papel')); end $r$;
--   revoke screener_owner from current_user;
--
--   Atenção: o rollback SÓ passa se nenhuma linha do documento único tiver sido
--   gravada. Se tiver, ele falha — e é assim que tem de ser.
-- ---------------------------------------------------------------------------
-- =============================================================

grant screener_owner to current_user;
select set_config('boomit.papel_da_migration', current_user, true);

-- A guarda do papel vem antes de qualquer coisa. `RESET ROLE` não é o inverso de
-- `SET ROLE` (ele volta ao papel de LOGIN da sessão), e foi assim que a migration
-- da ponte morreu no último comando em 15/09. Aqui o papel é devolvido pelo NOME.
do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  if v_papel is null then raise exception 'papel da migration nao foi guardado'; end if;
end $$;

-- 1) O PAPEL DA DONA VEM ANTES DE LER A TABELA --------------------------------
-- `screener_rhia_result_snapshots` é de `screener_owner`, com RLS ligada, zero
-- policy e zero grant. Ler daqui com o papel do `db push` tem três desfechos,
-- conforme o `rolinherit` dele — e um deles é o pior possível:
--
--   herda      → enxerga tudo (o que a verificação espera)
--   noinherit  → `permission denied`, e a migration morre com uma mensagem que
--                não tem nada a ver com o que ela estava fazendo
--   sem herdar, com select → **ZERO LINHAS, em silêncio**: a verificação passaria
--                sem ter verificado NADA, e o `alter table` é que falharia
--
-- O terceiro é o que torna isto bloqueante: uma guarda que mente é pior que
-- guarda nenhuma. Sob o papel da dona, os três desfechos viram um só.
set role screener_owner;

-- O risco desta migration não é o scan (a tabela é pequena e o CHECK é barato):
-- é a FILA DO LOCK. Se um `finalize` ou um `get_result` estiver em voo, o ALTER
-- espera pelo ACCESS EXCLUSIVE e, enquanto espera, bloqueia todo mundo atrás
-- dele — inclusive leitura, num produto que está no ar. Sem `lock_timeout`, essa
-- espera não tem fim.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- O lock explícito, ANTES de contar: sem ele, a verificação lê o commitado
-- naquele instante e uma transação concorrente ainda pode inserir linha
-- violadora antes de o ALTER pegar o lock. Com ele, a contagem já roda sob o
-- mesmo lock que o ALTER vai usar — e o `lock_timeout` passa a ter um comando
-- claro para culpar, em vez de um `alter table` que trava sem explicação.
lock table public.screener_rhia_result_snapshots in access exclusive mode;

-- 2) A VERIFICAÇÃO VEM ANTES DA TROCA ------------------------------------------
-- Se alguma linha já gravada divergir, é melhor abortar aqui, dizendo quantas e
-- por quê, do que deixar o `alter table` falhar com
-- `check constraint ... is violated by some row` — que não diz qual linha nem o
-- que fazer.
do $$
declare v_divergentes int; v_sem_versao int; v_rv_vazio int; v_sv_vazio int; v_total int;
begin
  select count(*),
         count(*) filter (where result -> 'public' ->> 'version' is null),
         count(*) filter (where coalesce(report_version, '') = ''),
         count(*) filter (where coalesce(scoring_version, '') = ''),
         count(*) filter (where result -> 'public' ->> 'version' is distinct from report_version)
    into v_total, v_sem_versao, v_rv_vazio, v_sv_vazio, v_divergentes
    from public.screener_rhia_result_snapshots;

  raise notice 'snapshots conferidos: %', v_total;
  if v_sem_versao > 0 then
    raise exception 'ha % snapshot(s) sem version no contrato — a restricao nova os recusaria', v_sem_versao;
  end if;
  if v_rv_vazio > 0 then raise exception 'ha % snapshot(s) com report_version vazio', v_rv_vazio; end if;
  if v_sv_vazio > 0 then raise exception 'ha % snapshot(s) com scoring_version vazio', v_sv_vazio; end if;
  if v_divergentes > 0 then
    raise exception 'ha % snapshot(s) em que o contrato e a coluna discordam sobre a versao', v_divergentes;
  end if;
end $$;

-- 3) A TROCA, NUMA AQUISIÇÃO DE LOCK SÓ ----------------------------------------
alter table public.screener_rhia_result_snapshots
  drop constraint screener_rhia_snap_contract,
  add constraint screener_rhia_snap_contract check (
    result -> 'public' ->> 'version' is not null
    and result -> 'public' ->> 'version' = report_version
  ),
  -- As colunas são `not null`, mas não eram não-vazias: sem isto, um contrato
  -- com versão vazia casaria com uma coluna vazia e as duas passariam juntas.
  add constraint screener_rhia_snap_report_version  check (report_version  <> ''),
  add constraint screener_rhia_snap_scoring_version check (scoring_version <> '');

comment on constraint screener_rhia_snap_contract on public.screener_rhia_result_snapshots is
  'O contrato guardado nao pode mentir sobre a propria versao: o que esta no JSON tem de ser o que esta em report_version. Substituiu (20260916140000) a comparacao com a constante 2.0.0-pilot, que impedia guardar resultado de qualquer outro instrumento. Amarra a report_version (versao do MODELO DE SAIDA) e nao a scoring_version (versao do CALCULO), porque as duas tem o direito de divergir.';

do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  execute format('set role %I', v_papel);
end $$;

-- 4) GUARDAS DE ACEITAÇÃO -------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'screener_rhia_result_snapshots'
     and c.conname = 'screener_rhia_snap_contract';

  if v_def is null then raise exception 'a restricao do contrato sumiu'; end if;
  if v_def like '%2.0.0-pilot%' then
    raise exception 'a restricao continua cravada numa versao: %', v_def; end if;
  if v_def not like '%report_version%' then
    raise exception 'a restricao nao amarra o contrato a coluna: %', v_def; end if;

  for v_def in
    select x from unnest(array['screener_rhia_snap_report_version', 'screener_rhia_snap_scoring_version']) x
  loop
    if not exists (select 1 from pg_constraint c
                     join pg_class t on t.oid = c.conrelid
                     join pg_namespace n on n.oid = t.relnamespace
                    where n.nspname = 'public'
                      and t.relname = 'screener_rhia_result_snapshots'
                      and c.conname = v_def) then
      raise exception 'faltou a restricao %', v_def; end if;
  end loop;

  -- A tabela continua imutável: o gatilho que bloqueia UPDATE é o que faz o
  -- snapshot valer como prova do que foi entregue. Conferido PELO NOME — "existe
  -- algum trigger não-interno" passaria com qualquer outro no lugar dele.
  if not exists (select 1 from pg_trigger g
                   join pg_class t on t.oid = g.tgrelid
                   join pg_namespace n on n.oid = t.relnamespace
                  where n.nspname = 'public'
                    and t.relname = 'screener_rhia_result_snapshots'
                    and g.tgname = 'trg_screener_rhia_snapshot_no_update') then
    raise exception 'o gatilho de imutabilidade do snapshot sumiu';
  end if;
end $$;

-- 5) fecha a fronteira
do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  if current_user <> coalesce(v_papel, '') then
    raise exception 'a migration terminaria como % em vez de % — algum bloco trocou o papel e nao devolveu',
      current_user, v_papel;
  end if;
end $$;
revoke screener_owner from current_user;
select set_config('boomit.papel_da_migration', '', true);
