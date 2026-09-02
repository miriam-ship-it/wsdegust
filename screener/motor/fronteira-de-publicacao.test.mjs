// =============================================================
// FRONTEIRA DE PUBLICAÇÃO — "edge-only" como propriedade VERIFICÁVEL
//
// Não basta convenção de pastas. Este teste inspeciona exatamente o que o
// Netlify publica (o diretório `publish` do netlify.toml) e reprova se qualquer
// conteúdo privado do screener vazar para o artefato estático:
//   - a definição privada e o motor não podem estar dentro do publish dir;
//   - nenhum arquivo publicado pode conter pontos, regras, action_library,
//     o código do instrumento, códigos internos de item, nem os enunciados/
//     instruções (que devem chegar em runtime pela edge, não embutidos no HTML).
// =============================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { instrumento } from "./definicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", ".."); // screener/motor → raiz do repo

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

test("netlify publica apenas `frontend/` (nunca a raiz do repo)", () => {
  const publish = lerPublishDir();
  assert.equal(publish, "frontend");
  assert.notEqual(publish, ".");
  assert.notEqual(publish, "");
});

test("a definição privada e o motor estão FORA do diretório publicado", () => {
  const publishDir = path.resolve(RAIZ, lerPublishDir());
  const privados = [
    path.resolve(RAIZ, "screener/instrumento/SCREENER_EMPRESA_IA_V1.json"),
    path.resolve(RAIZ, "screener/motor/definicao.mjs"),
    path.resolve(RAIZ, "screener/motor/motor.mjs"),
  ];
  for (const f of privados) {
    assert.ok(fs.existsSync(f), `arquivo privado sumiu: ${f}`);
    const rel = path.relative(publishDir, f);
    assert.ok(rel.startsWith(".."), `arquivo privado está DENTRO do publish dir: ${f}`);
  }
  // e a pasta screener/ não pode estar dentro de frontend/
  assert.ok(!fs.existsSync(path.join(publishDir, "screener")), "screener/ não pode estar dentro de frontend/");
});

test("nenhum arquivo publicado contém conteúdo privado do screener", () => {
  const publishDir = path.resolve(RAIZ, lerPublishDir());
  const arquivos = arquivosDe(publishDir).filter((f) => EXT_TEXTO.has(path.extname(f).toLowerCase()));

  // marcadores que só existem na definição/motor privados
  const marcadores = ["score_bp", "stage_points_bp", "action_library", "matrix_cut_bp", "SCREENER_EMPRESA_IA_V1", "pair_code"];
  // enunciados, instruções e códigos internos devem chegar pela edge, nunca embutidos
  const prompts = instrumento.items.map((it) => it.prompt);
  const instrucoes = instrumento.presentation.blocks.map((b) => b.instruction.replace("{assessment_unit_name}", ""));
  const codigos = instrumento.items.map((it) => it.code);

  for (const f of arquivos) {
    const txt = fs.readFileSync(f, "utf8");
    const rel = path.relative(RAIZ, f);
    for (const mk of marcadores) {
      assert.ok(!txt.includes(mk), `artefato publicado ${rel} contém marcador privado "${mk}"`);
    }
    for (const c of codigos) {
      assert.ok(!txt.includes(c), `artefato publicado ${rel} contém código interno de item "${c}"`);
    }
    for (const pr of prompts) {
      assert.ok(!txt.includes(pr.slice(0, 40)), `artefato publicado ${rel} embute enunciado do instrumento (deveria vir da edge)`);
    }
    for (const ins of instrucoes) {
      assert.ok(!txt.includes(ins.slice(0, 40)), `artefato publicado ${rel} embute instrução de bloco (deveria vir da edge)`);
    }
  }
});
