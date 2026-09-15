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
-- POR QUE A EMISSÃO PARTE DO TOKEN, E NÃO DE UM `respondente_id`. A primeira
-- versão desta migration recebia o id do respondente como parâmetro. Quem
-- alcançasse a RPC poderia emitir convite para QUALQUER pessoa, bastando o id —
-- e o id não é segredo: ele viaja no corpo de respostas da edge antiga. Agora a
-- emissão parte do `token_sessao`, que é o segredo da sessão de liderança e a
-- edge já lê do cabeçalho `x-sessao`. O id do respondente nunca entra pela
-- porta; ele é derivado aqui dentro.
--
-- ISOLAMENTO PRESERVADO. Nenhuma tabela existente muda, e a ponte não ganha
-- privilégio nenhum sobre `public.respondentes` — ver a seção 4.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (completo; `drop` exige ser dono, e a dona é screener_owner):
--
--   grant screener_owner to current_user;
--   drop function public.screener_rhia_op_ler_vinculo(text);
--   drop function public.screener_rhia_op_vincular_por_email(text);
--   drop function public.screener_rhia_op_vincular_por_convite(text, text);
--   drop function public.screener_rhia_op_emitir_convite(uuid, text, int);
--   drop table    public.screener_rhia_vinculos;
--   drop table    public.screener_rhia_convites;
--   revoke screener_owner from current_user;
--   drop function public.screener_ponte_respondente_por_email(text);
--   drop function public.screener_ponte_respondente_por_token(uuid);
--   -- e a purga volta ao corpo anterior: reaplique o `create function` de
--   -- 20260914170000_screener_rhia_purga_por_retencao.sql como `create or
--   -- replace`, que é a fonte executável daquele corpo.
-- ---------------------------------------------------------------------------
-- =============================================================

grant screener_owner to current_user;
-- `RESET ROLE` NÃO É O INVERSO DE `SET ROLE` aqui — ver a nota longa na seção 6.
-- Guarda-se o papel corrente e devolve-se ele, nominalmente.
do $$
declare v_papel name := current_user;
begin
  grant create on schema public to screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  grant create on schema public to screener_owner;
  execute format('set role %I', v_papel);
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
  -- USO ÚNICO, e o que o marca é `usado_em`. A versão anterior exigia que os
  -- dois campos andassem juntos — `(usado_em is null) = (usado_por is null)` — e
  -- isso teria derrubado a purga de retenção: `usado_por` é `on delete set
  -- null`, então apagar a sessão vencida zera o ponteiro e o CHECK estouraria.
  -- Como `screener_rhia_purga()` é uma função só, numa transação só, o LOTE
  -- INTEIRO abortaria, toda noite, em silêncio dentro do cron.
  -- O ponteiro pode sumir; o fato de ter sido usado, não.
  constraint screener_rhia_convite_uso_coerente check (usado_por is null or usado_em is not null),
  -- TETO DE PRAZO, na tabela e não só na RPC. A FASE 3 da purga só alcança o
  -- que venceu; um convite emitido com prazo absurdo nunca venceria e guardaria
  -- um ponteiro para PII para sempre — desmontando o argumento da seção 6 de que
  -- "o prazo vem do próprio registro". Na tabela, a regra vale para qualquer
  -- escritor futuro, não só para a RPC de hoje.
  -- 2160 horas = 90 dias. EM HORAS, e não em dias, porque `+ interval '90 days'`
  -- sobre `timestamptz` é aritmética de CALENDÁRIO: num fuso com horário de
  -- verão, 90 dias podem valer 2159 horas de relógio, e o teto da RPC (que conta
  -- horas) estouraria este CHECK em vez de devolver status. Com as duas pontas
  -- na mesma unidade, a igualdade é exata em qualquer fuso.
  constraint screener_rhia_convite_prazo_maximo check (expira_em <= criado_em + interval '2160 hours')
);
create index idx_screener_rhia_convites_resp on public.screener_rhia_convites (respondente_id);
comment on table public.screener_rhia_convites is
  'Convite de uso unico que liga uma sessao rhia ao respondente da lideranca. Codigo so como hash. Nao da acesso a nada: apenas identifica a pessoa. Vive ate expira_em; a purga noturna apaga os vencidos.';

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

