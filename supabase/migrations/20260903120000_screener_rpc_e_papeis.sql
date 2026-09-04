-- =============================================================
-- SCREENER — fronteira de segurança: papéis + RPC SECURITY DEFINER
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Escrita e testada localmente (pglite) para revisão;
--    a validação do modelo final de privilégios é num segundo branch efêmero,
--    onde a edge conecta EFETIVAMENTE como screener_runtime (senha temporária).
--
-- MODELO (retorno de 03-04/09/2026): a edge pública NÃO conecta como `postgres`
-- amplo e NÃO faz SQL direto. As FUNÇÕES são a fronteira e verificam elas mesmas
-- vínculo/status/vigência, token/expiração/revogação, sessão aberta, credencial
-- de prévia, pertencimento ao instrumento, checksum na finalização, idempotência
-- e trava concorrente. A edge mantém geração/hash do token, projeção, cálculo,
-- mapeamento de ids opacos e uma checagem de credencial redundante (defesa em
-- profundidade).
--
--   - screener_owner   : NOLOGIN + todos os bloqueios; dono só dos objetos
--                        screener_*; contexto (mínimo) dos SECURITY DEFINER.
--   - screener_runtime : LOGIN + todos os bloqueios; papel da
--                        SUPABASE_DB_POOLER_URL; só USAGE no schema + EXECUTE nas
--                        6 funções screener_op_*; NENHUM privilégio de tabela,
--                        sequence ou objeto legado. Senha SÓ fora da migration.
-- =============================================================

-- 1) PAPÉIS (atributos explícitos; senha nunca aqui) --------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'screener_owner') then
    create role screener_owner nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'screener_runtime') then
    create role screener_runtime login;
  end if;
  -- enforce (idempotente) — sem SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS/INHERIT
  alter role screener_owner   nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  alter role screener_runtime  login  noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  -- current_user precisa ser membro de screener_owner para reatribuir propriedade
  execute format('grant screener_owner to %I', current_user);
end $$;

-- 2) HELPER de credencial de prévia (privado; não concedido ao runtime) --------
-- Confere sha256(chave crua) == hash no vínculo + não revogada + não expirada.
create or replace function public.screener_priv_previa_ok(p_branding jsonb, p_preview_key text)
returns boolean language sql
security definer set search_path = '' as $$
  select p_preview_key is not null
     and (p_branding ? 'preview_credential_sha256')
     and encode(sha256(convert_to(p_preview_key, 'UTF8')), 'hex') = (p_branding ->> 'preview_credential_sha256')
     and (p_branding ->> 'preview_revoked_at') is null
     and (p_branding ->> 'preview_expires_at' is null
          or (p_branding ->> 'preview_expires_at')::timestamptz > now());
$$;

-- 3) AS 6 OPERAÇÕES (SECURITY DEFINER, search_path vazio, sem SQL dinâmica) -----

-- (a) obter apresentação. internal_preview sem credencial → null (não existe).
create or replace function public.screener_op_get_binding(p_event_slug text, p_preview_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.screener_event_bindings%rowtype;
begin
  select * into v from public.screener_event_bindings where event_slug = p_event_slug and is_current;
  if not found then return null; end if;
  if v.status = 'internal_preview' and not public.screener_priv_previa_ok(v.branding, p_preview_key) then
    return null;
  end if;
  return jsonb_build_object('id', v.id, 'event_slug', v.event_slug, 'status', v.status,
    'starts_at', v.starts_at, 'ends_at', v.ends_at, 'branding', v.branding,
    'instrument_code', v.instrument_code, 'instrument_version', v.instrument_version);
end $$;

-- (b) iniciar sessão. Revalida vínculo, vigência e credencial de prévia.
create or replace function public.screener_op_start(
  p_event_slug text, p_token_hash text, p_notice_version text,
  p_acknowledged_at timestamptz, p_expires_at timestamptz, p_preview_key text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bind public.screener_event_bindings%rowtype; v_id uuid;
begin
  select * into v_bind from public.screener_event_bindings where event_slug = p_event_slug and is_current;
  if not found then raise exception 'vinculo_inexistente'; end if;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.branding, p_preview_key) then
    raise exception 'previa_nao_autorizada';
  end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
  insert into public.screener_sessions
    (binding_id, token_hash, status, privacy_notice_version, privacy_acknowledged_at, expires_at)
    values (v_bind.id, p_token_hash, 'open', p_notice_version, p_acknowledged_at, p_expires_at)
    returning id into v_id;
  return jsonb_build_object('session_id', v_id);
end $$;

-- (c) retomar sessão. internal_preview sem credencial → null.
create or replace function public.screener_op_resume(p_token_hash text, p_preview_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.branding, p_preview_key) then
    return null;
  end if;
  return jsonb_build_object(
    'session', jsonb_build_object('id', v_sess.id, 'status', v_sess.status, 'expires_at', v_sess.expires_at,
      'revoked_at', v_sess.revoked_at, 'submitted_at', v_sess.submitted_at),
    'binding', jsonb_build_object('event_slug', v_bind.event_slug, 'status', v_bind.status,
      'starts_at', v_bind.starts_at, 'ends_at', v_bind.ends_at, 'branding', v_bind.branding,
      'instrument_code', v_bind.instrument_code, 'instrument_version', v_bind.instrument_version),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object('item_code', r.item_code, 'stage_code', r.stage_code))
      from public.screener_responses r where r.session_id = v_sess.id), '[]'::jsonb));
