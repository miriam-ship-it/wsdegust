// =============================================================
// LOADER RHIA — gerador da carga pública do Diagnóstico Boomit RH + IA v2
//
// Lê a fonte ÚNICA (screener/rhia/pacote/instrumento-rh-ia-v1.json, via
// screener/rhia/definicao.mjs — o JSON verbatim, sem reescrita), calcula o
// checksum pelo MESMO `canonicalize` do motor V1 (screener/motor/definicao.mjs,
// node) — regra idêntica à reimplementação Web Crypto que a edge usa em
// screener/rhia/definicao.mjs (igualdade provada em gerar-carga-rhia.test.mjs) —
// e emite um SQL de carga transacional e idempotente:
//   - insere a versão do instrumento INATIVA + o vínculo PÚBLICO do evento;
//   - no-op se a versão já existir com o mesmo checksum E a mesma definição;
//   - FALHA se a versão existir com checksum diferente (força nova versão);
//   - FALHA se o vínculo existir com configuração divergente (não sobrescreve);
//   - idempotente ⇒ seguro no replay greenfield.
//
// Não fala com o banco. Só gera o SQL (fonte no repo). O apply é passo à parte,
// sob aprovação. O vínculo nasce PÚBLICO (public_pilot) e SEM credencial: o link
// é público — qualquer um responde. É uma ISCA DE LEAD, então a captura é
// obrigatória (required_before_result) e o servidor retém o resultado até o
// lead. Vínculo público exige retenção definida (CHECK do schema).
//
// Uso:  node screener/loader/gerar-carga-rhia.mjs   # imprime o SQL em stdout
// Destino canônico (posterior ao schema+rpc rhia 20260912120000):
//   supabase/migrations/20260913120000_screener_rhia_carga_publica.sql
// =============================================================

import { createHash } from "node:crypto";
import { canonicalize } from "../motor/definicao.mjs";
import { instrumento } from "../rhia/definicao.mjs";

/** Slug público do evento de degustação (padrão do frontend via ?evento=). */
export const SLUG_PUBLICO_RHIA = "boomit-degustacao-rh-ia";