-- 3) COMO A PONTE ENXERGA `respondentes` — e por que NÃO é por grant ----------
--
-- O DEFEITO QUE ISTO CORRIGE. A versão anterior desta migration dava
-- `grant select (id, email) on public.respondentes to screener_owner`. Resolvia
-- o "permission denied" e não resolvia nada: `public.respondentes` tem RLS
-- LIGADA desde a 20260526000001, e as únicas policies de SELECT que sobreviveram
-- são `to anon` (pela própria sessão) e `to authenticated` (pelo evento do
-- painel). `screener_owner` é `nologin noinherit`, não é superusuário, não tem
-- BYPASSRLS e não é dona da tabela — dentro do SECURITY DEFINER a RLS se aplica
-- e NENHUMA policy a alcança. O grant abria a porta de baixo; a de cima ficava
-- fechada. Resultado medido: `respondente_nao_encontrado` e `sem_correspondencia`
-- para todo mundo, sem erro e sem log. A ponte nasceria morta.
--
-- A SAÍDA. Duas funções auxiliares SECURITY DEFINER cujo dono é o DONO DE
-- `respondentes` (`postgres`) — e dono de tabela não passa por RLS, salvo FORCE
-- ROW LEVEL SECURITY, que a guarda no fim deste arquivo confere. Elas NÃO
-- mudam de dono para `screener_owner`: é justamente o dono que as faz
-- funcionarem.
--
-- Por que não uma policy nova em `respondentes`: `create policy` pega
-- AccessExclusiveLock na tabela viva do app antigo, e ampliaria a superfície de
-- leitura de forma permanente. Duas funções de pergunta fechada não tocam a
-- tabela e são reversíveis com um `drop`.
--
-- O QUE ELAS DEVOLVEM É DELIBERADAMENTE POBRE: um id, e contagens. Nome e
-- empresa saem como "quantos valores distintos existem", nunca como texto. A
-- ponte precisa saber se os candidatos se contradizem — não precisa saber o que
-- eles dizem. PII não cruza a fronteira.

create function public.screener_ponte_respondente_por_token(p_token_sessao uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id from public.respondentes r where r.token_sessao = p_token_sessao
$$;
comment on function public.screener_ponte_respondente_por_token(uuid) is
  'Resolve o respondente da lideranca a partir do token de sessao, para a ponte do rhia. SECURITY DEFINER com dono igual ao dono de respondentes, porque a tabela tem RLS e screener_owner nao a alcanca. Execute so para screener_owner.';

-- A REGRA DE AMBIGUIDADE (decisão da dona do produto, 15/09).
-- Contar LINHAS não serve: o diagnóstico de liderança roda por evento, e quem
-- participa de dois eventos vira duas linhas com o mesmo e-mail. Chamar isso de
-- ambiguidade recusaria exatamente quem a rede existe para pegar — e, com 108
-- respondentes em eventos recorrentes, esse é o caso provável, não a exceção.
-- O que de fato indica DUAS PESSOAS atrás de um endereço (a caixa compartilhada
-- do tipo `contato@empresa.com`) é nome ou empresa DIVERGENTES.
-- Daí as contagens de valores distintos. Campo vazio não conta: ausência de
-- dado é silêncio, não contradição.
create function public.screener_ponte_respondente_por_email(p_email_normalizado text)
returns table (respondente_id uuid, quantos int, nomes_distintos int, empresas_distintas int)
language sql stable security definer set search_path = '' as $$
  with cand as (
    select r.id, r.iniciado_em,
           nullif(regexp_replace(lower(trim(r.nome)),    '\s+', ' ', 'g'), '') as nome,
           nullif(regexp_replace(lower(trim(r.empresa)), '\s+', ' ', 'g'), '') as empresa
      from public.respondentes r
     where r.email is not null
       and lower(trim(r.email)) = p_email_normalizado
  )
  select
    -- quando não há divergência, a pessoa é a mesma e vale a linha MAIS RECENTE:
    -- é ela que descreve o cargo, o porte e a empresa de hoje.
    (select c.id from cand c order by c.iniciado_em desc nulls last, c.id desc limit 1),
    (select count(*) from cand)::int,
    (select count(distinct c.nome)    from cand c where c.nome    is not null)::int,
    (select count(distinct c.empresa) from cand c where c.empresa is not null)::int
$$;
comment on function public.screener_ponte_respondente_por_email(text) is
  'Candidatos da lideranca para um e-mail normalizado, para a ponte do rhia. Devolve o id do mais recente e CONTAGENS de nomes/empresas distintos — nunca o texto. Quem decide o que e ambiguidade e a RPC da ponte. Execute so para screener_owner.';

revoke all on function public.screener_ponte_respondente_por_token(uuid)
  from public, anon, authenticated, service_role, screener_runtime;
revoke all on function public.screener_ponte_respondente_por_email(text)
  from public, anon, authenticated, service_role, screener_runtime;
grant execute on function public.screener_ponte_respondente_por_token(uuid) to screener_owner;
grant execute on function public.screener_ponte_respondente_por_email(text) to screener_owner;

-- 4) RPCs ---------------------------------------------------------------------

