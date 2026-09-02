-- =============================================================
-- SCREENER EMPRESA + IA — tabelas isoladas no projeto Ibmec (corte 2)
--
-- ✅ APLICADA em 02/09/2026 no projeto Ibmec (klnpnjumogojspubyabi), após
--    aprovação da Miriam. Verificado: 6 tabelas, RLS em 6/6, 0 policies,
--    trigger de imutabilidade presente, 24 check constraints, legado intacto.
--
-- Decisões materializadas:
--   Q7=(b) Supabase "Ibmec" com ISOLAMENTO LÓGICO (prefixo `screener_*`).
--   Q8=(d) módulo do wsdegust; o banco só guarda o que a EDGE grava.
--   Segurança: RLS habilitada em tudo, ZERO policy para anon; privilégios
--          REVOGADOS de anon/authenticated (inclusive a sequence). Só a edge
--          (service_role) acessa. Painel fica para um corte próprio.
--   Cadeia garantida pelo BANCO (não só pela edge):
--          event_slug → vínculo corrente → sessão(binding_id) → respostas → snapshot.
--
-- Sem `IF NOT EXISTS`: se qualquer entidade já existir, a migration FALHA e
-- exige investigação (não mascara estrutura incompatível).
--
-- O INSTRUMENTO (30 itens) NÃO é semeado aqui. Fonte única:
-- `screener/instrumento/SCREENER_EMPRESA_IA_V1.json`. Um loader separado
-- (versionado, transacional, idempotente; recalcula o checksum pelo MESMO
-- `canonicalize`; no-op se versão+checksum baterem; falha se a versão existir com
-- checksum diferente; integra o replay greenfield) insere a versão INATIVA e o
-- vínculo técnico `preview-interno-ia-v1`. Ainda não é este arquivo.
-- =============================================================

-- ---------- 1. Versões congeladas do instrumento ----------
create table public.screener_instrument_versions (
  instrument_code     text not null,
  instrument_version  text not null,
  definition          jsonb not null,
  checksum            text not null,
  status              text not null default 'inactive'
                        check (status in ('inactive', 'active', 'retired')),
  created_at          timestamptz not null default now(),
  primary key (instrument_code, instrument_version),
  constraint screener_iv_checksum_hex check (checksum ~ '^[0-9a-f]{64}$'),
  constraint screener_iv_definition_obj check (jsonb_typeof(definition) = 'object')
);
comment on table public.screener_instrument_versions is
  'Instrumentos congelados por versão, carregados INATIVOS. Definição privada (edge-only). Fonte no repo; loader insere com checksum.';

