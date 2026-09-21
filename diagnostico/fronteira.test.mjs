// =============================================================
// FRONTEIRA DE PUBLICAÇÃO do site dedicado — "edge-only" verificável.
//
// Não basta convenção de pastas. Este teste monta o site de verdade e
// inspeciona exatamente o que o Netlify publicaria, reprovando se qualquer
// conteúdo privado do Diagnóstico Boomit vazar para o artefato estático:
//   · a definição, o motor e o gabarito não podem estar no publish dir;
//   · nenhum arquivo publicado pode conter enunciado, alternativa, código de
//     item, tratamento, peso ou o mapa numérico — tudo isso chega em runtime
//     pela edge;
//   · a service role key nunca pode aparecer.
// =============================================================

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { construir, PROPRIOS, COMPARTILHADOS } from "./build.mjs";
import { definicao } from "../screener/publico/definicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const PUBLIC = path.join(AQUI, "public");
const def = definicao();

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

function lerPublishDir() {
  const toml = fs.readFileSync(path.join(AQUI, "netlify.toml"), "utf8");
  const m = toml.match(/publish\s*=\s*"([^"]+)"/);
  assert.ok(m, "diagnostico/netlify.toml não declara `publish`");
  return m[1];
}

test("o site dedicado publica `public/` — nunca `src/` nem a raiz", () => {
  const publish = lerPublishDir();
  assert.equal(publish, "public");
  assert.notEqual(publish, ".");
  assert.notEqual(publish, "src");
  const toml = fs.readFileSync(path.join(AQUI, "netlify.toml"), "utf8");
  assert.match(toml, /base\s*=\s*"diagnostico"/, "sem base directory o Netlify leria o toml da raiz");
});

test("o build monta só o que foi declarado", () => {
  const arquivos = construir();
  assert.deepEqual(arquivos, [...PROPRIOS, ...COMPARTILHADOS].sort());
});

test("a definição privada e o motor estão FORA do diretório publicado", () => {
  construir();
  const privados = [
    "screener/publico/instrumento/DIAGNOSTICO_BOOMIT_40.json",
    "screener/publico/instrumento/definicao-embutida.mjs",
    "screener/publico/definicao.mjs",
    "screener/publico/motor.mjs",
    "screener/publico/devolutiva.mjs",
    "screener/publico/conteudo-devolutiva.mjs",
    "screener/publico/fonte/blueprint-40-final.json",
  ].map((p) => path.resolve(RAIZ, p));
  for (const f of privados) {
    assert.ok(fs.existsSync(f), `arquivo privado sumiu: ${f}`);
    assert.ok(path.relative(PUBLIC, f).startsWith(".."), `arquivo privado DENTRO do publish dir: ${f}`);
  }
  assert.ok(!fs.existsSync(path.join(PUBLIC, "screener")), "screener/ não pode estar em public/");
  assert.ok(!fs.existsSync(path.join(PUBLIC, "supabase")), "supabase/ não pode estar em public/");
});

test("nenhum arquivo publicado embute o instrumento — ele chega pela edge", () => {
  construir();
  const arquivos = arquivosDe(PUBLIC).filter((f) => EXT_TEXTO.has(path.extname(f).toLowerCase()));
  assert.ok(arquivos.length > 0);

  for (const f of arquivos) {
    const txt = fs.readFileSync(f, "utf8");
    const rel = path.relative(RAIZ, f);

    for (const i of def.itens) {
      assert.ok(!txt.includes(i.codigo), `${rel} embute o código de item "${i.codigo}"`);
      assert.ok(!txt.includes(i.pergunta.slice(0, 40)), `${rel} embute o enunciado de ${i.codigo}`);
      assert.ok(!txt.includes(i.objetivo_interno), `${rel} embute o objetivo analítico de ${i.codigo}`);
      for (const o of i.opcoes) {
        // Alternativa muito curta ("Outro", "Diretor(a)") é palavra comum e
        // daria falso positivo contra qualquer código — `dg-outro` reprovaria
        // o arquivo. O que interessa proteger é a PROSA do instrumento, que
        // nunca é curta. O limiar deixa isso explícito em vez de afrouxar o
        // teste em silêncio.
        if (o.texto.length < 12) continue;
        assert.ok(!txt.includes(o.texto.slice(0, 40)), `${rel} embute a alternativa ${i.codigo}/${o.codigo}`);
      }
    }
    for (const marcador of ["mapa_provisorio", "e1_e4_confirmado", "cobertura_minima_do_bloco", "correcoes_rastreadas", "DIAGNOSTICO_BOOMIT_40"]) {
      assert.ok(!txt.includes(marcador), `${rel} contém marcador privado "${marcador}"`);
    }
  }
});

