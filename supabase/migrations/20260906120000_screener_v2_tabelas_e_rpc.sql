-- =============================================================
-- SCREENER_IA_V2 — tabelas isoladas + fronteira de segurança (RPC SECURITY DEFINER)
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Escrita e testada localmente (pglite) para revisão.
--
-- Princípio da casa: o que existe NÃO se sobrescreve — cria-se novo caminho/tabela.
-- O V2 usa a ESCADA de níveis (respostas N1–N4/NA) e o contrato `ScoreResultIAV2`,
-- que NÃO cabem nas tabelas do V1 (`screener_responses.stage_code` só aceita
-- E1–E4; o snapshot exige `ScoreResultV1`). Por isso o V2 ganha tabelas próprias
-- `screener_v2_*`. Reaproveita SÓ o que é genérico e aditivo: `screener_event_bindings`
-- e `screener_instrument_versions` (linhas novas) e o helper `screener_priv_previa_ok`.
--
-- MODELO idêntico ao V1: a edge NÃO faz SQL direto; toda leitura/escrita passa por
-- funções `screener_v2_op_*` SECURITY DEFINER (search_path vazio, sem SQL dinâmica),
-- donas de `screener_owner`, com EXECUTE só para `screener_runtime`. A chave de prévia
-- nunca chega crua (só o hash sha256). O navegador nunca vê pontos/pesos/fórmula.
-- =============================================================

-- membership temporária só para reatribuir propriedade ao owner (revogada no fim)
grant screener_owner to current_user;
do $$
begin
  grant create on schema public to screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  grant create on schema public to screener_owner;
  reset role;
end $$;

-- 1) TABELAS V2 ----------------------------------------------------------------

-- 1a. Sessões públicas anônimas do V2 (com a senioridade, que é input do cálculo)
create table public.screener_v2_sessions (
  id                       uuid primary key default gen_random_uuid(),
  binding_id               uuid not null references public.screener_event_bindings (id),
  token_hash               text not null unique,
  status                   text not null default 'open'
                             check (status in ('open', 'submitted', 'abandoned')),
  seniority_code           text
                             check (seniority_code is null or seniority_code ~ '^[a-z_]+$'),
  privacy_notice_version   text,
  privacy_acknowledged_at  timestamptz,
  created_at               timestamptz not null default now(),
  expires_at               timestamptz not null,
  revoked_at               timestamptz,
  submitted_at             timestamptz,
  constraint screener_v2_sess_token_hex check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint screener_v2_sess_expira check (expires_at > created_at),
  constraint screener_v2_sess_submit_coerente check (status <> 'submitted' or submitted_at is not null),
  constraint screener_v2_sess_privacy_coerente check (
    (privacy_notice_version is null) = (privacy_acknowledged_at is null)
  )
);
create index idx_screener_v2_sessions_binding on public.screener_v2_sessions (binding_id);
comment on table public.screener_v2_sessions is
  'Sessao publica anonima do diagnostico de IA V2. Token so como hash. seniority_code guarda a senioridade (input do calculo do esperado). Sem PII.';

-- 1b. Respostas (nível por questão; escala da ESCADA N1–N4 + NA)
create table public.screener_v2_responses (
  id             bigserial primary key,
  session_id     uuid not null references public.screener_v2_sessions (id) on delete cascade,
  item_code      text not null,
  answer_code    text not null check (answer_code in ('N1', 'N2', 'N3', 'N4', 'NA')),
  answered_at    timestamptz not null default now(),
  revised_at     timestamptz,
  unique (session_id, item_code)
);
create index idx_screener_v2_responses_sessao on public.screener_v2_responses (session_id);
comment on table public.screener_v2_responses is
  'Respostas por sessao V2 (questao + nivel N1-N4 ou NA). Sem PII. Uma linha por item, revisao idempotente.';

-- 1c. Snapshots de resultado (imutável + idempotente) — guarda o resultado INTERNO
--     (ScoreResultIAV2, com media/ponderada); a edge sanitiza na saida (PublicResultIAV2).
create table public.screener_v2_result_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.screener_v2_sessions (id) on delete restrict,
  event_slug           text not null,
  instrument_code      text not null,
  instrument_version   text not null,
  scoring_version      text not null,
  report_version       text not null,
  instrument_checksum  text not null,
  input_checksum       text not null,
  result               jsonb not null,
  created_at           timestamptz not null default now(),
  unique (session_id, instrument_checksum, input_checksum, scoring_version, report_version),
  constraint screener_v2_snap_slug_canon check (event_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint screener_v2_snap_ics_hex check (instrument_checksum ~ '^[0-9a-f]{64}$'),
  constraint screener_v2_snap_input_hex check (input_checksum ~ '^[0-9a-f]{64}$'),
  constraint screener_v2_snap_result_obj check (jsonb_typeof(result) = 'object'),
  constraint screener_v2_snap_contract check (result->>'contract_version' = 'ScoreResultIAV2')
);
create index idx_screener_v2_snapshots_sessao on public.screener_v2_result_snapshots (session_id, created_at desc);
comment on table public.screener_v2_result_snapshots is
  'Resultado V2 deterministico, imutavel (UPDATE bloqueado) e idempotente. Guarda o resultado interno; a edge projeta a versao publica.';

