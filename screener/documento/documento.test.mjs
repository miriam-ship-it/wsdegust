// O documento imprimível e a chamada ao serviço de impressão.
//
// O que estes testes protegem, acima de tudo: que o PDF e a tela saiam do MESMO
// renderizador. A divergência entre os dois foi um defeito real desta base — a
// tela do diagnóstico de liderança dizia R$ 39k–91k e o PDF dizia R$ 62k–273k
// para a mesma pessoa, por meses, sem ninguém notar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderUnificado } from "../../frontend/rhia.mjs";
import { calcularUnificado } from "../unificado/composicao.mjs";
import itensLideranca from "../unificado/lideranca-itens.json" with { type: "json" };
import { montarModulo, DESTINO } from "../../scripts/gerar-estilo-documento.mjs";
import { ESTILO_DOCUMENTO } from "./estilo.mjs";
import { documentoImprimivel, nomeDoArquivo, ESTILO_SO_DO_PAPEL } from "./imprimivel.mjs";
import { gerarPdf, base64, OPCOES_A4 } from "./pdf.mjs";

const PERFIL = { nome: "Ana Souza", empresa: "Boomit", cargo: "Head de RH", nivel: "G", porte: "S3", setor: "V1" };

function respostas() {
  const R = { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor de RH", CTX02: "AREA", CTX03: "DECIDE_SCOPE" };
  const dims = {
    EST: ["E3", "E3", "E4", "E3"], TAL: ["E2", "E3", "E3", "E2"], DES: ["E3", "E3", "E2", "E3"],
    INF: ["E3", "E4", "E3", "E3"], DAD: ["E2", "E2", "E3", "E2"], IA: ["E2", "E1", "E2", "NA"],
  };
  for (const [d, vs] of Object.entries(dims)) vs.forEach((v, i) => { R[`${d}0${i + 1}`] = v; });
  R.GOV01 = "E3"; R.GOV02 = "E2"; R.GOV03 = "E3";
  itensLideranca.items.forEach((it, i) => { R[`LID_${it.id}`] = it.options[i % 4].id; });
  return R;
}
const doc = () => calcularUnificado({ perfil: PERFIL, respostas: respostas() });

// -------------------------------------------------------------------------
// O estilo gerado
// -------------------------------------------------------------------------

test("o CSS do documento está EM DIA com os arquivos de frontend/", () => {
  // Se este teste reprova, rode `node scripts/gerar-estilo-documento.mjs`. Ele
  // existe para que ninguém mexa no visual da tela e descubra semanas depois que
  // o PDF continuou com o antigo.
  assert.equal(fs.readFileSync(DESTINO, "utf8"), montarModulo(),
    "screener/documento/estilo.mjs está velho — rode o gerador");
});

test("o CSS do documento é o do produto, com as regras de impressão junto", () => {
  const rhia = fs.readFileSync("frontend/rhia.css", "utf8");
  assert.ok(ESTILO_DOCUMENTO.includes("@media print"), "sem as regras de impressão o PDF sai com cara de tela");
  // uma amostra real da folha, para provar que é ELA e não um resumo
  assert.ok(ESTILO_DOCUMENTO.includes(rhia.trim().slice(0, 200)));
});

test("o CSS gerado fica FORA do diretório publicado", () => {
  // Ele já vai ao navegador pelos `<link>`; publicá-lo de novo como JavaScript
  // seria pagar duas vezes pela mesma folha.
  assert.ok(!DESTINO.includes(`${require_sep()}frontend${require_sep()}`), "o módulo de estilo não pode morar em frontend/");
  assert.ok(!fs.existsSync("frontend/estilo-documento.mjs"));
});
function require_sep() { return DESTINO.includes("\\") ? "\\" : "/"; }

// -------------------------------------------------------------------------
// O documento
// -------------------------------------------------------------------------

test("o documento imprimível é o MESMO da tela, com outra moldura", () => {
  const r = doc();
  const naTela = renderUnificado(r, { instrumentVersion: "1.0.0", leadHtml: "" });
  const noPapel = documentoImprimivel(r, { instrumentVersion: "1.0.0" });

  assert.ok(noPapel.includes(naTela), "o corpo tem de ser byte a byte o da tela — dois renderizadores divergem");
  assert.ok(noPapel.startsWith("<!doctype html>"));
  assert.ok(noPapel.includes("<style>"), "autocontido: quem abre é o serviço de impressão, sem os <link> do site");
});

test("o documento força o tema claro — o serviço pode herdar o escuro do sistema", () => {
  const html = documentoImprimivel(doc(), {});
  assert.ok(html.includes('data-theme="light"'), "sem isto sai um PDF preto");
  assert.ok(ESTILO_SO_DO_PAPEL.includes("print-color-adjust: exact"),
    "sem isto as barras imprimem vazias, e o gráfico vira uma lista de números");
});

test("o documento não leva o formulário de contato", () => {
  // No papel não há onde clicar, e um formulário impresso é ruído com aparência
  // de tarefa pendente.
  //
  // A busca é pelo ELEMENTO, não pela classe: o CSS embutido define
  // `.sc-leadform`, e procurar a string no documento inteiro acusava o
  // estilo — a primeira versão deste teste reprovou por isso.
  const html = documentoImprimivel(doc(), {});
  assert.ok(!html.includes('<form class="sc-leadform"'), "formulário impresso é tarefa que ninguém pode cumprir");
  assert.ok(html.includes(".sc-leadform"), "mas a folha de estilo continua inteira, e é a do produto");
});

test("o documento não vaza ponto-base, código de estágio nem id de item", () => {
  const html = documentoImprimivel(doc(), {});
  for (const p of ["_bp", "3333", "6667", '"E1"', '"E3"', "EST01", "GOV01", "LID_q1"]) {
    assert.ok(!html.includes(p), `vazou "${p}" para o PDF`);
  }
});

test("o título do documento é escapado", () => {
  const html = documentoImprimivel(doc(), { titulo: 'Ana <script>alert(1)</script>' });
  assert.ok(!html.includes("<script>alert"), "o título vai dentro de <title>, e continua sendo texto");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("o nome do arquivo sobrevive a qualquer sistema de arquivos", () => {
  assert.equal(nomeDoArquivo({ nome: "Ana Souza" }), "diagnostico-de-cenario-ana-souza.pdf");
  assert.equal(nomeDoArquivo({ nome: "José da Conceição Ção" }), "diagnostico-de-cenario-jose-da-conceicao-cao.pdf");
  assert.equal(nomeDoArquivo({ nome: "  " , empresa: "Boomit" }), "diagnostico-de-cenario-boomit.pdf");
  assert.equal(nomeDoArquivo(null), "diagnostico-de-cenario.pdf");
  assert.ok(!nomeDoArquivo({ nome: "A/B\\\\C:D" }).match(/[/\\\\:]/), "nada que um caminho recuse");
});

// -------------------------------------------------------------------------
// A chamada ao serviço de impressão
// -------------------------------------------------------------------------

function servicoFalso({ ok = true, status = 200, bytes = new Uint8Array([37, 80, 68, 70]) } = {}) {
  const chamadas = [];
  return {
    chamadas,
    fetch: async (url, init) => {
      chamadas.push({ url, init, corpo: JSON.parse(init.body) });
      return { ok, status, arrayBuffer: async () => bytes.buffer, text: async () => "erro" };
    },
  };
}

test("manda A4, com fundo, e espera a fonte da marca carregar", async () => {
  const s = servicoFalso();
  const bytes = await gerarPdf("<html>oi</html>", { token: "tk", fetch: s.fetch });

  assert.ok(bytes instanceof Uint8Array && bytes.length > 0);
  const { corpo, url } = s.chamadas[0];
  assert.deepEqual(corpo.options, OPCOES_A4);
  assert.equal(corpo.gotoOptions.waitUntil, "networkidle0",
    "sem esperar, o PDF sai com a fonte de sistema e ninguém vê antes de enviar");
  assert.ok(url.includes("token=tk"));
});

test("sem token, não tenta — e a mensagem não é um 500 genérico", async () => {
  await assert.rejects(gerarPdf("<html>oi</html>", { token: null }), /servico_de_impressao_nao_configurado/);
  await assert.rejects(gerarPdf("", { token: "tk" }), /documento_vazio/);
});

test("falha do serviço leva o status, e NUNCA o corpo do erro", async () => {
  // O corpo do erro pode ecoar trechos do HTML enviado — e o HTML tem nome,
  // empresa e cargo de uma pessoa.
  const s = servicoFalso({ ok: false, status: 429 });
  await assert.rejects(
    gerarPdf("<html>Ana Souza</html>", { token: "tk", fetch: s.fetch }),
    (e) => {
      assert.match(e.message, /servico_de_impressao_falhou_429/);
      assert.ok(!e.message.includes("Ana"), "nome de pessoa não entra em mensagem de erro");
      return true;
    });
});

test("base64 aguenta um PDF grande sem estourar a pilha", () => {
  const grandes = new Uint8Array(300000).fill(65);
  const b64 = base64(grandes);
  assert.equal(typeof b64, "string");
  assert.ok(b64.length > 100000);
  assert.equal(base64(new Uint8Array([104, 105])), "aGk=");
});
