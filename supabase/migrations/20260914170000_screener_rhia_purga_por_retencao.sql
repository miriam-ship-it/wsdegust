-- =============================================================
-- SCREENER_RHIA — purga por retenção. O vínculo DECLARAVA prazos; agora eles
-- acontecem.
--
-- O vínculo público declara `session_retention_days = 180` e
-- `lead_retention_days = 365`. Declarar não apaga nada: sem um job, o prazo era
-- uma promessa no banco de dados e nada mais. Isto é o compromisso de
-- privacidade registrado em screener/rhia/LIMITES-METODOLOGICOS.md saindo do
-- papel.
--
-- OS PRAZOS SÃO LIDOS DO VÍNCULO, não escritos aqui. Mudar a política é mudar
-- uma linha em `screener_event_bindings`, não outra migration.
--
-- O PROBLEMA QUE OBRIGA A PURGA A TER DUAS FASES: `screener_rhia_leads.session_id`
-- é `on delete restrict`, e o lead vive MAIS que a sessão (365 contra 180). Não
-- dá para apagar a sessão aos 180 dias enquanto o lead existe. A saída não é
-- encurtar o lead nem esticar a sessão — é entender o que cada prazo protege:
--
--   * 180 dias protegem o CONTEÚDO DA AVALIAÇÃO: as respostas e o resultado.
--     Isso é apagado no prazo, sempre.
--   * 365 dias protegem o CONTATO, que é a PII e mora na tabela de leads.
--   * A linha da sessão em si é anônima — só hash de token, sem PII, como o
--     próprio comentário da tabela diz. Quando ela sobrevive aos 180 dias, é
--     uma casca vazia mantida só porque o lead ainda aponta para ela, e ela sai
--     junto com o lead aos 365.
--
-- Ordem obrigatória de exclusão (descoberta na prática, apagando dados de teste):
-- snapshots → leads → respostas → sessões. Não há cascata nos snapshots, de
-- propósito: o resultado é imutável e não some por efeito colateral.
--
-- A função devolve um resumo com as contagens, para o job deixar rastro.
-- Aditiva e reversível: `cron.unschedule('boomit_screener_rhia_purga_v1')` e
-- `drop function public.screener_rhia_purga()`.
-- =============================================================

grant screener_owner to current_user;

create or replace function public.screener_rhia_purga()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_resp int := 0; v_snap int := 0; v_lead int := 0; v_sess int := 0; v_casca int := 0;
begin
  -- FASE 1 — conteúdo de avaliação além da retenção de SESSÃO.
  -- Snapshot primeiro: é ele que segura a sessão por chave estrangeira.
  delete from public.screener_rhia_result_snapshots n
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where n.session_id = s.id
     and s.created_at < now() - make_interval(days => coalesce(b.session_retention_days, 180));
  get diagnostics v_snap = row_count;

  delete from public.screener_rhia_responses r
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where r.session_id = s.id
     and s.created_at < now() - make_interval(days => coalesce(b.session_retention_days, 180));
  get diagnostics v_resp = row_count;

  -- Sessões vencidas que NÃO deixaram lead saem inteiras agora.
  delete from public.screener_rhia_sessions s
   using public.screener_event_bindings b
   where b.id = s.binding_id
     and s.created_at < now() - make_interval(days => coalesce(b.session_retention_days, 180))
     and not exists (select 1 from public.screener_rhia_leads l where l.session_id = s.id);
  get diagnostics v_sess = row_count;

  -- FASE 2 — o CONTATO, que tem prazo próprio e mais longo.
  delete from public.screener_rhia_leads l
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where l.session_id = s.id
     and l.created_at < now() - make_interval(days => coalesce(b.lead_retention_days, 365));
  get diagnostics v_lead = row_count;

  -- As cascas anônimas que só existiam para o lead apontar saem com ele.
  delete from public.screener_rhia_sessions s
   using public.screener_event_bindings b
   where b.id = s.binding_id
     and s.created_at < now() - make_interval(days => coalesce(b.session_retention_days, 180))
     and not exists (select 1 from public.screener_rhia_leads l where l.session_id = s.id);
  get diagnostics v_casca = row_count;

  return jsonb_build_object(
    'snapshots', v_snap, 'respostas', v_resp,
    'sessoes', v_sess + v_casca, 'leads', v_lead, 'em', now());
end $$;

alter function public.screener_rhia_purga() owner to screener_owner;

-- A função APAGA dados. Nenhum papel público pode alcançá-la; só o executor do
-- cron, que hoje é `postgres` (conferido em cron.job.username).
revoke all on function public.screener_rhia_purga()
  from public, anon, authenticated, service_role, screener_runtime;
grant execute on function public.screener_rhia_purga() to postgres;

-- Guarda de aceitação: fronteira fechada e a função executável só por quem deve.
do $$
begin
  if has_function_privilege('anon', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('authenticated', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('service_role', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('screener_runtime', 'public.screener_rhia_purga()', 'execute') then
    raise exception 'a purga ficou alcancavel por papel que nao deveria executa-la';
  end if;
  if not has_function_privilege('postgres', 'public.screener_rhia_purga()', 'execute') then
    raise exception 'o executor do cron perdeu o execute na purga';
  end if;
end $$;

revoke screener_owner from current_user;

-- @@@CRON@@@  (obrigatório; ignorado só nos testes pglite)
-- Agendamento com nome VERSIONADO, sem unschedule destrutivo, e validação do que
-- ficou cadastrado. Diário às 03:17 UTC: fora do pico e em minuto quebrado, para
-- não disputar com a coleta de rate que roda a cada 15 minutos em minuto redondo.
do $$
declare v_jobid bigint; v_job record;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise exception 'pg_cron indisponivel: a retencao declarada no vinculo nao pode ser cumprida — abortando'; end if;
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'boomit_screener_rhia_purga_v1') then
    raise exception 'job boomit_screener_rhia_purga_v1 ja existe — migration inedita nao deve encontra-lo'; end if;
  v_jobid := cron.schedule('boomit_screener_rhia_purga_v1', '17 3 * * *', 'select public.screener_rhia_purga()');
  select * into v_job from cron.job where jobid = v_jobid;
  if v_job.jobname <> 'boomit_screener_rhia_purga_v1'
     or v_job.schedule <> '17 3 * * *'
     or v_job.command <> 'select public.screener_rhia_purga()'
     or v_job.active is not true
     or v_job.username is null then
    raise exception 'job cadastrado invalido: %', row_to_json(v_job); end if;
end $$;
