-- =============================================================
-- PERFIL DO FORMULÁRIO ÚNICO — quem responde, declarado no começo.
--
-- A DECISÃO (dona do produto, 16/09): um formulário só, com tudo integrado, no
-- pipeline novo. As duas metades — liderança e RH+IA — passam a ser respondidas
-- na mesma sessão, e o documento sai inteiro no fim.
--
-- POR QUE UMA TABELA NOVA, E NÃO MAIS COLUNAS EM ALGUMA EXISTENTE.
-- `screener_rhia_leads` guarda CONTATO, capturado no portão, no fim, com
-- consentimento de marketing e retenção de 365 dias. O perfil é outra coisa:
-- identificação declarada ANTES de começar, porque `porte` e `nivel` são as duas
-- entradas do cálculo do CDL — sem eles não há faixa em reais. Misturar as duas
-- faria uma tabela com dois donos, dois momentos e dois prazos.
--
-- O QUE ESTA MIGRATION DELIBERADAMENTE NÃO FAZ: carregar o instrumento unificado
-- nem criar vínculo para ele. O conjunto de itens da metade de IA muda na sessão
-- de conteúdo de 25/09; carregar agora seria pôr no ar a versão que será
-- substituída, e o gerador de carga (que FALHA se a versão existir com checksum
-- diferente) transformaria isso em atrito. A carga vem quando o conteúdo fechar.
--
-- NADA DE LISTA CRAVADA DE VALORES. `nivel`, `porte` e `setor` NÃO ganham CHECK
-- de valores aqui: quem os valida é a definição guardada do instrumento, item a
-- item, como `screener_rhia_op_save_response` já faz com as alternativas. Foi
-- exatamente a lista cravada (`stage_code in ('E1'..'E4','NA')`) que, na tabela
-- do V1, transformou "acrescentar um nível" em migration de tabela compartilhada.
-- O que fica no banco são limites de FORMA — tamanho e ausência de controle.
--
-- PRIVACIDADE. `nome`, `empresa` e `cargo` são PII, e chegam ANTES do portão —
-- ao contrário de tudo que o rhia coletava até aqui, que era anônimo até o fim.
-- Por isso o formulário único precisa nascer como vínculo próprio, com aviso de
-- privacidade próprio; o link público do rhia segue anônimo, intocado. Esta
-- migration prepara a trilha; o aviso é decisão de produto e vem com a carga.
--
-- RETENÇÃO. O perfil é INSUMO DA AVALIAÇÃO, como as respostas — e some com elas,
-- no prazo da sessão declarado no vínculo. Não segue o prazo do contato: manter
-- empresa, cargo e porte por 365 dias ao lado do e-mail seria guardar mais do
-- que o necessário para o que o contato existe. Daí a fase 4 da purga, abaixo.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK:
--
--   grant screener_owner to current_user;
--   drop function public.screener_rhia_op_ler_perfil(text, text);
--   drop function public.screener_rhia_op_salvar_perfil(text, text, text, text, text, text, text, text);
--   drop table public.screener_rhia_perfis;
--   revoke screener_owner from current_user;
--   -- e a purga volta ao corpo anterior: reaplique o `create or replace` de
--   -- 20260915120000_screener_rhia_ponte_com_lideranca.sql, que é a fonte
--   -- executável do corpo em vigor antes desta migration.
-- ---------------------------------------------------------------------------
-- =============================================================

grant screener_owner to current_user;
select set_config('boomit.papel_da_migration', current_user, true);

-- `RESET ROLE` não é o inverso de `SET ROLE`: ele volta ao papel de LOGIN da
-- sessão, e o `supabase db push` se conecta com um papel de login e depois assume
-- outro. Foi assim que a migration da ponte morreu na primeira tentativa, no
-- último comando. Aqui o papel é devolvido pelo NOME, sempre.
do $$
declare v_papel name := current_user;
begin
  grant create on schema public to screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  grant create on schema public to screener_owner;
  execute format('set role %I', v_papel);
end $$;

-- 1) A TABELA ------------------------------------------------------------------
create table public.screener_rhia_perfis (
  session_id     uuid primary key references public.screener_rhia_sessions (id) on delete cascade,
  nome           text not null,
  empresa        text not null,
  cargo          text not null,
  nivel          text not null,
  porte          text not null,
  setor          text not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  -- Limites de FORMA, não de conteúdo. Os valores válidos de nivel/porte/setor
  -- vivem na definição do instrumento, e é lá que a RPC os confere.
  constraint screener_rhia_perfil_nome    check (char_length(nome)    between 1 and 120),
  constraint screener_rhia_perfil_empresa check (char_length(empresa) between 1 and 120),
  constraint screener_rhia_perfil_cargo   check (char_length(cargo)   between 1 and 120),
  constraint screener_rhia_perfil_nivel   check (char_length(nivel)   between 1 and 40),
  constraint screener_rhia_perfil_porte   check (char_length(porte)   between 1 and 40),
  constraint screener_rhia_perfil_setor   check (char_length(setor)   between 1 and 40)
);
comment on table public.screener_rhia_perfis is
  'Identificacao declarada no inicio do formulario unico. porte e nivel sao as entradas do CDL. PII: nome, empresa e cargo. Retencao: segue o prazo da SESSAO declarado no vinculo (e insumo da avaliacao, nao contato).';

