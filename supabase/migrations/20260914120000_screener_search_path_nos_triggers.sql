-- =============================================================
-- SCREENER — search_path fixo nas duas funções de trigger de snapshot.
--
-- POR QUE: o advisor de segurança do Supabase (function_search_path_mutable)
-- aponta `public.screener_snapshot_impede_update` (V1, desde a 20260902143339)
-- e `public.screener_rhia_snapshot_impede_update` (rhia, desde a 20260912120000):
-- as duas nasceram sem `search_path` fixo. Todas as RPC `screener_*_op_*` já
-- nascem com `search_path = ''`; estas duas escaparam porque são funções de
-- trigger, não RPC.
--
-- RISCO REAL, MEDIDO ANTES DE ESCREVER ESTA MIGRATION: **baixo**. Nenhuma das
-- duas é `SECURITY DEFINER` — ambas rodam com o privilégio de quem invoca —, e
-- as duas pertencem a `screener_owner`. Não há, portanto, caminho de escalada:
-- um `search_path` hostil não faz a função ganhar privilégio que o invocador já
-- não tenha. O que existe é uma lacuna de higiene, e o advisor está certo em
-- apontá-la.
--
-- POR QUE É SEGURO FIXAR: o corpo das duas é uma única instrução `raise
-- exception` com string literal. Não há referência a tabela, tipo, função ou
-- operador que dependa do `search_path` — `pg_catalog` continua implícito. O
-- comportamento observável não muda: UPDATE no snapshot continua sendo recusado
-- com a mesma mensagem.
--
-- ALCANCE: esta migration ALTERA UMA FUNÇÃO DO V1. É a única coisa neste
-- conjunto de trabalho que toca o V1, e toca por endurecimento, não por
-- mudança de comportamento — o teste comportamental prova que o trigger segue
-- recusando o UPDATE depois do ALTER.
--
-- ROLLBACK (completo — o `reset` sozinho não basta, porque ALTER FUNCTION exige
-- ser dono e a membership precisa ser retomada e devolvida):
--
--   grant screener_owner to current_user;
--   alter function public.screener_snapshot_impede_update()      reset search_path;
--   alter function public.screener_rhia_snapshot_impede_update() reset search_path;
--   revoke screener_owner from current_user;
--
-- Desfazer devolve o WARN `function_search_path_mutable` do advisor nas duas.
-- =============================================================

-- As funções pertencem a `screener_owner` e ALTER FUNCTION exige ser dono.
-- Mesma membership temporária que a 20260903120000 e as seguintes já usam.
grant screener_owner to current_user;

alter function public.screener_snapshot_impede_update()      set search_path = '';
alter function public.screener_rhia_snapshot_impede_update() set search_path = '';

-- Guarda de aceitação: se qualquer uma das duas ficar sem `search_path`, a
-- migration falha aqui em vez de passar silenciosamente e reaparecer no advisor.
do $$
declare
  achadas int;
  corretas int;
begin
  select count(*),
         count(*) filter (
           where p.proconfig is not null
             and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')
         )
    into achadas, corretas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('screener_snapshot_impede_update', 'screener_rhia_snapshot_impede_update');

  -- Duas checagens, não uma. Contar só as "corretas" deixaria a guarda passar
  -- calada se uma das funções sumisse: zero de zero é cem por cento.
  if achadas <> 2 then
    raise exception 'esperava as 2 funcoes de trigger, encontrei %', achadas;
  end if;
  -- Exige o search_path VAZIO, não um qualquer: `set search_path = public`
  -- silenciaria o advisor sem fechar a lacuna.
  if corretas <> 2 then
    raise exception 'search_path nao ficou vazio em % das 2 funcoes', 2 - corretas;
  end if;
end $$;

-- fecha a fronteira: revoga a membership temporária.
-- Sem esta linha o usuário da migration sai membro PERMANENTE de screener_owner,
-- o papel dono das tabelas isoladas — exatamente a fronteira que o V1 ergueu.
-- As cinco migrations anteriores que pegam a membership todas a devolvem.
revoke screener_owner from current_user;
