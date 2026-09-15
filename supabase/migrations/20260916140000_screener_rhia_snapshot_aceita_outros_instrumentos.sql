-- =============================================================
-- O SNAPSHOT PASSA A ACEITAR OUTRO INSTRUMENTO — sem deixar de conferir nada.
--
-- O QUE BLOQUEIA HOJE. `screener_rhia_snap_contract` exige que o contrato
-- guardado declare a versão `2.0.0-pilot`, que é a do modelo público do motor de
-- IA. O documento único tem outra forma e outra versão, então finalizar uma
-- sessão dele morreria no CHECK — e é por isso que `instrumentos.mjs` declara
-- `podeFinalizar: false` e a edge recusa com motivo legível, em vez de deixar a
-- pessoa responder 40 itens e bater num erro cru de banco no último clique.
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
-- O `is not null` explícito continua fazendo o que o `coalesce` fazia: sem a
-- chave, o `->>` daria NULL, a comparação daria NULL, e o CHECK passaria em
-- silêncio. `if` e CHECK sobre NULL não disparam — é a mesma armadilha que já
-- apareceu duas vezes nesta trilha.
--
-- NENHUMA LINHA EXISTENTE É AFETADA: a edge sempre gravou `report_version` com o
-- mesmo valor que pôs no contrato (`VERSAO_RESULTADO` ia para os dois lugares).
-- A verificação no apply confere isso antes de trocar a restrição, e ABORTA se
-- alguma linha divergir — em vez de o `alter table` falhar com uma mensagem que
-- não explica nada.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK:
--
--   grant screener_owner to current_user;
--   set role screener_owner;
--   alter table public.screener_rhia_result_snapshots
--     drop constraint screener_rhia_snap_contract,
--     drop constraint screener_rhia_snap_report_version;
--   alter table public.screener_rhia_result_snapshots
--     add constraint screener_rhia_snap_contract
--     check (coalesce(result -> 'public' ->> 'version', '') = '2.0.0-pilot');
--   reset role;  -- (aqui pode: é o rollback manual, fora do db push)
--   revoke screener_owner from current_user;
--
--   Atenção: o rollback SÓ passa se nenhuma linha do documento único tiver sido
--   gravada. Se tiver, ele falha — e é assim que tem de ser.
-- ---------------------------------------------------------------------------
-- =============================================================

grant screener_owner to current_user;
select set_config('boomit.papel_da_migration', current_user, true);

-- Antes de qualquer coisa: a guarda do papel. `RESET ROLE` não é o inverso de
-- `SET ROLE` (ele volta ao papel de LOGIN da sessão), e foi assim que a migration
-- da ponte morreu no último comando em 15/09. Aqui o papel é devolvido pelo NOME.
do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  if v_papel is null then raise exception 'papel da migration nao foi guardado'; end if;
end $$;

-- 1) A VERIFICAÇÃO VEM ANTES DA TROCA ------------------------------------------
-- Se alguma linha já gravada divergir, é melhor abortar aqui, dizendo quantas e
-- por quê, do que deixar o `alter table` falhar com "violates check constraint"
-- — mensagem que não diz qual linha nem o que fazer.
do $$
declare v_divergentes int; v_sem_versao int; v_vazias int;
begin
  select count(*) into v_sem_versao from public.screener_rhia_result_snapshots
   where result -> 'public' ->> 'version' is null;
  select count(*) into v_vazias from public.screener_rhia_result_snapshots
   where coalesce(report_version, '') = '';
  select count(*) into v_divergentes from public.screener_rhia_result_snapshots
   where result -> 'public' ->> 'version' is distinct from report_version;

  if v_sem_versao > 0 then
    raise exception 'ha % snapshot(s) sem version no contrato — a restricao nova os recusaria', v_sem_versao;
  end if;
  if v_vazias > 0 then
    raise exception 'ha % snapshot(s) com report_version vazio', v_vazias;
  end if;
  if v_divergentes > 0 then
    raise exception 'ha % snapshot(s) em que o contrato e a coluna discordam sobre a versao', v_divergentes;
  end if;
end $$;

-- 2) A TROCA --------------------------------------------------------------------
-- `set role` explícito: a tabela é de `screener_owner`, e ALTER TABLE exige ser
-- dono. A membership vem do `grant` do topo; sem ela nem seria possível trocar de
-- papel, porque a residual de `supabase_admin` tem `inherit` e `set` falsos.
set role screener_owner;

alter table public.screener_rhia_result_snapshots
  drop constraint screener_rhia_snap_contract;

alter table public.screener_rhia_result_snapshots
  add constraint screener_rhia_snap_contract check (
    result -> 'public' ->> 'version' is not null
    and result -> 'public' ->> 'version' = report_version
  );

-- A coluna é `not null`, mas não era `<> ''`: sem isto, um contrato com versão
-- vazia casaria com uma coluna vazia e as duas passariam juntas.
alter table public.screener_rhia_result_snapshots
  add constraint screener_rhia_snap_report_version check (report_version <> '');

comment on constraint screener_rhia_snap_contract on public.screener_rhia_result_snapshots is
  'O contrato guardado nao pode mentir sobre a propria versao: o que esta no JSON tem de ser o que esta em report_version. Substituiu (20260916140000) a comparacao com a constante 2.0.0-pilot, que impedia guardar resultado de qualquer outro instrumento.';

do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  execute format('set role %I', v_papel);
end $$;

-- 3) GUARDAS DE ACEITAÇÃO -------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c join pg_class t on t.oid = c.conrelid
   where t.relname = 'screener_rhia_result_snapshots' and c.conname = 'screener_rhia_snap_contract';

  if v_def is null then raise exception 'a restricao do contrato sumiu'; end if;
  if v_def like '%2.0.0-pilot%' then
    raise exception 'a restricao continua cravada numa versao: %', v_def; end if;
  if v_def not like '%report_version%' then
    raise exception 'a restricao nao amarra o contrato a coluna: %', v_def; end if;

  if not exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                  where t.relname = 'screener_rhia_result_snapshots'
                    and c.conname = 'screener_rhia_snap_report_version') then
    raise exception 'faltou a restricao de report_version nao vazio';
  end if;

  -- A tabela continua imutável: o gatilho que bloqueia UPDATE é o que faz o
  -- snapshot valer como prova do que foi entregue.
  if not exists (select 1 from pg_trigger g join pg_class t on t.oid = g.tgrelid
                  where t.relname = 'screener_rhia_result_snapshots' and not g.tgisinternal) then
    raise exception 'o gatilho de imutabilidade do snapshot sumiu';
  end if;
end $$;

-- 4) fecha a fronteira
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
