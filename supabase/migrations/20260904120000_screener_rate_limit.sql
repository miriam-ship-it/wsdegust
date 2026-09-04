-- =============================================================
-- SCREENER — rate limiting (Opção B: Postgres via RPC SECURITY DEFINER) — v3
--
-- ⚠️ NÃO APLICADA. Testada em pglite (exceto o bloco pg_cron, só no branch real).
--
-- CONTRATO (status): authorized→segue · limited→429 · invalid→404 uniforme ·
--   bad_key/unknown_operation/policy_error→503 · falha SQL/conexão→503 (edge).
--
-- previa_invalida ATÔMICA e SERIALIZADA (screener_op_preview_authorize):
--   (a) localiza o vínculo pelo slug SEM validar credencial;
--   (b) se existe e NÃO é internal_preview → devolve o vínculo p/ a matriz normal,
--       SEM tocar o bucket (evento público não é bloqueado por falhas anteriores);
--   (c) se é internal_preview OU inexistente → bucket GLOBAL por IP (sem slug),
--       com `insert 0 on conflict do nothing` + `select ... FOR UPDATE` (serializa
--       chamadas concorrentes na MESMA janela);
--   (d) já bloqueado (count>=5) → limited ANTES de testar a credencial;
--   (e) credencial válida → authorized SEM incrementar; inválida/inexistente →
--       incrementa (saturado) e mantém o lock até o commit. Nunca lança.
--   Resposta externa igual p/ slug inexistente e credencial inválida.
-- screener_op_rate_check (genérica): start_preview/autosave/submit/consulta.
--
-- RETENÇÃO ≤ 48h ATIVA: varredura inline amortizada (50; order+skip locked; bloco
--   guardado que NÃO reverte o consumo do bucket) + job pg_cron OBRIGATÓRIO
--   (a migration FALHA se pg_cron não ativar/agendar). Janela fixa pelo relógio do
--   BANCO. Rotacionar SCREENER_RATE_KEY_SECRET muda as chaves HMAC → REINICIA os
--   buckets. Habilitar pg_cron é ALTERAÇÃO GLOBAL do projeto (consta no dry-run).
--
-- BYPASS declarado (rollout): a produção tem screener_op_get_binding executável
--   por screener_runtime — valida a credencial, mas SEM o gate de rate limit.
--   Esta migration NÃO o revoga (a edge ainda o usa até o wiring). Ordem: (1) esta
--   migration adiciona preview_authorize; (2) a edge passa a usá-lo; (3) migration
--   POSTERIOR revoga get_binding. DURANTE ESSE INTERVALO o rate limiting de prévia
--   NÃO é fronteira integral. preview_authorize já devolve o contrato completo do
--   vínculo para que o get_binding possa ser removido sem perda.
--
-- DDL sem tolerância a drift: sem IF NOT EXISTS na tabela; CREATE FUNCTION; o
--   ledger de migrations impede reaplicação.
-- =============================================================

-- 1) TABELA + RLS -------------------------------------------------------------
create table public.screener_rate_limit (
  key_hmac text not null, operation text not null, window_start timestamptz not null, count integer not null default 0,
  constraint screener_rate_pk primary key (key_hmac, operation, window_start),
  constraint screener_rate_hmac_hex check (key_hmac ~ '^[0-9a-f]{64}$'),
  constraint screener_rate_count_pos check (count >= 0),
  constraint screener_rate_op check (operation in ('previa_invalida','start_preview','autosave','submit','consulta'))
);
create index screener_rate_window_idx on public.screener_rate_limit (window_start);
alter table public.screener_rate_limit enable row level security;  -- sem policies: nega acesso direto

