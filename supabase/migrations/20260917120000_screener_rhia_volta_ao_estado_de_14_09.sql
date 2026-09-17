-- =============================================================
-- VOLTA AO ESTADO DE ANTES DA SESSÃO DE 15/09 — desfaz, no banco, as três
-- migrations daquela sessão, a pedido da Miriam ("pode voltar tudo", 17/09).
--
--   20260915120000  ponte com a liderança  (convites, vínculos, 6 funções, purga fase 3)
--   20260916120000  perfil do formulário único (tabela, 3 funções, purga com perfis)
--   20260916140000  snapshot aceita outros instrumentos (CHECK por report_version)
--
-- POR QUE UMA MIGRATION NOVA, e não apagar as antigas: o que está no ledger não
-- se reescreve. As três continuam registradas; esta registra a volta.
--
-- NADA SE PERDE: o preflight de 17/09 mostrou as três tabelas VAZIAS (0 convites,
-- 0 vínculos, 0 perfis) e os 3 snapshots existentes todos em 2.0.0-pilot. As
-- guardas abaixo conferem isso de novo, sob lock, e abortam se tiver mudado.
--
-- ORDEM DE APLICAÇÃO: a edge já voltou para a versão de 14/09 (publicada de novo a partir do commit bc90ad1, o mesmo da v3),
-- que não chama nenhuma das funções removidas aqui. Site e edge primeiro, banco
-- por último.
--
-- O QUE VOLTA, exatamente:
--   * screener_rhia_purga() → corpo e comentário da 20260914170000, palavra por
--     palavra (dono, ACL e job do cron não mudam: create or replace os preserva)
--   * screener_rhia_snap_contract → a forma da 20260912120000
--   * saem: as tabelas screener_rhia_convites, _vinculos, _perfis; as funções
--     screener_rhia_op_{emitir_convite, vincular_por_convite, vincular_por_email,
--     ler_vinculo, salvar_perfil, ler_perfil}, screener_priv_perfil_opcao_ok e
--     screener_ponte_respondente_por_{token, email}; as restrições
--     screener_rhia_snap_report_version e _scoring_version.
--
-- Pipeline do `db push` (lição de 16/09): nada de LOCK TABLE nem SET LOCAL no
-- nível superior — timeouts por set_config(..., true) e lock dentro de DO.
-- =============================================================

grant screener_owner to current_user;
select set_config('boomit.papel_da_migration', current_user, true);

do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  if v_papel is null then raise exception 'papel da migration nao foi guardado'; end if;
end $$;

-- CREATE transitório no schema: o `create or replace` da purga exige, mesmo
-- substituindo. Revogado no fim.
do $$
declare v_papel name := current_user;
begin
  grant create on schema public to screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  grant create on schema public to screener_owner;
  execute format('set role %I', v_papel);
end $$;

select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);

-- 1) LOCKS, NA ORDEM EM QUE O RESTO DA MIGRATION PRECISARIA DELES ----------------
-- Apagar uma tabela com chave estrangeira trava EXCLUSIVAMENTE a tabela
-- referenciada: `respondentes` (da liderança, em uso) e `screener_rhia_sessions`.
-- Pegá-las aqui, antes do snapshot, evita o deadlock com um `finalize` em voo
-- (que segura a sessão e espera o snapshot) e deixa o `lock_timeout` culpar um
-- comando claro. `respondentes` é de `postgres`: travada pelo papel da migration.
do $$
begin
  if current_setting('lock_timeout') <> '3s' then
    raise exception 'lock_timeout nao ficou em 3s (esta em %)', current_setting('lock_timeout'); end if;
  lock table public.respondentes in access exclusive mode;
end $$;

set role screener_owner;

do $$
begin
  lock table public.screener_rhia_sessions, public.screener_rhia_result_snapshots,
             public.screener_rhia_convites, public.screener_rhia_vinculos, public.screener_rhia_perfis
    in access exclusive mode;
end $$;

-- 1') COMO DONA: confere que nada se perde, e desfaz ------------------------------