alter table public.screener_rhia_perfis enable row level security;

-- 2) GRAVAR -------------------------------------------------------------------
-- Mesma fronteira das outras RPC: SECURITY DEFINER, `search_path` vazio, e o
-- único caminho de escrita. Valida sessão, vigência e credencial de prévia
-- exatamente como `screener_rhia_op_capturar_lead`, e os VALORES contra a
-- definição guardada — nunca contra uma lista escrita aqui.
create function public.screener_rhia_op_salvar_perfil(
  p_token_hash text, p_preview_hash text,
  p_nome text, p_empresa text, p_cargo text,
  p_nivel text, p_porte text, p_setor text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sess public.screener_rhia_sessions%rowtype;
  v_bind public.screener_event_bindings%rowtype;
  v_def  jsonb;
  v_nome text; v_empresa text; v_cargo text;
  -- Limpeza de caractere de controle. O NUL NÃO chega aqui: o Postgres o recusa
  -- no protocolo, antes da função, com `invalid byte sequence for encoding
  -- UTF8`. Quem precisa tirá-lo é a edge, como `postLeadRhia` já faz. O que esta
  -- limpeza pega são os OUTROS controles, que passam pelo protocolo e sujariam
  -- nome, empresa e cargo.
  --
  -- `[[:cntrl:]]` em vez de uma faixa escrita com escapes: caractere de controle
  -- (NUL inclusive) faz o Postgres abortar a transação com um erro de encoding
  -- que não tem por que chegar ao navegador. A classe POSIX evita escrever a
  -- faixa com escapes de unicode, que e como se poe um NUL de verdade dentro do
  -- arquivo sem perceber (foi o que aconteceu na primeira versao deste arquivo).
  c_controle constant text := '[[:cntrl:]]';
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;

  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(
       v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return jsonb_build_object('status', 'sessao_nao_encontrada');
  end if;

  if v_sess.revoked_at is not null
     or (v_sess.expires_at is not null and v_sess.expires_at <= now()) then
    return jsonb_build_object('status', 'sessao_invalida');
  end if;
  -- O perfil faz parte de RESPONDER. Depois do submit o resultado já foi
  -- calculado com o que havia; deixar trocar o porte aqui mudaria a conta
  -- por baixo de um resultado já entregue.
  if v_sess.status <> 'open' then return jsonb_build_object('status', 'sessao_nao_aberta'); end if;

  v_nome    := nullif(trim(regexp_replace(coalesce(p_nome, ''),    c_controle, '', 'g')), '');
  v_empresa := nullif(trim(regexp_replace(coalesce(p_empresa, ''), c_controle, '', 'g')), '');
  v_cargo   := nullif(trim(regexp_replace(coalesce(p_cargo, ''),   c_controle, '', 'g')), '');
  if v_nome is null or v_empresa is null or v_cargo is null then
    return jsonb_build_object('status', 'campo_obrigatorio');
  end if;
  if char_length(v_nome) > 120 or char_length(v_empresa) > 120 or char_length(v_cargo) > 120 then
    return jsonb_build_object('status', 'campo_longo_demais');
  end if;

  select v.definition into v_def
    from public.screener_instrument_versions v
   where v.instrument_code = v_bind.instrument_code
     and v.instrument_version = v_bind.instrument_version;
  if v_def is null then return jsonb_build_object('status', 'instrumento_ausente'); end if;
  -- Instrumento sem bloco de perfil não é o do formulário único: recusar é mais
  -- honesto que gravar um perfil que ninguém vai ler. É ISTO que mantém o link
  -- público do rhia anônimo — a única coisa que o separa de um formulário com
  -- nome e empresa é a definição dele não ter o bloco.
  --
  -- `coalesce` porque `jsonb_typeof(null)` é NULL, e um `if` sobre NULL não
  -- dispara: sem ele a recusa não acontecia, e a chamada caía adiante em
  -- `valor_invalido` — mensagem errada para o problema certo. Pego pelo teste.
  if coalesce(jsonb_typeof(v_def -> 'perfil'), 'ausente') <> 'array' then
    return jsonb_build_object('status', 'instrumento_sem_perfil');
  end if;

  if not public.screener_priv_perfil_opcao_ok(v_def, 'nivel', p_nivel) then
    return jsonb_build_object('status', 'valor_invalido', 'campo', 'nivel'); end if;
  if not public.screener_priv_perfil_opcao_ok(v_def, 'porte', p_porte) then
    return jsonb_build_object('status', 'valor_invalido', 'campo', 'porte'); end if;
  if not public.screener_priv_perfil_opcao_ok(v_def, 'setor', p_setor) then
    return jsonb_build_object('status', 'valor_invalido', 'campo', 'setor'); end if;

  insert into public.screener_rhia_perfis (session_id, nome, empresa, cargo, nivel, porte, setor)
       values (v_sess.id, v_nome, v_empresa, v_cargo, p_nivel, p_porte, p_setor)
  on conflict (session_id) do update
     set nome = excluded.nome, empresa = excluded.empresa, cargo = excluded.cargo,
         nivel = excluded.nivel, porte = excluded.porte, setor = excluded.setor,
         atualizado_em = now();

  return jsonb_build_object('status', 'ok');
end $$;

-- A conferência de um valor de perfil contra a definição guardada. Separada
-- porque são três campos com a mesma regra, e regra repetida três vezes é regra
-- que diverge na quarta.
create function public.screener_priv_perfil_opcao_ok(p_def jsonb, p_campo text, p_valor text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from jsonb_array_elements(p_def -> 'perfil') campo,
           jsonb_array_elements(campo -> 'opcoes') op
     where campo ->> 'id' = p_campo
       and op ->> 'id' = p_valor
  )
$$;

-- 3) LER ----------------------------------------------------------------------
-- O motor da liderança precisa de `porte` e `nivel` para o CDL, e o documento
-- precisa de nome e empresa para a capa. Função NOVA em vez de acrescentar
-- campos a `screener_rhia_op_get_result`, que está em produção e serve o link
-- público anônimo — onde perfil não existe e não deve passar a aparecer.
create function public.screener_rhia_op_ler_perfil(p_token_hash text, p_preview_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sess public.screener_rhia_sessions%rowtype;
  v_bind public.screener_event_bindings%rowtype;
  v_p public.screener_rhia_perfis%rowtype;
begin
  select * into v_sess from public.screener_rhia_sessions where token_hash = p_token_hash;
  if not found then return jsonb_build_object('status', 'sessao_nao_encontrada'); end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(
       v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return jsonb_build_object('status', 'sessao_nao_encontrada');
  end if;

  select * into v_p from public.screener_rhia_perfis where session_id = v_sess.id;
  if v_p.session_id is null then return jsonb_build_object('status', 'sem_perfil'); end if;
  return jsonb_build_object('status', 'ok', 'perfil', jsonb_build_object(
    'nome', v_p.nome, 'empresa', v_p.empresa, 'cargo', v_p.cargo,
    'nivel', v_p.nivel, 'porte', v_p.porte, 'setor', v_p.setor));
end $$;

-- 4) A PURGA PASSA A APAGAR O PERFIL NO PRAZO DA SESSÃO ------------------------
-- O perfil é insumo da avaliação, como as respostas: some com elas, aos
-- `session_retention_days` do vínculo. O `on delete cascade` da tabela é rede de
-- segurança, não política: ele só age quando a LINHA de sessão sai, e a linha de
-- quem deixou contato sobrevive até os 365 dias do contato.
--
-- É `create or replace` do corpo em vigor, mantendo o resto PALAVRA POR PALAVRA.
-- O corpo anterior é o da 20260915120000, que por sua vez emendou a 20260914170000
-- — o rollback no cabeçalho aponta para o arquivo certo.
do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  if v_papel is null then raise exception 'papel da migration nao foi guardado'; end if;
end $$;
set role screener_owner;
create or replace function public.screener_rhia_purga()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_snap int := 0; v_resp int := 0; v_sem_lead int := 0; v_lead int := 0; v_cascas int := 0;
  v_conv int := 0; v_perfil int := 0;
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

  -- O perfil acompanha as respostas: mesmo prazo, mesma razão.
  delete from public.screener_rhia_perfis p
   using public.screener_rhia_sessions s
   join  public.screener_event_bindings b on b.id = s.binding_id
   where p.session_id = s.id
     and b.session_retention_days is not null
     and s.created_at < now() - make_interval(days => b.session_retention_days);
  get diagnostics v_perfil = row_count;

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
    'snapshots', v_snap, 'respostas', v_resp, 'perfis', v_perfil,
    'sessoes_sem_contato', v_sem_lead, 'sessoes_liberadas_pelo_contato', v_cascas,
    'contatos', v_lead, 'convites_vencidos', v_conv, 'em', now());
end $$;

comment on function public.screener_rhia_purga() is
  'Purga por retencao do rhia. Prazos vem do vinculo; vinculo sem retencao declarada nao e purgado. 180 dias apagam o conteudo da avaliacao (respostas, perfil e snapshot) de todos; a linha de sessao de quem deixou contato sobrevive ate os 365 dias do contato, porque continua ligada a PII pelo session_id unico do lead — ela NAO e anonima. Fase 3 (20260915120000): convites vencidos. Fase 1 ganhou os perfis em 20260916120000.';
do $$
declare v_papel text := nullif(current_setting('boomit.papel_da_migration', true), '');
begin
  execute format('set role %I', v_papel);
end $$;

-- 5) PROPRIEDADE E PRIVILÉGIOS -------------------------------------------------
alter table    public.screener_rhia_perfis owner to screener_owner;
alter function public.screener_rhia_op_salvar_perfil(text, text, text, text, text, text, text, text) owner to screener_owner;
alter function public.screener_rhia_op_ler_perfil(text, text)                                        owner to screener_owner;
alter function public.screener_priv_perfil_opcao_ok(jsonb, text, text)                               owner to screener_owner;

