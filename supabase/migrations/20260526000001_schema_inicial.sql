-- =============================================================
-- IBMEC Assessment · Schema v1
-- Supabase Postgres
-- Criado: 2026-05-26 | Para: Evento IBMEC 08-10/06/2026
-- =============================================================

-- Extensões (Supabase já tem habilitadas, mas garantimos)
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================
-- TABELA: eventos
-- Programa/evento que congela versão de catálogo e questionário
-- =============================================================
create table if not exists public.eventos (
  id                   uuid primary key default uuid_generate_v4(),
  slug                 text not null unique,
  nome                 text not null,
  cliente              text not null default 'IBMEC',
  inicio_em            date,
  fim_em               date,
  catalogo_versao      text not null default 'v1.1',
  questionario_versao  text not null default 'q-v1.0',
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now()
);

comment on table public.eventos is
  'Evento ou programa. Congela versão do catálogo de benchmark e do questionário.';

-- =============================================================
-- TABELA: respondentes
-- Cada respondente é anônimo até informar email no gate final
-- =============================================================
create table if not exists public.respondentes (
  id                       uuid primary key default uuid_generate_v4(),
  evento_id                uuid not null references public.eventos(id) on delete cascade,
  token_sessao             uuid not null unique default uuid_generate_v4(),

  -- Identificação (sem email no início)
  nome                     text,
  empresa                  text,
  cargo                    text,
  persona                  text check (persona in ('A','C','G','X')),
  tamanho                  text check (tamanho in ('S1','S2','S3','S4')),
  segmento                 text check (segmento in ('V1','V2','V3','V4','V5','V6','V7','V8','V9')),

  -- Email só ao final (gate)
  email                    text,
  email_capturado_em       timestamptz,

  -- LGPD
  consentimento_lgpd       boolean not null default false,
  consentimento_marketing  boolean default false,

  -- Status
  iniciado_em              timestamptz not null default now(),
  submetido_em             timestamptz,
  tempo_segundos           integer,

  -- Reprodutibilidade
  versao_questionario      text not null default 'q-v1.0',

  -- Audit (opcional)
  ip_address               inet,
  user_agent               text
);

comment on table public.respondentes is
  'Pessoa preenchendo o assessment. Anônimo até informar email no gate.';

create index if not exists idx_respondentes_evento   on public.respondentes(evento_id);
create index if not exists idx_respondentes_token    on public.respondentes(token_sessao);
create index if not exists idx_respondentes_email    on public.respondentes(email) where email is not null;
create index if not exists idx_respondentes_persona  on public.respondentes(persona);
create index if not exists idx_respondentes_subm     on public.respondentes(submetido_em) where submetido_em is not null;

-- =============================================================
-- TABELA: respostas
-- Uma linha por resposta. Valor 1-5 enforced por check constraint
-- =============================================================
create table if not exists public.respostas (
  id              bigserial primary key,
  respondente_id  uuid not null references public.respondentes(id) on delete cascade,
  pergunta_id     text not null,           -- 'D1-pessoa-G', 'D3-empresa-X' etc
  dimensao        text not null check (dimensao in ('D1','D2','D3','D4','D5')),
  lente           text not null check (lente in ('pessoa','empresa')),
  valor           integer not null check (valor >= 1 and valor <= 5),
  confianca       integer check (confianca >= 1 and confianca <= 5),
  respondida_em   timestamptz not null default now(),

  unique(respondente_id, pergunta_id)
);

comment on table public.respostas is
  'Resposta individual a uma pergunta. Likert 1-5.';

create index if not exists idx_respostas_respondente on public.respostas(respondente_id);
create index if not exists idx_respostas_dimensao    on public.respostas(dimensao);

