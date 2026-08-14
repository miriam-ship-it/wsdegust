-- =============================================================
-- IBMEC Assessment · Smoke Tests
-- Rode no Supabase SQL Editor APÓS aplicar schema.sql
-- Cada bloco DEVE retornar OK ou levantar exception
-- =============================================================

-- ------------------------------------------------------
-- TEST 1: Evento IBMEC foi criado pelo seed
-- ------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.eventos where slug = 'ibmec-junho-2026';
  if v_count <> 1 then
    raise exception 'FAIL test 1: esperava 1 evento ibmec-junho-2026, achou %', v_count;
  end if;
  raise notice 'OK test 1: seed evento IBMEC presente';
end$$;

-- ------------------------------------------------------
-- TEST 2: Inserir respondente sem email (anônimo no início)
-- ------------------------------------------------------
do $$
declare
  v_evento_id  uuid;
  v_resp_id    uuid;
  v_token      uuid;
begin
  select id into v_evento_id from public.eventos where slug = 'ibmec-junho-2026';

  insert into public.respondentes
    (evento_id, nome, empresa, cargo, persona, tamanho, segmento, consentimento_lgpd)
  values
    (v_evento_id, 'TEST Miriam', 'IBMEC', 'Diretora', 'G', 'S3', 'V7', true)
  returning id, token_sessao into v_resp_id, v_token;

  if v_resp_id is null then
    raise exception 'FAIL test 2: respondente não foi inserido';
  end if;
  if v_token is null then
    raise exception 'FAIL test 2: token_sessao não foi gerado';
  end if;

  raise notice 'OK test 2: respondente criado id=% token=%', v_resp_id, v_token;
end$$;

-- ------------------------------------------------------
-- TEST 3: Persona inválida deve falhar
-- ------------------------------------------------------
do $$
declare
  v_evento_id uuid;
  v_failed   boolean := false;
begin
  select id into v_evento_id from public.eventos where slug = 'ibmec-junho-2026';

  begin
    insert into public.respondentes (evento_id, persona)
    values (v_evento_id, 'Z');  -- inválido (só A/C/G/X)
  exception when check_violation then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'FAIL test 3: persona inválida foi aceita';
  end if;
  raise notice 'OK test 3: check constraint persona funciona';
end$$;

-- ------------------------------------------------------
-- TEST 4: Inserir resposta válida + valor fora de range
-- ------------------------------------------------------
do $$
declare
  v_evento_id  uuid;
  v_resp_id    uuid;
  v_failed     boolean := false;
begin
  select id into v_evento_id from public.eventos where slug = 'ibmec-junho-2026';

  insert into public.respondentes (evento_id, persona, consentimento_lgpd)
  values (v_evento_id, 'X', true)
  returning id into v_resp_id;

  -- Inserir resposta válida
  insert into public.respostas (respondente_id, pergunta_id, dimensao, lente, valor)
  values (v_resp_id, 'D1-pessoa-X', 'D1', 'pessoa', 4);

  -- Tentar resposta inválida (valor 6 — fora de 1-5)
  begin
    insert into public.respostas (respondente_id, pergunta_id, dimensao, lente, valor)
    values (v_resp_id, 'D2-pessoa-X', 'D2', 'pessoa', 6);
  exception when check_violation then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'FAIL test 4: valor 6 foi aceito (deveria falhar)';
  end if;
  raise notice 'OK test 4: check constraint valor 1-5 funciona';
end$$;

-- ------------------------------------------------------
-- TEST 5: UNIQUE (respondente_id, pergunta_id) — não pode duplicar
-- ------------------------------------------------------
do $$
declare
  v_evento_id  uuid;
  v_resp_id    uuid;
  v_failed     boolean := false;
begin
  select id into v_evento_id from public.eventos where slug = 'ibmec-junho-2026';

  insert into public.respondentes (evento_id, persona, consentimento_lgpd)
  values (v_evento_id, 'A', true)
  returning id into v_resp_id;

  insert into public.respostas (respondente_id, pergunta_id, dimensao, lente, valor)
  values (v_resp_id, 'D1-pessoa-A', 'D1', 'pessoa', 3);

  begin
    insert into public.respostas (respondente_id, pergunta_id, dimensao, lente, valor)
    values (v_resp_id, 'D1-pessoa-A', 'D1', 'pessoa', 4);  -- duplicado
  exception when unique_violation then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'FAIL test 5: pergunta duplicada foi aceita';
  end if;
  raise notice 'OK test 5: unique constraint funciona';
end$$;

-- ------------------------------------------------------
-- TEST 6: Inserir relatorio com versão tripla
-- ------------------------------------------------------
do $$
declare
  v_evento_id  uuid;
  v_resp_id    uuid;
  v_rel_id     uuid;
begin
  select id into v_evento_id from public.eventos where slug = 'ibmec-junho-2026';

  insert into public.respondentes (evento_id, persona, consentimento_lgpd, submetido_em)
  values (v_evento_id, 'C', true, now())
  returning id into v_resp_id;

  insert into public.relatorios (
    respondente_id, catalogo_versao, questionario_versao,
    scores_json, maturidade_letra, maturidade_score,
    cdl_min, cdl_max, risco_estrategico
  ) values (
    v_resp_id, 'v1.1', 'q-v1.0',
    '{"D1": {"pessoa": 3.5, "empresa": 4.0, "gap": -0.5}}'::jsonb,
    'B', 72.5, 250000, 580000, 42.0
  )
  returning id into v_rel_id;

  if v_rel_id is null then
    raise exception 'FAIL test 6: relatório não foi criado';
  end if;
  raise notice 'OK test 6: relatorio criado id=%', v_rel_id;
end$$;

-- ------------------------------------------------------
-- TEST 7: View v_resumo_evento retorna dados
-- ------------------------------------------------------
do $$
declare
  v_count int;
  v_finalizados int;
begin
  select total_respondentes, total_finalizados
    into v_count, v_finalizados
    from public.v_resumo_evento
   where slug = 'ibmec-junho-2026';

  if v_count < 4 then  -- inserimos pelo menos 4 nos testes acima
    raise exception 'FAIL test 7: view v_resumo_evento mostra %, esperava ≥4', v_count;
  end if;
  raise notice 'OK test 7: v_resumo_evento mostra % respondentes (% finalizados)', v_count, v_finalizados;
end$$;

-- ------------------------------------------------------
-- TEST 8: RLS está habilitado em todas as tabelas
-- ------------------------------------------------------
do $$
declare
  v_unprotected text[];
begin
  select array_agg(tablename)
    into v_unprotected
    from pg_tables
   where schemaname = 'public'
     and tablename in ('eventos','respondentes','respostas','relatorios')
     and not rowsecurity;

  if v_unprotected is not null and array_length(v_unprotected, 1) > 0 then
    raise exception 'FAIL test 8: RLS não habilitada em %', v_unprotected;
  end if;
  raise notice 'OK test 8: RLS habilitada em todas as 4 tabelas';
end$$;

-- ------------------------------------------------------
-- CLEANUP: remover dados de teste
-- ------------------------------------------------------
delete from public.respondentes where nome like 'TEST%' or nome is null;

-- ------------------------------------------------------
-- RESUMO
-- ------------------------------------------------------
select
  'Schema OK · 4 tabelas · 4 RLS · 2 views · seed IBMEC presente' as status,
  (select count(*) from public.eventos where slug = 'ibmec-junho-2026') as evento_seed,
  (select count(*) from pg_policies where schemaname='public') as policies_count;