do $$
declare v_conv int; v_vinc int; v_perf int; v_snap_outros int;
begin
  select count(*) into v_conv from public.screener_rhia_convites;
  select count(*) into v_vinc from public.screener_rhia_vinculos;
  select count(*) into v_perf from public.screener_rhia_perfis;
  select count(*) into v_snap_outros from public.screener_rhia_result_snapshots
   where coalesce(result -> 'public' ->> 'version', '') <> '2.0.0-pilot';
  raise notice 'convites %, vinculos %, perfis %, snapshots fora do 2.0.0-pilot %', v_conv, v_vinc, v_perf, v_snap_outros;
  if v_conv + v_vinc + v_perf > 0 then
    raise exception 'ha dados nas tabelas da sessao (convites %, vinculos %, perfis %) — a volta apagaria dado real; abortado',
      v_conv, v_vinc, v_perf;
  end if;
  if v_snap_outros > 0 then
    raise exception 'ha % snapshot(s) fora do 2.0.0-pilot — a restricao antiga os recusaria; abortado', v_snap_outros;
  end if;
end $$;

-- 1a) o snapshot volta à restrição original
alter table public.screener_rhia_result_snapshots
  drop constraint screener_rhia_snap_contract,
  drop constraint screener_rhia_snap_report_version,
  drop constraint screener_rhia_snap_scoring_version,
  add constraint screener_rhia_snap_contract
    check (coalesce(result -> 'public' ->> 'version', '') = '2.0.0-pilot');

-- 1b) a purga volta ao corpo da 20260914170000 — ANTES de as tabelas saírem,
--     porque o corpo atual as referencia
create or replace function public.screener_rhia_purga()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_snap int := 0; v_resp int := 0; v_sem_lead int := 0; v_lead int := 0; v_cascas int := 0;
begin
  -- ---------- FASE 1 — o conteúdo da avaliação, aos 180 dias ----------
  -- Snapshot primeiro: é ele que segura a sessão por chave estrangeira.
  delete from public.screener_rhia_result_snapshots n
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where n.session_id = s.id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days);
  get diagnostics v_snap = row_count;

  delete from public.screener_rhia_responses r
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where r.session_id = s.id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days);
  get diagnostics v_resp = row_count;

  -- Quem nunca deixou contato sai inteiro agora.
  delete from public.screener_rhia_sessions s
   using public.screener_event_bindings b
   where b.id = s.binding_id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days)
     and not exists (select 1 from public.screener_rhia_leads l where l.session_id = s.id);
  get diagnostics v_sem_lead = row_count;

  -- ---------- FASE 2 — o contato, no prazo dele ----------
  delete from public.screener_rhia_leads l
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where l.session_id = s.id
     and b.lead_retention_days is not null
     and l.created_at < now() - make_interval(days => b.lead_retention_days);
  get diagnostics v_lead = row_count;

  -- As sessões que só continuavam de pé porque um lead apontava para elas.
  -- É o MESMO comando da fase 1, de novo: o que mudou foi o mundo entre os dois
  -- — os leads vencidos saíram. A contagem fica separada de propósito, porque
  -- "nunca teve contato" e "o contato venceu" são fatos diferentes.
  delete from public.screener_rhia_sessions s
   using public.screener_event_bindings b
   where b.id = s.binding_id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days)
     and not exists (select 1 from public.screener_rhia_leads l where l.session_id = s.id);
  get diagnostics v_cascas = row_count;

  return jsonb_build_object(
    'snapshots', v_snap, 'respostas', v_resp,
    'sessoes_sem_contato', v_sem_lead, 'sessoes_liberadas_pelo_contato', v_cascas,
    'contatos', v_lead, 'em', now());
end $$;

comment on function public.screener_rhia_purga() is
  'Purga por retencao do rhia. Prazos vem do vinculo; vinculo sem retencao declarada nao e purgado. 180 dias apagam o conteudo da avaliacao (respostas e snapshot) de todos; a linha de sessao de quem deixou contato sobrevive ate os 365 dias do contato, porque continua ligada a PII pelo session_id unico do lead — ela NAO e anonima.';

