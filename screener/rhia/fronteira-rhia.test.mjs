// =============================================================
// FRONTEIRA DE PUBLICAÇÃO — rhia
//
// Mesmo princípio de screener/motor/fronteira-de-publicacao.test.mjs: o que o
// Netlify publica (o `publish` do netlify.toml) não pode embutir o instrumento.
// As 30 questões chegam ao navegador pela edge (GET /rhia/start), nunca pelo
// HTML/JS estático. Logo, nenhum arquivo publicado pode conter:
//   - o código do instrumento ("boomit_rh_ia_maturity_v1");
//   - os ids de item (CTX01…GOV03) — o front trata o campo condicional pelo
//     `conditional_field` que vem na apresentação, sem hardcode de id;
//   - os enunciados (primeiros 40 chars de cada prompt).
// =============================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { instrumento } from "./definicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", ".."); // screener/rhia → raiz do repo

function lerPublishDir() {
  const toml = fs.readFileSync(path.join(RAIZ, "netlify.toml"), "utf8");
  const m = toml.match(/publish\s*=\s*"([^"]+)"/);
  assert.ok(m, "netlify.toml não declara `publish`");
  return m[1];
}

const EXT_TEXTO = new Set([".html", ".htm", ".js", ".mjs", ".cjs", ".json", ".css", ".svg", ".txt", ".map"]);
function arquivosDe(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...arquivosDe(p));
    else out.push(p);
  }
  return out;
}

test("a definição do pacote, o núcleo rhia e o motor estão FORA do diretório publicado", () => {
  const publishDir = path.resolve(RAIZ, lerPublishDir());
  const privados = [
    path.resolve(RAIZ, "screener/rhia/pacote/instrumento-rh-ia-v1.json"),
    path.resolve(RAIZ, "screener/rhia/pacote/src/output-engine-v2.mjs"),
    path.resolve(RAIZ, "screener/rhia/pacote/src/output-definition-v2.mjs"),
    path.resolve(RAIZ, "screener/rhia/definicao.mjs"),
    path.resolve(RAIZ, "screener/rhia/logica.mjs"),
  ];
  for (const f of privados) {
    assert.ok(fs.existsSync(f), `arquivo privado sumiu: ${f}`);
    const rel = path.relative(publishDir, f);
    assert.ok(rel.startsWith(".."), `arquivo privado está DENTRO do publish dir: ${f}`);
  }
  assert.ok(!fs.existsSync(path.join(publishDir, "screener")), "screener/ não pode estar dentro de frontend/");
});

test("nenhum arquivo publicado contém o instrumento rhia (código, ids de item, enunciados)", () => {
  const publishDir = path.resolve(RAIZ, lerPublishDir());
  const arquivos = arquivosDe(publishDir).filter((f) => EXT_TEXTO.has(path.extname(f).toLowerCase()));
  assert.ok(arquivos.length > 0, "publish dir vazio?");

  const codigo = instrumento.instrument_id;
  const ids = instrumento.items.map((it) => it.id);
  const prompts = instrumento.items.map((it) => it.prompt.slice(0, 40));

  for (const f of arquivos) {
    const txt = fs.readFileSync(f, "utf8");
    const rel = path.relative(RAIZ, f);
    assert.ok(!txt.includes(codigo), `artefato publicado ${rel} contém o código do instrumento "${codigo}"`);
    for (const id of ids) {
      assert.ok(!txt.includes(id), `artefato publicado ${rel} contém id de item "${id}" (deve vir da edge)`);
    }
    for (const pr of prompts) {
      assert.ok(!txt.includes(pr), `artefato publicado ${rel} embute enunciado do instrumento (deveria vir da edge)`);
    }
  }
});