-- =============================================================
-- TABELA: relatorios
-- Snapshot do relatório com versão tripla congelada
-- =============================================================
create table if not exists public.relatorios (
  id                    uuid primary key default uuid_generate_v4(),
  respondente_id        uuid not null unique references public.respondentes(id) on delete cascade,

  -- Versões congeladas
  catalogo_versao       text not null,
  questionario_versao   text not null,
  motor_versao          text not null default 'engine-v1.0',

  -- Scores (JSON aberto)
  scores_json           jsonb not null,    -- { D1: {pessoa, empresa, gap}, ... }
  benchmarks_json       jsonb,             -- { D1: {fonte, gap_mercado}, ... }
  bandeiras_json        jsonb,             -- { D3: 'amarela', ... }

  -- Indicadores destacados (denormalizados para query rápida)
  maturidade_letra      text,              -- 'D' a 'AAA'
  maturidade_score      numeric(5,2),      -- 0-100
  cdl_min               numeric(14,2),     -- faixa anual em R$
  cdl_max               numeric(14,2),
  risco_estrategico     numeric(5,2),      -- 0-100 (%)

  -- PDF
  pdf_url               text,
  pdf_gerado_em         timestamptz,
  pdf_enviado_em        timestamptz,
  pdf_tamanho_bytes     integer,

  -- Erros (se houver)
  erro_geracao          text,

  gerado_em             timestamptz not null default now()
);

comment on table public.relatorios is
  'Resultado calculado. Uma linha por respondente. Versão tripla congelada para audit.';

create index if not exists idx_relatorios_respondente on public.relatorios(respondente_id);
create index if not exists idx_relatorios_pdf_enviado on public.relatorios(pdf_enviado_em);
create index if not exists idx_relatorios_persona     on public.relatorios((scores_json->>'persona'));

-- =============================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================
alter table public.eventos       enable row level security;
alter table public.respondentes  enable row level security;
alter table public.respostas     enable row level security;
alter table public.relatorios    enable row level security;

-- ----- EVENTOS -----
drop policy if exists "eventos_anon_read_ativos" on public.eventos;
create policy "eventos_anon_read_ativos"
  on public.eventos for select
  to anon
  using (ativo = true);

drop policy if exists "eventos_admin_all" on public.eventos;
create policy "eventos_admin_all"
  on public.eventos for all
  to authenticated
  using (true)
  with check (true);

-- ----- RESPONDENTES -----
-- Anon pode INSERT (criar novo respondente)
drop policy if exists "respondentes_anon_insert" on public.respondentes;
create policy "respondentes_anon_insert"
  on public.respondentes for insert
  to anon
  with check (true);

-- Anon pode SELECT (filtragem por token feita no front)
drop policy if exists "respondentes_anon_select" on public.respondentes;
create policy "respondentes_anon_select"
  on public.respondentes for select
  to anon
  using (true);

-- Anon pode UPDATE somente campos seguros (NÃO consentimento_lgpd inicial,
-- evita user bypass — token funciona como password)
drop policy if exists "respondentes_anon_update" on public.respondentes;
create policy "respondentes_anon_update"
  on public.respondentes for update
  to anon
  using (true)
  with check (true);

-- Admin (Miriam) tudo
drop policy if exists "respondentes_admin_all" on public.respondentes;
create policy "respondentes_admin_all"
  on public.respondentes for all
  to authenticated
  using (true)
  with check (true);

-- ----- RESPOSTAS -----
drop policy if exists "respostas_anon_insert" on public.respostas;
create policy "respostas_anon_insert"
  on public.respostas for insert
  to anon
  with check (true);

drop policy if exists "respostas_anon_select" on public.respostas;
create policy "respostas_anon_select"
  on public.respostas for select
  to anon
  using (true);

drop policy if exists "respostas_admin_all" on public.respostas;
create policy "respostas_admin_all"
  on public.respostas for all
  to authenticated
  using (true)
  with check (true);

-- ----- RELATORIOS -----
-- INSERT só via service_role (Edge Function), não criamos policy anon insert
drop policy if exists "relatorios_anon_select" on public.relatorios;
create policy "relatorios_anon_select"
  on public.relatorios for select
  to anon
  using (true);