-- 2) previa_invalida ATÔMICA + SERIALIZADA ------------------------------------
create function public.screener_op_preview_authorize(p_ip_hmac text, p_event_slug text, p_preview_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_limit int := 5; v_window int := 600; v_start timestamptz; v_count int; v_now timestamptz := now();
        v_bind public.screener_event_bindings%rowtype; v_bj jsonb;
begin
  if p_ip_hmac is null or p_ip_hmac !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','bad_key'); end if;

  -- (a) localiza o vínculo SEM validar credencial
  select * into v_bind from public.screener_event_bindings where event_slug = p_event_slug and is_current;
  if found then
    v_bj := jsonb_build_object('id',v_bind.id,'event_slug',v_bind.event_slug,'status',v_bind.status,
      'starts_at',v_bind.starts_at,'ends_at',v_bind.ends_at,'branding',v_bind.branding,
      'instrument_code',v_bind.instrument_code,'instrument_version',v_bind.instrument_version,
      'result_mode',v_bind.result_mode,'lead_capture_mode',v_bind.lead_capture_mode,
      'session_retention_days',v_bind.session_retention_days,'lead_retention_days',v_bind.lead_retention_days);
    -- (b) vínculo público (não-preview): matriz normal; NÃO toca o bucket de prévia
    if v_bind.status <> 'internal_preview' then
      return jsonb_build_object('status','authorized','binding', v_bj);
    end if;
  end if;

  -- (c) internal_preview OU inexistente: bucket GLOBAL por IP, com LOCK
  v_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);
  insert into public.screener_rate_limit (key_hmac, operation, window_start, count)
    values (p_ip_hmac, 'previa_invalida', v_start, 0)
  on conflict (key_hmac, operation, window_start) do nothing;
  select count into v_count from public.screener_rate_limit
    where key_hmac = p_ip_hmac and operation = 'previa_invalida' and window_start = v_start
    for update;                                       -- serializa concorrentes na janela

  if v_count >= v_limit then                          -- (d) já bloqueado → nem testa credencial
    return jsonb_build_object('status','limited',
      'retry_after_seconds', ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int);
  end if;

  -- (e) credencial válida (só internal_preview existente chega aqui) → authorized SEM incrementar
  if found and public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return jsonb_build_object('status','authorized','binding', v_bj);
  end if;

  -- (e') inexistente OU credencial inválida → incrementa (saturado); lock até o commit
  update public.screener_rate_limit
    set count = case when count >= 2147483647 then 2147483647 else count + 1 end
    where key_hmac = p_ip_hmac and operation = 'previa_invalida' and window_start = v_start
  returning count into v_count;
  return jsonb_build_object(
    'status', case when v_count > v_limit then 'limited' else 'invalid' end,
    'retry_after_seconds', case when v_count > v_limit
      then ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int else 0 end);
end $$;

-- 3) RPC genérica (start_preview/autosave/submit/consulta) ---------------------
create function public.screener_op_rate_check(p_key_hmac text, p_operation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_limit int; v_window int; v_start timestamptz; v_count int; v_now timestamptz := now();
begin
  case p_operation
    when 'start_preview' then v_limit:=10; v_window:=3600; when 'autosave' then v_limit:=120; v_window:=3600;
    when 'submit' then v_limit:=10; v_window:=3600; when 'consulta' then v_limit:=60; v_window:=3600;
    else return jsonb_build_object('status','unknown_operation','remaining',0,'retry_after_seconds',0); end case;
  if v_limit is null or v_window is null or v_window <= 0 then return jsonb_build_object('status','policy_error','remaining',0,'retry_after_seconds',0); end if;
  if p_key_hmac is null or p_key_hmac !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','bad_key','remaining',0,'retry_after_seconds',0); end if;
  v_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);
  insert into public.screener_rate_limit (key_hmac, operation, window_start, count) values (p_key_hmac, p_operation, v_start, 1)
  on conflict (key_hmac, operation, window_start)
    do update set count = case when public.screener_rate_limit.count >= 2147483647 then 2147483647 else public.screener_rate_limit.count + 1 end
  returning count into v_count;
  begin  -- retenção amortizada; ordem + skip locked; guardada (não reverte o consumo do bucket)
    delete from public.screener_rate_limit where ctid in (
      select ctid from public.screener_rate_limit where window_start < v_now - interval '48 hours'
      order by window_start limit 50 for update skip locked);
  exception when others then raise warning 'screener_rate_gc_inline_falhou: %', sqlerrm; end;
  return jsonb_build_object('status', case when v_count <= v_limit then 'allowed' else 'limited' end,
    'remaining', greatest(v_limit - v_count, 0),
    'retry_after_seconds', case when v_count <= v_limit then 0 else ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int end);
end $$;

-- 4) GC fixo (48h, sem parâmetro) ---------------------------------------------
create function public.screener_rate_gc()
returns integer language plpgsql security definer set search_path = '' as $$
declare v int;
begin delete from public.screener_rate_limit where window_start < now() - interval '48 hours';
  get diagnostics v = row_count; return v; end $$;

-- 5) PROPRIEDADE + PRIVILÉGIOS ------------------------------------------------
grant screener_owner to current_user;
do $$ begin grant create on schema public to screener_owner;
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
-- higiene: a trigger de imutabilidade não deve ser executável por ninguém (não é bypass — é trigger)
revoke all on function public.screener_snapshot_impede_update() from public, anon, authenticated, service_role, screener_runtime;

do $$ begin revoke create on schema public from screener_owner;
exception when insufficient_privilege then set local role pg_database_owner; revoke create on schema public from screener_owner; reset role; end $$;
revoke screener_owner from current_user;

-- @@@CRON@@@  (obrigatório; ignorado só nos testes pglite)
-- 6) AGENDAMENTO OBRIGATÓRIO — nome VERSIONADO; sem unschedule destrutivo;
--    FALHA se pg_cron indisponível, se já existir job homônimo, ou se a validação
--    do job cadastrado não bater. Executor = username do job (papel do cron).
do $$
declare v_jobid bigint; v_job record;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise exception 'pg_cron indisponivel: retencao de 48h nao pode ser garantida — abortando'; end if;
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'boomit_screener_rate_gc_v1') then
    raise exception 'job boomit_screener_rate_gc_v1 ja existe — migration inedita nao deve encontra-lo'; end if;
  v_jobid := cron.schedule('boomit_screener_rate_gc_v1', '*/15 * * * *', 'select public.screener_rate_gc()');
  select * into v_job from cron.job where jobid = v_jobid;
  if v_job.jobname <> 'boomit_screener_rate_gc_v1'
     or v_job.schedule <> '*/15 * * * *'
     or v_job.command <> 'select public.screener_rate_gc()'
     or v_job.active is not true
     or v_job.username is null then
    raise exception 'job cadastrado invalido: %', row_to_json(v_job); end if;
end $$;