end $$;

-- (d) salvar resposta. Trava, revalida (vínculo/vigência/credencial/sessão aberta),
--     confere PERTENCIMENTO AO INSTRUMENTO e faz o upsert.
create or replace function public.screener_op_save_response(
  p_token_hash text, p_item_code text, p_stage_code text, p_preview_key text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype; v_n integer;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.branding, p_preview_key) then
    raise exception 'previa_nao_autorizada';
  end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
  if p_stage_code not in ('E1','E2','E3','E4','NA') then raise exception 'estagio_invalido'; end if;
  if not exists (
    select 1 from public.screener_instrument_versions iv
    cross join lateral jsonb_array_elements(iv.definition -> 'items') it
    where iv.instrument_code = v_bind.instrument_code
      and iv.instrument_version = v_bind.instrument_version
      and it ->> 'code' = p_item_code
  ) then raise exception 'item_fora_do_instrumento'; end if;
  insert into public.screener_responses (session_id, item_code, stage_code, answered_at)
    values (v_sess.id, p_item_code, p_stage_code, now())
  on conflict (session_id, item_code) do update set stage_code = excluded.stage_code, revised_at = now();
  select count(*) into v_n from public.screener_responses where session_id = v_sess.id;
  return jsonb_build_object('answered', v_n);
end $$;

-- (e) finalizar. Trava, idempotente, confere canônico (collate "C"), snapshot, fecha.
create or replace function public.screener_op_finalize(
  p_token_hash text, p_expected_canonical text, p_result jsonb,
  p_instrument_checksum text, p_input_checksum text, p_scoring_version text, p_report_version text,
  p_preview_key text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_canonical text; v_result jsonb;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.branding, p_preview_key) then
    raise exception 'previa_nao_autorizada';
  end if;
  if v_sess.status = 'submitted' then
    select result into v_result from public.screener_result_snapshots
      where session_id = v_sess.id order by created_at desc limit 1;
    return jsonb_build_object('status','ja_submetida','result', v_result);
  end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
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

-- (f) obter resultado. internal_preview sem credencial → null.
create or replace function public.screener_op_get_result(p_token_hash text, p_preview_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.branding, p_preview_key) then
    return null;
  end if;
  return jsonb_build_object(
    'session', jsonb_build_object('status', v_sess.status, 'expires_at', v_sess.expires_at, 'revoked_at', v_sess.revoked_at),
    'binding', jsonb_build_object('event_slug', v_bind.event_slug, 'status', v_bind.status,
      'starts_at', v_bind.starts_at, 'ends_at', v_bind.ends_at, 'branding', v_bind.branding),
    'result', (select r.result from public.screener_result_snapshots r
               where r.session_id = v_sess.id order by r.created_at desc limit 1));
end $$;

-- 4) PROPRIEDADE: tabelas + sequences + funções screener_* -> screener_owner ----
do $$
declare obj text;
begin
  for obj in
    select format('table public.%I', c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p') and c.relname like 'screener\_%'
    union all
    select format('sequence public.%I', c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='S' and c.relname like 'screener\_%'
    union all
    select format('function %s', p.oid::regprocedure) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'screener\_%'
  loop
    execute format('alter %s owner to screener_owner', obj);
  end loop;
end $$;

-- 5) PRIVILÉGIOS do screener_runtime -----------------------------------------
grant usage on schema public to screener_runtime;
revoke all on all tables    in schema public from screener_runtime;
revoke all on all sequences in schema public from screener_runtime;
revoke all on all functions in schema public from screener_runtime;
-- helper de credencial: ninguém além do owner (via DEFINER) executa
revoke all on function public.screener_priv_previa_ok(jsonb, text) from public, anon, authenticated, service_role;
-- as 6 operações: EXECUTE só para screener_runtime; revogado dos demais
do $$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'screener\_op\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute format('grant execute on function %s to screener_runtime', fn);
  end loop;
end $$;
