-- =============================================================
-- SCREENER_RHIA — purga por retenção. O vínculo DECLARAVA prazos; agora eles
-- acontecem.
--
-- O vínculo público declara `session_retention_days = 180` e
-- `lead_retention_days = 365`. Declarar não apaga nada: sem um job, o prazo era
-- uma promessa guardada numa coluna. Isto é o compromisso de privacidade
-- registrado em screener/rhia/LIMITES-METODOLOGICOS.md saindo do papel.
--
-- OS PRAZOS VÊM DO VÍNCULO, e só dele. **Vínculo que não declarou retenção não
-- é purgado** — não há prazo padrão escondido aqui. O CHECK de
-- `20260902143339` só exige retenção não-nula em `public_pilot`/`published`,
-- então um vínculo em `internal_preview` pode legitimamente não ter política; e
-- inventar uma por ele seria esta função decidindo o que o vínculo calou.
--
-- O QUE CADA PRAZO PROTEGE — e por que a purga tem duas fases.
-- `screener_rhia_leads.session_id` é `on delete restrict` e `unique`, e o lead
-- vive MAIS que a sessão (365 contra 180). Não dá para apagar a sessão aos 180
-- enquanto o lead existe. A saída não é encurtar o lead nem esticar a sessão:
--
--   * 180 dias protegem o CONTEÚDO DA AVALIAÇÃO — respostas e resultado. Isso é
--     apagado no prazo, sempre, para todo mundo.
--   * 365 dias protegem o CONTATO (a PII, na tabela de leads) **e o registro da
--     sessão a que ele está vinculado**.
--
-- Sendo preciso, porque a versão anterior deste cabeçalho não era: a linha de
-- sessão que sobrevive dos 180 aos 365 **não é anônima**. Ela guarda
-- `token_hash`, `created_at`, `submitted_at`, `binding_id` e o registro de
-- ciência do aviso de privacidade — e continua ligada à PII pelo `session_id`
-- único do lead. Quem tem as duas tabelas sabe que aquele e-mail respondeu
-- naquele dia. Portanto: **o registro de sessão de quem virou lead é retido por
-- 365 dias, não 180**, e é assim que está escrito em LIMITES-METODOLOGICOS.md.
-- Quem não deixou contato tem tudo apagado aos 180.
--
-- ORDEM REAL DE EXCLUSÃO (não há cascata nos snapshots, de propósito — o
-- resultado é imutável e não some por efeito colateral):
--   fase 1: snapshots → respostas → sessões sem lead
--   fase 2: leads vencidos → cascas que o lead liberou
--
-- A função devolve as contagens separadas, inclusive as duas categorias de
-- sessão, para o job deixar rastro útil e não uma soma que esconde a diferença.
--
-- ROLLBACK (completo — `drop function` exige ser dono, e a dona é screener_owner):
--
--   select cron.unschedule('boomit_screener_rhia_purga_v1');
--   grant screener_owner to current_user;
--   drop function public.screener_rhia_purga();
--   revoke screener_owner from current_user;
--
-- O `pg_cron` fica: quem o instalou foi a 20260904120000, e o job de rate
-- limiting depende dele.
-- =============================================================

grant screener_owner to current_user;

-- Para SER dona de objeto em `public`, `screener_owner` precisa de CREATE no
-- schema — é a regra do ALTER ... OWNER, registrada na 20260903120000 e usada
-- por todas as migrations que transferem propriedade. O CREATE é TRANSITÓRIO e
-- é revogado no fim deste arquivo. Sem isto, o ALTER OWNER abaixo falha com
-- `permission denied for schema public` no Supabase (onde `postgres` NÃO é
-- superusuário) — e passa despercebido no pglite, onde é.
do $$ begin grant create on schema public to screener_owner;
exception when insufficient_privilege then set local role pg_database_owner;
  grant create on schema public to screener_owner; reset role; end $$;

