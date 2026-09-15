import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import itensLideranca from "./lideranca-itens.json" with { type: "json" };
import { instrumento as instrumentoIA } from "../rhia/definicao.mjs";
import {
  PERFIL, PREFIXO_LIDERANCA, montarInstrumento, apresentacaoPublica,
  separarRespostas, perfilParaMotor, calcularUnificado,
  apresentacaoUnificada, estimativaEmMinutos, perfilCompleto,
} from "./composicao.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

// -------------------------------------------------------------------------
// FIDELIDADE AO QUE ESTÁ NO AR — 108 pessoas já responderam exatamente isto.
// -------------------------------------------------------------------------

test("liderança: o JSON é o que o formulário no ar pergunta, palavra por palavra", () => {
  const html = fs.readFileSync(path.join(RAIZ, "frontend", "index.html"), "utf8");
  const bloco = html.match(/const PERGUNTAS_POOL = (\[[\s\S]*?\n\]);/);
  assert.ok(bloco, "o formulário no ar mudou de forma — reveja a extração antes de seguir");
  // eslint-disable-next-line no-eval
  const pool = eval(bloco[1]);

  assert.equal(pool.length, itensLideranca.items.length);
  for (const p of pool) {
    const nosso = itensLideranca.items.find((i) => i.id === p.id);
    assert.ok(nosso, `item ${p.id} sumiu do JSON`);
    assert.equal(nosso.prompt, p.stem, `${p.id}: enunciado divergente do que está no ar`);
    assert.equal(nosso.dimension, p.dim);
    assert.equal(nosso.lens, p.lente);
    assert.equal(nosso.options.length, p.options.length);
    p.options.forEach((o, i) => {
      assert.equal(nosso.options[i].label, o.t, `${p.id}/${i}: alternativa divergente`);
      assert.equal(nosso.options[i].score, o.s, `${p.id}/${i}: PONTO divergente — muda o resultado de todo mundo`);
    });
  }
});

test("liderança: cinco dimensões, duas lentes, uma pergunta por par", () => {
  const pares = itensLideranca.items.map((i) => `${i.dimension}/${i.lens}`);
  assert.equal(new Set(pares).size, pares.length, "par (dimensão, lente) repetido");
  assert.equal(pares.length, 10);
  for (const d of ["D1", "D2", "D3", "D4", "D5"]) {
    for (const l of ["pessoa", "empresa"]) {
      assert.ok(pares.includes(`${d}/${l}`), `falta ${d}/${l} — o motor devolveria INCOMPLETO`);
    }
  }
});

// -------------------------------------------------------------------------
// A COMPOSIÇÃO
// -------------------------------------------------------------------------

test("o formulário é perfil + contexto + liderança + IA, nessa ordem", () => {
  const instr = montarInstrumento();
  assert.deepEqual(instr.blocos.map((b) => b.id), ["contexto", "lideranca", "ia"]);
  assert.equal(instr.perfil, PERFIL);
  // perfil precisa de porte e nível: sem eles não há CDL
  const ids = PERFIL.map((c) => c.id);
  assert.ok(ids.includes("porte") && ids.includes("nivel"),
    "sem porte e nível o CDL não existe, e é ele que move a conversa");
});

test("a quantidade de itens de IA é DADO, não número escrito no código", () => {
  const cheio = montarInstrumento();
  // Encurtar a metade de IA é decisão de conteúdo (sessão de 25/09). Quando
  // acontecer, será um pacote novo — e nada aqui pode precisar de reescrita.
  const enxuto = {
    ...instrumentoIA,
    items: instrumentoIA.items.filter((i) => i.kind === "context" || /0[12]$/.test(i.id)),
  };
  const curto = montarInstrumento({ ia: enxuto });

  assert.ok(curto.totais.ia < cheio.totais.ia, "o instrumento enxuto tem de produzir menos itens");
  assert.equal(curto.totais.contexto, cheio.totais.contexto, "o contexto não encolhe junto");
  assert.equal(curto.totais.lideranca, 10, "a metade de liderança não é afetada pelo corte da outra");
  assert.equal(curto.totais.itens, curto.totais.contexto + curto.totais.lideranca + curto.totais.ia);
});

