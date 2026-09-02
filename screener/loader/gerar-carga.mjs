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
-- Transacional e idempotente: no-op se a versão já existir com o mesmo
-- checksum; FALHA se existir com checksum diferente. Integra o replay greenfield
-- (rode DEPOIS da migration de schema screener_*).
--
-- Depende do MESMO canonicalize do motor: o checksum abaixo é
-- sha256(canonicalize(definição)). checksum = ${sum}
-- =============================================================
do $$
declare
  v_code       text  := ${sqlLit(code)};
  v_version    text  := ${sqlLit(version)};
  v_checksum   text  := ${sqlLit(sum)};
  v_definition jsonb := ${TAG}${canonical}${TAG}::jsonb;
  v_existing   text;
begin
  select checksum into v_existing
    from public.screener_instrument_versions
    where instrument_code = v_code and instrument_version = v_version;

  if v_existing is null then
    insert into public.screener_instrument_versions
      (instrument_code, instrument_version, definition, checksum, status)
      values (v_code, v_version, v_definition, v_checksum, 'inactive');
    raise notice 'carga: % % inserido (inativo)', v_code, v_version;
  elsif v_existing = v_checksum then
    raise notice 'carga: % % já presente com o mesmo checksum — no-op', v_code, v_version;
  else
    raise exception 'carga recusada: checksum divergente para % % (banco=%, repo=%). Publique uma nova versão do instrumento.',
      v_code, v_version, v_existing, v_checksum;
  end if;

  -- vínculo técnico interno (idempotente): preview sem prazo público
  insert into public.screener_event_bindings
    (event_slug, instrument_code, instrument_version, is_current, status)
    values ('preview-interno-ia-v1', v_code, v_version, true, 'internal_preview')
  on conflict (event_slug, instrument_code, instrument_version) do nothing;
end
$$;
`;
}

// CLI: imprime o SQL em stdout (a gravação/commit do arquivo é externa).
const executadoDireto = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("screener/loader/gerar-carga.mjs");
if (executadoDireto) {
  process.stdout.write(gerarCargaSQL());
}