-- Emite o convite. Chamada ao fim da liderança, com o código já hasheado pela
-- edge — o código cru nunca chega ao banco. O `p_token_sessao` tem de vir do
-- cabeçalho `x-sessao`, derivado no servidor: NUNCA do corpo da requisição.
create function public.screener_rhia_op_emitir_convite(
  p_token_sessao uuid, p_codigo_hash text, p_horas int default 720
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_resp uuid; v_id uuid; v_dono uuid;
begin
  if p_codigo_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'codigo_invalido'); end if;

  v_resp := public.screener_ponte_respondente_por_token(p_token_sessao);
  if v_resp is null then return jsonb_build_object('status', 'sessao_de_lideranca_nao_encontrada'); end if;

  -- IDEMPOTENTE: reenviar o e-mail de fecho da liderança não pode multiplicar
  -- convites para a mesma pessoa. O mesmo código para OUTRA pessoa é outra
  -- coisa — é conflito, e se recusa.
  --
  -- Uma corrida entre duas chamadas simultâneas com o MESMO código para a MESMA
  -- pessoa devolve `codigo_em_uso`: o `do nothing` não espera o concorrente e o
  -- `select` seguinte, em READ COMMITTED, não vê a linha ainda não commitada.
  -- Com código de 256 bits isso só acontece em reenvio da mesma requisição, e a
  -- tentativa seguinte acerta. Fica registrado em vez de resolvido com lock.
  --
  -- `least(2160, ...)` é o mesmo teto do CHECK da tabela, em horas (90 dias):
  -- aqui devolve resultado; lá é a regra que vale para qualquer escritor.
  insert into public.screener_rhia_convites (codigo_hash, respondente_id, expira_em)
       values (p_codigo_hash, v_resp,
               now() + make_interval(hours => least(2160, greatest(1, coalesce(p_horas, 720)))))
  on conflict (codigo_hash) do nothing
  returning id into v_id;
  if v_id is not null then return jsonb_build_object('status', 'ok', 'convite_id', v_id); end if;

  select c.id, c.respondente_id into v_id, v_dono
    from public.screener_rhia_convites c where c.codigo_hash = p_codigo_hash;
  if v_dono is distinct from v_resp then return jsonb_build_object('status', 'codigo_em_uso'); end if;
  return jsonb_build_object('status', 'ok', 'convite_id', v_id, 'ja_existia', true);
end $$;

