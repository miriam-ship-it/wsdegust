// Regressões encontradas SÓ contra o Postgres/Deno reais (branch efêmero,
// 03/09/2026) — o pglite as mascarava. Guardas estáticas para não reintroduzir.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const handlers = readFileSync(join(aqui, "handlers.mjs"), "utf8");
const wrapper = readFileSync(join(aqui, "..", "..", "supabase", "functions", "screener", "index.ts"), "utf8");

test("finalize recebe o OBJETO do resultado, não JSON.stringify (postgres.js codifica 2x → viola screener_snap_result_obj)", () => {
  // a chamada a screener_finalize_submission deve passar `resultado,` (objeto),
  // nunca `JSON.stringify(resultado)` — senão o snapshot vira jsonb string escalar.
  assert.ok(/screener_finalize_submission/.test(handlers), "chamada de finalize presente");
  assert.ok(!/JSON\.stringify\(resultado\)/.test(handlers), "não pode passar JSON.stringify(resultado) ao finalize");
  assert.ok(/\bresultado,\s*instrument_checksum\b/.test(handlers), "deve passar o objeto `resultado` ao finalize");
});

test("token de sessão vem do header x-session-token, nunca da query string (não vaza em log de acesso)", () => {
  assert.ok(/x-session-token/.test(wrapper), "wrapper lê x-session-token");
  // o token de `a` vem do header (ou corpo), com override após o spread de q:
  assert.ok(/token:\s*sessionToken\s*\?\?/.test(wrapper), "token de `a` prioriza o header, ignora a query");
});

test("conexão via transaction pooler + max:1 (direta esgota slots sob concorrência)", () => {
  assert.ok(/prepare:\s*false,\s*max:\s*1/.test(wrapper), "postgres(...) com prepare:false e max:1");
  assert.ok(/POOLER|pooler/.test(wrapper), "wrapper documenta/usa o pooler de transação");
});

test("event_slug ausente → 400 (não 500 do driver ao receber undefined)", () => {
  const guardas = handlers.match(/event_slug_obrigatorio/g) || [];
  assert.ok(guardas.length >= 2, "getStart e postStart guardam event_slug ausente");
});