/** Literal SQL de texto, com escape de aspas simples. */
function sqlLit(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * Gera o SQL de carga rhia (DO block transacional e idempotente).
 *
 * Configuração do vínculo PÚBLICO (ajuste ANTES de aplicar, se preciso):
 *   slug=boomit-degustacao-rh-ia · status=public_pilot · lead=required_before_result
 *   retenção: sessão 180 dias, lead 365 dias (exigida para vínculo público).
 *
 * @param {object} [def=instrumento]  o JSON do pacote (instrument_id/instrument_version)
 * @param {{slug?:string,status?:string,leadMode?:string,sessionRetentionDays?:number,leadRetentionDays?:number}} [binding]
 * @returns {string}
 */
export function gerarCargaRhiaSQL(def = instrumento, binding = {}) {
  const canonical = canonicalize(def);
  const sum = createHash("sha256").update(canonical).digest("hex");
  const code = def.instrument_id;
  const version = def.instrument_version;
  if (typeof code !== "string" || typeof version !== "string") {
    throw new Error("Definição sem instrument_id/instrument_version: não é o JSON do pacote rhia.");
  }
  const slug = binding.slug || SLUG_PUBLICO_RHIA;
  const status = binding.status || "public_pilot";
  const leadMode = binding.leadMode || "required_before_result";
  const sessionRet = binding.sessionRetentionDays ?? 180;
  const leadRet = binding.leadRetentionDays ?? 365;

  const TAG = "$def$";
  if (canonical.includes(TAG)) {
    throw new Error("Colisão de dollar-quoting: o JSON canônico contém o rótulo do delimitador.");
  }

  return `-- =============================================================
-- SCREENER_RHIA — carga do instrumento ${code} ${version} + vínculo público
--
-- ⚠️ GERADO por screener/loader/gerar-carga-rhia.mjs a partir de
--    screener/rhia/pacote/instrumento-rh-ia-v1.json — NÃO editar à mão. Para
--    mudar o conteúdo, edite a fonte (o pacote) e regenere (o checksum muda
--    junto). O JSON entra VERBATIM: as 30 questões são literais do pacote.
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Rode DEPOIS da migration de schema+rpc rhia
--    (20260912120000). Transacional (bloco DO atômico) e idempotente:
--   INSTRUMENTO: insere se ausente; no-op só se checksum E definição batem;
--     falha se checksum diverge, ou se checksum bate mas definição diverge.
--   VÍNCULO: idempotência explícita (sem cláusula silenciosa de conflito).
--     Nasce PÚBLICO (${status}) SEM credencial — o link é público (isca de lead),
--     captura obrigatória (${leadMode}): o servidor retém o resultado
--     até o lead. Aplicar isto = deixar o evento pronto para ir ao ar assim que
--     a edge e o frontend estiverem publicados.
--
-- As tabelas pertencem a screener_owner desde 20260903120000 e têm RLS ligada;
-- a membership temporária abaixo dá ao executor da migration os privilégios do
-- dono para inserir, e é revogada no fim (mesmo padrão das migrations da casa).
--
-- checksum = sha256(canonicalize(definição)) = ${sum}
-- =============================================================

-- membership temporária: privilégios do dono para a carga (revogada no fim)
grant screener_owner to current_user;

do $$
declare
  v_code        text  := ${sqlLit(code)};
  v_version     text  := ${sqlLit(version)};
  v_checksum    text  := ${sqlLit(sum)};
  v_definition  jsonb := ${TAG}${canonical}${TAG}::jsonb;
  -- configuração PRETENDIDA do vínculo público rhia (isca de lead)
  v_slug        text    := ${sqlLit(slug)};
  v_status      text    := ${sqlLit(status)};
  v_is_current  boolean := true;
  v_result_mode text    := 'immediate';
  v_lead_mode   text    := ${sqlLit(leadMode)};
  v_session_ret integer := ${Number(sessionRet)};
  v_lead_ret    integer := ${Number(leadRet)};
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
    raise notice 'carga rhia: instrumento % % inserido (inativo)', v_code, v_version;
  elsif v_ex_sum is distinct from v_checksum then
    raise exception 'carga rhia recusada: checksum divergente para % % (banco=%, repo=%). Publique uma nova versão.',
      v_code, v_version, v_ex_sum, v_checksum;
  elsif v_ex_def is distinct from v_definition then
    raise exception 'carga rhia recusada: checksum igual mas definição divergente para % % — possível checksum cadastrado incorretamente.',
      v_code, v_version;
  else
    raise notice 'carga rhia: instrumento % % já presente e coincidente — no-op', v_code, v_version;
  end if;

  -- ---------- VÍNCULO (idempotência explícita) ----------
  select * into v_b
    from public.screener_event_bindings
    where event_slug = v_slug and instrument_code = v_code and instrument_version = v_version;

  if not found then
    if exists (select 1 from public.screener_event_bindings where event_slug = v_slug and is_current) then
      raise exception 'carga rhia recusada: já existe outro vínculo corrente para o evento % — recuso criar duplicado.', v_slug;
    end if;
    insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
       session_retention_days, lead_retention_days, branding)
      values (v_slug, v_code, v_version, v_is_current, v_status, v_result_mode, v_lead_mode,
              v_session_ret, v_lead_ret, v_branding);
    raise notice 'carga rhia: vínculo % criado (status %)', v_slug, v_status;
  elsif v_b.status = v_status
        and v_b.is_current = v_is_current
        and v_b.result_mode = v_result_mode
        and v_b.lead_capture_mode = v_lead_mode
        and v_b.branding = v_branding
        and v_b.session_retention_days is not distinct from v_session_ret
        and v_b.lead_retention_days is not distinct from v_lead_ret then
    raise notice 'carga rhia: vínculo % já presente e coincidente — no-op', v_slug;
  else
    raise exception 'carga rhia recusada: vínculo % existe com configuração divergente — recuso sobrescrever.', v_slug;
  end if;
end
$$;

-- fecha a fronteira: revoga a membership temporária
revoke screener_owner from current_user;
`;
}

// CLI: imprime o SQL em stdout (a gravação/commit do arquivo é externa).
const executadoDireto = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("screener/loader/gerar-carga-rhia.mjs");
if (executadoDireto) {
  process.stdout.write(gerarCargaRhiaSQL());
}
