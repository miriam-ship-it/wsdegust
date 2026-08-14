-- =============================================================
-- QUEM LOGA VÊ SÓ O EVENTO QUE É DELE
--
-- Antes: authenticated tinha `for all using (true)` nas quatro tabelas. Todo
-- usuário criado enxergava os 57 leads do IBMEC junto com os da Boomit — e,
-- por ser ALL e não SELECT, podia APAGAR os 71 respondentes. Cadastrar gente
-- da empresa nesse estado desfaria a separação por evento feita em 14/08.
--
-- Agora: uma tabela diz quem cuida de qual evento, e as policies filtram por
-- ela. O painel só lê (verificado: nenhum insert/update/delete em admin.html),
-- então authenticated perde ALL e fica com SELECT.
--
-- A amarração é por E-MAIL, não por user_id, de propósito: assim dá para
-- liberar o acesso de alguém ANTES de a conta existir, e o convite do Supabase
-- (a pessoa escolhe a própria senha) funciona sem ninguém trocar senha.
--
-- MEDIDO (role authenticated, em transação com rollback):
--   miriam@boomit.com.br         -> 2 eventos, 71 respondentes, 57 leads
--   thamiryssilva@boomit.com.br  -> 1 evento (boomit-degustacao), 0, 0
--   logado fora da tabela        -> 0, 0, 0
--   delete from respondentes     -> 0 linhas apagadas
--   anon (formulário público)    -> acha o evento, 0 respondentes
-- =============================================================

create table if not exists public.admin_eventos (
  email      text not null,
  evento_id  uuid not null references public.eventos(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (email, evento_id)
);

comment on table public.admin_eventos is
  'Quem enxerga qual evento no painel. Gerenciada pelo dashboard/service_role — authenticated só lê a própria linha.';

alter table public.admin_eventos enable row level security;

drop policy if exists "admin_eventos_le_a_propria_linha" on public.admin_eventos;
create policy "admin_eventos_le_a_propria_linha"
  on public.admin_eventos for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Os eventos que o usuário desta requisição pode ver. O e-mail vem do JWT, que
-- o Supabase assina — não é entrada livre como o cabeçalho do formulário.
create or replace function public.eventos_do_usuario()
returns setof uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select evento_id from public.admin_eventos
  where lower(email) = lower(auth.jwt() ->> 'email')
$$;

comment on function public.eventos_do_usuario() is
  'Eventos que o usuário logado enxerga. Base das policies de authenticated.';

-- ----- as quatro policies: de ALL/true para SELECT/filtrado -----
drop policy if exists "eventos_admin_all" on public.eventos;
create policy "eventos_admin_select_dos_seus"
  on public.eventos for select
  to authenticated
  using (id in (select public.eventos_do_usuario()));

drop policy if exists "respondentes_admin_all" on public.respondentes;
create policy "respondentes_admin_select_dos_seus"
  on public.respondentes for select
  to authenticated
  using (evento_id in (select public.eventos_do_usuario()));

drop policy if exists "respostas_admin_all" on public.respostas;
create policy "respostas_admin_select_dos_seus"
  on public.respostas for select
  to authenticated
  using (respondente_id in (
    select id from public.respondentes
    where evento_id in (select public.eventos_do_usuario())));

drop policy if exists "relatorios_admin_all" on public.relatorios;
create policy "relatorios_admin_select_dos_seus"
  on public.relatorios for select
  to authenticated
  using (respondente_id in (
    select id from public.respondentes
    where evento_id in (select public.eventos_do_usuario())));

-- ----- quem cuida de quê -----
-- (dado, não estrutura: repetir é seguro por causa do on conflict)
insert into public.admin_eventos (email, evento_id)
select 'miriam@boomit.com.br', id from public.eventos
union all
select 'thamiryssilva@boomit.com.br', id from public.eventos where slug = 'boomit-degustacao'
on conflict do nothing;
