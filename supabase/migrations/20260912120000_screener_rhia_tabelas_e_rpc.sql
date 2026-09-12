-- =============================================================
-- SCREENER_RHIA — Diagnóstico Boomit RH + IA v2: tabelas isoladas + fronteira (RPC SECURITY DEFINER)
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Escrita e testada localmente (pglite) para revisão.
--
-- Princípio da casa: o que existe NÃO se sobrescreve — cria-se novo caminho/tabela.
-- O instrumento rhia (boomit_rh_ia_maturity_v1) tem 30 itens de três tipos —
-- contexto (opções próprias, ex.: HR_LEADER/SELF/INFORM), práticas e governança
-- (E1–E4/NA) — mais um campo condicional de texto livre (CTX01_OTHER_TEXT, 2–120
-- chars). Isso NÃO cabe nas tabelas do V1 (`screener_responses.stage_code` só
-- aceita E1–E4/NA; o snapshot exige `ScoreResultV1`). Por isso o rhia ganha tabelas
-- próprias `screener_rhia_*`. Reaproveita SÓ o que é genérico e aditivo:
-- `screener_event_bindings` e `screener_instrument_versions` (linhas novas) e o
-- helper `screener_priv_previa_ok` (da 20260903120000, que também cria os papéis).
--
-- MODELO idêntico ao V1: a edge NÃO faz SQL direto; toda leitura/escrita passa por
-- funções `screener_rhia_op_*` SECURITY DEFINER (search_path vazio, sem SQL dinâmica),
-- donas de `screener_owner`, com EXECUTE só para `screener_runtime`. A chave de prévia
-- nunca chega crua (só o hash sha256). O snapshot guarda o contrato INTEIRO do motor
-- ({public, internal}); a edge projeta só `public` ao navegador — pontos-base, pesos e
-- respostas nunca saem do banco para o cliente.
--
-- VALIDAÇÃO NO BANCO: a função de gravação valida a resposta contra a DEFINIÇÃO
-- gravada em `screener_instrument_versions` (o JSON verbatim do pacote): item por `id`,
-- opção por `options[].id`, e o texto livre pelo `conditional_field` (min/max e sem
-- caracteres de controle). A fronteira não confia no cliente nem na edge.
--
-- PORTÃO DE LEAD (server-side): quando o vínculo é `required_before_result`, a própria
-- RPC de leitura retém o resultado até existir lead da sessão. Sem lead, `result` é
-- null e `lead_required` é true — nem contornando a edge o resultado sai. O portão só
-- vale sobre um snapshot EXISTENTE: sessão ainda aberta responde `result` null com
-- `lead_required` false (não há nada a reter, e a edge devolve 404 sem_resultado).
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

-- 1) TABELAS RHIA --------------------------------------------------------------

-- 1a. Sessões públicas anônimas do rhia
create table public.screener_rhia_sessions (
  id                       uuid primary key default gen_random_uuid(),
  binding_id               uuid not null references public.screener_event_bindings (id),
  token_hash               text not null unique,
  status                   text not null default 'open'
                             check (status in ('open', 'submitted', 'abandoned')),
  privacy_notice_version   text,
  privacy_acknowledged_at  timestamptz,
  created_at               timestamptz not null default now(),
  expires_at               timestamptz not null,
  revoked_at               timestamptz,
  submitted_at             timestamptz,
  constraint screener_rhia_sess_token_hex check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint screener_rhia_sess_expira check (expires_at > created_at),
  constraint screener_rhia_sess_submit_coerente check (status <> 'submitted' or submitted_at is not null),
  constraint screener_rhia_sess_privacy_coerente check (
    (privacy_notice_version is null) = (privacy_acknowledged_at is null)
  )
);
create index idx_screener_rhia_sessions_binding on public.screener_rhia_sessions (binding_id);
comment on table public.screener_rhia_sessions is
  'Sessao publica anonima do Diagnostico Boomit RH + IA (rhia). Token so como hash. Ciencia do aviso de privacidade registrada aqui. Sem PII.';

