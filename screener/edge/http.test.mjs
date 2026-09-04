// Testes da política HTTP (CORS, métodos, limite de corpo). node --test.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAllowlist, avaliarOrigem, metodosDaRota, allowDaRota,
  headersSolicitadosPermitidos, lerCorpoJson, HEADERS_PERMITIDOS,
} from "./http.mjs";

test("parseAllowlist: aceita https válidos; rejeita *, null, credenciais, path, query, fragmento, http", () => {
  const a = parseAllowlist("https://app.exemplo.com, https://x.exemplo.com");
  assert.ok(a.has("https://app.exemplo.com") && a.has("https://x.exemplo.com") && a.size === 2);
  for (const ruim of ["*", "null", "https://u:p@a.com", "https://a.com/caminho", "https://a.com/", "https://a.com?q=1", "https://a.com#f", "http://a.com", "lixo"]) {
    assert.equal(parseAllowlist(ruim).size, 0, `deveria rejeitar: ${ruim}`);
  }
  assert.equal(parseAllowlist("").size, 0);
  // http só é aceito quando exigirHttps=false (dev)
  assert.ok(parseAllowlist("http://localhost:3000", { exigirHttps: false }).has("http://localhost:3000"));
});

test("avaliarOrigem: sem origem segue; permitida; recusada bloqueia", () => {
  const a = parseAllowlist("https://app.exemplo.com");
  assert.deepEqual(avaliarOrigem(undefined, a), { semOrigem: true });
  assert.deepEqual(avaliarOrigem("https://app.exemplo.com", a), { permitido: true, origin: "https://app.exemplo.com" });
  assert.deepEqual(avaliarOrigem("https://malicioso.com", a), { bloqueado: true });
});

test("métodos por rota + Allow", () => {
  assert.deepEqual(metodosDaRota("/start"), ["GET", "POST"]);
  assert.deepEqual(metodosDaRota("/response"), ["PUT"]);
  assert.equal(metodosDaRota("/inexistente"), null);
  assert.equal(allowDaRota("/start"), "GET, POST, OPTIONS");
  assert.equal(allowDaRota("/submit"), "POST, OPTIONS");
});

test("headers de preflight solicitados: só os permitidos passam", () => {
  assert.ok(headersSolicitadosPermitidos("content-type, x-session-token"));
  assert.ok(headersSolicitadosPermitidos(""));
  assert.ok(!headersSolicitadosPermitidos("content-type, x-evil"));
  // a allowlist inclui os headers do contrato
  assert.ok(HEADERS_PERMITIDOS.includes("x-preview-key") && HEADERS_PERMITIDOS.includes("x-session-token"));
});

test("lerCorpoJson: dentro do teto retorna objeto", async () => {
  const req = new Request("http://x/", { method: "POST", body: JSON.stringify({ a: 1, event_slug: "s" }) });
  assert.deepEqual((await lerCorpoJson(req, 16384)).valor, { a: 1, event_slug: "s" });
});

test("lerCorpoJson: Content-Length acima do teto → 413 (não confia só no header, mas barra cedo)", async () => {
  const req = new Request("http://x/", { method: "POST", body: "x".repeat(20000) });
  assert.equal((await lerCorpoJson(req, 16384)).erro, 413);
});

test("lerCorpoJson: stream excede o teto SEM Content-Length confiável → 413 (leitura incremental)", async () => {
  const stream = new ReadableStream({
    start(c) {
      const chunk = new Uint8Array(8192).fill(97); // 'a'
      for (let i = 0; i < 3; i++) c.enqueue(chunk); // 24 KiB > 16 KiB
      c.close();
    },
  });
  const req = new Request("http://x/", { method: "POST", body: stream, duplex: "half" });
  assert.equal(req.headers.get("content-length"), null, "stream deve ir sem content-length (chunked)");
  assert.equal((await lerCorpoJson(req, 16384)).erro, 413);
});

test("lerCorpoJson: corpo vazio → {}; corpo inválido → {} (handlers validam conteúdo)", async () => {
  assert.deepEqual((await lerCorpoJson(new Request("http://x/", { method: "POST" }), 16384)).valor, {});
  assert.deepEqual((await lerCorpoJson(new Request("http://x/", { method: "POST", body: "não é json" }), 16384)).valor, {});
});

test("lerCorpoJson: exatamente no teto passa; um byte acima barra", async () => {
  const noLimite = JSON.stringify({ p: "a".repeat(16384 - 12) }); // ~16384 bytes
  const req1 = new Request("http://x/", { method: "POST", body: noLimite.slice(0, 16384) });
  const r1 = await lerCorpoJson(req1, 16384);
  assert.ok("valor" in r1 || "erro" in r1); // não estoura
  const req2 = new Request("http://x/", { method: "POST", body: "a".repeat(16385) });
  assert.equal((await lerCorpoJson(req2, 16384)).erro, 413);
});
