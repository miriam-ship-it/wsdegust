// =============================================================
// LOADER — gerador da carga inativa do instrumento
//
// Lê a fonte ÚNICA (screener/instrumento/SCREENER_EMPRESA_IA_V1.json) via o
// mesmo módulo do motor, calcula o checksum pelo MESMO `canonicalize`, e emite
// um SQL de carga transacional e idempotente:
//   - insere a versão do instrumento INATIVA + o vínculo técnico interno;
//   - no-op se a versão já existir com o mesmo checksum;
//   - FALHA se a versão existir com checksum diferente (força nova versão);
//   - idempotente ⇒ seguro no replay greenfield.
//
// Não fala com o banco. Só gera o SQL (fonte no repo). O apply é um passo à
// parte, sob aprovação.
//
// Uso:  node screener/loader/gerar-carga.mjs   # imprime o SQL em stdout
// Destino canônico (posterior ao schema 20260902143339):
//   supabase/migrations/20260902150000_screener_carga_inativa_v1.sql
// =============================================================

import { instrumento, canonicalize, checksum } from "../motor/definicao.mjs";

/** Literal SQL de texto, com escape de aspas simples. */
function sqlLit(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * Gera o SQL de carga (DO block transacional e idempotente).
 * @param {object} [def=instrumento]
 * @returns {string}
 */
export function gerarCargaSQL(def = instrumento) {
  const canonical = canonicalize(def);
  const sum = checksum(def);
  const code = def.instrument.code;
  const version = def.instrument.version;

  // dollar-quoting seguro: o JSON canônico não pode conter o rótulo
  const TAG = "$def$";
  if (canonical.includes(TAG)) {
    throw new Error("Colisão de dollar-quoting: o JSON canônico contém o rótulo do delimitador.");
  }

  return `-- =============================================================
-- SCREENER — carga INATIVA de ${code} ${version}
--
-- ⚠️ GERADO por screener/loader/gerar-carga.mjs a partir de
--    screener/instrumento/${code}.json — NÃO editar à mão. Para mudar o
--    conteúdo, edite o JSON e regenere (o checksum muda junto).
--
-- Transacional (bloco DO atômico) e idempotente com falha explícita:
--   INSTRUMENTO: insere se ausente; no-op só se checksum E definição batem;
--     falha se checksum diverge, ou se checksum bate mas definição diverge
--     (pega checksum cadastrado errado).
--   VÍNCULO: idempotência explícita (nada de cláusula silenciosa de conflito).
--     Se o vínculo exato não existe, falha caso já haja OUTRO vínculo corrente
--     para o evento; senão insere. Se existe,
--     compara todos os campos pretendidos: no-op se coincidem, falha se algum
--     diverge. Assim a carga nunca "termina com sucesso sem criar o pretendido".
-- Integra o replay greenfield (rode DEPOIS da migration de schema screener_*).
--
-- checksum = sha256(canonicalize(definição)) = ${sum}
-- =============================================================
do $$
declare
  v_code        text  := ${sqlLit(code)};
  v_version     text  := ${sqlLit(version)};
  v_checksum    text  := ${sqlLit(sum)};
  v_definition  jsonb := ${TAG}${canonical}${TAG}::jsonb;
  -- configuração PRETENDIDA do vínculo técnico interno
  v_slug        text    := 'preview-interno-ia-v1';
  v_status      text    := 'internal_preview';
  v_is_current  boolean := true;
  v_result_mode text    := 'immediate';
  v_lead_mode   text    := 'optional_after_submit';
  v_branding    jsonb   := '{}'::jsonb;
  -- estado existente
  v_ex_sum   text;
  v_ex_def   jsonb;
  v_b        public.screener_event_bindings%rowtype;
begin
  -- ---------- INSTRUMENTO ----------
  select checksum, definition into v_ex_sum, v_ex_def
    from public.screener_instrument_versions
    where instrument_code = v_code and instrument_version = v_version;

  if not found then
    insert into public.screener_instrument_versions
      (instrument_code, instrument_version, definition, checksum, status)
      values (v_code, v_version, v_definition, v_checksum, 'inactive');
    raise notice 'carga: instrumento % % inserido (inativo)', v_code, v_version;
  elsif v_ex_sum is distinct from v_checksum then
    raise exception 'carga recusada: checksum divergente para % % (banco=%, repo=%). Publique uma nova versão.',
      v_code, v_version, v_ex_sum, v_checksum;
  elsif v_ex_def is distinct from v_definition then
    raise exception 'carga recusada: checksum igual mas definição divergente para % % — possível checksum cadastrado incorretamente.',
      v_code, v_version;
  else
    raise notice 'carga: instrumento % % já presente e coincidente — no-op', v_code, v_version;
  end if;

  -- ---------- VÍNCULO (idempotência explícita) ----------
  select * into v_b
    from public.screener_event_bindings
    where event_slug = v_slug and instrument_code = v_code and instrument_version = v_version;

  if not found then
    if exists (select 1 from public.screener_event_bindings where event_slug = v_slug and is_current) then
      raise exception 'carga recusada: já existe outro vínculo corrente para o evento % — recuso criar duplicado.', v_slug;
    end if;
    insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode, branding)
      values (v_slug, v_code, v_version, v_is_current, v_status, v_result_mode, v_lead_mode, v_branding);
    raise notice 'carga: vínculo % criado (status %)', v_slug, v_status;
  elsif v_b.status = v_status
        and v_b.is_current = v_is_current
        and v_b.result_mode = v_result_mode
        and v_b.lead_capture_mode = v_lead_mode
        and v_b.branding = v_branding
        and v_b.session_retention_days is null
        and v_b.lead_retention_days is null then
    raise notice 'carga: vínculo % já presente e coincidente — no-op', v_slug;
  else
    raise exception 'carga recusada: vínculo % existe com configuração divergente — recuso sobrescrever.', v_slug;
  end if;
end
$$;
`;
}

// CLI: imprime o SQL em stdout (a gravação/commit do arquivo é externa).
const executadoDireto = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("screener/loader/gerar-carga.mjs");
if (executadoDireto) {
  process.stdout.write(gerarCargaSQL());
}
