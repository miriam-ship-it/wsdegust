-- =============================================================
-- PONTE ENTRE OS DOIS DIAGNÓSTICOS — liderança e RH+IA na mesma pessoa.
--
-- O PROBLEMA. Os dois nascem de fluxos com identidades separadas: a liderança
-- identifica por `respondentes.token_sessao`, com nome, empresa e cargo
-- declarados no começo; o rhia é anônimo e só captura contato no portão, no
-- fim. Medido em 15/09: 108 respondentes de liderança, 3 leads de rhia, e
-- **zero** pessoas nos dois. Sem ponte, não existe documento único.
--
-- A DECISÃO (dona do produto, 15/09): caminho (c) com (a) como rede.
--   (c) quem termina a liderança recebe o link do rhia com um CONVITE, e as duas
--       metades passam a apontar para a mesma pessoa — ligação CERTA;
--   (a) quem chegou pelos dois lados em momentos diferentes é reconciliado pelo
--       e-mail — ligação PROVÁVEL, nunca tratada como certa.
--
-- POR QUE UM CONVITE, E NÃO O TOKEN NA URL. A regra da casa é que token de
-- sessão só trafega em cabeçalho, nunca em URL, query string ou HTML. Colocar
-- `token_sessao` no link violaria isso e exporia a sessão da liderança em
-- histórico de navegador, em link compartilhado e em referer. O convite é outra
-- coisa: opaco, de uso único, com validade, e que não dá acesso a nada da
-- liderança — só diz "esta sessão de rhia pertence àquela pessoa".
--
-- E o convite, como o token, **nunca é gravado cru**: guardamos só o sha256,
-- exatamente como `screener_rhia_sessions.token_hash`.
--
-- ISOLAMENTO PRESERVADO. Nenhuma tabela existente muda. A ponte é uma tabela
-- nova, com chave estrangeira para os dois lados — removê-la desfaz a ligação
-- sem tocar em nenhum dos dois diagnósticos.
-- =============================================================

grant screener_owner to current_user;
do $$
begin
  grant create on schema public to screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  grant create on schema public to screener_owner;
  reset role;
end $$;

-- 1) CONVITE — emitido ao fim da liderança, consumido ao iniciar o rhia -------
create table public.screener_rhia_convites (
  id              uuid primary key default gen_random_uuid(),
  codigo_hash     text not null unique,
  respondente_id  uuid not null references public.respondentes (id) on delete cascade,
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null,
  usado_em        timestamptz,
  usado_por       uuid references public.screener_rhia_sessions (id) on delete set null,
  constraint screener_rhia_convite_hex check (codigo_hash ~ '^[0-9a-f]{64}$'),
  constraint screener_rhia_convite_expira check (expira_em > criado_em),
  -- uso único: ou os dois campos estão preenchidos, ou nenhum
  constraint screener_rhia_convite_uso_coerente check ((usado_em is null) = (usado_por is null))
);
create index idx_screener_rhia_convites_resp on public.screener_rhia_convites (respondente_id);
comment on table public.screener_rhia_convites is
  'Convite de uso unico que liga uma sessao rhia ao respondente da lideranca. Codigo so como hash. Nao da acesso a nada: apenas identifica a pessoa.';

-- 2) VÍNCULO — a ponte propriamente dita --------------------------------------
create table public.screener_rhia_vinculos (
  session_id      uuid primary key references public.screener_rhia_sessions (id) on delete cascade,
  respondente_id  uuid not null references public.respondentes (id) on delete cascade,
  origem          text not null check (origem in ('convite', 'email')),
  -- `convite` é ligação CERTA; `email` é PROVÁVEL e tem de ser lida assim no
  -- documento. Guardar a confiança junto evita que alguém, daqui a seis meses,
  -- trate as duas como a mesma coisa.
  confianca       text not null check (confianca in ('certa', 'provavel')),
  criado_em       timestamptz not null default now()
);
create index idx_screener_rhia_vinculos_resp on public.screener_rhia_vinculos (respondente_id);
comment on table public.screener_rhia_vinculos is
  'Ponte entre uma sessao rhia e um respondente da lideranca. origem=convite e ligacao certa; origem=email e provavel e o documento precisa dizer isso.';