create function public.screener_v2_snapshot_impede_update() returns trigger
  language plpgsql as $$
begin
  raise exception 'screener_v2_result_snapshots e imutavel: UPDATE nao e permitido';
end;
$$;
create trigger trg_screener_v2_snapshot_no_update
  before update on public.screener_v2_result_snapshots
  for each row execute function public.screener_v2_snapshot_impede_update();

-- 1d. Leads (único lugar com PII) — vinculado à sessão V2
create table public.screener_v2_leads (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null unique references public.screener_v2_sessions (id) on delete restrict,
  nome                text,
  email               text not null,
  email_normalized    text not null,
  marketing_opt_in    boolean not null default false,
  marketing_opt_in_at timestamptz,
  lead_source         text,
  created_at          timestamptz not null default now(),
  constraint screener_v2_lead_optin_coerente check (marketing_opt_in = (marketing_opt_in_at is not null))
);
comment on table public.screener_v2_leads is
  'Lead V2 (PII isolada): nome, e-mail e opt-in. Vinculado ao resultado pelo session_id.';

-- RLS + revogação explícita
alter table public.screener_v2_sessions         enable row level security;
alter table public.screener_v2_responses        enable row level security;
alter table public.screener_v2_result_snapshots enable row level security;
alter table public.screener_v2_leads            enable row level security;

revoke all on table
  public.screener_v2_sessions, public.screener_v2_responses,
  public.screener_v2_result_snapshots, public.screener_v2_leads
  from anon, authenticated;
revoke all on sequence public.screener_v2_responses_id_seq from anon, authenticated;

-- 2) AS 6 OPERAÇÕES V2 (SECURITY DEFINER, search_path vazio, sem SQL dinâmica) ---
-- Reutilizam o helper genérico public.screener_priv_previa_ok (do V1).

-- 2a. start — cria a sessão V2
create or replace function public.screener_v2_op_start(
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
  insert into public.screener_v2_sessions
    (binding_id, token_hash, status, privacy_notice_version, privacy_acknowledged_at, expires_at)
    values (v_bind.id, p_token_hash, 'open', p_notice_version, p_acknowledged_at, p_expires_at)
    returning id into v_id;
  return jsonb_build_object('session_id', v_id);
end $$;

-- 2b. resume — devolve sessão + vínculo + respostas + senioridade
create or replace function public.screener_v2_op_resume(p_token_hash text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_v2_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
begin
  select * into v_sess from public.screener_v2_sessions where token_hash = p_token_hash;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  return jsonb_build_object(
    'session', jsonb_build_object('id', v_sess.id, 'status', v_sess.status, 'expires_at', v_sess.expires_at,
      'revoked_at', v_sess.revoked_at, 'submitted_at', v_sess.submitted_at, 'seniority_code', v_sess.seniority_code),
    'binding', jsonb_build_object('event_slug', v_bind.event_slug, 'status', v_bind.status,
      'starts_at', v_bind.starts_at, 'ends_at', v_bind.ends_at, 'branding', v_bind.branding,
      'lead_capture_mode', v_bind.lead_capture_mode,
      'instrument_code', v_bind.instrument_code, 'instrument_version', v_bind.instrument_version),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object('item_code', r.item_code, 'answer_code', r.answer_code))
      from public.screener_v2_responses r where r.session_id = v_sess.id), '[]'::jsonb));
end $$;