-- Consome o convite e cria o vínculo CERTO.
create function public.screener_rhia_op_vincular_por_convite(
  p_token_hash text, p_codigo_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sess public.screener_rhia_sessions%rowtype;
  v_conv public.screener_rhia_convites%rowtype;
  v_vin  public.screener_rhia_vinculos%rowtype;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if v_sess.id is null then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;
  -- MESMA CHECAGEM DE `screener_rhia_op_capturar_lead`, e pelo mesmo motivo:
  -- sem ela, quem abre o link numa aba velha QUEIMA o convite numa sessão
  -- morta, reabre direito e recebe `convite_ja_usado` — sem ponte, sem erro e
  -- sem log. Não se exige `submitted` aqui: o vínculo por convite acontece no
  -- COMEÇO do rhia, não no portão.
  if v_sess.revoked_at is not null
     or (v_sess.expires_at is not null and v_sess.expires_at <= now()) then
    return jsonb_build_object('status', 'sessao_invalida');
  end if;

  select * into v_conv from public.screener_rhia_convites
   where codigo_hash = p_codigo_hash for update;
  if v_conv.id is null then return jsonb_build_object('status', 'convite_invalido'); end if;
  if v_conv.usado_em is not null then return jsonb_build_object('status', 'convite_ja_usado'); end if;
  if v_conv.expira_em <= now() then return jsonb_build_object('status', 'convite_expirado'); end if;

  -- DUAS CERTEZAS QUE SE CONTRADIZEM não se resolvem por ordem de chegada. Se
  -- esta sessão já está ligada com certeza a OUTRA pessoa, alguma coisa está
  -- errada a montante (link colado no lugar errado, convite reencaminhado) e o
  -- certo é recusar, sem queimar o convite — ele ainda serve à sessão certa.
  select * into v_vin from public.screener_rhia_vinculos where session_id = v_sess.id;
  if v_vin.session_id is not null and v_vin.confianca = 'certa'
     and v_vin.respondente_id <> v_conv.respondente_id then
    return jsonb_build_object('status', 'conflito_de_vinculo', 'respondente_id', v_vin.respondente_id);
  end if;

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

  return jsonb_build_object('status', 'ok', 'confianca', 'certa',
                            'respondente_id', v_conv.respondente_id);
end $$;

-- A rede: reconcilia por e-mail, e marca como PROVÁVEL.
create function public.screener_rhia_op_vincular_por_email(
  p_token_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sess public.screener_rhia_sessions%rowtype;
  v_vin  public.screener_rhia_vinculos%rowtype;
  v_email text;
  v_cand record;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if v_sess.id is null then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;
  if v_sess.revoked_at is not null
     or (v_sess.expires_at is not null and v_sess.expires_at <= now()) then
    return jsonb_build_object('status', 'sessao_invalida');
  end if;

  -- Nunca rebaixa uma ligação certa para provável.
  if exists (select 1 from public.screener_rhia_vinculos v
              where v.session_id = v_sess.id and v.confianca = 'certa') then
    return jsonb_build_object('status', 'ja_vinculado', 'confianca', 'certa');
  end if;

  select l.email_normalized into v_email
    from public.screener_rhia_leads l where l.session_id = v_sess.id;
  if v_email is null then return jsonb_build_object('status', 'sem_contato'); end if;

  select * into v_cand from public.screener_ponte_respondente_por_email(v_email);
  if v_cand.quantos = 0 then return jsonb_build_object('status', 'sem_correspondencia'); end if;

  -- AMBIGUIDADE NÃO VIRA PALPITE. Duas linhas com o mesmo e-mail são a mesma
  -- pessoa em dois eventos — a menos que nome ou empresa se contradigam, que é
  -- a assinatura da caixa compartilhada. Aí não se escolhe: casamento que erra
  -- em silêncio é pior que ausência de casamento, porque o documento fica com a
  -- metade de outra pessoa.
  if v_cand.nomes_distintos > 1 or v_cand.empresas_distintas > 1 then
    return jsonb_build_object('status', 'ambiguo', 'candidatos', v_cand.quantos);
  end if;

  insert into public.screener_rhia_vinculos (session_id, respondente_id, origem, confianca)
       values (v_sess.id, v_cand.respondente_id, 'email', 'provavel')
  on conflict (session_id) do nothing;

  -- A RESPOSTA DESCREVE O BANCO, NÃO A INTENÇÃO. Se o `do nothing` guardou um
  -- vínculo anterior, dizer "ok" faria a edge acreditar que ligou esta pessoa.
  select * into v_vin from public.screener_rhia_vinculos where session_id = v_sess.id;
  if v_vin.respondente_id <> v_cand.respondente_id then
    return jsonb_build_object('status', 'ja_vinculado', 'confianca', v_vin.confianca,
                              'respondente_id', v_vin.respondente_id);
  end if;
  return jsonb_build_object('status', 'ok', 'confianca', 'provavel',
                            'respondente_id', v_vin.respondente_id);
end $$;

-- Lê a ponte para montar o documento único.
create function public.screener_rhia_op_ler_vinculo(
  p_token_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_rhia_sessions%rowtype; v_vin public.screener_rhia_vinculos%rowtype;
        v_sessao jsonb;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if v_sess.id is null then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;

  -- AQUI NÃO SE RECUSA POR ESTADO, ao contrário das duas RPC de escrita — e a
  -- assimetria é a da casa, não descuido. `screener_rhia_op_resume` e
  -- `op_get_result` devolvem `status`, `expires_at` e `revoked_at` no objeto
  -- `session` e deixam a edge decidir; esta faz o mesmo. Recusar aqui e devolver
  -- flags lá deixaria duas leituras do mesmo banco discordando sobre o que é uma
  -- sessão válida. Quem escreve a edge tem os flags na mão e não tem desculpa.
  v_sessao := jsonb_build_object('id', v_sess.id, 'status', v_sess.status,
                                 'expires_at', v_sess.expires_at, 'revoked_at', v_sess.revoked_at,
                                 'submitted_at', v_sess.submitted_at);

  select * into v_vin from public.screener_rhia_vinculos where session_id = v_sess.id;
  if v_vin.session_id is null then
    return jsonb_build_object('status', 'sem_vinculo', 'session', v_sessao); end if;
  return jsonb_build_object('status', 'ok', 'respondente_id', v_vin.respondente_id,
                            'origem', v_vin.origem, 'confianca', v_vin.confianca,
                            'session', v_sessao);
end $$;

-- 5) PROPRIEDADE E PRIVILÉGIOS -------------------------------------------------
-- Note quem NÃO está aqui: os dois auxiliares da seção 3 continuam com o dono
-- de `respondentes`. Passá-los a `screener_owner` os quebraria em silêncio.
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

-- 6) A PURGA PASSA A APAGAR CONVITES VENCIDOS ---------------------------------
-- O convite guarda um ponteiro para PII (`respondente_id`). Vencido, ele não
-- serve mais a nada: não pode ser consumido, e a proveniência da ligação já está
-- gravada em `screener_rhia_vinculos.origem`. Guardá-lo seria manter um
-- ponteiro vivo além do prazo que ele mesmo declarou.
--
-- O PRAZO VEM DO PRÓPRIO REGISTRO — `expira_em` —, no mesmo princípio da
-- 20260914170000: nenhuma constante de retenção escondida no código.
-- Consequência assumida: depois de vencido e purgado, quem tentar o link recebe
-- `convite_invalido` em vez de `convite_expirado`. Para quem lê, as duas frases
-- dizem "este link não vale mais"; a diferença não paga um ponteiro para PII.
--
-- É `create or replace` do corpo da 20260914170000, mantendo o resto PALAVRA
-- POR PALAVRA — o rollback no cabeçalho aponta para aquele arquivo, que é a
-- fonte executável do corpo anterior. `set role` explícito porque a dona é
-- `screener_owner`: a membership residual de `supabase_admin` tem `inherit` e
-- `set` falsos (DEPLOY.md, Passo 2b), então sem o `grant` do topo desta migration
-- nem seria possível trocar de papel — e sem trocar, `postgres` não é dona e o
-- `create or replace` seria recusado.
--
-- E DEVOLVE-SE O PAPEL PELO NOME, NUNCA COM `reset role`. Esta migration morreu
-- na primeira tentativa de apply (15/09) exatamente aqui: `RESET ROLE` volta ao
-- papel de LOGIN da sessão, e o `supabase db push` se conecta com um papel de
-- login e depois assume outro ("Initialising login role..."). O `reset` desfazia
-- isso, e todos os comandos seguintes rodavam com a identidade errada — o último
-- deles, `revoke screener_owner from current_user`, morreu com `no possible
-- grantors` e a transação inteira voltou atrás. Nada foi aplicado, mas o defeito
-- era meu: `reset role` não é o inverso de `set role` quando alguém já havia
-- trocado o papel antes de mim.
select set_config('boomit.papel_da_migration', current_user, true);
set role screener_owner;
create or replace function public.screener_rhia_purga()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_snap int := 0; v_resp int := 0; v_sem_lead int := 0; v_lead int := 0; v_cascas int := 0;
  v_conv int := 0;
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

  -- ---------- FASE 3 — o convite, no prazo que ele mesmo declarou ----------
  delete from public.screener_rhia_convites c where c.expira_em < now();
  get diagnostics v_conv = row_count;

  return jsonb_build_object(
    'snapshots', v_snap, 'respostas', v_resp,
    'sessoes_sem_contato', v_sem_lead, 'sessoes_liberadas_pelo_contato', v_cascas,
    'contatos', v_lead, 'convites_vencidos', v_conv, 'em', now());
end $$;

-- O comentário sobrevive ao `create or replace`, e por isso passaria a mentir
-- por omissão: ele só falava das fases 1 e 2.
comment on function public.screener_rhia_purga() is
  'Purga por retencao do rhia. Prazos vem do vinculo; vinculo sem retencao declarada nao e purgado. 180 dias apagam o conteudo da avaliacao (respostas e snapshot) de todos; a linha de sessao de quem deixou contato sobrevive ate os 365 dias do contato, porque continua ligada a PII pelo session_id unico do lead — ela NAO e anonima. Fase 3 (20260915120000): apaga convites da ponte cujo expira_em ja passou, prazo que o proprio convite declarou.';
do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  if v_papel is null then raise exception 'papel da migration nao foi guardado antes do set role'; end if;
  execute format('set role %I', v_papel);
end $$;

-- A `20260914170000` usou `create function`, e não `or replace`, de propósito: a
-- função apaga PII e não pode nascer com o EXECUTE para PUBLIC que toda função
-- nova ganha. Aqui o `or replace` é necessário — mas num banco que ainda não
-- tenha aquela migration (branch, preview, replay interrompido, ou reaplicação
-- depois do rollback dela) este comando CRIARIA a função, e ela nasceria
-- alcançável por `anon`. A guarda cobre os dois caminhos.
do $$
begin
  -- `coalesce` porque `pg_get_userbyid(null) <> 'x'` é NULL, e um `if` sobre NULL
  -- não dispara: sem ele, a guarda seria cega a uma função que não existe.
  if coalesce(pg_get_userbyid((select proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'screener_rhia_purga')),
              'ausente') <> 'screener_owner' then
    raise exception 'a purga ficou com dono errado, ou sumiu, depois do replace';
  end if;
  -- E o outro lado da guarda: conferir só quem NÃO pode aplaudiria uma purga que
  -- perdeu o EXECUTE do executor do cron e parou de rodar, calada, toda noite.
  if not has_function_privilege(current_user, 'public.screener_rhia_purga()', 'execute') then
    raise exception 'o executor do cron perdeu o EXECUTE na purga';
  end if;
  if has_function_privilege('anon', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('authenticated', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('service_role', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('screener_runtime', 'public.screener_rhia_purga()', 'execute') then
    raise exception 'a purga ficou alcancavel por papel que nao deveria executa-la';
  end if;
end $$;

-- 7) GUARDAS DE ACEITAÇÃO ------------------------------------------------------

-- 7a) A guarda que teria pego o defeito principal: um auxiliar SECURITY DEFINER
-- só escapa da RLS de `respondentes` se o dono dele for o dono DA TABELA. Se
-- alguém, um dia, "arrumar" isso passando os auxiliares para `screener_owner`,
-- a migration para aqui em vez de a ponte ficar muda em produção.
do $$
declare v_dono_tab name; v_dono_fn name; v_secdef boolean; v_sp text[]; f text;
begin
  select pg_get_userbyid(c.relowner) into v_dono_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'respondentes';
  if v_dono_tab is null then raise exception 'public.respondentes nao existe'; end if;

  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'respondentes' and c.relforcerowsecurity) then
    raise exception 'respondentes esta em FORCE ROW LEVEL SECURITY: nem o dono escapa, e a ponte nasceria muda';
  end if;

  foreach f in array array['screener_ponte_respondente_por_token', 'screener_ponte_respondente_por_email'] loop
    select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      into v_dono_fn, v_secdef, v_sp
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if v_dono_fn is distinct from v_dono_tab then
      raise exception 'auxiliar % tem dono %, e respondentes tem dono %: a RLS voltaria a filtrar tudo, em silencio',
        f, v_dono_fn, v_dono_tab;
    end if;
    if not v_secdef then raise exception 'auxiliar % nao e SECURITY DEFINER', f; end if;
    -- o literal é `search_path=""`, como confere a 20260914120000: qualquer
    -- outro valor devolveria a função ao schema de quem a chama
    if v_sp is null or not ('search_path=""' = any(v_sp)) then
      raise exception 'auxiliar % sem search_path vazio', f; end if;
  end loop;
end $$;

-- 7b) Fronteira: mesma regra das outras sete RPC.
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

  -- Os auxiliares são de uso EXCLUSIVO da ponte: nem o runtime os alcança.
  foreach f in array array[
    'public.screener_ponte_respondente_por_token(uuid)',
    'public.screener_ponte_respondente_por_email(text)'
  ] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute')
       or has_function_privilege('screener_runtime', f, 'execute') then
      raise exception 'auxiliar de leitura de respondentes alcancavel indevidamente: %', f; end if;
    if not has_function_privilege('screener_owner', f, 'execute') then
      raise exception 'a ponte perdeu o execute em: %', f; end if;
  end loop;

  -- Nenhum privilégio de TABELA para o runtime: ele só alcança as RPC.
  -- `has_table_privilege` pergunta ao Postgres o que o papel PODE;
  -- `information_schema.role_table_grants` mostra só o que é visível a quem
  -- consulta, e poderia calar uma concessão existente.
  if has_table_privilege('screener_runtime', 'public.screener_rhia_convites',
                         'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('screener_runtime', 'public.screener_rhia_vinculos',
                         'select,insert,update,delete,truncate,references,trigger') then
    raise exception 'o runtime ganhou privilegio de tabela na ponte';
  end if;
