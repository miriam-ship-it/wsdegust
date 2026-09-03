-- =============================================================
-- SCREENER — fronteira de segurança: papéis + RPC SECURITY DEFINER
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Escrita e testada localmente (pglite) para revisão;
--    a validação do modelo final de privilégios é num segundo branch efêmero.
--
-- MODELO (decidido no retorno de 03/09/2026):
--   A edge pública NÃO conecta como `postgres` amplo. Toda a fronteira é:
--   - `screener_owner`  : NOLOGIN, dono só dos objetos screener_*. É o contexto
--                         em que as funções SECURITY DEFINER rodam (privilégio
--                         mínimo — não é `postgres`, não vê tabelas legadas).
--   - `screener_runtime`: LOGIN, NOINHERIT, sem BYPASSRLS. É o papel embutido na
--                         SUPABASE_DB_POOLER_URL da edge. Recebe SÓ `USAGE` no
--                         schema e `EXECUTE` nas 6 funções — NENHUMA permissão
--                         direta de tabela. Senha definida FORA da migration
--                         (secret), nunca aqui.
--   - As SEIS operações da edge passam por funções SECURITY DEFINER; nenhuma
--     consulta direta a tabela pela edge. `GRANT EXECUTE` só a screener_runtime;
--     revogado de public/anon/authenticated/service_role.
--
-- Todas as funções: `search_path = ''` (vazio), objetos public.* totalmente
-- qualificados, sem SQL dinâmica. Built-ins resolvem de pg_catalog (implícito,
-- não-shadowável com search_path vazio).
-- =============================================================

-- 1) PAPÉIS ----------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'screener_owner') then
    create role screener_owner nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'screener_runtime') then
    -- LOGIN sem senha: a senha é definida fora da migration (secret) via
    -- `alter role screener_runtime password '...'` num canal seguro.
    create role screener_runtime login noinherit;
  end if;
end $$;

-- current_user precisa ser membro de screener_owner para reatribuir propriedade.
do $$ begin execute format('grant screener_owner to %I', current_user); end $$;

-- 2) PROPRIEDADE dos objetos screener_* -> screener_owner ------
alter table public.screener_instrument_versions owner to screener_owner;
alter table public.screener_event_bindings      owner to screener_owner;
alter table public.screener_sessions            owner to screener_owner;
alter table public.screener_responses           owner to screener_owner;
alter table public.screener_result_snapshots    owner to screener_owner;
alter table public.screener_leads               owner to screener_owner;
-- sequências associadas (ex.: screener_responses.id) -> mesmo dono
do $$
declare seqname text;
begin
  for seqname in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'screener\_%'
  loop
    execute format('alter sequence public.%I owner to screener_owner', seqname);
  end loop;
end $$;

-- 3) screener_runtime: só USAGE no schema; NENHUMA permissão de tabela ---------
grant usage on schema public to screener_runtime;
-- (garantia defensiva: nada de tabela/sequência mesmo que algum default conceda)
revoke all on all tables in schema public from screener_runtime;
revoke all on all sequences in schema public from screener_runtime;

-- 4) FUNÇÕES SECURITY DEFINER (as 6 operações) --------------------------------
-- Cada uma revalida estado/vigência sob trava; a edge mantém projeção, cálculo,
-- checagem de credencial/consentimento e mapeamento de ids opacos.

-- (a) obter apresentação: vínculo corrente por slug (para capacidade/credencial/projeção).
create or replace function public.screener_op_get_binding(p_event_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  select to_jsonb(b) into v from (
    select id, event_slug, status, starts_at, ends_at, branding, instrument_code, instrument_version
    from public.screener_event_bindings
    where event_slug = p_event_slug and is_current
  ) b;
  return v;  -- null se não houver vínculo corrente
end $$;

-- (b) iniciar sessão: revalida vínculo e insere a sessão (token só como hash).
create or replace function public.screener_op_start(
  p_event_slug text, p_token_hash text, p_notice_version text,
  p_acknowledged_at timestamptz, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bind public.screener_event_bindings%rowtype; v_id uuid;
begin
  select * into v_bind from public.screener_event_bindings
    where event_slug = p_event_slug and is_current;
  if not found then raise exception 'vinculo_inexistente'; end if;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
  insert into public.screener_sessions
    (binding_id, token_hash, status, privacy_notice_version, privacy_acknowledged_at, expires_at)
    values (v_bind.id, p_token_hash, 'open', p_notice_version, p_acknowledged_at, p_expires_at)
    returning id into v_id;
  return jsonb_build_object('session_id', v_id);
end $$;

-- (c) retomar sessão: estado da sessão + vínculo + respostas (por hash do token).
create or replace function public.screener_op_resume(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'status', s.status, 'expires_at', s.expires_at,
      'revoked_at', s.revoked_at, 'submitted_at', s.submitted_at),
    'binding', jsonb_build_object('event_slug', b.event_slug, 'status', b.status,
      'starts_at', b.starts_at, 'ends_at', b.ends_at, 'branding', b.branding,
      'instrument_code', b.instrument_code, 'instrument_version', b.instrument_version),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object('item_code', r.item_code, 'stage_code', r.stage_code))
      from public.screener_responses r where r.session_id = s.id), '[]'::jsonb)
  ) into v
  from public.screener_sessions s
  join public.screener_event_bindings b on b.id = s.binding_id
  where s.token_hash = p_token_hash;
  return v;  -- null se o token não corresponde a sessão alguma
