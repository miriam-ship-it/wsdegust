-- =============================================================
-- RLS: anon deixa de enxergar tudo e passa a enxergar SÓ A PRÓPRIA SESSÃO
--
-- Antes: respondentes/respostas/relatorios tinham policies de anon com
-- `using (true)`. A anon key é pública (está no HTML servido e no repo), então
-- qualquer pessoa lia nome, empresa, cargo e e-mail de todos os respondentes —
-- e, pelo UPDATE aberto, podia alterá-los. Eram 71 pessoas.
--
-- Agora: o front gera o token da sessão, manda no cabeçalho `x-sessao`, e a
-- policy só devolve a linha cujo token bate. Sem cabeçalho, zero linha.
--
-- ⚠️ Esta migration EXIGE o front que manda o cabeçalho. Um front antigo, que
--    deixa o token nascer no default da coluna, para de conseguir criar
--    respondente: o RETURNING do INSERT passa pela policy de SELECT e volta
--    vazio.
-- =============================================================

-- O token que veio no cabeçalho desta requisição. Texto, não uuid: cabeçalho é
-- entrada de fora, e um valor malformado deve devolver nada — nunca estourar.
create or replace function public.sessao_do_cabecalho()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-sessao', '')
$$;

comment on function public.sessao_do_cabecalho() is
  'Token de sessão enviado pelo front no cabeçalho x-sessao. Base das policies de anon.';

-- ----- RESPONDENTES -----
drop policy if exists "respondentes_anon_select" on public.respondentes;
create policy "respondentes_anon_select_propria_sessao"
  on public.respondentes for select
  to anon
  using (token_sessao::text = public.sessao_do_cabecalho());

-- O front nunca faz UPDATE direto: quem grava e-mail e consentimento é a edge
-- function `gate-and-send`, que roda com service_role e não passa por RLS.
drop policy if exists "respondentes_anon_update" on public.respondentes;

-- INSERT segue aberto (é como a pessoa entra), mas só em evento ativo.
drop policy if exists "respondentes_anon_insert" on public.respondentes;
create policy "respondentes_anon_insert_evento_ativo"
  on public.respondentes for insert
  to anon
  with check (evento_id in (select id from public.eventos where ativo = true));

-- ----- RESPOSTAS -----
drop policy if exists "respostas_anon_select" on public.respostas;
create policy "respostas_anon_select_propria_sessao"
  on public.respostas for select
  to anon
  using (respondente_id in (
    select id from public.respondentes
    where token_sessao::text = public.sessao_do_cabecalho()));

drop policy if exists "respostas_anon_insert" on public.respostas;
create policy "respostas_anon_insert_propria_sessao"
  on public.respostas for insert
  to anon
  with check (respondente_id in (
    select id from public.respondentes
    where token_sessao::text = public.sessao_do_cabecalho()));

-- 🔴 Faltava UPDATE. O front salva resposta com upsert(onConflict); quem
-- VOLTAVA e trocava uma resposta caía no conflito, o update era negado e o
-- erro morria em console.warn('offline?'). A correção da resposta não chegava
-- no banco e ninguém via. Agora chega — e só na própria sessão.
drop policy if exists "respostas_anon_update" on public.respostas;
create policy "respostas_anon_update_propria_sessao"
  on public.respostas for update
  to anon
  using (respondente_id in (
    select id from public.respondentes
    where token_sessao::text = public.sessao_do_cabecalho()))
  with check (respondente_id in (
    select id from public.respondentes
    where token_sessao::text = public.sessao_do_cabecalho()));

-- ----- RELATORIOS -----
-- O front nunca lê esta tabela: o relatório é calculado na tela e a
-- `gate-and-send` devolve o que precisa. Anon não tem o que fazer aqui.
drop policy if exists "relatorios_anon_select" on public.relatorios;

-- ----- EVENTOS -----
-- Segue legível por anon (só slug/versões, sem PII) — é como o front resolve
-- o evento pelo slug antes de existir sessão.
