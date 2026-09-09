// =============================================================
// LOADER V2 — gerador da carga inativa do instrumento de IA V2
//
// Lê a fonte ÚNICA (screener/v2/instrumento-ia-v2.mjs), calcula o checksum pelo
// MESMO `canonicalize` do motor (igual ao que a edge computa em checksumV2), e
// emite um SQL de carga transacional e idempotente:
//   - insere a versão do instrumento INATIVA + um vínculo técnico interno V2;
//   - no-op se a versão já existir com o mesmo checksum;
//   - FALHA se a versão existir com checksum diferente (força nova versão);
//   - idempotente ⇒ seguro no replay greenfield.
//
// Não fala com o banco. Só gera o SQL (fonte no repo). O apply é passo à parte,
// sob aprovação. O vínculo nasce em internal_preview SEM credencial — inerte até
// que o hash da credencial seja semeado FORA da migration (regra de segurança:
// a chave nunca vai à migration; só o hash sha256, por statement parametrizado).
//
// Uso:  node screener/loader/gerar-carga-v2.mjs   # imprime o SQL em stdout
// Destino canônico (posterior ao schema+rpc V2 20260906120000):
//   supabase/migrations/20260907120000_screener_v2_carga_inativa.sql
// =============================================================

import { createHash } from "node:crypto";
import { canonicalize } from "../motor/definicao.mjs";
import { instrumentoV2 } from "../edge/definicao-v2.mjs";

/** Literal SQL de texto, com escape de aspas simples. */
function sqlLit(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * Gera o SQL de carga V2 (DO block transacional e idempotente).
 *
 * Configuração do vínculo (ajuste ANTES de aplicar, se preciso):
 *   slug=preview-interno-ia-v2 · status=internal_preview · lead=none.
 * Para o evento PÚBLICO, crie um vínculo NOVO (outro slug, ex.
 * boomit-degustacao-ia-v2) — não sobrescreva este (regra da casa).
 *
 * @param {object} [def=instrumentoV2]
 * @param {{slug?:string,status?:string,leadMode?:string}} [binding]
 * @returns {string}
 */
export function gerarCargaV2SQL(def = instrumentoV2, binding = {}) {
  const canonical = canonicalize(def);
  const sum = createHash("sha256").update(canonical).digest("hex");
  const code = def.code;
  const version = def.version;
  const slug = binding.slug || "preview-interno-ia-v2";
  const status = binding.status || "internal_preview";
  const leadMode = binding.leadMode || "none";

  const TAG = "$def$";
  if (canonical.includes(TAG)) {
    throw new Error("Colisão de dollar-quoting: o JSON canônico contém o rótulo do delimitador.");
  }

  return `-- =============================================================
-- SCREENER_IA_V2 — carga INATIVA de ${code} ${version}
--
-- ⚠️ GERADO por screener/loader/gerar-carga-v2.mjs a partir de
--    screener/v2/instrumento-ia-v2.mjs — NÃO editar à mão. Para mudar o
--    conteúdo, edite a fonte e regenere (o checksum muda junto).
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Rode DEPOIS da migration de schema+rpc V2
--    (20260906120000). Transacional (bloco DO atômico) e idempotente:
--   INSTRUMENTO: insere se ausente; no-op só se checksum E definição batem;
--     falha se checksum diverge, ou se checksum bate mas definição diverge.
--   VÍNCULO: idempotência explícita (sem cláusula silenciosa de conflito).
--     Nasce em ${status} SEM credencial (inerte até semear o hash fora daqui).
--     Para o evento público, crie um vínculo NOVO (outro slug) — não altere este.
--
-- checksum = sha256(canonicalize(definição)) = ${sum}
-- =============================================================
do $$
declare
  v_code        text  := ${sqlLit(code)};
  v_version     text  := ${sqlLit(version)};
  v_checksum    text  := ${sqlLit(sum)};
  v_definition  jsonb := ${TAG}${canonical}${TAG}::jsonb;
  -- configuração PRETENDIDA do vínculo técnico interno V2
  v_slug        text    := ${sqlLit(slug)};
  v_status      text    := ${sqlLit(status)};
  v_is_current  boolean := true;
  v_result_mode text    := 'immediate';
  v_lead_mode   text    := ${sqlLit(leadMode)};
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
    raise notice 'carga v2: instrumento % % inserido (inativo)', v_code, v_version;
  elsif v_ex_sum is distinct from v_checksum then
    raise exception 'carga v2 recusada: checksum divergente para % % (banco=%, repo=%). Publique uma nova versão.',
      v_code, v_version, v_ex_sum, v_checksum;
  elsif v_ex_def is distinct from v_definition then
    raise exception 'carga v2 recusada: checksum igual mas definição divergente para % % — possível checksum cadastrado incorretamente.',
      v_code, v_version;
  else
    raise notice 'carga v2: instrumento % % já presente e coincidente — no-op', v_code, v_version;
  end if;

  -- ---------- VÍNCULO (idempotência explícita) ----------
  select * into v_b
    from public.screener_event_bindings
    where event_slug = v_slug and instrument_code = v_code and instrument_version = v_version;

  if not found then
    if exists (select 1 from public.screener_event_bindings where event_slug = v_slug and is_current) then
      raise exception 'carga v2 recusada: já existe outro vínculo corrente para o evento % — recuso criar duplicado.', v_slug;
    end if;
    insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode, branding)
      values (v_slug, v_code, v_version, v_is_current, v_status, v_result_mode, v_lead_mode, v_branding);
    raise notice 'carga v2: vínculo % criado (status %)', v_slug, v_status;
  elsif v_b.status = v_status
        and v_b.is_current = v_is_current
        and v_b.result_mode = v_result_mode
        and v_b.lead_capture_mode = v_lead_mode
        and v_b.branding = v_branding
        and v_b.session_retention_days is null
        and v_b.lead_retention_days is null then
    raise notice 'carga v2: vínculo % já presente e coincidente — no-op', v_slug;
  else
    raise exception 'carga v2 recusada: vínculo % existe com configuração divergente — recuso sobrescrever.', v_slug;
  end if;
end
$$;
`;
}

// CLI: imprime o SQL em stdout (a gravação/commit do arquivo é externa).
const executadoDireto = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("screener/loader/gerar-carga-v2.mjs");
if (executadoDireto) {
  process.stdout.write(gerarCargaV2SQL());
}
