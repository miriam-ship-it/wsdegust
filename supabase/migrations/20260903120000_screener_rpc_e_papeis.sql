-- =============================================================
-- SCREENER — fronteira de segurança: colunas de credencial + papéis + RPC
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Escrita e testada localmente (pglite) para revisão.
--
-- MODELO (retorno de 04/09/2026):
--  - Credencial de prévia é DADO DE SEGURANÇA → colunas próprias no vínculo,
--    NUNCA em `branding` (que é apresentação e pode ir ao frontend). CHECKs
--    garantem hash hexadecimal de 64, coerência e ausência dessas chaves em
--    `branding`. A projeção pública nunca retorna essas colunas.
--  - A CHAVE CRUA não chega ao Postgres: a edge calcula sha256 e envia só o hash.
--  - A edge NÃO conecta como `postgres` amplo e NÃO faz SQL direto. As FUNÇÕES
--    são a fronteira e verificam tudo. `screener_runtime` só executa as 6.
-- =============================================================

-- 1) COLUNAS DE CREDENCIAL (fora de branding) + migração do que existir ---------
alter table public.screener_event_bindings
  add column if not exists preview_credential_hash text,
  add column if not exists preview_expires_at       timestamptz,
  add column if not exists preview_revoked_at        timestamptz;

-- migra qualquer configuração antiga que estivesse em branding e a remove de lá
update public.screener_event_bindings set
  preview_credential_hash = coalesce(preview_credential_hash, branding ->> 'preview_credential_sha256', branding ->> 'preview_credential_hash'),
  preview_expires_at       = coalesce(preview_expires_at, (branding ->> 'preview_expires_at')::timestamptz),
  preview_revoked_at       = coalesce(preview_revoked_at, (branding ->> 'preview_revoked_at')::timestamptz)
where branding ?| array['preview_credential_sha256','preview_credential_hash','preview_expires_at','preview_revoked_at'];

update public.screener_event_bindings
  set branding = branding - 'preview_credential_sha256' - 'preview_credential_hash' - 'preview_expires_at' - 'preview_revoked_at'
where branding ?| array['preview_credential_sha256','preview_credential_hash','preview_expires_at','preview_revoked_at'];

-- CHECKs (idempotentes)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'screener_bind_previa_hash_hex') then
    alter table public.screener_event_bindings add constraint screener_bind_previa_hash_hex
      check (preview_credential_hash is null or preview_credential_hash ~ '^[0-9a-f]{64}$');
  end if;
  -- coerência: expiração/revogação só fazem sentido com credencial presente
  if not exists (select 1 from pg_constraint where conname = 'screener_bind_previa_coerente') then
    alter table public.screener_event_bindings add constraint screener_bind_previa_coerente
      check (preview_credential_hash is not null or (preview_expires_at is null and preview_revoked_at is null));
  end if;
  -- branding NUNCA carrega chaves de credencial
  if not exists (select 1 from pg_constraint where conname = 'screener_bind_branding_sem_credencial') then
    alter table public.screener_event_bindings add constraint screener_bind_branding_sem_credencial
      check (branding is null or not (branding ?| array['preview_credential_sha256','preview_credential_hash','preview_expires_at','preview_revoked_at']));
  end if;
end $$;

-- 2) PAPÉIS -------------------------------------------------------------------
-- SUPERUSER/REPLICATION/BYPASSRLS não podem ser setados sem ser superuser (o
-- admin do Supabase não é) — MAS são NO por padrão em papel recém-criado, que é
-- exatamente o estado desejado. CREATEDB/CREATEROLE também são NO por padrão.
-- Só firmamos explicitamente LOGIN/NOLOGIN e NOINHERIT (permitidos ao admin).
-- Resultado (verificado em teste): ambos NOSUPERUSER NOCREATEDB NOCREATEROLE
-- NOREPLICATION NOBYPASSRLS NOINHERIT; owner NOLOGIN, runtime LOGIN.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'screener_owner')   then create role screener_owner   nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'screener_runtime') then create role screener_runtime  login  noinherit; end if;
  alter role screener_owner   nologin noinherit;   -- idempotente, sem tocar atributos de superuser
  alter role screener_runtime  login  noinherit;
end $$;
-- membership temporária só para reatribuir propriedade (revogada no fim)
grant screener_owner to current_user;

-- 3) HELPER de credencial (privado; recebe o HASH, nunca a chave crua) ----------
create or replace function public.screener_priv_previa_ok(
  p_hash text, p_expires timestamptz, p_revoked timestamptz, p_preview_hash text
) returns boolean language sql
security definer set search_path = '' as $$
  select p_preview_hash is not null and p_hash is not null
     and p_preview_hash = p_hash
     and p_revoked is null
     and (p_expires is null or p_expires > now());
$$;

-- 4) AS 6 OPERAÇÕES (SECURITY DEFINER, search_path vazio, sem SQL dinâmica) -----

