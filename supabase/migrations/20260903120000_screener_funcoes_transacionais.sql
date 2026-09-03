-- =============================================================
-- SCREENER — funções transacionais da edge (corte 3, endurecimento)
--
-- ⚠️ NÃO APLICADA. Escrita e testada (pglite) para revisão; sem apply.
--
-- Garantem ATOMICIDADE real independente do adaptador: cada função trava a
-- sessão (`for update`), revalida estado/vigência/sessão e faz a escrita numa
-- única transação. O cálculo continua no motor `.mjs`; a finalização confirma,
-- sob a trava, que as respostas não mudaram entre leitura e persistência
-- (compara a serialização canônica), evitando gravar resultado obsoleto.
--
-- `search_path` fixo; `EXECUTE` revogado de public/anon/authenticated e
-- concedido apenas a service_role (a edge).
-- =============================================================

-- Trava a sessão, confirma 'open', valida o vínculo (estado + vigência) e faz o
-- upsert da resposta. Raise em qualquer condição inválida.
create or replace function public.screener_save_response(
  p_session_id uuid, p_item_code text, p_stage_code text
) returns void
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_sess public.screener_sessions%rowtype;
  v_bind public.screener_event_bindings%rowtype;
begin
  select * into v_sess from public.screener_sessions where id = p_session_id for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;

  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;

  insert into public.screener_responses (session_id, item_code, stage_code, answered_at)
    values (p_session_id, p_item_code, p_stage_code, now())
  on conflict (session_id, item_code) do update set stage_code = excluded.stage_code, revised_at = now();
end;
$$;

-- Trava a sessão; idempotente (se já submetida, devolve 'ja_submetida' sem
-- reescrever). Revalida vínculo, confere que a serialização canônica atual das
-- respostas bate com a esperada (calculada na edge), insere o snapshot de forma
-- idempotente e fecha a sessão — tudo atômico.
create or replace function public.screener_finalize_submission(
  p_session_id uuid,
  p_expected_canonical text,
  p_result jsonb,
  p_instrument_checksum text,
  p_input_checksum text,
  p_scoring_version text,
  p_report_version text
) returns text
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_sess public.screener_sessions%rowtype;
  v_bind public.screener_event_bindings%rowtype;
  v_canonical text;
begin
  select * into v_sess from public.screener_sessions where id = p_session_id for update;
  if not found then raise exception 'sessao_inexistente'; end if;
  if v_sess.status = 'submitted' then return 'ja_submetida'; end if;   -- idempotente
  if v_sess.status <> 'open' then raise exception 'sessao_nao_aberta'; end if;
  if v_sess.revoked_at is not null or v_sess.expires_at <= now() then raise exception 'sessao_invalida'; end if;

  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status in ('inactive','closed') then raise exception 'indisponivel'; end if;
  if (v_bind.starts_at is not null and now() < v_bind.starts_at)
     or (v_bind.ends_at is not null and now() > v_bind.ends_at) then raise exception 'fora_de_vigencia'; end if;

  -- as respostas não podem ter mudado entre o cálculo e a finalização
  select string_agg(item_code || ':' || stage_code, '|' order by item_code)
    into v_canonical from public.screener_responses where session_id = p_session_id;
  if v_canonical is distinct from p_expected_canonical then
    raise exception 'respostas_mudaram';
  end if;

  insert into public.screener_result_snapshots
    (session_id, event_slug, instrument_code, instrument_version, scoring_version, report_version,
     instrument_checksum, input_checksum, result)
    values (p_session_id, v_bind.event_slug, v_bind.instrument_code, v_bind.instrument_version,
            p_scoring_version, p_report_version, p_instrument_checksum, p_input_checksum, p_result)
  on conflict (session_id, instrument_checksum, input_checksum, scoring_version, report_version) do nothing;

  update public.screener_sessions set status = 'submitted', submitted_at = now()
    where id = p_session_id and status = 'open';
  return 'finalizada';
end;
$$;

-- Privilégios: só a edge (service_role) executa.
revoke all on function public.screener_save_response(uuid, text, text) from public, anon, authenticated;
revoke all on function public.screener_finalize_submission(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.screener_save_response(uuid, text, text) to service_role;
grant execute on function public.screener_finalize_submission(uuid, text, jsonb, text, text, text, text) to service_role;