alter table public.screener_rhia_convites enable row level security;
alter table public.screener_rhia_vinculos enable row level security;

-- 3) RPCs ---------------------------------------------------------------------

-- Emite o convite. Chamada ao fim da liderança, com o código já hasheado pela
-- edge — o código cru nunca chega ao banco.
create function public.screener_rhia_op_emitir_convite(
  p_respondente_id uuid, p_codigo_hash text, p_horas int default 720
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_codigo_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'codigo_invalido'); end if;
  if not exists (select 1 from public.respondentes r where r.id = p_respondente_id) then
    return jsonb_build_object('status', 'respondente_nao_encontrado'); end if;

  insert into public.screener_rhia_convites (codigo_hash, respondente_id, expira_em)
       values (p_codigo_hash, p_respondente_id, now() + make_interval(hours => greatest(1, p_horas)))
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'convite_id', v_id);
end $$;

-- Consome o convite e cria o vínculo CERTO.
create function public.screener_rhia_op_vincular_por_convite(
  p_token_hash text, p_codigo_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_conv public.screener_rhia_convites%rowtype;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if v_sess.id is null then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;

  select * into v_conv from public.screener_rhia_convites
   where codigo_hash = p_codigo_hash for update;
  if v_conv.id is null then return jsonb_build_object('status', 'convite_invalido'); end if;
  if v_conv.usado_em is not null then return jsonb_build_object('status', 'convite_ja_usado'); end if;
  if v_conv.expira_em <= now() then return jsonb_build_object('status', 'convite_expirado'); end if;

  -- A ligação certa SOBREPÕE uma provável anterior: o convite sabe quem é a
  -- pessoa, o casamento por e-mail apenas supõe.
  insert into public.screener_rhia_vinculos (session_id, respondente_id, origem, confianca)
       values (v_sess.id, v_conv.respondente_id, 'convite', 'certa')
  on conflict (session_id) do update
     set respondente_id = excluded.respondente_id, origem = 'convite',
         confianca = 'certa', criado_em = now();

  update public.screener_rhia_convites
     set usado_em = now(), usado_por = v_sess.id
   where id = v_conv.id;

  return jsonb_build_object('status', 'ok', 'confianca', 'certa');
end $$;

-- A rede: reconcilia por e-mail, e marca como PROVÁVEL.
create function public.screener_rhia_op_vincular_por_email(
  p_token_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_email text; v_resp_id uuid; v_quantos int;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if v_sess.id is null then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;

  -- Nunca rebaixa uma ligação certa para provável.
  if exists (select 1 from public.screener_rhia_vinculos v
              where v.session_id = v_sess.id and v.confianca = 'certa') then
    return jsonb_build_object('status', 'ja_vinculado', 'confianca', 'certa');
  end if;

  select l.email_normalized into v_email
    from public.screener_rhia_leads l where l.session_id = v_sess.id;
  if v_email is null then return jsonb_build_object('status', 'sem_contato'); end if;

  -- AMBIGUIDADE NÃO VIRA PALPITE: se o mesmo e-mail aparece em mais de um
  -- respondente, não se escolhe um. Casamento que erra em silêncio é pior que
  -- ausência de casamento, porque o documento fica com a metade de outra pessoa.
  -- Conta primeiro, escolhe depois. `min()` não existe para uuid, e de todo modo
  -- "o menor id" não seria critério: se há mais de um, não há escolha a fazer.
  select count(*) into v_quantos
    from public.respondentes r
   where r.email is not null and lower(trim(r.email)) = v_email;
  if v_quantos = 0 then return jsonb_build_object('status', 'sem_correspondencia'); end if;
  if v_quantos > 1 then return jsonb_build_object('status', 'ambiguo', 'candidatos', v_quantos); end if;

  select r.id into v_resp_id
    from public.respondentes r
   where r.email is not null and lower(trim(r.email)) = v_email
   limit 1;

  insert into public.screener_rhia_vinculos (session_id, respondente_id, origem, confianca)
       values (v_sess.id, v_resp_id, 'email', 'provavel')
  on conflict (session_id) do nothing;

  return jsonb_build_object('status', 'ok', 'confianca', 'provavel');
end $$;

-- Lê a ponte para montar o documento único.
create function public.screener_rhia_op_ler_vinculo(
  p_token_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_vin public.screener_rhia_vinculos%rowtype;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if v_sess.id is null then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;
  select * into v_vin from public.screener_rhia_vinculos where session_id = v_sess.id;
  if v_vin.session_id is null then return jsonb_build_object('status', 'sem_vinculo'); end if;
  return jsonb_build_object('status', 'ok', 'respondente_id', v_vin.respondente_id,
                            'origem', v_vin.origem, 'confianca', v_vin.confianca);
end $$;

-- 4) O MÍNIMO QUE A PONTE PRECISA DO LADO DA LIDERANÇA ------------------------
-- As RPC são SECURITY DEFINER e rodam como `screener_owner`, que não tem
-- privilégio nenhum em `public.respondentes` — tabela do app antigo. Sem isto,
-- toda chamada morre com "permission denied for table respondentes". Descoberto
-- pelo teste comportamental, não em produção.
--
-- O grant é por COLUNA e só de leitura: a ponte precisa saber que o respondente
-- existe (`id`) e casar por e-mail (`email`). Nome, empresa, cargo, consentimento
-- e IP continuam fora de alcance. Este privilégio é permanente, ao contrário do
-- CREATE no schema, que é transitório — por isso está declarado aqui e não junto
-- com ele.
grant select (id, email) on public.respondentes to screener_owner;

-- 5) PROPRIEDADE E PRIVILÉGIOS -------------------------------------------------
alter table    public.screener_rhia_convites owner to screener_owner;
alter table    public.screener_rhia_vinculos owner to screener_owner;
alter function public.screener_rhia_op_emitir_convite(uuid, text, int)        owner to screener_owner;
alter function public.screener_rhia_op_vincular_por_convite(text, text)       owner to screener_owner;
alter function public.screener_rhia_op_vincular_por_email(text)               owner to screener_owner;
alter function public.screener_rhia_op_ler_vinculo(text)                      owner to screener_owner;

revoke all on table public.screener_rhia_convites from public, anon, authenticated, service_role, screener_runtime;
revoke all on table public.screener_rhia_vinculos from public, anon, authenticated, service_role, screener_runtime;

revoke all on function public.screener_rhia_op_emitir_convite(uuid, text, int)  from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_vincular_por_convite(text, text) from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_vincular_por_email(text)         from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_ler_vinculo(text)                from public, anon, authenticated, service_role;

grant execute on function public.screener_rhia_op_emitir_convite(uuid, text, int)  to screener_runtime;
grant execute on function public.screener_rhia_op_vincular_por_convite(text, text) to screener_runtime;
grant execute on function public.screener_rhia_op_vincular_por_email(text)         to screener_runtime;
grant execute on function public.screener_rhia_op_ler_vinculo(text)                to screener_runtime;

-- Guarda de aceitação: mesma fronteira das outras sete RPC.
do $$
declare f text;
begin
  foreach f in array array[
    'public.screener_rhia_op_emitir_convite(uuid,text,int)',
    'public.screener_rhia_op_vincular_por_convite(text,text)',
    'public.screener_rhia_op_vincular_por_email(text)',
    'public.screener_rhia_op_ler_vinculo(text)'
  ] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') then
      raise exception 'RPC alcancavel por papel publico: %', f; end if;
    if not has_function_privilege('screener_runtime', f, 'execute') then
      raise exception 'o runtime perdeu o execute em: %', f; end if;
  end loop;
  -- nenhum privilégio de TABELA para o runtime: ele só alcança as RPC
  if exists (select 1 from information_schema.role_table_grants
              where grantee = 'screener_runtime'
                and table_name in ('screener_rhia_convites', 'screener_rhia_vinculos')) then
    raise exception 'o runtime ganhou privilegio de tabela na ponte';
  end if;
end $$;

-- 6) fecha a fronteira
do $$
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  revoke create on schema public from screener_owner;
  reset role;
end $$;
revoke screener_owner from current_user;
