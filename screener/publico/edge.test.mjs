// A edge roda o MESMO motor dos testes — e isso precisa ser verificável, não
// combinado. `_motor/` é uma cópia gerada; se alguém editar a cópia em vez da
// fonte, o deploy sobe um motor que nenhum teste nunca viu.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MODULOS, preparar, arquivosParaDeploy } from "../../scripts/preparar-edge-diagnostico.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const EDGE = join(RAIZ, "supabase", "functions", "diagnostico");

test("a cópia em _motor/ é idêntica à fonte em screener/publico/", () => {
  preparar();
  for (const m of MODULOS) {
    const fonte = readFileSync(join(AQUI, m), "utf8");
    const copia = readFileSync(join(EDGE, "_motor", m), "utf8");
    assert.equal(copia, fonte, `_motor/${m} divergiu da fonte`);
  }
});

test("a edge importa só de _motor/ — nunca de fora da própria pasta", () => {
  const src = readFileSync(join(EDGE, "index.ts"), "utf8");
  const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  for (const i of imports) {
    const externo = i.startsWith("https://");
    const local = i.startsWith("./_motor/");
    assert.ok(externo || local, `import fora do contrato: ${i}`);
    assert.ok(!i.includes("../"), `import para fora da pasta da função: ${i}`);
  }
  // e os quatro módulos que ela usa estão declarados para o deploy
  const nomes = arquivosParaDeploy().map((f) => f.name);
  assert.ok(nomes.includes("index.ts"));
  for (const m of MODULOS) assert.ok(nomes.includes(`_motor/${m}`), `${m} fora do deploy`);
});

test("a edge não embute segredo nem resolve outro evento", () => {
  const src = readFileSync(join(EDGE, "index.ts"), "utf8");
  // segredos só por Deno.env, nunca literais
  assert.doesNotMatch(src, /eyJhbGciOiJIUzI1NiI/, "chave JWT literal no código da edge");
  assert.match(src, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(src, /Deno\.env\.get\("BREVO_API_KEY"\)/);
  assert.match(src, /Deno\.env\.get\("BROWSERLESS_TOKEN"\)/);
  // o slug é constante, não vem do corpo da requisição
  assert.match(src, /const EVENTO_SLUG = "diagnosticoboomit"/);
  assert.doesNotMatch(src, /corpo\.slug|corpo\.evento/, "o cliente não pode escolher o evento");
  // e a trava de escopo existe
  assert.match(src, /evento\.slug !== EVENTO_SLUG/);
  assert.match(src, /token nao pertence a este evento/);
});

test("a edge nunca grava nota de maturidade enquanto a escala não for confirmada", () => {
  const src = readFileSync(join(EDGE, "index.ts"), "utf8");
  assert.match(src, /maturidade_letra:\s*null/);
  assert.match(src, /maturidade_score:\s*null/);
  // e o que vai para a tela é a projeção sanitizada, não o resultado cru
  assert.match(src, /resultado:\s*pub/);
  assert.doesNotMatch(src, /resultado:\s*resultado/);
});

test("_motor/ não é versionado — ele é gerado", () => {
  const ignore = readFileSync(join(RAIZ, ".gitignore"), "utf8");
  assert.match(ignore, /supabase\/functions\/diagnostico\/_motor\//);
  assert.match(ignore, /diagnostico\/public\//);
  assert.ok(existsSync(join(EDGE, "index.ts")), "o index.ts, esse sim, é versionado");
});