create or replace function public.screener_op_get_binding(p_event_slug text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.screener_event_bindings%rowtype;
begin
  select * into v from public.screener_event_bindings where event_slug = p_event_slug and is_current;
  if not found then return null; end if;
  if v.status = 'internal_preview' and not public.screener_priv_previa_ok(v.preview_credential_hash, v.preview_expires_at, v.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  return jsonb_build_object('id', v.id, 'event_slug', v.event_slug, 'status', v.status,
    'starts_at', v.starts_at, 'ends_at', v.ends_at, 'branding', v.branding,   -- branding livre de credencial (CHECK)
    'instrument_code', v.instrument_code, 'instrument_version', v.instrument_version);
end $$;

create or replace function public.screener_op_start(
  p_event_slug text, p_token_hash text, p_notice_version text,
  p_acknowledged_at timestamptz, p_expires_at timestamptz, p_preview_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bind public.screener_event_bindings%rowtype; v_id uuid;
begin
  select * into v_bind from public.screener_event_bindings where event_slug = p_event_slug and is_current;
  if not found then raise exception 'vinculo_inexistente'; end if;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
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

create or replace function public.screener_op_resume(p_token_hash text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
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

create or replace function public.screener_op_save_response(
  p_token_hash text, p_item_code text, p_stage_code text, p_preview_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype; v_n integer;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
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

create or replace function public.screener_op_finalize(
  p_token_hash text, p_expected_canonical text, p_result jsonb,
  p_instrument_checksum text, p_input_checksum text, p_scoring_version text, p_report_version text,
  p_preview_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_canonical text; v_result jsonb;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
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

create or replace function public.screener_op_get_result(p_token_hash text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  return jsonb_build_object(
    'session', jsonb_build_object('status', v_sess.status, 'expires_at', v_sess.expires_at, 'revoked_at', v_sess.revoked_at),
    'binding', jsonb_build_object('event_slug', v_bind.event_slug, 'status', v_bind.status,
      'starts_at', v_bind.starts_at, 'ends_at', v_bind.ends_at, 'branding', v_bind.branding),
    'result', (select r.result from public.screener_result_snapshots r
               where r.session_id = v_sess.id order by r.created_at desc limit 1));
end $$;

-- 5) PROPRIEDADE -> screener_owner (LISTA FECHADA, assinaturas completas) --------
-- Para SER dono de objetos em `public`, screener_owner precisa de CREATE no schema
-- (regra do ALTER ... OWNER). `public` é de pg_database_owner; postgres é membro do
-- banco/owner e concede AGINDO como pg_database_owner. CREATE é TRANSITÓRIO: revogado
-- ao fim (o dono mantém acesso total aos objetos que possui, sem CREATE de schema).
do $$
begin
  grant create on schema public to screener_owner;            -- superuser (pglite) resolve direto
exception when insufficient_privilege then
  set local role pg_database_owner;                            -- Supabase: postgres é membro do dono do schema
  grant create on schema public to screener_owner;
  reset role;
end $$;

alter table    public.screener_instrument_versions owner to screener_owner;
alter table    public.screener_event_bindings      owner to screener_owner;
alter table    public.screener_sessions            owner to screener_owner;
alter table    public.screener_responses           owner to screener_owner;
alter table    public.screener_result_snapshots    owner to screener_owner;
alter table    public.screener_leads               owner to screener_owner;
alter sequence public.screener_responses_id_seq    owner to screener_owner;
alter function public.screener_snapshot_impede_update() owner to screener_owner;
alter function public.screener_priv_previa_ok(text, timestamptz, timestamptz, text) owner to screener_owner;
alter function public.screener_op_get_binding(text, text) owner to screener_owner;
alter function public.screener_op_start(text, text, text, timestamptz, timestamptz, text) owner to screener_owner;
alter function public.screener_op_resume(text, text) owner to screener_owner;
alter function public.screener_op_save_response(text, text, text, text) owner to screener_owner;
alter function public.screener_op_finalize(text, text, jsonb, text, text, text, text, text) owner to screener_owner;
alter function public.screener_op_get_result(text, text) owner to screener_owner;

-- 6) PRIVILÉGIOS (assinaturas completas; service_role declarado explicitamente) --
-- USAGE em `public` já vem do grant padrão a PUBLIC (o schema é de pg_database_owner;
-- postgres não pode reconceder). screener_runtime herda USAGE por PUBLIC — o que
-- basta para EXECUTE; nenhum privilégio de objeto vem daí (todos revogados abaixo).

-- zero privilégio direto de tabela/sequence para screener_runtime E service_role
revoke all on table public.screener_instrument_versions, public.screener_event_bindings,
  public.screener_sessions, public.screener_responses, public.screener_result_snapshots,
  public.screener_leads from screener_runtime, service_role;
revoke all on sequence public.screener_responses_id_seq from screener_runtime, service_role;

-- helper privado: só o owner executa (via DEFINER); revogado de todos os demais
revoke all on function public.screener_priv_previa_ok(text, timestamptz, timestamptz, text)
  from public, anon, authenticated, service_role, screener_runtime;

-- as 6 operações: EXECUTE só para screener_runtime
revoke all on function public.screener_op_get_binding(text, text)                                   from public, anon, authenticated, service_role;
revoke all on function public.screener_op_start(text, text, text, timestamptz, timestamptz, text)   from public, anon, authenticated, service_role;
revoke all on function public.screener_op_resume(text, text)                                        from public, anon, authenticated, service_role;
revoke all on function public.screener_op_save_response(text, text, text, text)                     from public, anon, authenticated, service_role;
revoke all on function public.screener_op_finalize(text, text, jsonb, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.screener_op_get_result(text, text)                                    from public, anon, authenticated, service_role;
grant execute on function public.screener_op_get_binding(text, text)                                   to screener_runtime;
grant execute on function public.screener_op_start(text, text, text, timestamptz, timestamptz, text)   to screener_runtime;
grant execute on function public.screener_op_resume(text, text)                                        to screener_runtime;
grant execute on function public.screener_op_save_response(text, text, text, text)                     to screener_runtime;
grant execute on function public.screener_op_finalize(text, text, jsonb, text, text, text, text, text) to screener_runtime;
grant execute on function public.screener_op_get_result(text, text)                                    to screener_runtime;

-- 7) fecha a fronteira: revoga o CREATE transitório do owner e a membership temporária
do $$
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  revoke create on schema public from screener_owner;
  reset role;
end $$;
revoke screener_owner from current_user;