-- ---------- 2. Vínculo evento × instrumento ----------
-- Estado de publicação POR VÍNCULO. Vários vínculos por evento (versões
-- diferentes) coexistem; só UM pode ser o corrente.
create table public.screener_event_bindings (
  id                     uuid primary key default gen_random_uuid(),
  event_slug             text not null,
  instrument_code        text not null,
  instrument_version     text not null,
  is_current             boolean not null default false,
  status                 text not null default 'inactive'
                           check (status in ('inactive', 'internal_preview', 'public_pilot', 'published', 'closed')),
  branding               jsonb not null default '{}'::jsonb,
  result_mode            text not null default 'immediate'
                           check (result_mode in ('immediate')),  -- 'deferred' fica fora da v1
  lead_capture_mode      text not null default 'optional_after_submit'
                           check (lead_capture_mode in ('none', 'optional_after_submit', 'required_before_result')),
  session_retention_days integer check (session_retention_days is null or session_retention_days > 0),
  lead_retention_days    integer check (lead_retention_days is null or lead_retention_days > 0),
  starts_at              timestamptz,
  ends_at                timestamptz,
  created_at             timestamptz not null default now(),
  foreign key (instrument_code, instrument_version)
    references public.screener_instrument_versions (instrument_code, instrument_version),
  unique (event_slug, instrument_code, instrument_version),
  constraint screener_binding_slug_canon check (event_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint screener_binding_branding_obj check (jsonb_typeof(branding) = 'object'),
  constraint screener_binding_janela check (starts_at is null or ends_at is null or starts_at < ends_at),
  -- retenção obrigatória antes de ir ao público
  constraint screener_binding_retencao check (
    status not in ('public_pilot', 'published')
    or (session_retention_days is not null and lead_retention_days is not null)
  )
);
-- só um vínculo corrente por evento
create unique index uq_screener_binding_corrente
  on public.screener_event_bindings (event_slug)
  where is_current;
comment on table public.screener_event_bindings is
  'Liga evento a uma versão de instrumento, marca e modo. Ativação por vínculo. is_current marca a versão vigente do evento; retenção exigida antes de public_pilot/published.';

-- ---------- 3. Sessões públicas anônimas ----------
-- A sessão aponta para o VÍNCULO (binding_id), não para um event_slug/versão
-- soltos — impede sessão em evento sem vínculo ou com instrumento incompatível.
-- Token gerado pela EDGE com aleatoriedade criptográfica, devolvido uma única
-- vez ao navegador e persistido só como HASH (SHA-256 hex, 64 chars).
create table public.screener_sessions (
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
  constraint screener_sess_token_hex check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint screener_sess_expira check (expires_at > created_at),
  constraint screener_sess_submit_coerente check (status <> 'submitted' or submitted_at is not null),
  constraint screener_sess_privacy_coerente check (
    (privacy_notice_version is null) = (privacy_acknowledged_at is null)
  )
);
create index idx_screener_sessions_binding on public.screener_sessions (binding_id);
comment on table public.screener_sessions is
  'Sessão pública anônima, presa ao binding_id (cadeia forte). Token só como hash. Ciência do aviso de privacidade registrada aqui (≠ consentimento de marketing). Sem PII.';

-- ---------- 4. Respostas ----------
-- A edge traduz o id opaco da opção para (item_code, stage) ANTES de gravar.
-- item_code é validado pela edge contra a definição (não há FK para itens, que
-- vivem no JSONB da versão). N/A é estágio; nunca zero (regra do motor).
create table public.screener_responses (
  id             bigserial primary key,
  session_id     uuid not null references public.screener_sessions (id) on delete cascade,
  item_code      text not null,
  stage_code     text not null check (stage_code in ('E1', 'E2', 'E3', 'E4', 'NA')),
  answered_at    timestamptz not null default now(),
  revised_at     timestamptz,
  unique (session_id, item_code)
);
create index idx_screener_responses_sessao on public.screener_responses (session_id);
comment on table public.screener_responses is
  'Respostas por sessão (item + estágio). Sem PII. Uma linha por item, revisão idempotente.';

-- ---------- 5. Snapshots de resultado (imutável + idempotente) ----------
-- Idempotência: a mesma repetição técnica (mesmos checksums e versões) NÃO cria
-- duplicata; uma nova versão de motor/relatório gera outro snapshot.
-- Imutabilidade: UPDATE é bloqueado por trigger. Exclusão só por rotina
-- controlada de retenção (por isso session_id é RESTRICT, não CASCADE): apagar
-- uma sessão exige apagar o snapshot deliberadamente antes. A imutabilidade vale
-- DURANTE o período de retenção declarado no vínculo.
create table public.screener_result_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.screener_sessions (id) on delete restrict,
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
  constraint screener_snap_slug_canon check (event_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint screener_snap_ics_hex check (instrument_checksum ~ '^[0-9a-f]{64}$'),
  constraint screener_snap_input_hex check (input_checksum ~ '^[0-9a-f]{64}$'),
  constraint screener_snap_result_obj check (jsonb_typeof(result) = 'object'),
  constraint screener_snap_contract check (result->>'contract_version' = 'ScoreResultV1')
);
create index idx_screener_snapshots_sessao on public.screener_result_snapshots (session_id, created_at desc);
comment on table public.screener_result_snapshots is
  'Resultado determinístico, imutável (UPDATE bloqueado) e idempotente. Append-only; exclusão só por retenção controlada.';

create function public.screener_snapshot_impede_update() returns trigger
  language plpgsql as $$
begin
  raise exception 'screener_result_snapshots é imutável: UPDATE não é permitido';
end;
$$;
create trigger trg_screener_snapshot_no_update
  before update on public.screener_result_snapshots
  for each row execute function public.screener_snapshot_impede_update();

-- ---------- 6. Leads (único lugar com PII) ----------
-- Ligado ao resultado só pelo session_id interno; e-mail nunca entra no motor
-- nem nas respostas. Aceitar o aviso de privacidade (na sessão) ≠ consentir com
-- marketing (aqui). RESTRICT: lead sai pela sua própria rotina de retenção.
create table public.screener_leads (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null unique references public.screener_sessions (id) on delete restrict,
  nome               text,
  email              text not null,
  email_normalized   text not null,
  marketing_opt_in   boolean not null default false,
  marketing_opt_in_at timestamptz,
  lead_source        text,
  created_at         timestamptz not null default now(),
  constraint screener_lead_optin_coerente check (marketing_opt_in = (marketing_opt_in_at is not null))
);
comment on table public.screener_leads is
  'Lead (PII isolada): nome, e-mail e opt-in de marketing (opcional, mesmo quando o e-mail é necessário para entregar o relatório). Vinculado ao resultado pelo session_id.';

-- =============================================================
-- RLS + revogação explícita de privilégios
--
-- RLS sem policy já bloqueia linhas para anon/authenticated. A revogação
-- explícita reduz a superfície e documenta a intenção. service_role ignora RLS e
-- mantém seus grants — é o único caminho (edge).
-- =============================================================
alter table public.screener_instrument_versions enable row level security;
alter table public.screener_event_bindings      enable row level security;
alter table public.screener_sessions            enable row level security;
alter table public.screener_responses           enable row level security;
alter table public.screener_result_snapshots    enable row level security;
alter table public.screener_leads               enable row level security;

revoke all on table
  public.screener_instrument_versions,
  public.screener_event_bindings,
  public.screener_sessions,
  public.screener_responses,
  public.screener_result_snapshots,
  public.screener_leads
  from anon, authenticated;

revoke all on sequence public.screener_responses_id_seq from anon, authenticated;

-- (proposital: nenhuma create policy. anon/authenticated = zero acesso.
--  service_role = tudo, via edge. Policies de painel virão em corte próprio.)
