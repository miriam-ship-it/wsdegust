// Testes dos helpers de rate limiting (IP + chave HMAC). node --test.
import test from "node:test";
import assert from "node:assert/strict";
import { ehIpValido, extrairIp, chaveRate } from "./ratelimit.mjs";

test("ehIpValido: IPv4 e IPv6 válidos; rejeita inválidos", () => {
  for (const ok of ["1.2.3.4", "255.255.255.255", "0.0.0.0", "2001:db8::1", "::1", "fe80::1"])
    assert.ok(ehIpValido(ok), `deveria aceitar ${ok}`);
  for (const bad of ["", "256.0.0.1", "1.2.3", "1.2.3.4.5", "abc", "1.2.3.-1", "gggg::1", "12345", null, undefined])
    assert.ok(!ehIpValido(bad), `deveria rejeitar ${bad}`);
});

test("extrairIp: cf-connecting-ip é a autoridade; x-forwarded-for é ignorado; ausente/inválido → unknown", () => {
  const h = (m) => (n) => m[n.toLowerCase()];
  assert.equal(extrairIp(h({ "cf-connecting-ip": "203.0.113.7" })), "203.0.113.7");
  // x-forwarded-for NÃO é autoridade
  assert.equal(extrairIp(h({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" })), "unknown");
  // cf presente porém inválido → unknown (não cai para outro header)
  assert.equal(extrairIp(h({ "cf-connecting-ip": "not-an-ip", "x-forwarded-for": "1.2.3.4" })), "unknown");
  // ausente → unknown
  assert.equal(extrairIp(h({})), "unknown");
});

test("chaveRate: HMAC determinístico, 64 hex, sensível a secret/tipo/slug/id", async () => {
  const k1 = await chaveRate("segredo", "autosave", "slug", "id1");
  assert.match(k1, /^[0-9a-f]{64}$/);
  assert.equal(k1, await chaveRate("segredo", "autosave", "slug", "id1")); // determinístico
  assert.notEqual(k1, await chaveRate("segredo", "autosave", "slug", "id2")); // id diferente
  assert.notEqual(k1, await chaveRate("segredo", "submit", "slug", "id1"));   // tipo diferente
  assert.notEqual(k1, await chaveRate("OUTRO", "autosave", "slug", "id1"));    // secret diferente
  // a chave é opaca: não contém o identificador em claro
  assert.ok(!k1.includes("id1"));
});