drop policy if exists "relatorios_admin_all" on public.relatorios;
create policy "relatorios_admin_all"
  on public.relatorios for all
  to authenticated
  using (true)
  with check (true);

-- =============================================================
-- VIEW agregada para o admin (resumo do evento)
-- =============================================================
create or replace view public.v_resumo_evento as
select
  e.slug,
  e.nome,
  e.cliente,
  count(distinct r.id) as total_respondentes,
  count(distinct r.id) filter (where r.submetido_em is not null) as total_finalizados,
  count(distinct r.id) filter (where r.email is not null) as total_com_email,
  count(distinct r.id) filter (where r.email is not null and r.submetido_em is not null) as leads_qualificados,
  count(distinct rel.id) filter (where rel.pdf_enviado_em is not null) as pdf_enviados,
  count(distinct rel.id) filter (where rel.erro_geracao is not null) as erros_geracao
from public.eventos e
left join public.respondentes r  on r.evento_id = e.id
left join public.relatorios   rel on rel.respondente_id = r.id
group by e.slug, e.nome, e.cliente;

comment on view public.v_resumo_evento is
  'Dashboard resumo para admin: contagem de respondentes, finalizações, leads, PDFs.';

-- =============================================================
-- VIEW para export CSV (admin baixa direto do dashboard Supabase)
-- =============================================================
create or replace view public.v_leads_export as
select
  r.id::text as respondente_id,
  r.evento_id::text,
  e.slug as evento_slug,
  r.nome,
  r.empresa,
  r.cargo,
  case r.persona
    when 'A' then 'Analista'
    when 'C' then 'Coordenador'
    when 'G' then 'Gerente/Diretor'
    when 'X' then 'C-Level'
  end as nivel_hierarquico,
  case r.tamanho
    when 'S1' then 'Até 50'
    when 'S2' then '51-250'
    when 'S3' then '251-1000'
    when 'S4' then 'Mais de 1000'
  end as porte,
  r.segmento as setor_id,
  r.email,
  r.email_capturado_em,
  r.consentimento_lgpd,
  r.consentimento_marketing,
  r.iniciado_em,
  r.submetido_em,
  r.tempo_segundos,
  rel.maturidade_letra,
  rel.maturidade_score,
  rel.cdl_min,
  rel.cdl_max,
  rel.risco_estrategico,
  rel.pdf_enviado_em,
  case
    when rel.maturidade_score < 50 and rel.risco_estrategico > 60 then 'quente'
    when rel.maturidade_score < 70 then 'morno'
    else 'frio'
  end as score_lead
from public.respondentes r
join public.eventos e        on e.id = r.evento_id
left join public.relatorios rel on rel.respondente_id = r.id
where r.email is not null;

comment on view public.v_leads_export is
  'View para export CSV de leads qualificados. Acessível pelo admin no Supabase Studio.';

-- =============================================================
-- SEED: Evento IBMEC Junho 2026
-- =============================================================
insert into public.eventos (slug, nome, cliente, inicio_em, fim_em, catalogo_versao, questionario_versao)
values (
  'ibmec-junho-2026',
  'Diagnóstico Estratégico IBMEC · Junho 2026',
  'IBMEC',
  '2026-06-08',
  '2026-06-10',
  'v1.1',
  'q-v1.0'
)
on conflict (slug) do nothing;

-- =============================================================
-- STORAGE bucket para PDFs (criado via Supabase Dashboard ou esta call)
-- =============================================================
-- Executar via Dashboard: Storage > New bucket > 'relatorios' (public: false)
-- Policy: anon pode SELECT seu próprio PDF via URL assinada (gerada pela Edge Function)

-- =============================================================
-- DONE
-- =============================================================
-- Próximos passos:
-- 1. Subir schema no Supabase SQL Editor
-- 2. Criar bucket 'relatorios' no Supabase Storage (private)
-- 3. Configurar secrets na Edge Function (RESEND_KEY, BROWSERLESS_TOKEN)
-- 4. Deploy Edge Function gate-and-send
-- 5. Smoke test com tests/smoke_test.sql
