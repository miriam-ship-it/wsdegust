-- =============================================================
-- SCREENER — o limite de criação de sessão deixa de tratar uma SALA como abuso.
--
-- O DEFEITO, encontrado em produção no primeiro uso real: `start_preview` era
-- 10 por hora **por IP**. A política foi escrita quando o único vínculo era uma
-- prévia interna, com um punhado de pessoas e credencial. O vínculo público do
-- diagnóstico RH+IA é outra coisa: é um link aberto, distribuído, e quem o abre
-- costuma estar atrás de um IP compartilhado — o wifi corporativo do workshop,
-- a rede do Ibmec, o NAT da operadora no celular. Com 10/hora por IP, a 11ª
-- pessoa da mesma sala recebia "Muitas tentativas em pouco tempo".
--
-- Ou seja: o controle não estava barrando abuso, estava barrando o público.
--
-- A CORREÇÃO: `start_preview` passa a 5000 por hora por IP. O número é
-- deliberadamente alto e continua sendo um teto:
--   * uma sala de 200 pessoas atrás de um IP, cada uma recomeçando algumas
--     vezes, não chega perto;
--   * o NAT de uma operadora, com muita gente vindo do mesmo IP, também não;
--   * um script criando sessão em série chega em minutos, e aí é barrado.
-- O objetivo do limite deixa de ser "racionar acesso" e passa a ser só "conter
-- automação desenfreada", que é o que faz sentido num link público.
--
-- O que NÃO muda, de propósito:
--   * `autosave` (120/h), `submit` (10/h) e `consulta` (60/h) continuam iguais.
--     Eles são chaveados pelo TOKEN DA SESSÃO, não pelo IP, então nunca punem
--     uma pessoa pelo que a sala fez. São a proteção que de fato importa aqui.
--   * `previa_invalida` (5 por 10 min) continua igual: é força bruta de
--     credencial, e o vínculo público não tem credencial nenhuma.
--
-- O CORPO É CÓPIA FIEL da 20260904120000: validação da chave por regex de hex,
-- coleta amortizada limitada a 50 linhas com `skip locked`, mesma forma de
-- resposta. **A única diferença é o número de `start_preview`.** Conferido linha
-- a linha contra o original antes de aplicar — um `create or replace` é a hora
-- em que se reescreve sem querer o que não se queria tocar.
--
-- Aditiva e reversível: `create or replace` da função; voltar é trocar o número.
-- Não exige redeploy da edge — a política vive no banco.
-- =============================================================

grant screener_owner to current_user;

create or replace function public.screener_op_rate_check(p_key_hmac text, p_operation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_limit int; v_window int; v_start timestamptz; v_count int; v_now timestamptz := now();
begin
  case p_operation
    -- Criação de sessão: chaveada por IP, e IP é compartilhado. Teto alto, só
    -- contra automação. Ver o cabeçalho desta migration.
    when 'start_preview' then v_limit:=5000; v_window:=3600;
    when 'autosave' then v_limit:=120; v_window:=3600;
    when 'submit' then v_limit:=10; v_window:=3600;
    when 'consulta' then v_limit:=60; v_window:=3600;
    else return jsonb_build_object('status','unknown_operation','remaining',0,'retry_after_seconds',0); end case;
  if v_limit is null or v_window is null or v_window <= 0 then
    return jsonb_build_object('status','policy_error','remaining',0,'retry_after_seconds',0); end if;
  if p_key_hmac is null or p_key_hmac !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','bad_key','remaining',0,'retry_after_seconds',0); end if;

  v_start := to_timestamp(floor(extract(epoch from v_now) / v_window) * v_window);
  insert into public.screener_rate_limit (key_hmac, operation, window_start, count)
       values (p_key_hmac, p_operation, v_start, 1)
  on conflict (key_hmac, operation, window_start)
    do update set count = case when public.screener_rate_limit.count >= 2147483647
                               then 2147483647 else public.screener_rate_limit.count + 1 end
  returning count into v_count;

  begin  -- retenção amortizada; ordem + skip locked; guardada (não reverte o consumo do bucket)
    delete from public.screener_rate_limit where ctid in (
      select ctid from public.screener_rate_limit where window_start < v_now - interval '48 hours'
      order by window_start limit 50 for update skip locked);
  exception when others then raise warning 'screener_rate_gc_inline_falhou: %', sqlerrm; end;

  return jsonb_build_object(
    'status', case when v_count <= v_limit then 'allowed' else 'limited' end,
    'remaining', greatest(v_limit - v_count, 0),
    'retry_after_seconds', case when v_count <= v_limit then 0
      else ceil(extract(epoch from (v_start + make_interval(secs => v_window) - v_now)))::int end);
end $$;

alter function public.screener_op_rate_check(text, text) owner to screener_owner;
revoke all on function public.screener_op_rate_check(text, text) from public, anon, authenticated, service_role;
grant execute on function public.screener_op_rate_check(text, text) to screener_runtime;

-- Guarda de aceitação: a política nova tem de estar valendo, e a fronteira da
-- função tem de continuar fechada. Falhar aqui é melhor que descobrir no ar.
do $$
declare r jsonb; chave text := repeat('a', 64);
begin
  r := public.screener_op_rate_check(chave, 'start_preview');
  if r->>'status' <> 'allowed' or (r->>'remaining')::int < 4000 then
    raise exception 'limite de start_preview nao subiu: %', r;
  end if;
  if public.screener_op_rate_check(chave, 'operacao_inexistente')->>'status' <> 'unknown_operation' then
    raise exception 'operacao desconhecida deixou de ser rejeitada';
  end if;
  if has_function_privilege('anon', 'public.screener_op_rate_check(text,text)', 'execute')
     or has_function_privilege('service_role', 'public.screener_op_rate_check(text,text)', 'execute') then
    raise exception 'a funcao ficou executavel por papel publico';
  end if;
  if not has_function_privilege('screener_runtime', 'public.screener_op_rate_check(text,text)', 'execute') then
    raise exception 'o runtime perdeu o execute';
  end if;
  delete from public.screener_rate_limit where key_hmac = chave;   -- limpa o teste
end $$;

-- fecha a fronteira: devolve a membership temporária
revoke screener_owner from current_user;