end $$;

-- (d) salvar resposta: trava a sessão, revalida e faz o upsert. Retorna o total.
create or replace function public.screener_op_save_response(
  p_token_hash text, p_item_code text, p_stage_code text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype; v_n integer;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
  insert into public.screener_responses (session_id, item_code, stage_code, answered_at)
    values (v_sess.id, p_item_code, p_stage_code, now())
  on conflict (session_id, item_code) do update set stage_code = excluded.stage_code, revised_at = now();
  select count(*) into v_n from public.screener_responses where session_id = v_sess.id;
  return jsonb_build_object('answered', v_n);
end $$;

-- (e) finalizar submissão: trava, idempotente, confere canônico, grava snapshot,
--     fecha a sessão. Devolve o snapshot (a edge sanitiza em PublicResultV1).
create or replace function public.screener_op_finalize(
  p_token_hash text, p_expected_canonical text, p_result jsonb,
  p_instrument_checksum text, p_input_checksum text, p_scoring_version text, p_report_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_canonical text; v_result jsonb;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  if v_sess.status = 'submitted' then
    select result into v_result from public.screener_result_snapshots
      where session_id = v_sess.id order by created_at desc limit 1;
    return jsonb_build_object('status','ja_submetida','result', v_result);
  end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
  -- respostas não podem ter mudado entre o cálculo (edge) e a finalização.
  -- collate "C" p/ casar byte-a-byte com o sort de code-unit do JS (sem colação).
  select string_agg(item_code || ':' || stage_code, '|' order by item_code collate "C")
    into v_canonical from public.screener_responses where session_id = v_sess.id;
  if v_canonical is distinct from p_expected_canonical then raise exception 'respostas_mudaram'; end if;
  insert into public.screener_result_snapshots
    (session_id, event_slug, instrument_code, instrument_version, scoring_version, report_version,
     instrument_checksum, input_checksum, result)
    values (v_sess.id, v_bind.event_slug, v_bind.instrument_code, v_bind.instrument_version,
            p_scoring_version, p_report_version, p_instrument_checksum, p_input_checksum, p_result)
  on conflict (session_id, instrument_checksum, input_checksum, scoring_version, report_version) do nothing;
  update public.screener_sessions set status = 'submitted', submitted_at = now()
    where id = v_sess.id and status = 'open';
  select result into v_result from public.screener_result_snapshots
    where session_id = v_sess.id order by created_at desc limit 1;
  return jsonb_build_object('status','finalizada','result', v_result);
end $$;

-- (f) obter resultado: snapshot + estado (para a edge decidir leitura).
create or replace function public.screener_op_get_result(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'session', jsonb_build_object('status', s.status, 'expires_at', s.expires_at, 'revoked_at', s.revoked_at),
    'binding', jsonb_build_object('event_slug', b.event_slug, 'status', b.status,
      'starts_at', b.starts_at, 'ends_at', b.ends_at, 'branding', b.branding),
    'result', (select r.result from public.screener_result_snapshots r
               where r.session_id = s.id order by r.created_at desc limit 1)
  ) into v
  from public.screener_sessions s
  join public.screener_event_bindings b on b.id = s.binding_id
  where s.token_hash = p_token_hash;
  return v;
end $$;

-- 5) DONO + PRIVILÉGIOS das funções -------------------------------------------
-- Dono = screener_owner (para o DEFINER rodar com privilégio mínimo, não postgres).
-- EXECUTE só a screener_runtime; revogado de todos os demais.
do $$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'screener\_op\_%'
  loop
    execute format('alter function %s owner to screener_owner', fn);
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon, authenticated, service_role', fn);
    execute format('grant execute on function %s to screener_runtime', fn);
  end loop;
end $$;