revoke all on table public.screener_rhia_perfis from public, anon, authenticated, service_role, screener_runtime;

revoke all on function public.screener_rhia_op_salvar_perfil(text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.screener_rhia_op_ler_perfil(text, text)
  from public, anon, authenticated, service_role;
-- A auxiliar não é RPC: só as duas acima a chamam, e elas rodam como a dona.
revoke all on function public.screener_priv_perfil_opcao_ok(jsonb, text, text)
  from public, anon, authenticated, service_role, screener_runtime;

grant execute on function public.screener_rhia_op_salvar_perfil(text, text, text, text, text, text, text, text) to screener_runtime;
grant execute on function public.screener_rhia_op_ler_perfil(text, text)                                        to screener_runtime;

-- 6) GUARDAS DE ACEITAÇÃO ------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.screener_rhia_op_salvar_perfil(text,text,text,text,text,text,text,text)',
    'public.screener_rhia_op_ler_perfil(text,text)'
  ] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') then
      raise exception 'RPC de perfil alcancavel por papel publico: %', f; end if;
    if not has_function_privilege('screener_runtime', f, 'execute') then
      raise exception 'o runtime perdeu o execute em: %', f; end if;
  end loop;

  if has_function_privilege('screener_runtime', 'public.screener_priv_perfil_opcao_ok(jsonb,text,text)', 'execute') then
    raise exception 'a auxiliar de validacao nao e RPC e o runtime nao deve alcanca-la'; end if;

  -- PII: zero privilégio de tabela para quem quer que seja além da dona.
  if has_table_privilege('screener_runtime', 'public.screener_rhia_perfis',
                         'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('anon', 'public.screener_rhia_perfis', 'select')
     or has_table_privilege('authenticated', 'public.screener_rhia_perfis', 'select')
     or has_table_privilege('service_role', 'public.screener_rhia_perfis', 'select') then
    raise exception 'a tabela de perfil ficou alcancavel por tabela — ela guarda nome, empresa e cargo';
  end if;

  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'screener_rhia_perfis'
                    and c.relrowsecurity and pg_get_userbyid(c.relowner) = 'screener_owner') then
    raise exception 'a tabela de perfil precisa de RLS ligada e dono screener_owner';
  end if;

  -- A purga tem de continuar do jeito que estava: dona certa e fora do alcance
  -- de todo mundo, menos do executor do cron.
  if coalesce(pg_get_userbyid((select proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'screener_rhia_purga')), 'ausente') <> 'screener_owner' then
    raise exception 'a purga ficou com dono errado, ou sumiu, depois do replace';
  end if;
  if not has_function_privilege(current_user, 'public.screener_rhia_purga()', 'execute') then
    raise exception 'o executor do cron perdeu o EXECUTE na purga'; end if;
  if has_function_privilege('anon', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('authenticated', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('service_role', 'public.screener_rhia_purga()', 'execute')
     or has_function_privilege('screener_runtime', 'public.screener_rhia_purga()', 'execute') then
    raise exception 'a purga ficou alcancavel por papel que nao deveria executa-la';
  end if;
end $$;

-- 7) fecha a fronteira
do $$
declare v_papel name := current_user;
begin
  revoke create on schema public from screener_owner;
exception when insufficient_privilege then
  set local role pg_database_owner;
  revoke create on schema public from screener_owner;
  execute format('set role %I', v_papel);
end $$;

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