-- 2c. save_response — grava um nível de questão OU a senioridade (item_code reservado
--     'SENIORIDADE'), travando e revalidando a sessão atomicamente.
create or replace function public.screener_v2_op_save_response(
  p_token_hash text, p_item_code text, p_answer_code text, p_preview_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_v2_sessions%rowtype; v_bind public.screener_event_bindings%rowtype; v_n integer;
begin
  select * into v_sess from public.screener_v2_sessions where token_hash = p_token_hash for update;
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

  if p_item_code = 'SENIORIDADE' then
    -- valida a senioridade contra a definição do instrumento e grava na coluna da sessão
    if not exists (
      select 1 from public.screener_instrument_versions iv
      cross join lateral jsonb_array_elements(iv.definition -> 'senioridade') s
      where iv.instrument_code = v_bind.instrument_code
        and iv.instrument_version = v_bind.instrument_version
        and s ->> 'code' = p_answer_code
    ) then raise exception 'senioridade_invalida'; end if;
    update public.screener_v2_sessions set seniority_code = p_answer_code where id = v_sess.id;
    select count(*) into v_n from public.screener_v2_responses where session_id = v_sess.id;
    return jsonb_build_object('answered', v_n, 'seniority_code', p_answer_code);
  end if;

  if p_answer_code not in ('N1','N2','N3','N4','NA') then raise exception 'nivel_invalido'; end if;
  if not exists (
    select 1 from public.screener_instrument_versions iv
    cross join lateral jsonb_array_elements(iv.definition -> 'questoes') q
    where iv.instrument_code = v_bind.instrument_code
      and iv.instrument_version = v_bind.instrument_version
      and q ->> 'code' = p_item_code
  ) then raise exception 'item_fora_do_instrumento'; end if;
  insert into public.screener_v2_responses (session_id, item_code, answer_code, answered_at)
    values (v_sess.id, p_item_code, p_answer_code, now())
  on conflict (session_id, item_code) do update set answer_code = excluded.answer_code, revised_at = now();
  select count(*) into v_n from public.screener_v2_responses where session_id = v_sess.id;
  return jsonb_build_object('answered', v_n);
end $$;

-- 2d. finalize — grava o snapshot (imutável/idempotente) se as respostas + senioridade
--     não mudaram desde a leitura. O canônico inclui a senioridade.
create or replace function public.screener_v2_op_finalize(
  p_token_hash text, p_expected_canonical text, p_result jsonb,
  p_instrument_checksum text, p_input_checksum text, p_scoring_version text, p_report_version text,
  p_preview_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_v2_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_canonical text; v_result jsonb;
begin
  select * into v_sess from public.screener_v2_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    raise exception 'previa_nao_autorizada';
  end if;
  if v_sess.status = 'submitted' then
    select result into v_result from public.screener_v2_result_snapshots
      where session_id = v_sess.id order by created_at desc limit 1;
    return jsonb_build_object('status','ja_submetida','result', v_result);
  end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
  select '@sen:' || coalesce(v_sess.seniority_code, '') || '|' ||
         coalesce(string_agg(item_code || ':' || answer_code, '|' order by item_code collate "C"), '')
    into v_canonical from public.screener_v2_responses where session_id = v_sess.id;
  if v_canonical is distinct from p_expected_canonical then raise exception 'respostas_mudaram'; end if;
  insert into public.screener_v2_result_snapshots
    (session_id, event_slug, instrument_code, instrument_version, scoring_version, report_version,
     instrument_checksum, input_checksum, result)
    values (v_sess.id, v_bind.event_slug, v_bind.instrument_code, v_bind.instrument_version,
            p_scoring_version, p_report_version, p_instrument_checksum, p_input_checksum, p_result)
  on conflict (session_id, instrument_checksum, input_checksum, scoring_version, report_version) do nothing;
  update public.screener_v2_sessions set status = 'submitted', submitted_at = now()
    where id = v_sess.id and status = 'open';
  select result into v_result from public.screener_v2_result_snapshots
    where session_id = v_sess.id order by created_at desc limit 1;
  return jsonb_build_object('status','finalizada','result', v_result);
end $$;

-- 2e. get_result — devolve o snapshot mais recente.
--     GATE DE LEAD (fronteira): quando o vínculo é 'required_before_result', o
--     resultado só sai DEPOIS que há lead capturado para a sessão. Sem lead,
--     devolve result=null + lead_required=true. Assim o navegador não consegue
--     ler o resultado sem antes dar o contato — nem burlando a edge.
create or replace function public.screener_v2_op_get_result(p_token_hash text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_v2_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_base jsonb; v_tem_lead boolean;
begin
  select * into v_sess from public.screener_v2_sessions where token_hash = p_token_hash;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  v_base := jsonb_build_object(
    'session', jsonb_build_object('status', v_sess.status, 'expires_at', v_sess.expires_at, 'revoked_at', v_sess.revoked_at),
    'binding', jsonb_build_object('event_slug', v_bind.event_slug, 'status', v_bind.status,
      'lead_capture_mode', v_bind.lead_capture_mode,
      'starts_at', v_bind.starts_at, 'ends_at', v_bind.ends_at, 'branding', v_bind.branding));
  if v_bind.lead_capture_mode = 'required_before_result' then
    select exists (select 1 from public.screener_v2_leads l where l.session_id = v_sess.id) into v_tem_lead;
    if not v_tem_lead then
      return v_base || jsonb_build_object('result', null, 'lead_required', true);
    end if;
  end if;
  return v_base || jsonb_build_object(
    'result', (select r.result from public.screener_v2_result_snapshots r
               where r.session_id = v_sess.id order by r.created_at desc limit 1),
    'lead_required', false);
end $$;

-- 2f. capturar_lead — único caminho de escrita da PII; exige sessão submetida + válida,
--     credencial se internal_preview, e respeita lead_capture_mode do vínculo.
create or replace function public.screener_v2_op_capturar_lead(
  p_token_hash text, p_preview_hash text, p_nome text, p_email text, p_marketing_opt_in boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_v2_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_email text; v_norm text;
begin
  select * into v_sess from public.screener_v2_sessions where token_hash = p_token_hash for update;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    raise exception 'previa_nao_autorizada';
  end if;
  if v_bind.lead_capture_mode = 'none' then raise exception 'lead_desativado'; end if;
  if v_sess.status <> 'submitted' then raise exception 'sessao_nao_submetida'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  v_email := btrim(coalesce(p_email, ''));
  if v_email = '' or position('@' in v_email) = 0 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalido';
  end if;
  v_norm := lower(v_email);
  insert into public.screener_v2_leads (session_id, nome, email, email_normalized, marketing_opt_in, marketing_opt_in_at, lead_source)
    values (v_sess.id, nullif(btrim(coalesce(p_nome,'')),''), v_email, v_norm,
            coalesce(p_marketing_opt_in, false),
            case when coalesce(p_marketing_opt_in, false) then now() else null end,
            v_bind.event_slug)
  on conflict (session_id) do update set
    nome = excluded.nome, email = excluded.email, email_normalized = excluded.email_normalized,
    marketing_opt_in = excluded.marketing_opt_in, marketing_opt_in_at = excluded.marketing_opt_in_at;
  return jsonb_build_object('status', 'ok');
end $$;

-- 3) PROPRIEDADE -> screener_owner ---------------------------------------------
alter table    public.screener_v2_sessions         owner to screener_owner;
alter table    public.screener_v2_responses        owner to screener_owner;
alter table    public.screener_v2_result_snapshots owner to screener_owner;
alter table    public.screener_v2_leads            owner to screener_owner;
alter sequence public.screener_v2_responses_id_seq owner to screener_owner;
alter function public.screener_v2_snapshot_impede_update() owner to screener_owner;
alter function public.screener_v2_op_start(text, text, text, timestamptz, timestamptz, text) owner to screener_owner;
alter function public.screener_v2_op_resume(text, text) owner to screener_owner;
alter function public.screener_v2_op_save_response(text, text, text, text) owner to screener_owner;
alter function public.screener_v2_op_finalize(text, text, jsonb, text, text, text, text, text) owner to screener_owner;
alter function public.screener_v2_op_get_result(text, text) owner to screener_owner;
alter function public.screener_v2_op_capturar_lead(text, text, text, text, boolean) owner to screener_owner;

-- 4) PRIVILÉGIOS — EXECUTE só para screener_runtime; zero privilégio de tabela ----
revoke all on table public.screener_v2_sessions, public.screener_v2_responses,
  public.screener_v2_result_snapshots, public.screener_v2_leads from screener_runtime, service_role;
revoke all on sequence public.screener_v2_responses_id_seq from screener_runtime, service_role;

revoke all on function public.screener_v2_op_start(text, text, text, timestamptz, timestamptz, text)   from public, anon, authenticated, service_role;
revoke all on function public.screener_v2_op_resume(text, text)                                        from public, anon, authenticated, service_role;
revoke all on function public.screener_v2_op_save_response(text, text, text, text)                     from public, anon, authenticated, service_role;
revoke all on function public.screener_v2_op_finalize(text, text, jsonb, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.screener_v2_op_get_result(text, text)                                    from public, anon, authenticated, service_role;
revoke all on function public.screener_v2_op_capturar_lead(text, text, text, text, boolean)            from public, anon, authenticated, service_role;
grant execute on function public.screener_v2_op_start(text, text, text, timestamptz, timestamptz, text)   to screener_runtime;
grant execute on function public.screener_v2_op_resume(text, text)                                        to screener_runtime;
grant execute on function public.screener_v2_op_save_response(text, text, text, text)                     to screener_runtime;
grant execute on function public.screener_v2_op_finalize(text, text, jsonb, text, text, text, text, text) to screener_runtime;
grant execute on function public.screener_v2_op_get_result(text, text)                                    to screener_runtime;
grant execute on function public.screener_v2_op_capturar_lead(text, text, text, text, boolean)            to screener_runtime;

-- 5) fecha a fronteira: revoga o CREATE transitório do owner e a membership temporária
do $$
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  revoke create on schema public from screener_owner;
  reset role;
end $$;
revoke screener_owner from current_user;
