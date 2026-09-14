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

// -------------------------------------------------------------------------
// REDE DE SEGURANÇA (o caso que já aconteceu): não basta o app não vazar — um
// ARQUIVO DE TESTE dentro do publish dir também é publicado. `frontend/rhia.test.mjs`
// carregava o motor privado e escrevia pontos-base e códigos de estágio; hoje
// vive em `screener/rhia/frontend-rhia.test.mjs`. Os três testes abaixo impedem
// a reincidência, por marcador, por import e por nome de arquivo.
// -------------------------------------------------------------------------

/** Internos que NUNCA podem estar num arquivo publicado, venha de onde vier. */
const MARCADORES_INTERNOS = [
  { re: /\b3333\b/, nome: "3333 (pontos-base)" },
  { re: /\b6667\b/, nome: "6667 (pontos-base)" },
  { re: /\b10000\b/, nome: "10000 (pontos-base)" },
  { re: /\bP[1-5]\b/, nome: "código de estágio P1–P5" },
  { re: /leadership_bp/, nome: "eixo interno leadership_bp" },
  { re: /process_bp/, nome: "eixo interno process_bp" },
  { re: /\bai_bp\b/, nome: "eixo interno ai_bp" },
  { re: /weakestBp/, nome: "weakestBp" },
];

test("nenhum arquivo publicado contém pontos-base, códigos de estágio ou eixos internos", () => {
  const publishDir = path.resolve(RAIZ, lerPublishDir());
  const arquivos = arquivosDe(publishDir).filter((f) => EXT_TEXTO.has(path.extname(f).toLowerCase()));
  for (const f of arquivos) {
    const txt = fs.readFileSync(f, "utf8");
    const rel = path.relative(RAIZ, f);
    for (const m of MARCADORES_INTERNOS) {
      assert.ok(!m.re.test(txt), `artefato publicado ${rel} contém ${m.nome}`);
    }
  }
});

test("nenhum arquivo publicado importa de fora do diretório publicado", () => {
  const publishDir = path.resolve(RAIZ, lerPublishDir());
  const arquivos = arquivosDe(publishDir).filter((f) => [".js", ".mjs", ".cjs", ".html"].includes(path.extname(f).toLowerCase()));
  // `from "../…"`, `import("../…")`, `require("../…")` — qualquer caminho que
  // saia do publish dir arrasta conteúdo privado para o artefato estático.
  const fuga = /(from|import|require)\s*\(?\s*["'`]\.\.\//;
  for (const f of arquivos) {
    const txt = fs.readFileSync(f, "utf8");
    assert.ok(!fuga.test(txt), `artefato publicado ${path.relative(RAIZ, f)} referencia caminho fora do publish dir`);
  }
});

test("nenhum arquivo de teste NOVO dentro do diretório publicado", () => {
  const publishDir = path.resolve(RAIZ, lerPublishDir());
  // Não há mais exceção. O teste do V1 era a única herdada; em 14/09 ele foi
  // para screener/motor/frontend-screener.test.mjs, antes de a `main` publicar
  // o diretório. Arquivo de teste não tem função no ar: ele fica junto do
  // módulo que prova, nunca dentro do que o Netlify serve.
  const testes = arquivosDe(publishDir)
    .map((f) => path.relative(publishDir, f).split(path.sep).join("/"))
    .filter((rel) => /\.test\.[^./]+$/.test(rel));
  assert.deepEqual(testes, [], `arquivo de teste dentro do publish dir: ${testes.join(", ")}`);
});
