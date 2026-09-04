-- =============================================================
-- SCREENER — rate limiting (Opção B: Postgres via RPC SECURITY DEFINER)
--
-- ⚠️ NÃO APLICADA. Escrita e testada localmente (pglite) para revisão.
--
-- CONTRATO DE RETORNO (status, não só allowed) — a edge mapeia:
--   allowed            -> segue
--   limited            -> 429 + Retry-After
--   unknown_operation  -> 503   (defeito edge↔banco)
--   bad_key            -> 503   (HMAC malformado)
--   policy_error       -> 503   (inconsistência de política)
--   (falha SQL/conexão na chamada) -> 503, decidido na edge (fail-closed)
--
-- AMPLIFICAÇÃO POR CHAVE (resolvida no WIRING, não aqui): as rotas ANÔNIMAS
--   (start, previa_invalida) usam chave por IP (espaço limitado); as rotas de
--   sessão (autosave/submit/consulta) só chamam rate_check DEPOIS de a sessão ser
--   confirmada (token válido). Assim um atacante com tokens aleatórios não cria
--   uma linha por tentativa. A RPC é agnóstica à chave; quem garante o limite do
--   espaço de chaves é a ordem das chamadas (ver pseudofluxo no PR/contrato).
--
-- RETENÇÃO ATIVA (não só "GC disponível"):
--   - varredura GLOBAL amortizada e LIMITADA dentro da RPC, em bloco GUARDADO
--     (falha não impede a autorização; emite WARNING como sinal operacional);
--   - job pg_cron `screener_rate_gc` a cada 15 min (guardado por disponibilidade
--     da extensão; executor = papel do cron/postgres; monitoramento via
--     cron.job_run_details); retenção ≤ 48h.
--   - Janela FIXA pelo relógio do BANCO (permite ~2× o limite no limiar — aceito).
-- =============================================================

-- 1) TABELA (só dados pseudonimizados) + RLS ----------------------------------
create table if not exists public.screener_rate_limit (
  key_hmac     text        not null,
  operation    text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  constraint screener_rate_pk primary key (key_hmac, operation, window_start),
  constraint screener_rate_hmac_hex check (key_hmac ~ '^[0-9a-f]{64}$'),
  constraint screener_rate_count_pos check (count >= 0)
);
create index if not exists screener_rate_window_idx on public.screener_rate_limit (window_start);
-- RLS ligada, SEM policies: nega acesso direto a qualquer papel; o DEFINER roda
-- como dono (screener_owner), que não é sujeito a RLS (não forçada).
alter table public.screener_rate_limit enable row level security;

-- 2) RPC de verificação/incremento (fronteira; contrato com status) ------------
create or replace function public.screener_op_rate_check(p_key_hmac text, p_operation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit int; v_window int; v_start timestamptz; v_count int; v_now timestamptz := now();
begin
  case p_operation
    when 'previa_invalida' then v_limit := 5;   v_window := 600;
    when 'start_preview'   then v_limit := 10;  v_window := 3600;
    when 'autosave'        then v_limit := 120; v_window := 3600;
    when 'submit'          then v_limit := 10;  v_window := 3600;
    when 'consulta'        then v_limit := 60;  v_window := 3600;
    else return jsonb_build_object('status','unknown_operation','remaining',0,'retry_after_seconds',0);
  end case;
  if v_limit is null or v_window is null or v_window <= 0 then
    return jsonb_build_object('status','policy_error','remaining',0,'retry_after_seconds',0);
  end if;
  if p_key_hmac is null or p_key_hmac !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','bad_key','remaining',0,'retry_after_seconds',0);
  end if;

  -- janela fixa pelo relógio do BANCO
  v_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);

  -- incremento atômico; overflow guard via least(...)
  insert into public.screener_rate_limit (key_hmac, operation, window_start, count)
    values (p_key_hmac, p_operation, v_start, 1)
  on conflict (key_hmac, operation, window_start)
    do update set count = least(public.screener_rate_limit.count + 1, 2147483647)
  returning count into v_count;

  -- retenção: varredura global amortizada e LIMITADA; GUARDADA (não bloqueia auth)
  begin
    delete from public.screener_rate_limit
      where ctid in (
        select ctid from public.screener_rate_limit
        where window_start < v_now - interval '48 hours' limit 50);
  exception when others then
    raise warning 'screener_rate_gc_inline_falhou: %', sqlerrm;  -- sinal operacional
  end;

  return jsonb_build_object(
    'status', case when v_count <= v_limit then 'allowed' else 'limited' end,
    'remaining', greatest(v_limit - v_count, 0),
    'retry_after_seconds',
      case when v_count <= v_limit then 0
           else ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int end);
end $$;

-- 3) GC explícito (varredura completa; agendado via pg_cron) -------------------
create or replace function public.screener_rate_gc(p_older_than interval default interval '48 hours')
returns integer language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  delete from public.screener_rate_limit where window_start < now() - p_older_than;
  get diagnostics v = row_count;
  return v;
end $$;

-- 4) PROPRIEDADE + PRIVILÉGIOS ------------------------------------------------
grant screener_owner to current_user;
do $$
begin
  grant create on schema public to screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner; grant create on schema public to screener_owner; reset role;
end $$;

alter table    public.screener_rate_limit owner to screener_owner;
alter function public.screener_op_rate_check(text, text) owner to screener_owner;
alter function public.screener_rate_gc(interval) owner to screener_owner;

-- nenhum acesso direto à tabela (RLS + sem grants); belt-and-suspenders:
revoke all on table public.screener_rate_limit from screener_runtime, service_role, anon, authenticated;
-- rate_check: EXECUTE só para screener_runtime
revoke all on function public.screener_op_rate_check(text, text) from public, anon, authenticated, service_role;
grant execute on function public.screener_op_rate_check(text, text) to screener_runtime;
-- GC: executável pelo dono e pelo EXECUTOR do cron (papel administrativo que agenda);
-- negado a runtime/anon/authenticated/service_role e ao público.
revoke all on function public.screener_rate_gc(interval) from public, anon, authenticated, service_role, screener_runtime;
grant execute on function public.screener_rate_gc(interval) to current_user;  -- executor do pg_cron

do $$
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner; revoke create on schema public from screener_owner; reset role;
end $$;
revoke screener_owner from current_user;

-- 5) AGENDAMENTO REAL (pg_cron) — guardado por disponibilidade da extensão ------
-- Executor: papel do cron (postgres no Supabase). Frequência: a cada 15 min.
-- Monitoramento: cron.job / cron.job_run_details. Idempotente (upsert por nome).
-- Em ambientes sem pg_cron (ex.: pglite dos testes), este bloco é ignorado e a
-- retenção fica pela varredura amortizada inline + chamada manual de GC.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('screener_rate_gc', '*/15 * * * *', 'select public.screener_rate_gc()');
  else
    raise notice 'pg_cron indisponível: agendar screener_rate_gc por outro mecanismo antes de public_pilot';
  end if;
exception when others then
  raise notice 'pg_cron não agendado (%.): agendar antes de public_pilot', sqlerrm;
end $$;
