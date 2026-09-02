-- =============================================================
-- SCREENER EMPRESA + IA — tabelas isoladas no projeto Ibmec (corte 2)
--
-- ⚠️ NÃO APLICADA. Escrita para revisão (grilling 02/09). Nenhuma linha roda
--    no Supabase nesta etapa; nenhum dado legado é tocado.
--
-- Decisões que esta migration materializa:
--   Q7=(b) reutilizar o Supabase "Ibmec" com ISOLAMENTO LÓGICO: prefixo
--          `screener_*`, sem misturar com eventos/respondentes/respostas atuais.
--   Q8=(d) módulo do wsdegust; o banco só guarda o que a edge grava.
--   Segurança: RLS habilitada em tudo, NENHUMA policy para `anon` — o navegador
--          nunca lê/escreve estas tabelas; acesso só pela edge (service_role, que
--          ignora RLS). Sessão por token OPACO guardado como HASH. Tudo carrega
--          `event_slug` para separação e reprodutibilidade por evento.
--   Método: Pessoa/Empresa/IA nunca somam; N/A é estágio, não zero; lead
--          separado das respostas; resultado é snapshot imutável e versionado.
--
-- O INSTRUMENTO em si (os 30 itens) NÃO é semeado aqui: a fonte única é
-- `screener/instrumento/SCREENER_EMPRESA_IA_V1.json` no repo. Um passo de carga
-- separado (loader edge/script, também fora desta etapa) insere a linha em
-- `screener_instrument_versions` a partir daquele arquivo, com o checksum, e
-- cria o vínculo técnico `preview-interno-ia-v1` em `internal_preview`. Assim o
-- JSON não vira uma segunda fonte de verdade dentro do SQL.
-- =============================================================

-- ---------- 1. Versões congeladas do instrumento ----------
-- Uma linha por (código, versão). Guarda a DEFINIÇÃO PRIVADA inteira (com pontos,
-- dimensões, regras) — é leitura exclusiva da edge; RLS abaixo bloqueia anon.
create table if not exists public.screener_instrument_versions (
  instrument_code     text not null,
  instrument_version  text not null,
  definition          jsonb not null,          -- definição privada completa
  checksum            text not null,           -- sha256 da serialização canônica
  status              text not null default 'inactive'
                        check (status in ('inactive', 'active', 'retired')),
  created_at          timestamptz not null default now(),
  primary key (instrument_code, instrument_version)
);

comment on table public.screener_instrument_versions is
  'Instrumentos do screener, congelados por versão. Carregados INATIVOS. Fonte no repo (JSON versionado); o loader insere aqui com o checksum.';

-- ---------- 2. Vínculo evento × instrumento ----------
-- Cada evento aponta para uma versão de instrumento e aplica sua marca/modo.
-- O estado de publicação é POR VÍNCULO (não global): um evento pode estar em
-- piloto enquanto outros seguem sem screener.
create table if not exists public.screener_event_bindings (
  id                  uuid primary key default gen_random_uuid(),
  event_slug          text not null unique,
  instrument_code     text not null,
  instrument_version  text not null,
  status              text not null default 'inactive'
                        check (status in ('inactive', 'internal_preview', 'public_pilot', 'published', 'closed')),
  branding            jsonb not null default '{}'::jsonb,   -- cores, logo, texto inicial
  result_mode         text not null default 'immediate'
                        check (result_mode in ('immediate', 'deferred')),
  lead_capture_mode   text not null default 'after_submit'
                        check (lead_capture_mode in ('after_submit', 'none')),
  starts_at           timestamptz,
  ends_at             timestamptz,
  created_at          timestamptz not null default now(),
  foreign key (instrument_code, instrument_version)
    references public.screener_instrument_versions (instrument_code, instrument_version)
);

comment on table public.screener_event_bindings is
  'Liga um evento a uma versão de instrumento, marca e modo. Ativação é por vínculo, nunca global.';