-- `create function`, não `create or replace`: a função é nova. Se já existir
-- uma homônima (teste manual, rollback pela metade), queremos o erro. Um
-- `or replace` a substituiria calada MANTENDO O DONO ANTIGO — e uma função
-- SECURITY DEFINER com dono errado não alcança as tabelas, falhando em silêncio
-- dentro do cron por seis meses, até alguém notar que nada foi purgado.
create function public.screener_rhia_purga()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_snap int := 0; v_resp int := 0; v_sem_lead int := 0; v_lead int := 0; v_cascas int := 0;
begin
  -- ---------- FASE 1 — o conteúdo da avaliação, aos 180 dias ----------
  -- Snapshot primeiro: é ele que segura a sessão por chave estrangeira.
  delete from public.screener_rhia_result_snapshots n
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where n.session_id = s.id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days);
  get diagnostics v_snap = row_count;

  delete from public.screener_rhia_responses r
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where r.session_id = s.id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days);
  get diagnostics v_resp = row_count;

  -- Quem nunca deixou contato sai inteiro agora.
  delete from public.screener_rhia_sessions s
   using public.screener_event_bindings b
   where b.id = s.binding_id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days)
     and not exists (select 1 from public.screener_rhia_leads l where l.session_id = s.id);
  get diagnostics v_sem_lead = row_count;

  -- ---------- FASE 2 — o contato, no prazo dele ----------
  delete from public.screener_rhia_leads l
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where l.session_id = s.id
     and b.lead_retention_days is not null
     and l.created_at < now() - make_interval(days => b.lead_retention_days);
  get diagnostics v_lead = row_count;

  -- As sessões que só continuavam de pé porque um lead apontava para elas.
  -- É o MESMO comando da fase 1, de novo: o que mudou foi o mundo entre os dois
  -- — os leads vencidos saíram. A contagem fica separada de propósito, porque
  -- "nunca teve contato" e "o contato venceu" são fatos diferentes.
  delete from public.screener_rhia_sessions s
   using public.screener_event_bindings b
   where b.id = s.binding_id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days)
     and not exists (select 1 from public.screener_rhia_leads l where l.session_id = s.id);
  get diagnostics v_cascas = row_count;

  return jsonb_build_object(
    'snapshots', v_snap, 'respostas', v_resp,
    'sessoes_sem_contato', v_sem_lead, 'sessoes_liberadas_pelo_contato', v_cascas,
    'contatos', v_lead, 'em', now());
end $$;

comment on function public.screener_rhia_purga() is
  'Purga por retencao do rhia. Prazos vem do vinculo; vinculo sem retencao declarada nao e purgado. 180 dias apagam o conteudo da avaliacao (respostas e snapshot) de todos; a linha de sessao de quem deixou contato sobrevive ate os 365 dias do contato, porque continua ligada a PII pelo session_id unico do lead — ela NAO e anonima.';

alter function public.screener_rhia_purga() owner to screener_owner;

-- A função APAGA dados. Nenhum papel público pode alcançá-la. Função nasce com
-- EXECUTE para PUBLIC, então o `revoke ... from public` é o que importa aqui.
-- O EXECUTE vai para `current_user`, não para um nome cravado: quem aplica esta
-- migration é quem agenda o job logo abaixo, e portanto é o executor do cron.
revoke all on function public.screener_rhia_purga()
  from public, anon, authenticated, service_role, screener_runtime;
grant execute on function public.screener_rhia_purga() to current_user;

-- Guarda de aceitação da fronteira (roda também no pglite).
do $$
begin
  if pg_get_userbyid((select proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'screener_rhia_purga')) <> 'screener_owner' then
    raise exception 'a purga ficou com dono errado — SECURITY DEFINER com dono errado nao alcanca as tabelas';
  end if;
  if has_function_privilege('anon', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('authenticated', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('service_role', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('screener_runtime', 'public.screener_rhia_purga()', 'execute') then
    raise exception 'a purga ficou alcancavel por papel que nao deveria executa-la';
  end if;
end $$;

-- fecha a fronteira: CREATE no schema era transitório, e a membership também
do $$ begin revoke create on schema public from screener_owner;
exception when insufficient_privilege then set local role pg_database_owner;
  revoke create on schema public from screener_owner; reset role; end $$;
revoke screener_owner from current_user;

-- @@@CRON@@@  (obrigatório; ignorado só nos testes pglite)
-- Agendamento com nome VERSIONADO, sem unschedule destrutivo, e validação do que
-- ficou cadastrado. Diário às 03:17 UTC: fora do pico e em minuto quebrado, para
-- não disputar com a coleta de rate, que roda a cada 15 minutos em minuto redondo.
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
  -- A amarração que interessa: QUEM O CRON USA é QUEM PODE EXECUTAR. Conferir um
  -- nome fixo não provaria nada se o job fosse agendado por outro papel.
  if not has_function_privilege(v_job.username, 'public.screener_rhia_purga()', 'execute') then
    raise exception 'o executor do cron (%) nao pode executar a purga', v_job.username; end if;
end $$;