test("todo arquivo referenciado pelo site existe em public/", () => {
  // Esta catraca nasceu de um 404 real: `logica.mjs` foi extraída dos dois
  // módulos e ninguém a declarou no build. O site subia e parava na tela de
  // carregando, sem erro visível no servidor.
  construir();
  const barra = (p) => p.split(path.sep).join("/");
  const publicados = new Set(arquivosDe(PUBLIC).map((f) => barra(path.relative(PUBLIC, f))));

  for (const f of arquivosDe(PUBLIC)) {
    const ext = path.extname(f).toLowerCase();
    if (![".html", ".mjs", ".css"].includes(ext)) continue;
    const txt = fs.readFileSync(f, "utf8");
    const rel = barra(path.relative(PUBLIC, f));

    const refs = [
      ...txt.matchAll(/(?:from|import)\s+["'](\.\/[^"']+)["']/g),
      ...txt.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g),
      ...txt.matchAll(/url\(["']?(?!https?:|data:)([^"')]+)["']?\)/g),
    ]
      .map((m) => m[1].replace(/^\.\//, "").split(/[?#]/)[0])
      // `href="${url}"` é montado em tempo de execução (o link do PDF
      // assinado, por exemplo) — não é um arquivo do site.
      .filter((r) => !r.includes("${"));

    for (const r of refs) {
      assert.ok(publicados.has(r), `${rel} referencia "${r}", que não foi publicado`);
    }
  }
});

test("o publicado não carrega segredo de servidor", () => {
  construir();
  for (const f of arquivosDe(PUBLIC).filter((x) => EXT_TEXTO.has(path.extname(x).toLowerCase()))) {
    const txt = fs.readFileSync(f, "utf8");
    const rel = path.relative(RAIZ, f);
    for (const segredo of ["service_role", "SERVICE_ROLE", "BREVO_API_KEY", "BROWSERLESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"]) {
      assert.ok(!txt.includes(segredo), `${rel} menciona segredo de servidor: ${segredo}`);
    }
  }
});

test("o EVENTO_SLUG dedicado está no HTML e é o único evento citado", () => {
  construir();
  const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
  assert.match(html, /EVENTO_SLUG:\s*'diagnosticoboomit'/);
  assert.match(html, /EDGE_GATE_FUNCTION:\s*'diagnostico'/);
  // nenhum outro evento do banco compartilhado pode ser referenciado
  for (const outro of ["ibmec-junho-2026", "boomit-degustacao", "boomit-degustacao-ia"]) {
    assert.ok(!html.includes(outro), `index.html cita outro evento: ${outro}`);
  }
});

test("o front resolve o evento por slug E por ativo", () => {
  const mjs = fs.readFileSync(path.join(AQUI, "src", "diagnostico.mjs"), "utf8");
  assert.match(mjs, /\.eq\("slug", CFG\.EVENTO_SLUG\)/);
  assert.match(mjs, /\.eq\("ativo", true\)/);
  assert.match(mjs, /"x-sessao": estado\.token/, "o token tem que viajar no cabeçalho x-sessao");
});

test("nenhuma marca de outro evento no site dedicado", () => {
  construir();
  for (const f of arquivosDe(PUBLIC).filter((x) => [".html", ".css", ".mjs"].includes(path.extname(x)))) {
    const txt = fs.readFileSync(f, "utf8");
    const rel = path.relative(RAIZ, f);
    assert.ok(!/ibmec/i.test(txt), `${rel} carrega marca do IBMEC`);
    assert.ok(!txt.includes("#002555") && !txt.includes("#F5AC00"), `${rel} usa a paleta do IBMEC`);
    assert.ok(!txt.includes("Krub"), `${rel} usa a fonte do IBMEC`);
  }
});