-- ---------- 3. Sessões públicas anônimas ----------
-- Sem PII. O token de retomada nasce no cliente e viaja opaco; aqui só o HASH.
create table if not exists public.screener_sessions (
  id                  uuid primary key default gen_random_uuid(),
  event_slug          text not null,
  instrument_code     text not null,
  instrument_version  text not null,
  token_hash          text not null unique,     -- hash do token opaco de retomada
  status              text not null default 'open'
                        check (status in ('open', 'submitted', 'abandoned')),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  submitted_at        timestamptz,
  foreign key (instrument_code, instrument_version)
    references public.screener_instrument_versions (instrument_code, instrument_version)
);
create index if not exists idx_screener_sessions_evento on public.screener_sessions (event_slug);

comment on table public.screener_sessions is
  'Sessão pública anônima. Escopada por event_slug; retomável pelo token (guardado só como hash). Sem PII.';

-- ---------- 4. Respostas ----------
-- A edge traduz o id opaco da opção para (item_code, stage) ANTES de gravar.
-- N/A é um estágio válido — nunca vira zero (isso é regra do motor, não do banco).
create table if not exists public.screener_responses (
  id             bigserial primary key,
  session_id     uuid not null references public.screener_sessions (id) on delete cascade,
  item_code      text not null,
  stage_code     text not null check (stage_code in ('E1', 'E2', 'E3', 'E4', 'NA')),
  answered_at    timestamptz not null default now(),
  revised_at     timestamptz,
  unique (session_id, item_code)
);
create index if not exists idx_screener_responses_sessao on public.screener_responses (session_id);

comment on table public.screener_responses is
  'Respostas por sessão (item + estágio). Sem PII. Uma linha por item, com revisão idempotente.';

-- ---------- 5. Snapshots de resultado ----------
-- Append-only e imutável: reprocessar gera nova linha, nunca sobrescreve. Carrega
-- todas as versões e checksums para reprodutibilidade e separação por evento.
create table if not exists public.screener_result_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.screener_sessions (id) on delete cascade,
  event_slug           text not null,
  instrument_code      text not null,
  instrument_version   text not null,
  scoring_version      text not null,
  report_version       text not null,
  instrument_checksum  text not null,
  input_checksum       text not null,          -- checksum das respostas normalizadas
  result               jsonb not null,         -- ScoreResultV1 (sem PII, sem saída proibida)
  created_at           timestamptz not null default now()
);
create index if not exists idx_screener_snapshots_sessao on public.screener_result_snapshots (session_id, created_at desc);

comment on table public.screener_result_snapshots is
  'Resultado determinístico, imutável e versionado. Append-only (guarda histórico de reprocessamento).';

-- ---------- 6. Leads ----------
-- ÚNICO lugar com PII. Ligado ao resultado só pelo id interno da sessão — o
-- e-mail nunca entra no motor nem nas respostas.
create table if not exists public.screener_leads (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null unique references public.screener_sessions (id) on delete cascade,
  nome          text,
  email         text not null,
  consent       boolean not null default false,
  consent_at    timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.screener_leads is
  'Lead (nome/e-mail/consentimento), separado das respostas. Vinculado ao resultado pelo session_id interno. PII fica só aqui.';

-- =============================================================
-- RLS — fronteira de acesso
--
-- Habilitada em todas as tabelas. NENHUMA policy para `anon`: sem policy, a anon
-- key (que é pública) não lê nem escreve nada aqui. A edge opera com
-- service_role, que IGNORA RLS por definição — é o único caminho de escrita/leitura.
-- Acesso do painel (authenticated) virá numa migration posterior, espelhando o
-- padrão de admin_eventos, quando o corte de painel existir.
-- =============================================================
alter table public.screener_instrument_versions enable row level security;
alter table public.screener_event_bindings      enable row level security;
alter table public.screener_sessions            enable row level security;
alter table public.screener_responses           enable row level security;
alter table public.screener_result_snapshots    enable row level security;
alter table public.screener_leads               enable row level security;

-- (proposital: nenhuma create policy. anon = zero acesso; service_role = tudo, via edge.)
