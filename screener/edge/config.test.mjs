// Garante que a decisão verify_jwt=false está versionada no config.toml.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const toml = readFileSync(join(raiz, "supabase", "config.toml"), "utf8");

test("config.toml declara [functions.screener] verify_jwt = false", () => {
  const bloco = toml.match(/\[functions\.screener\]([\s\S]*?)(\n\[|$)/);
  assert.ok(bloco, "seção [functions.screener] ausente");
  assert.match(bloco[1], /verify_jwt\s*=\s*false/, "verify_jwt deve ser false");
});
