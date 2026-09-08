-- =============================================================
-- SCREENER — captura de lead (degustação pública) — função da fronteira
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Escrita e testada em pglite.
--
-- CAMINHO NOVO, ADITIVO: não altera nenhuma das 6 funções nem a tabela existentes.
-- A tabela `screener_leads` (única com PII) já existe desde 20260902143339 e já é
-- dona de screener_owner desde 20260903120000, com screener_runtime SEM acesso.
-- Aqui só se acrescenta a 7ª função `screener_op_capturar_lead` (SECURITY DEFINER),
-- que é o ÚNICO caminho de escrita da PII — a edge nunca faz INSERT direto.
--
-- REGRAS (a função é a fronteira, não confia no cliente):
--  - resolve a sessão pelo token_hash; inexistente → null (edge → 404);
--  - credencial de prévia validada para internal_preview (só o hash chega ao banco);
--  - só captura lead de sessão JÁ SUBMETIDA e válida (não revogada/expirada) — lead
--    de degustação é de quem concluiu; evita PII de sessão abandonada;
--  - respeita lead_capture_mode do vínculo: 'none' → recusa;
--  - e-mail validado e normalizado (lower+trim); opt-in coerente (data só se true);
--  - 1 lead por sessão (unique session_id) → upsert idempotente;
--  - lead_source = event_slug do vínculo.
-- =============================================================

grant screener_owner to current_user;  -- membership temporária p/ reatribuir dono

create or replace function public.screener_op_capturar_lead(
  p_token_hash text, p_preview_hash text, p_nome text, p_email text, p_opt_in boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.screener_sessions%rowtype; v_bind public.screener_event_bindings%rowtype;
        v_email text; v_email_norm text; v_nome text; v_opt boolean; v_opt_at timestamptz;
begin
  select * into v_sess from public.screener_sessions where token_hash = p_token_hash for update;
  if not found then return null; end if;
  select * into v_bind from public.screener_event_bindings where id = v_sess.binding_id;
  if v_bind.status = 'internal_preview' and not public.screener_priv_previa_ok(
       v_bind.preview_credential_hash, v_bind.preview_expires_at, v_bind.preview_revoked_at, p_preview_hash) then
    return null;
  end if;
  if v_bind.lead_capture_mode = 'none' then raise exception 'lead_desativado'; end if;
  if v_sess.status <> 'submitted' then raise exception 'sessao_nao_submetida'; end if;
  if v_sess.revoked_at is not null or (v_sess.expires_at is not null and v_sess.expires_at <= now()) then
    raise exception 'sessao_invalida';
  end if;

  v_email := trim(coalesce(p_email, ''));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalido';
  end if;
  v_email_norm := lower(v_email);
  v_nome := nullif(trim(coalesce(p_nome, '')), '');
  v_opt := coalesce(p_opt_in, false);
  v_opt_at := case when v_opt then now() else null end;

  insert into public.screener_leads
    (session_id, nome, email, email_normalized, marketing_opt_in, marketing_opt_in_at, lead_source)
    values (v_sess.id, v_nome, v_email, v_email_norm, v_opt, v_opt_at, v_bind.event_slug)
  on conflict (session_id) do update set
    nome = excluded.nome, email = excluded.email, email_normalized = excluded.email_normalized,
    marketing_opt_in = excluded.marketing_opt_in, marketing_opt_in_at = excluded.marketing_opt_in_at;

  return jsonb_build_object('status', 'ok');
end $$;

-- PROPRIEDADE + PRIVILÉGIOS (mesmo padrão das 6: dono screener_owner, EXECUTE só runtime)
do $$ begin grant create on schema public to screener_owner;
exception when insufficient_privilege then set local role pg_database_owner; grant create on schema public to screener_owner; reset role; end $$;

alter function public.screener_op_capturar_lead(text, text, text, text, boolean) owner to screener_owner;
revoke all on function public.screener_op_capturar_lead(text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.screener_op_capturar_lead(text, text, text, text, boolean) to screener_runtime;

do $$ begin revoke create on schema public from screener_owner;
exception when insufficient_privilege then set local role pg_database_owner; revoke create on schema public from screener_owner; reset role; end $$;
revoke screener_owner from current_user;
