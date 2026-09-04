-- =============================================================
-- SCREENER — rate limiting (Opção B: Postgres via RPC SECURITY DEFINER)
--
-- ⚠️ NÃO APLICADA. Escrita e testada localmente (pglite) para revisão.
--
-- Correções incorporadas (retorno de 04/09/2026):
--  - RPC PRÓPRIA, separada das 6 operações: o incremento não pode ser revertido
--    junto com a transação de uma operação que levante por token/credencial
--    inválida (senão tentativas inválidas deixariam de contar).
--  - A edge envia SÓ o HMAC opaco (SCREENER_RATE_KEY_SECRET); o banco NUNCA
--    recebe IP, token, token_hash ou user-agent. Guarda só HMAC/operação/janela/
--    contador.
--  - fail-closed: a RPC nunca levanta por "limite excedido" (retorna allowed=
--    false); a edge decide 429 (excedido) / 503 (limiter indisponível).
--  - Limites canônicos NA RPC (não manipuláveis pelo chamador). Janela fixa
--    (permite ~2× o limite na transição entre janelas — aceito e documentado).
--  - Retenção ≤ 48h: limpeza oportunista por chave na RPC + GC explícito
--    (screener_rate_gc), a agendar via pg_cron. Índice por window_start.
--  - screener_owner dono; EXECUTE da RPC só para screener_runtime; sem acesso
--    direto à tabela para ninguém além do dono.
-- =============================================================

-- 1) TABELA (só dados pseudonimizados) ----------------------------------------
create table if not exists public.screener_rate_limit (
  key_hmac     text        not null,   -- HMAC-SHA256 hex (nunca IP/token em claro)
  operation    text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  constraint screener_rate_pk primary key (key_hmac, operation, window_start),
  constraint screener_rate_hmac_hex check (key_hmac ~ '^[0-9a-f]{64}$'),
  constraint screener_rate_count_pos check (count >= 0)
);
create index if not exists screener_rate_window_idx on public.screener_rate_limit (window_start);

-- 2) RPC de verificação/incremento (fronteira) --------------------------------
-- Recebe SÓ o HMAC + a operação. Incrementa atomicamente e devolve o veredito.
-- NUNCA levanta por limite excedido. Limites canônicos internos (fail-closed em
-- operação desconhecida ou chave malformada). search_path vazio, sem SQL dinâmica.
create or replace function public.screener_op_rate_check(p_key_hmac text, p_operation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit int; v_window int;  -- segundos
  v_start timestamptz; v_count int; v_now timestamptz := now();
begin
  case p_operation
    when 'previa_invalida' then v_limit := 5;   v_window := 600;
    when 'start_preview'   then v_limit := 10;  v_window := 3600;
    when 'autosave'        then v_limit := 120; v_window := 3600;
    when 'submit'          then v_limit := 10;  v_window := 3600;
    when 'consulta'        then v_limit := 60;  v_window := 3600;
    else return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after_seconds', 3600); -- fail-closed
  end case;
  if p_key_hmac is null or p_key_hmac !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after_seconds', v_window); -- fail-closed
  end if;

  v_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);

  insert into public.screener_rate_limit (key_hmac, operation, window_start, count)
    values (p_key_hmac, p_operation, v_start, 1)
  on conflict (key_hmac, operation, window_start) do update set count = public.screener_rate_limit.count + 1
  returning count into v_count;

  -- limpeza oportunista (bounded growth mesmo sem GC agendado)
  delete from public.screener_rate_limit
    where key_hmac = p_key_hmac and operation = p_operation and window_start < v_now - interval '48 hours';

  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'remaining', greatest(v_limit - v_count, 0),
    'retry_after_seconds',
      case when v_count <= v_limit then 0
           else ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int end
  );
end $$;

-- 3) GC explícito (agendar via pg_cron; roda como papel privilegiado) ----------
create or replace function public.screener_rate_gc(p_older_than interval default interval '48 hours')
returns integer language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  delete from public.screener_rate_limit where window_start < now() - p_older_than;
  get diagnostics v = row_count;
  return v;
end $$;

-- 4) PROPRIEDADE + PRIVILÉGIOS ------------------------------------------------
-- screener_owner precisa de CREATE transitório em public para ser dono (mesmo
-- padrão da migration de papéis). Depois revoga.
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

-- runtime e papéis amplos: NENHUM acesso direto à tabela
revoke all on table public.screener_rate_limit from screener_runtime, service_role, anon, authenticated;
-- RPC de rate check: EXECUTE só para screener_runtime
revoke all on function public.screener_op_rate_check(text, text) from public, anon, authenticated, service_role;
grant execute on function public.screener_op_rate_check(text, text) to screener_runtime;
-- GC: administrativo — ninguém além do dono (pg_cron roda como papel privilegiado)
revoke all on function public.screener_rate_gc(interval) from public, anon, authenticated, service_role, screener_runtime;

do $$
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner; revoke create on schema public from screener_owner; reset role;
end $$;
revoke screener_owner from current_user;
