// O módulo embutido (que a edge importa) e o JSON auditável (que a pessoa
// revisa) têm que ser a MESMA coisa. Este teste é o que impede publicar um
// instrumento diferente do que foi aprovado porque alguém esqueceu de rodar
// `node scripts/gerar-definicao-embutida.mjs`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { definicao, checksum } from "./definicao.mjs";
import { gerar, conteudoNormalizado } from "../../scripts/gerar-definicao-embutida.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(AQUI, "instrumento", "DIAGNOSTICO_BOOMIT_40.json");
const MJS_PATH = join(AQUI, "instrumento", "definicao-embutida.mjs");

test("o módulo embutido está em dia com o JSON auditável", () => {
  const esperado = gerar();
  const atual = readFileSync(MJS_PATH, "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    atual,
    esperado.replace(/\r\n/g, "\n"),
    "definicao-embutida.mjs está defasada — rode `node scripts/gerar-definicao-embutida.mjs`"
  );
});

test("o checksum publicado é o do JSON aprovado", () => {
  const sha = createHash("sha256").update(conteudoNormalizado(JSON_PATH)).digest("hex");
  assert.equal(checksum(), sha);
});

test("o conteúdo carregado é idêntico ao JSON", () => {
  assert.deepEqual(definicao(), JSON.parse(conteudoNormalizado(JSON_PATH)));
});

test("o motor não importa builtin do Node — roda igual no Deno", () => {
  // Olha DECLARAÇÃO DE IMPORT, não o texto do arquivo: um comentário que
  // menciona `node:fs` para explicar por que ele não está ali é documentação,
  // não dependência, e reprová-lo ensinaria a apagar a explicação.
  const IMPORT = /(?:^|\n)\s*(?:import|export)[^;\n]*\sfrom\s+["']([^"']+)["']/g;
  for (const arq of ["definicao.mjs", "motor.mjs", "devolutiva.mjs", "conteudo-devolutiva.mjs"]) {
    const fonte = readFileSync(join(AQUI, arq), "utf8");
    for (const m of fonte.matchAll(IMPORT)) {
      assert.ok(!m[1].startsWith("node:"), `${arq} importa ${m[1]}, que não vale na edge`);
      assert.ok(m[1].startsWith("."), `${arq} importa pacote externo ${m[1]} — o motor é sem dependência`);
    }
  }
});