test("os itens de liderança não colidem com os do pacote de IA", () => {
  const instr = montarInstrumento();
  const todos = instr.blocos.flatMap((b) => b.itens.map((i) => i.id));
  assert.equal(new Set(todos).size, todos.length, "id repetido faria uma resposta sobrescrever a outra");
  for (const i of instr.blocos.find((b) => b.id === "lideranca").itens) {
    assert.ok(i.id.startsWith(PREFIXO_LIDERANCA));
  }
});

test("o instrumento diz de onde cada metade veio", () => {
  const f = montarInstrumento().fontes;
  assert.equal(f.ia.instrument_id, instrumentoIA.instrument_id);
  assert.equal(f.ia.instrument_version, instrumentoIA.instrument_version);
  assert.equal(f.lideranca.instrument_id, itensLideranca.instrument_id);
});

// -------------------------------------------------------------------------
// A FRONTEIRA — o navegador nunca vê ponto
// -------------------------------------------------------------------------

test("a apresentação pública não leva NENHUM ponto de liderança", () => {
  const publico = apresentacaoPublica();
  const blob = JSON.stringify(publico);
  assert.ok(!blob.includes('"score"'), "o campo score não pode cruzar a fronteira");

  const lid = publico.blocos.find((b) => b.id === "lideranca");
  for (const it of lid.itens) {
    for (const o of it.options) {
      assert.deepEqual(Object.keys(o).sort(), ["id", "label"],
        "alternativa publicada só pode ter id e rótulo");
    }
  }
  // e o enunciado continua chegando inteiro — tirar ponto não é tirar conteúdo
  assert.equal(lid.itens[0].prompt, itensLideranca.items[0].prompt);
});

test("a apresentação pública não é o instrumento privado por engano", () => {
  // Guarda contra o erro mais fácil de cometer aqui: devolver `instr` direto.
  const privado = JSON.stringify(montarInstrumento());
  assert.ok(privado.includes('"score"'), "o instrumento privado É quem guarda os pontos");
  assert.notEqual(JSON.stringify(apresentacaoPublica()), privado);
});

// -------------------------------------------------------------------------
// A SEPARAÇÃO — cada motor recebe o que é dele
// -------------------------------------------------------------------------

test("o ponto é resolvido no servidor, contra a definição privada", () => {
  const item = itensLideranca.items[0];
  const opcao = item.options[2];
  const { lideranca } = separarRespostas({ [PREFIXO_LIDERANCA + item.id]: opcao.id });

  assert.deepEqual(lideranca, [{ dimensao: item.dimension, lente: item.lens, valor: opcao.score }]);
  // o navegador mandou "O3", não "4" — é esta a diferença que fecha o buraco
  // pelo qual, no app antigo, qualquer pessoa escolhia o próprio resultado
  assert.notEqual(opcao.id, String(opcao.score));
});

test("resposta de IA passa inteira; alternativa inventada não vira ponto", () => {
  const item = itensLideranca.items[0];
  const r = separarRespostas({
    EST01: "E3",
    CTX02: "AREA",
    [PREFIXO_LIDERANCA + item.id]: "O99",
    [PREFIXO_LIDERANCA + "q404"]: "O1",
  });
  assert.deepEqual(r.ia, { EST01: "E3", CTX02: "AREA" });
  assert.deepEqual(r.lideranca, [], "alternativa que não existe não pode virar nota");
  assert.deepEqual(r.desconhecidas.sort(), [PREFIXO_LIDERANCA + "q404", PREFIXO_LIDERANCA + item.id].sort());
});

test("o perfil vira o que o motor da liderança espera", () => {
  assert.deepEqual(perfilParaMotor({ porte: "S3", nivel: "G", nome: "Ana" }), { tamanho: "S3", persona: "G" });
  assert.deepEqual(perfilParaMotor(null), { tamanho: null, persona: null });
});

// -------------------------------------------------------------------------
// O RESULTADO DAS DUAS METADES
// -------------------------------------------------------------------------

