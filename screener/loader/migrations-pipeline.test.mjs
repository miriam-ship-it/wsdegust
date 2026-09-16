// O `npx supabase db push` manda cada migration num PIPELINE: atômico (um erro
// desfaz tudo), mas sem bloco de transação explícito. Dois comandos se
// comportam diferente nesse modo do que no pglite dos testes comportamentais,
// que roda o arquivo como uma consulta só:
//
//   LOCK TABLE (nível superior)  → erro "can only be used in transaction blocks"
//   SET LOCAL  (nível superior)  → só um WARNING, e o valor NÃO vale
//
// O primeiro derrubou o apply do snapshot em 16/09 (sem deixar resíduo). O
// segundo é pior: passa, e o `lock_timeout` que protegia o produto no ar nunca
// existiu. Dentro de um bloco `DO` os dois funcionam; fora, use `set_config(...,
// true)` para parâmetros e um `DO` para o lock.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = "supabase/migrations";

test("nenhuma migration usa LOCK TABLE ou SET LOCAL fora de um bloco DO", () => {
  const achados = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".sql"))) {
    const linhas = fs.readFileSync(path.join(DIR, f), "utf8").split(/\r?\n/);
    let dentroDeDo = false;
    linhas.forEach((l, i) => {
      if (/^\s*--/.test(l)) return;
      // corpo dollar-quoted: alterna a cada $$ (ou $tag$) que abre/fecha
      const marcas = l.match(/\$[a-z_]*\$/gi) || [];
      const nivelSuperior = !dentroDeDo;
      if (marcas.length % 2 === 1) dentroDeDo = !dentroDeDo;
      if (nivelSuperior && /^\s*(lock\s+table|set\s+local)\b/i.test(l)) achados.push(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.deepEqual(achados, [], "no pipeline do db push isso falha ou é ignorado em silêncio");
});