-- 1b. Respostas (item + código da opção; ou o texto livre do campo condicional)
--     answer_code livre até 120 chars porque o instrumento tem opções de contexto
--     (HR_LEADER, SELF, INFORM...), estágios (E1–E4/NA) e o texto de CTX01_OTHER_TEXT.
--     A validação semântica (opção pertence ao item; texto dentro do limite) é feita
--     pela RPC contra a definição gravada — o CHECK é só a cerca física.
create table public.screener_rhia_responses (
  id             bigserial primary key,
  session_id     uuid not null references public.screener_rhia_sessions (id) on delete cascade,
  item_code      text not null,
  answer_code    text not null check (char_length(answer_code) between 1 and 120),
  answered_at    timestamptz not null default now(),
  revised_at     timestamptz,
  unique (session_id, item_code)
);
create index idx_screener_rhia_responses_sessao on public.screener_rhia_responses (session_id);
comment on table public.screener_rhia_responses is
  'Respostas por sessao rhia (item + codigo da opcao, ou texto livre do campo condicional). Sem PII. Uma linha por item, revisao idempotente.';

-- 1c. Snapshots de resultado (imutável + idempotente) — guarda o contrato INTEIRO do
--     motor do pacote ({public, internal}); a edge projeta `public` na saída.
create table public.screener_rhia_result_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.screener_rhia_sessions (id) on delete restrict,
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
  constraint screener_rhia_snap_slug_canon check (event_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint screener_rhia_snap_ics_hex check (instrument_checksum ~ '^[0-9a-f]{64}$'),
  constraint screener_rhia_snap_input_hex check (input_checksum ~ '^[0-9a-f]{64}$'),
  constraint screener_rhia_snap_result_obj check (jsonb_typeof(result) = 'object'),
  -- coalesce: sem a chave, o ->> daria NULL e o CHECK passaria em silêncio
  constraint screener_rhia_snap_contract check (coalesce(result -> 'public' ->> 'version', '') = '2.0.0-pilot')
);
create index idx_screener_rhia_snapshots_sessao on public.screener_rhia_result_snapshots (session_id, created_at desc);
comment on table public.screener_rhia_result_snapshots is
  'Resultado rhia deterministico, imutavel (UPDATE bloqueado) e idempotente. Guarda o contrato inteiro do motor (public + internal); a edge projeta a versao publica. Append-only; exclusao so por retencao controlada.';

create function public.screener_rhia_snapshot_impede_update() returns trigger
  language plpgsql as $$
begin
  raise exception 'screener_rhia_result_snapshots e imutavel: UPDATE nao e permitido';
end;
$$;
create trigger trg_screener_rhia_snapshot_no_update
  before update on public.screener_rhia_result_snapshots
  for each row execute function public.screener_rhia_snapshot_impede_update();

-- 1d. Leads (único lugar com PII) — vinculado à sessão rhia
create table public.screener_rhia_leads (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null unique references public.screener_rhia_sessions (id) on delete restrict,
  nome                text,
  email               text not null,
  email_normalized    text not null,
  marketing_opt_in    boolean not null default false,
  marketing_opt_in_at timestamptz,
  lead_source         text,
  created_at          timestamptz not null default now(),
  constraint screener_rhia_lead_optin_coerente check (marketing_opt_in = (marketing_opt_in_at is not null))
);
comment on table public.screener_rhia_leads is
  'Lead rhia (PII isolada): nome, e-mail e opt-in de marketing. Vinculado ao resultado pelo session_id. Portao server-side quando o vinculo exige lead antes do resultado.';

-- RLS + revogação explícita
alter table public.screener_rhia_sessions         enable row level security;
alter table public.screener_rhia_responses        enable row level security;
alter table public.screener_rhia_result_snapshots enable row level security;
alter table public.screener_rhia_leads            enable row level security;

revoke all on table
  public.screener_rhia_sessions, public.screener_rhia_responses,
  public.screener_rhia_result_snapshots, public.screener_rhia_leads
  from anon, authenticated;
revoke all on sequence public.screener_rhia_responses_id_seq from anon, authenticated;

-- 2) AS 6 OPERAÇÕES RHIA (SECURITY DEFINER, search_path vazio, sem SQL dinâmica) ---
-- Reutilizam o helper genérico public.screener_priv_previa_ok (da 20260903120000).

-- 2a. start — cria a sessão rhia
create or replace function public.screener_rhia_op_start(
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
  insert into public.screener_rhia_sessions
    (binding_id, token_hash, status, privacy_notice_version, privacy_acknowledged_at, expires_at)
    values (v_bind.id, p_token_hash, 'open', p_notice_version, p_acknowledged_at, p_expires_at)
    returning id into v_id;
  return jsonb_build_object('session_id', v_id);
end $$;

-- 2b. resume — devolve sessão + vínculo (com lead_capture_mode) + respostas
create or replace function public.screener_rhia_op_resume(p_token_hash text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
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
      'lead_capture_mode', v_bind.lead_capture_mode,
      'instrument_code', v_bind.instrument_code, 'instrument_version', v_bind.instrument_version),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object('item_code', r.item_code, 'answer_code', r.answer_code) order by r.item_code collate "C")
      from public.screener_rhia_responses r where r.session_id = v_sess.id), '[]'::jsonb));
