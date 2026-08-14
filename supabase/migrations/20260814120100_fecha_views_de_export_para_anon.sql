-- =============================================================
-- O BURACO QUE FAZIA A RLS NÃO VALER NADA
--
-- v_leads_export e v_resumo_evento são views SECURITY DEFINER com dono
-- postgres: elas consultam as tabelas com a permissão de QUEM AS CRIOU, não
-- de quem pergunta. Resultado: mesmo depois de apertar a RLS, `anon` (chave
-- pública) ainda lia 57 linhas de v_leads_export — nome, empresa e e-mail de
-- todo respondente que deixou contato. A view passava por cima da policy.
--
-- Sem esta migration, a anterior é cosmética.
--
-- Duas travas, não uma:
--   1. tirar o SELECT de anon — quem exporta lead é o painel, e o painel
--      loga (role `authenticated`);
--   2. ligar security_invoker: a view passa a rodar com a permissão de quem
--      pergunta, então mesmo que alguém devolva o SELECT para anon por
--      engano, a RLS volta a valer dentro dela.
-- =============================================================

revoke select on public.v_leads_export  from anon;
revoke select on public.v_resumo_evento from anon;

alter view public.v_leads_export  set (security_invoker = on);
alter view public.v_resumo_evento set (security_invoker = on);

-- search_path fixo: sem isso, quem controla o search_path da sessão pode
-- fazer a função resolver outro objeto com o mesmo nome.
alter function public.sessao_do_cabecalho() set search_path = public, pg_temp;