end $$;

-- 7c) A PROVA COMPORTAMENTAL — a guarda 7a é estrutural, e o defeito de 15/09
-- era exatamente "está tudo estruturalmente certo e nada aparece". Com as 108
-- linhas que já existem, dá para provar de verdade: rodando COMO `screener_owner`,
-- o auxiliar tem de enxergar pelo menos uma. Num banco sem respondentes com
-- e-mail (branch, replay do zero) não há o que provar, e a guarda se cala em vez
-- de inventar uma falha.
do $$
declare v_email text; v_visto int; v_papel name := current_user;
begin
  select lower(trim(r.email)) into v_email
    from public.respondentes r where r.email is not null
   order by r.iniciado_em desc limit 1;
  if v_email is null then return; end if;

  set local role screener_owner;
  select quantos into v_visto from public.screener_ponte_respondente_por_email(v_email);
  execute format('set role %I', v_papel);

  if coalesce(v_visto, 0) = 0 then
    raise exception 'a ponte enxerga ZERO linhas de respondentes — o defeito de 15/09 voltou';
  end if;
end $$;

-- 8) fecha a fronteira
do $$
declare v_papel name := current_user;
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  revoke create on schema public from screener_owner;
  execute format('set role %I', v_papel);
end $$;

-- A ÚLTIMA LINHA SÓ FUNCIONA SE A IDENTIDADE FOR A MESMA DO COMEÇO. Se algum
-- bloco acima tiver deixado o papel trocado, o revoke falharia com uma mensagem
-- obscura (`no possible grantors`) e a transação inteira voltaria atrás no fim
-- de uma migration longa. A guarda diz o que de fato aconteceu.
do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  if v_papel is not null and current_user <> v_papel then
    raise exception 'a migration terminaria como % em vez de % — algum bloco trocou o papel e nao devolveu',
      current_user, v_papel;
  end if;
end $$;
revoke screener_owner from current_user;
select set_config('boomit.papel_da_migration', '', true);
