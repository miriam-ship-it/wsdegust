-- =============================================================
-- SCREENER — rate limiting (Opção B: Postgres via RPC SECURITY DEFINER)
--
-- ⚠️ NÃO APLICADA. Escrita e testada localmente (pglite, exceto o bloco pg_cron).
--
-- CONTRATO (status): allowed→segue · limited→429+Retry-After ·
--   unknown_operation/bad_key/policy_error→503 · falha SQL/conexão→503 (edge).
--
-- previa_invalida é ATÔMICA em screener_op_preview_authorize: consulta o bucket
--   ANTES de testar a credencial (a 6ª tentativa é bloqueada mesmo se a credencial
--   for correta), incrementa só quando inválida, não lança (o incremento persiste),
--   e a chave é por IP SEM slug (o slug é do cliente → não pode indexar o bucket).
--   Após validar, usa-se binding_id (do banco) — nunca o slug bruto.
-- screener_op_rate_check (genérica) cobre start_preview/autosave/submit/consulta.
--
-- RETENÇÃO ≤ 48h ATIVA: varredura global amortizada e LIMITADA (50, order+skip
--   locked) dentro de rate_check, em bloco GUARDADO (falha não bloqueia auth, só
--   emite WARNING) + job pg_cron OBRIGATÓRIO (a migration FALHA se não agendar).
--   Janela FIXA pelo relógio do BANCO. Rotacionar SCREENER_RATE_KEY_SECRET muda
--   todas as chaves HMAC → REINICIA efetivamente todos os buckets.
--
-- DDL sem tolerância a drift: sem IF NOT EXISTS na tabela; CREATE FUNCTION (não
--   OR REPLACE); reaplicação é impedida pelo ledger de migrations.
-- =============================================================

-- 1) TABELA (só dados pseudonimizados) + RLS ----------------------------------
create table public.screener_rate_limit (
  key_hmac     text        not null,
  operation    text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  constraint screener_rate_pk primary key (key_hmac, operation, window_start),
  constraint screener_rate_hmac_hex check (key_hmac ~ '^[0-9a-f]{64}$'),
  constraint screener_rate_count_pos check (count >= 0),
  constraint screener_rate_op check (operation in ('previa_invalida','start_preview','autosave','submit','consulta'))
);
create index screener_rate_window_idx on public.screener_rate_limit (window_start);
alter table public.screener_rate_limit enable row level security;  -- sem policies: nega acesso direto

-- 2) previa_invalida ATÔMICA: consulta bucket → valida credencial → incrementa só se inválida
create function public.screener_op_preview_authorize(p_ip_hmac text, p_event_slug text, p_preview_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := 5; v_window int := 600; v_start timestamptz; v_count int; v_now timestamptz := now();
  v_bind public.screener_event_bindings%rowtype;
begin
  if p_ip_hmac is null or p_ip_hmac !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','bad_key');  -- edge → 503
  end if;
  v_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);

  -- (1) CONSULTA o bucket ANTES de testar a credencial
  select count into v_count from public.screener_rate_limit
    where key_hmac = p_ip_hmac and operation = 'previa_invalida' and window_start = v_start;
  if coalesce(v_count, 0) >= v_limit then  -- (2) já bloqueado → nem testa a credencial
    return jsonb_build_object('status','limited',
      'retry_after_seconds', ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int);
  end if;

  -- (3) valida vínculo + credencial de prévia
  select * into v_bind from public.screener_event_bindings where event_slug = p_event_slug and is_current;
  if found and (v_bind.status <> 'internal_preview'
       or public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash)) then
    -- (6) VÁLIDA (ou vínculo não-preview) → NÃO incrementa; devolve o vínculo
    return jsonb_build_object('status','authorized','binding', jsonb_build_object(
      'id', v_bind.id, 'event_slug', v_bind.event_slug, 'status', v_bind.status,
      'starts_at', v_bind.starts_at, 'ends_at', v_bind.ends_at, 'branding', v_bind.branding,
      'instrument_code', v_bind.instrument_code, 'instrument_version', v_bind.instrument_version));
  end if;

  -- (4)(5) INVÁLIDA → incrementa (saturado, sem lançar → persiste)
  insert into public.screener_rate_limit (key_hmac, operation, window_start, count)
    values (p_ip_hmac, 'previa_invalida', v_start, 1)
  on conflict (key_hmac, operation, window_start)
    do update set count = case when public.screener_rate_limit.count >= 2147483647
                               then 2147483647 else public.screener_rate_limit.count + 1 end
  returning count into v_count;
  return jsonb_build_object(
    'status', case when v_count > v_limit then 'limited' else 'invalid' end,
    'retry_after_seconds', case when v_count > v_limit
      then ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int else 0 end);