-- 1c) as funções e tabelas da sessão, cujo dono é screener_owner
drop function public.screener_rhia_op_salvar_perfil(text, text, text, text, text, text, text, text);
drop function public.screener_rhia_op_ler_perfil(text, text);
drop function public.screener_priv_perfil_opcao_ok(jsonb, text, text);
drop function public.screener_rhia_op_emitir_convite(uuid, text, integer);
drop function public.screener_rhia_op_vincular_por_convite(text, text);
drop function public.screener_rhia_op_vincular_por_email(text);
drop function public.screener_rhia_op_ler_vinculo(text);
drop table public.screener_rhia_perfis;
drop table public.screener_rhia_vinculos;
drop table public.screener_rhia_convites;

do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  execute format('set role %I', v_papel);
end $$;

-- 2) COMO O PAPEL DA MIGRATION: as duas auxiliares da ponte são de `postgres` ----
drop function public.screener_ponte_respondente_por_token(uuid);
drop function public.screener_ponte_respondente_por_email(text);

-- 3) GUARDAS DE ACEITAÇÃO — o banco tem de estar como em 14/09 --------------------
do $$
declare v_def text; v_sobra text;
begin
  -- nada da sessão sobrou
  select string_agg(c.relname, ', ') into v_sobra from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('screener_rhia_convites', 'screener_rhia_vinculos', 'screener_rhia_perfis');
  if v_sobra is not null then raise exception 'tabela da sessao sobrou: %', v_sobra; end if;

  select string_agg(p.proname, ', ') into v_sobra from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'screener_rhia_op_emitir_convite', 'screener_rhia_op_vincular_por_convite', 'screener_rhia_op_vincular_por_email',
     'screener_rhia_op_ler_vinculo', 'screener_rhia_op_salvar_perfil', 'screener_rhia_op_ler_perfil',
     'screener_priv_perfil_opcao_ok', 'screener_ponte_respondente_por_token', 'screener_ponte_respondente_por_email');
  if v_sobra is not null then raise exception 'funcao da sessao sobrou: %', v_sobra; end if;

  -- o snapshot com a restrição original, e só ela
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.screener_rhia_result_snapshots'::regclass and c.conname = 'screener_rhia_snap_contract';
  if v_def is null or v_def not like '%2.0.0-pilot%' or v_def like '%report_version%' then
    raise exception 'a restricao do snapshot nao voltou a forma original: %', v_def; end if;
  if exists (select 1 from pg_constraint c where c.conrelid = 'public.screener_rhia_result_snapshots'::regclass
              and c.conname in ('screener_rhia_snap_report_version', 'screener_rhia_snap_scoring_version')) then
    raise exception 'restricao da sessao sobrou no snapshot'; end if;
  if not exists (select 1 from pg_trigger g where g.tgrelid = 'public.screener_rhia_result_snapshots'::regclass
                  and g.tgname = 'trg_screener_rhia_snapshot_no_update') then
    raise exception 'o gatilho de imutabilidade do snapshot sumiu'; end if;

  -- a purga como era: sem fase de convites nem de perfis, mesma dona, mesmo alcance
  select pg_get_functiondef('public.screener_rhia_purga()'::regprocedure) into v_def;
  if v_def like '%screener_rhia_convites%' or v_def like '%screener_rhia_perfis%' then
    raise exception 'a purga ainda referencia tabela da sessao'; end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = 'public.screener_rhia_purga()'::regprocedure)) <> 'screener_owner' then
    raise exception 'a purga ficou com dono errado'; end if;
  if not has_function_privilege(current_user, 'public.screener_rhia_purga()', 'execute') then
    raise exception 'o executor do cron perdeu o EXECUTE na purga'; end if;
  if has_function_privilege('anon', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('authenticated', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('service_role', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('screener_runtime', 'public.screener_rhia_purga()', 'execute') then
    raise exception 'a purga ficou alcancavel por papel que nao deveria executa-la'; end if;
end $$;

-- 4) fecha a fronteira ------------------------------------------------------------
do $$
declare v_papel name := current_user;
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  revoke create on schema public from screener_owner;
  execute format('set role %I', v_papel);
end $$;

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