/** Respostas completas das duas metades, no formato do formulário único. */
function respostasCompletas() {
  const R = { CTX01: "OTHER", CTX01_OTHER_TEXT: "Consultor de RH", CTX02: "AREA", CTX03: "DECIDE_SCOPE" };
  const dims = {
    EST: ["E3", "E3", "E4", "E3"], TAL: ["E2", "E3", "E3", "E2"], DES: ["E3", "E3", "E2", "E3"],
    INF: ["E3", "E4", "E3", "E3"], DAD: ["E2", "E2", "E3", "E2"], IA: ["E2", "E1", "E2", "NA"],
  };
  for (const [d, vs] of Object.entries(dims)) vs.forEach((v, i) => { R[`${d}0${i + 1}`] = v; });
  R.GOV01 = "E3"; R.GOV02 = "E2"; R.GOV03 = "E3";
  for (const it of itensLideranca.items) R[PREFIXO_LIDERANCA + it.id] = it.options[2].id;
  return R;
}
const PERFIL_EXEMPLO = { nome: "Ana", empresa: "Boomit", cargo: "Head de RH", nivel: "G", porte: "S3", setor: "V1" };

test("com as duas metades, saem as duas leituras e a relação entre elas", () => {
  const r = calcularUnificado({ perfil: PERFIL_EXEMPLO, respostas: respostasCompletas() });

  assert.equal(r.completo, true);
  assert.equal(r.lideranca.status, "OK");
  assert.ok(Number.isFinite(r.lideranca.maturidade.score100));
  assert.ok(r.lideranca.cdl.min > 0, "porte e nível vieram do perfil e o CDL saiu");
  assert.ok(r.ia && r.ia.status !== "INSUFFICIENT");
  assert.ok(r.cruzamento, "é a relação entre as duas que justifica um documento só");
});

test("a síntese cita as DUAS metades, com os números que os motores deram", () => {
  // O teste que existia aqui antes conferia `typeof sintese === "string"` e o
  // comprimento — e passava com um texto que dizia "no estágio undefined, com
  // undefined de 100". Passar pelo motivo errado é pior que falhar.
  const r = calcularUnificado({ perfil: PERFIL_EXEMPLO, respostas: respostasCompletas() });

  assert.ok(!r.sintese.includes("undefined"), `síntese com buraco: ${r.sintese}`);
  assert.ok(r.sintese.includes(r.lideranca.maturidade.letra), "não cita a letra da liderança");
  assert.ok(r.sintese.includes(String(r.lideranca.maturidade.score100)), "não cita o score da liderança");
  assert.ok(r.sintese.includes(String(r.ia.metricas.indice)), "não cita o índice de IA");
  assert.ok(r.sintese.includes(r.ia.positioning.stage), "não cita o degrau da escada");
  assert.ok(r.cruzamento.ia.degrau === r.ia.positioning.stage,
    "o degrau da leitura cruzada tem de ser o mesmo que o da devolutiva de IA");
});

test("NÃO existe índice combinado — nem aqui, nem por descuido", () => {
  const r = calcularUnificado({ perfil: PERFIL_EXEMPLO, respostas: respostasCompletas() });
  const chaves = Object.keys(r);
  for (const proibida of ["indice_geral", "score_geral", "indiceCombinado", "total", "nota"]) {
    assert.ok(!chaves.includes(proibida),
      `${proibida} seria número novo, sem instrumento que o sustente e sem ninguém ter decidido o peso de cada metade`);
  }
  assert.ok(Object.hasOwn(r, "lideranca") && Object.hasOwn(r, "ia"),
    "as duas medidas ficam separadas, e o cruzamento ao lado");
});

test("meia medida não derruba a outra metade, e não vira leitura cruzada", () => {
  const todas = respostasCompletas();

  // só a liderança
  const soLideranca = Object.fromEntries(Object.entries(todas).filter(([k]) => k.startsWith(PREFIXO_LIDERANCA)));
  const a = calcularUnificado({ perfil: PERFIL_EXEMPLO, respostas: soLideranca });
  assert.equal(a.lideranca.status, "OK");
  assert.equal(a.cruzamento, null, "leitura cruzada com meia medida seria invenção");
  assert.equal(a.completo, false);

  // só a de IA
  const soIA = Object.fromEntries(Object.entries(todas).filter(([k]) => !k.startsWith(PREFIXO_LIDERANCA)));
  const b = calcularUnificado({ perfil: PERFIL_EXEMPLO, respostas: soIA });
  assert.equal(b.lideranca.status, "INCOMPLETO");
  assert.ok(b.lideranca.faltantes.length > 0, "diz o que falta, em vez de devolver NaN");
  assert.ok(b.ia, "a metade pronta continua de pé");
  assert.equal(b.cruzamento, null);
});