end $$;

-- 2c. save_response — grava a opção de um item OU o texto livre de um campo
--     condicional, validando contra a definição gravada do instrumento. Trava e
--     revalida a sessão atomicamente.
--
--     Item comum: p_item_code deve existir em definition->'items' (por 'id') e
--       p_answer_code deve ser um options[].id daquele item → senão opcao_invalida.
--     Texto livre: p_item_code deve ser o 'id' do conditional_field de algum item;
--       o texto (btrim) precisa ter entre min_length e max_length e não conter
--       caracteres de controle → senão texto_invalido. Grava o texto já aparado.
--       A coerência "texto só quando CTX01 = OTHER" NÃO é decidida aqui (o
--       respondente pode trocar CTX01 depois); a edge a decide na submissão e o
--       texto órfão nunca pontua.
--     Nenhum dos dois: item_fora_do_instrumento.
create or replace function public.screener_rhia_op_save_response(
  p_token_hash text, p_item_code text, p_answer_code text, p_preview_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_item jsonb; v_campo jsonb; v_texto text; v_n integer;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash for update;
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

  -- item comum: localiza pela definição gravada (JSON verbatim do pacote)
  select it into v_item
    from public.screener_instrument_versions iv
    cross join lateral jsonb_array_elements(iv.definition -> 'items') it
    where iv.instrument_code = v_bind.instrument_code
      and iv.instrument_version = v_bind.instrument_version
      and it ->> 'id' = p_item_code
    limit 1;

  if v_item is not null then
    if p_answer_code is null or not exists (
      select 1 from jsonb_array_elements(v_item -> 'options') op where op ->> 'id' = p_answer_code
    ) then raise exception 'opcao_invalida'; end if;
    v_texto := p_answer_code;
  else
    -- texto livre: localiza o campo condicional cujo id é o item_code pedido
    select it -> 'conditional_field' into v_campo
      from public.screener_instrument_versions iv
      cross join lateral jsonb_array_elements(iv.definition -> 'items') it
      where iv.instrument_code = v_bind.instrument_code
        and iv.instrument_version = v_bind.instrument_version
        and it -> 'conditional_field' ->> 'id' = p_item_code
      limit 1;
    if v_campo is null then raise exception 'item_fora_do_instrumento'; end if;
    v_texto := btrim(coalesce(p_answer_code, ''));
    if char_length(v_texto) < coalesce((v_campo ->> 'min_length')::integer, 1)
       or char_length(v_texto) > coalesce((v_campo ->> 'max_length')::integer, 120)
       or v_texto ~ '[[:cntrl:]]' then
      raise exception 'texto_invalido';
    end if;
  end if;

  insert into public.screener_rhia_responses (session_id, item_code, answer_code, answered_at)
    values (v_sess.id, p_item_code, v_texto, now())
  on conflict (session_id, item_code) do update set answer_code = excluded.answer_code, revised_at = now();
  select count(*) into v_n from public.screener_rhia_responses where session_id = v_sess.id;
  return jsonb_build_object('answered', v_n);
end $$;

-- 2d. finalize — grava o snapshot (imutável/idempotente) se as respostas não
--     mudaram desde a leitura pela edge. Canônico IDÊNTICO ao de logica.mjs:
--     linhas item<TAB>valor, ordenadas por item_code (collate "C" = por code unit),
--     unidas por quebra de linha; sem respostas → ''. O texto livre entra no
--     canônico (é uma linha da tabela) e, por não aceitar caracteres de controle,
--     nunca colide com os separadores.
create or replace function public.screener_rhia_op_finalize(
  p_token_hash text, p_expected_canonical text, p_result jsonb,
  p_instrument_checksum text, p_input_checksum text, p_scoring_version text, p_report_version text,
  p_preview_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_canonical text; v_result jsonb;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    raise exception 'previa_nao_autorizada';
  end if;
  if v_sess.status = 'submitted' then
    select result into v_result from public.screener_rhia_result_snapshots
      where session_id = v_sess.id order by created_at desc limit 1;
    return jsonb_build_object('status','ja_submetida','result', v_result);
  end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;
  select coalesce(string_agg(item_code || E'\t' || answer_code, E'\n' order by item_code collate "C"), '')
    into v_canonical from public.screener_rhia_responses where session_id = v_sess.id;
  if v_canonical is distinct from p_expected_canonical then raise exception 'respostas_mudaram'; end if;
  insert into public.screener_rhia_result_snapshots
    (session_id, event_slug, instrument_code, instrument_version, scoring_version, report_version,
     instrument_checksum, input_checksum, result)
    values (v_sess.id, v_bind.event_slug, v_bind.instrument_code, v_bind.instrument_version,
            p_scoring_version, p_report_version, p_instrument_checksum, p_input_checksum, p_result)
  on conflict (session_id, instrument_checksum, input_checksum, scoring_version, report_version) do nothing;
  update public.screener_rhia_sessions set status = 'submitted', submitted_at = now()
    where id = v_sess.id and status = 'open';
  select result into v_result from public.screener_rhia_result_snapshots
    where session_id = v_sess.id order by created_at desc limit 1;
  return jsonb_build_object('status','finalizada','result', v_result);
end $$;

-- 2e. get_result — devolve o snapshot mais recente.
--     GATE DE LEAD (fronteira): quando o vínculo é 'required_before_result', o
--     resultado só sai DEPOIS que há lead capturado para a sessão. Sem lead,
--     devolve result=null + lead_required=true. Assim o navegador não consegue
--     ler o resultado sem antes dar o contato — nem burlando a edge.
--     ORDEM IMPORTA: o snapshot é consultado ANTES do gate. Sem snapshot não há
--     o que reter, e o portão anunciaria "dê seu contato" para uma sessão que
--     sequer foi submetida (e o 404 sem_resultado da edge nunca aconteceria).
create or replace function public.screener_rhia_op_get_result(p_token_hash text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_base jsonb; v_tem_lead boolean; v_result jsonb;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  v_base := jsonb_build_object(
    'session', jsonb_build_object('id', v_sess.id, 'status', v_sess.status, 'expires_at', v_sess.expires_at,
      'revoked_at', v_sess.revoked_at, 'submitted_at', v_sess.submitted_at),
    'binding', jsonb_build_object('event_slug', v_bind.event_slug, 'status', v_bind.status,
      'lead_capture_mode', v_bind.lead_capture_mode,
      'starts_at', v_bind.starts_at, 'ends_at', v_bind.ends_at, 'branding', v_bind.branding,
      'instrument_code', v_bind.instrument_code, 'instrument_version', v_bind.instrument_version));
  select r.result into v_result from public.screener_rhia_result_snapshots r
    where r.session_id = v_sess.id order by r.created_at desc limit 1;
  -- O portão só existe sobre um resultado EXISTENTE: numa sessão ainda aberta
  -- não há nada a reter, e anunciar lead_required ali esconderia o estado real
  -- ("ainda não há resultado") atrás de um pedido de contato — além de tornar
  -- inalcançável o 404 sem_resultado que a edge implementa.
  if v_result is null then
    return v_base || jsonb_build_object('result', null, 'lead_required', false);
  end if;
  if v_bind.lead_capture_mode = 'required_before_result' then
    select exists (select 1 from public.screener_rhia_leads l where l.session_id = v_sess.id) into v_tem_lead;
    if not v_tem_lead then
      return v_base || jsonb_build_object('result', null, 'lead_required', true);
    end if;
  end if;
  return v_base || jsonb_build_object('result', v_result, 'lead_required', false);
end $$;

-- 2f. capturar_lead — único caminho de escrita da PII. Regras idênticas ao
--     screener_op_capturar_lead do V1: sessão submetida e válida; credencial se
--     internal_preview; 'none' recusa; e-mail validado e normalizado; opt-in
--     coerente; 1 lead por sessão (upsert); lead_source = event_slug.
create or replace function public.screener_rhia_op_capturar_lead(
  p_token_hash text, p_preview_hash text, p_nome text, p_email text, p_opt_in boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_email text; v_email_norm text; v_nome text; v_opt boolean; v_opt_at timestamptz;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash for update;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(
       v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  if v_bind.lead_capture_mode = 'none' then raise exception 'lead_desativado'; end if;
  if v_sess.status <> 'submitted' then raise exception 'sessao_nao_submetida'; end if;
  if v_sess.revoked_at is not null or (v_sess.expires_at is not null and v_sess.expires_at <= now()) then
    raise exception 'sessao_invalida';
  end if;

  v_email := trim(coalesce(p_email, ''));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalido';
  end if;
  v_email_norm := lower(v_email);
  v_nome := nullif(trim(coalesce(p_nome, '')), '');
  v_opt := coalesce(p_opt_in, false);
  v_opt_at := case when v_opt then now() else null end;

  insert into public.screener_rhia_leads
    (session_id, nome, email, email_normalized, marketing_opt_in, marketing_opt_in_at, lead_source)
    values (v_sess.id, v_nome, v_email, v_email_norm, v_opt, v_opt_at, v_bind.event_slug)
  on conflict (session_id) do update set
    nome = excluded.nome, email = excluded.email, email_normalized = excluded.email_normalized,
    marketing_opt_in = excluded.marketing_opt_in, marketing_opt_in_at = excluded.marketing_opt_in_at;

  return jsonb_build_object('status', 'ok');
end $$;

-- 2g. get_binding — igual à do V1, mas projetando lead_capture_mode, de que o
--     frontend precisa já na abertura para saber se há portão antes do resultado.
--     Função NOVA: não altera screener_op_get_binding, que está em produção.
create or replace function public.screener_rhia_op_get_binding(p_event_slug text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.screener_event_bindings%rowtype;
begin
  select * into v from public.screener_event_bindings where event_slug = p_event_slug and is_current;
  if not found then return null; end if;
  if v.status = 'internal_preview' and not public.screener_priv_previa_ok(
       v.preview_credential_hash, v.preview_expires_at, v.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  return jsonb_build_object('id', v.id, 'event_slug', v.event_slug, 'status', v.status,
    'starts_at', v.starts_at, 'ends_at', v.ends_at, 'branding', v.branding,
    'lead_capture_mode', v.lead_capture_mode,
    'instrument_code', v.instrument_code, 'instrument_version', v.instrument_version);
end $$;

-- 3) PROPRIEDADE -> screener_owner (LISTA FECHADA, assinaturas completas) --------
alter table    public.screener_rhia_sessions         owner to screener_owner;
alter table    public.screener_rhia_responses        owner to screener_owner;
alter table    public.screener_rhia_result_snapshots owner to screener_owner;
alter table    public.screener_rhia_leads            owner to screener_owner;
alter sequence public.screener_rhia_responses_id_seq owner to screener_owner;
alter function public.screener_rhia_snapshot_impede_update() owner to screener_owner;
alter function public.screener_rhia_op_start(text, text, text, timestamptz, timestamptz, text) owner to screener_owner;
alter function public.screener_rhia_op_resume(text, text) owner to screener_owner;
alter function public.screener_rhia_op_save_response(text, text, text, text) owner to screener_owner;
alter function public.screener_rhia_op_finalize(text, text, jsonb, text, text, text, text, text) owner to screener_owner;
alter function public.screener_rhia_op_get_result(text, text) owner to screener_owner;
alter function public.screener_rhia_op_capturar_lead(text, text, text, text, boolean) owner to screener_owner;
alter function public.screener_rhia_op_get_binding(text, text) owner to screener_owner;

-- 4) PRIVILÉGIOS — EXECUTE só para screener_runtime; zero privilégio de tabela ----
revoke all on table public.screener_rhia_sessions, public.screener_rhia_responses,
  public.screener_rhia_result_snapshots, public.screener_rhia_leads from screener_runtime, service_role;
revoke all on sequence public.screener_rhia_responses_id_seq from screener_runtime, service_role;

revoke all on function public.screener_rhia_snapshot_impede_update()                                    from public, anon, authenticated, service_role, screener_runtime;
revoke all on function public.screener_rhia_op_start(text, text, text, timestamptz, timestamptz, text)   from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_resume(text, text)                                        from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_save_response(text, text, text, text)                     from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_finalize(text, text, jsonb, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_get_result(text, text)                                    from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_capturar_lead(text, text, text, text, boolean)            from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_get_binding(text, text)                                   from public, anon, authenticated, service_role;
grant execute on function public.screener_rhia_op_start(text, text, text, timestamptz, timestamptz, text)   to screener_runtime;
grant execute on function public.screener_rhia_op_resume(text, text)                                        to screener_runtime;
grant execute on function public.screener_rhia_op_save_response(text, text, text, text)                     to screener_runtime;
grant execute on function public.screener_rhia_op_finalize(text, text, jsonb, text, text, text, text, text) to screener_runtime;
grant execute on function public.screener_rhia_op_get_result(text, text)                                    to screener_runtime;
grant execute on function public.screener_rhia_op_capturar_lead(text, text, text, text, boolean)            to screener_runtime;
grant execute on function public.screener_rhia_op_get_binding(text, text)                                   to screener_runtime;

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