end $$;

-- 3) RPC genérica (start_preview/autosave/submit/consulta) ---------------------
create function public.screener_op_rate_check(p_key_hmac text, p_operation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit int; v_window int; v_start timestamptz; v_count int; v_now timestamptz := now();
begin
  case p_operation
    when 'start_preview' then v_limit := 10;  v_window := 3600;
    when 'autosave'      then v_limit := 120; v_window := 3600;
    when 'submit'        then v_limit := 10;  v_window := 3600;
    when 'consulta'      then v_limit := 60;  v_window := 3600;
    else return jsonb_build_object('status','unknown_operation','remaining',0,'retry_after_seconds',0);
  end case;
  if v_limit is null or v_window is null or v_window <= 0 then
    return jsonb_build_object('status','policy_error','remaining',0,'retry_after_seconds',0);
  end if;
  if p_key_hmac is null or p_key_hmac !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','bad_key','remaining',0,'retry_after_seconds',0);
  end if;

  v_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);

  insert into public.screener_rate_limit (key_hmac, operation, window_start, count)
    values (p_key_hmac, p_operation, v_start, 1)
  on conflict (key_hmac, operation, window_start)
    do update set count = case when public.screener_rate_limit.count >= 2147483647
                               then 2147483647 else public.screener_rate_limit.count + 1 end
  returning count into v_count;

  begin  -- retenção amortizada; ordem + skip locked; guardada (não bloqueia auth)
    delete from public.screener_rate_limit where ctid in (
      select ctid from public.screener_rate_limit
      where window_start < v_now - interval '48 hours'
      order by window_start limit 50 for update skip locked);
  exception when others then
    raise warning 'screener_rate_gc_inline_falhou: %', sqlerrm;
  end;

  return jsonb_build_object(
    'status', case when v_count <= v_limit then 'allowed' else 'limited' end,
    'remaining', greatest(v_limit - v_count, 0),
    'retry_after_seconds',
      case when v_count <= v_limit then 0
           else ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int end);
end $$;

-- 4) GC explícito (retenção fixa 48h; sem parâmetro livre) ---------------------
create function public.screener_rate_gc()
returns integer language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  delete from public.screener_rate_limit where window_start < now() - interval '48 hours';
  get diagnostics v = row_count; return v;
end $$;

-- 5) PROPRIEDADE + PRIVILÉGIOS ------------------------------------------------
grant screener_owner to current_user;
do $$
begin grant create on schema public to screener_owner;
exception when insufficient_privilege then set local role pg_database_owner; grant create on schema public to screener_owner; reset role; end $$;

alter table    public.screener_rate_limit owner to screener_owner;
alter function public.screener_op_preview_authorize(text, text, text) owner to screener_owner;
alter function public.screener_op_rate_check(text, text) owner to screener_owner;
alter function public.screener_rate_gc() owner to screener_owner;

revoke all on table public.screener_rate_limit from public, anon, authenticated, service_role, screener_runtime;
revoke all on function public.screener_op_preview_authorize(text, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.screener_op_preview_authorize(text, text, text) to screener_runtime;
revoke all on function public.screener_op_rate_check(text, text) from public, anon, authenticated, service_role;
grant  execute on function public.screener_op_rate_check(text, text) to screener_runtime;
revoke all on function public.screener_rate_gc() from public, anon, authenticated, service_role, screener_runtime;
grant  execute on function public.screener_rate_gc() to current_user;  -- executor do pg_cron

do $$
begin revoke create on schema public from screener_owner;
exception when insufficient_privilege then set local role pg_database_owner; revoke create on schema public from screener_owner; reset role; end $$;
revoke screener_owner from current_user;

-- @@@CRON@@@  (bloco obrigatório; ignorado só nos testes pglite, sem pg_cron)
-- 6) AGENDAMENTO OBRIGATÓRIO — a migration FALHA se pg_cron não puder ser ativado
--    ou agendado. Habilitar pg_cron é ALTERAÇÃO GLOBAL do projeto (aparece no
--    dry-run e deve constar da autorização). Executor: papel do cron (postgres).
--    Verificar: cron.job (1 linha) e cron.job_run_details (execuções).
do $$
declare v_jobs int;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise exception 'pg_cron indisponivel: retencao de 48h nao pode ser garantida — abortando';
  end if;
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'screener_rate_gc';  -- garante exatamente 1
  perform cron.schedule('screener_rate_gc', '*/15 * * * *', 'select public.screener_rate_gc()');
  select count(*) into v_jobs from cron.job where jobname = 'screener_rate_gc';
  if v_jobs <> 1 then raise exception 'esperado exatamente 1 job screener_rate_gc, ha %', v_jobs; end if;
end $$;