test("sem perfil, a liderança não inventa faixa de CDL", () => {
  const r = calcularUnificado({ perfil: null, respostas: respostasCompletas() });
  assert.equal(r.lideranca.status, "OK", "as respostas estão lá; o que falta é o perfil");
  // o motor usa padrões quando porte/nível faltam — o que não pode é o número
  // sumir em silêncio ou virar NaN
  assert.ok(Number.isFinite(r.lideranca.cdl.min) && Number.isFinite(r.lideranca.cdl.max));
});

// -------------------------------------------------------------------------
// A APRESENTAÇÃO — obedece ao contrato que o front já consome
// -------------------------------------------------------------------------

test("a apresentação fala a mesma língua que o front já entende", () => {
  // É esta conformidade que evita um segundo front: a pilha de perguntas, o
  // progresso, a retomada e o teclado do rhia funcionam sem uma linha nova.
  const a = apresentacaoUnificada();
  assert.ok(a.instrument && a.instrument.id && a.instrument.version);
  assert.deepEqual(a.groups.map((g) => g.code), ["contexto", "lideranca", "ia"]);
  for (const it of a.items) {
    assert.equal(typeof it.id, "string");
    assert.equal(typeof it.prompt, "string");
    assert.ok(["contexto", "lideranca", "ia"].includes(it.group));
    assert.ok(Array.isArray(it.options) && it.options.length > 0);
    for (const o of it.options) assert.deepEqual(Object.keys(o).sort(), ["id", "label"]);
  }
  // o front filtra o contexto por `group`, e a ordem é a da leitura
  assert.equal(a.items.filter((i) => i.group === "contexto").length, 3);
  assert.ok(a.items.every((i, n) => i.order === n + 1), "ordem com furo quebra o progresso");
});

test("a apresentação NÃO leva ponto nenhum", () => {
  const blob = JSON.stringify(apresentacaoUnificada());
  assert.ok(!blob.includes('"score"'), "o ponto é resolvido no servidor, contra a definição privada");
});

test("a apresentação leva o bloco de perfil — e é ele que liga a tela", () => {
  const a = apresentacaoUnificada();
  assert.ok(Array.isArray(a.perfil) && a.perfil.length === PERFIL.length);
  // e o instrumento anônimo NÃO tem o bloco: é essa ausência que mantém o link
  // público sem nome e sem empresa
  assert.equal(instrumentoIA.perfil, undefined);
});

test("a estimativa de tempo é derivada, não cravada", () => {
  const cheio = apresentacaoUnificada();
  const enxuto = apresentacaoUnificada({
    ia: { ...instrumentoIA, items: instrumentoIA.items.filter((i) => i.kind === "context" || /01$/.test(i.id)) },
  });
  assert.notEqual(enxuto.instrument.estimated_minutes, cheio.instrument.estimated_minutes,
    "encurtar o instrumento tem de encurtar o tempo anunciado junto");
  assert.equal(estimativaEmMinutos(30, 3), "10–13");
  assert.equal(estimativaEmMinutos(0), "1–4", "nunca anuncia zero minuto");
});

test("perfil completo: exige os obrigatórios e recusa valor fora da lista", () => {
  const cheio = { nome: "Ana", empresa: "Boomit", cargo: "Head", nivel: "G", porte: "S3", setor: "V1" };
  assert.deepEqual(perfilCompleto(cheio), { ok: true, faltam: [] });
  assert.deepEqual(perfilCompleto({ ...cheio, nome: "   " }).faltam, ["nome"], "espaço não é nome");
  assert.deepEqual(perfilCompleto({ ...cheio, nivel: "Z" }).faltam, ["nivel"], "nível inventado não passa");
  assert.deepEqual(perfilCompleto({ ...cheio, empresa: "A".repeat(200) }).faltam, ["empresa"]);
  assert.equal(perfilCompleto(null).faltam.length, PERFIL.filter((c) => c.obrigatorio).length);
});
