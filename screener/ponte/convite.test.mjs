import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  gerarCodigo, hashDoCodigo, linkDoConvite, emitirConvite,
  convitePresenteNaUrl, urlSemConvite,
} from "./convite.mjs";

const BASE = "https://diagnosticoboomit.netlify.app/rhia.html";

test("o código tem 256 bits e não se repete", () => {
  const vistos = new Set();
  for (let i = 0; i < 200; i++) {
    const c = gerarCodigo();
    assert.match(c, /^[0-9a-f]{64}$/);
    vistos.add(c);
  }
  assert.equal(vistos.size, 200, "código de convite repetido é convite de outra pessoa");
});

test("o hash é o sha256 do código — o mesmo que o banco confere", async () => {
  const c = gerarCodigo();
  assert.equal(await hashDoCodigo(c), createHash("sha256").update(c, "utf8").digest("hex"));
});

test("o link leva o convite e preserva o que a base já tinha", () => {
  const c = gerarCodigo();
  assert.equal(linkDoConvite(BASE, c), `${BASE}?convite=${c}`);
  const comUtm = linkDoConvite(`${BASE}?utm_source=email`, c);
  assert.ok(comUtm.includes("utm_source=email"), "a base é configuração; não se pode descartar o que ela traz");
  assert.ok(comUtm.includes(`convite=${c}`));
});

// -------------------------------------------------------------------------
// A emissão
// -------------------------------------------------------------------------

/** Um banco de mentira que guarda o que recebeu, para conferir o que cruzou. */
function bancoFalso(resposta) {
  const chamadas = [];
  return {
    chamadas,
    q: async (texto, params) => {
      chamadas.push({ texto, params });
      if (resposta instanceof Error) throw resposta;
      return { rows: [{ r: resposta }] };
    },
  };
}

test("emite pelo TOKEN da sessão, e o que vai ao banco é o hash", async () => {
  const db = bancoFalso({ status: "ok", convite_id: "id-1" });
  const r = await emitirConvite({ q: db.q, tokenSessao: "tok-lideranca", horas: 720 });

  assert.equal(r.status, "ok");
  assert.match(r.codigo, /^[0-9a-f]{64}$/);

  const [texto, params] = [db.chamadas[0].texto, db.chamadas[0].params];
  assert.ok(texto.includes("screener_rhia_op_emitir_convite"));
  assert.equal(params[0], "tok-lideranca", "quem identifica a pessoa é o token, não um id escolhido");
  assert.equal(params[1], await hashDoCodigo(r.codigo));
  assert.notEqual(params[1], r.codigo, "o código cru não pode chegar ao banco");
  assert.equal(params[2], 720);
});

test("sem token de sessão não se emite nada", async () => {
  const db = bancoFalso({ status: "ok" });
  const r = await emitirConvite({ q: db.q, tokenSessao: null });
  assert.equal(r.status, "sem_token_de_sessao");
  assert.equal(r.codigo, null);
  assert.equal(db.chamadas.length, 0, "nem chega a bater no banco");
});

test("falha do banco NÃO derruba a entrega do relatório", async () => {
  const db = bancoFalso(new Error("pooler fora do ar"));
  const r = await emitirConvite({ q: db.q, tokenSessao: "t" });
  assert.equal(r.status, "falhou");
  assert.match(r.erro, /pooler/);
  assert.equal(r.codigo, null, "sem código, o e-mail sai sem o link — e sai");
});

test("status que não seja ok não vira código", async () => {
  for (const status of ["sessao_de_lideranca_nao_encontrada", "codigo_em_uso", "codigo_invalido"]) {
    const r = await emitirConvite({ q: bancoFalso({ status }).q, tokenSessao: "t" });
    assert.equal(r.status, status);
    assert.equal(r.codigo, null);
  }
  const semResposta = await emitirConvite({ q: bancoFalso(null).q, tokenSessao: "t" });
  assert.equal(semResposta.status, "sem_resposta");
});

test("reemissão do mesmo convite é reconhecida, não confundida com um convite novo", async () => {
  const db = bancoFalso({ status: "ok", convite_id: "id-1", ja_existia: true });
  const r = await emitirConvite({ q: db.q, tokenSessao: "t" });
  assert.equal(r.status, "ok");
  assert.equal(r.ja_existia, true);
});

// -------------------------------------------------------------------------
// A chegada
// -------------------------------------------------------------------------

test("lê o convite da URL de chegada, e só no formato certo", () => {
  const c = gerarCodigo();
  assert.equal(convitePresenteNaUrl(`${BASE}?convite=${c}`), c);
  assert.equal(convitePresenteNaUrl(BASE), null);
  assert.equal(convitePresenteNaUrl(`${BASE}?convite=nao-e-hash`), null,
    "o que não tem a forma de um código não vira tentativa de vínculo");
  assert.equal(convitePresenteNaUrl(`${BASE}?convite=${c.toUpperCase()}`), null);
  assert.equal(convitePresenteNaUrl("nem e url"), null);
});

test("a URL limpa não guarda o convite, e preserva o resto", () => {
  const c = gerarCodigo();
  assert.equal(urlSemConvite(`${BASE}?convite=${c}`), "/rhia.html");
  assert.equal(urlSemConvite(`${BASE}?convite=${c}&utm_source=email`), "/rhia.html?utm_source=email");
  assert.equal(urlSemConvite(`${BASE}?convite=${c}#topo`), "/rhia.html#topo");
  assert.ok(!urlSemConvite(`${BASE}?convite=${c}`).includes(c),
    "enquanto está na barra, o código viaja em histórico, em compartilhamento e em Referer");
});
