// Testes puros da lógica da edge (node --test).
import test from "node:test";
import assert from "node:assert/strict";
import { instrumento, projecaoPublica } from "../motor/definicao.mjs";
import { calcular } from "../motor/motor.mjs";
import { gerarToken, hashToken, sha256Hex, capacidades, resolverOpcao, validarSubmissao, paraPublico, avaliarCredencialPrevia } from "./logica.mjs";

const NOW = new Date("2026-09-10T12:00:00Z");
function preencher(stage) { const r = {}; for (const it of instrumento.items) r[it.code] = stage; return r; }

test("token: 64 hex e único; hash determinístico e 64 hex", async () => {
  const t1 = gerarToken(), t2 = gerarToken();
  assert.match(t1, /^[0-9a-f]{64}$/); assert.notEqual(t1, t2);
  const h = await hashToken(t1);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashToken(t1));
  assert.notEqual(h, await hashToken(t2));
});

test("matriz de estados", async () => {
  const semCred = false, comCred = true;
  assert.deepEqual(pick(capacidades({ status: "inactive" }, NOW, semCred)), [false, false, false, false]);
  assert.deepEqual(pick(capacidades({ status: "internal_preview" }, NOW, semCred)), [false, false, false, false]);
  assert.deepEqual(pick(capacidades({ status: "internal_preview" }, NOW, comCred)), [true, true, true, true]);
  assert.deepEqual(pick(capacidades({ status: "public_pilot" }, NOW, semCred)), [true, true, true, true]);
  assert.deepEqual(pick(capacidades({ status: "published" }, NOW, semCred)), [true, true, true, true]);
  // closed: sem iniciar/escrever, com leitura
  assert.deepEqual(pick(capacidades({ status: "closed" }, NOW, semCred)), [true, false, false, true]);
  // fora de vigência (janela no passado): sem iniciar/escrever, com leitura
  const fora = capacidades({ status: "public_pilot", starts_at: "2026-01-01", ends_at: "2026-02-01" }, NOW, semCred);
  assert.deepEqual(pick(fora), [true, false, false, true]);
  // dentro de vigência
  const dentro = capacidades({ status: "public_pilot", starts_at: "2026-09-01", ends_at: "2026-12-01" }, NOW, semCred);
  assert.deepEqual(pick(dentro), [true, true, true, true]);
});
function pick(c) { return [c.autorizado, c.podeIniciar, c.podeEscrever, c.podeLerResultado]; }

test("resolverOpcao: válido; rejeita id desconhecido e item que não corresponde", () => {
  const pub = projecaoPublica(instrumento, { sessionSeed: "s1" });
  const it = pub.blocks[0].items[0];
  const op = it.options[0];
  const alvo = resolverOpcao(pub.mapping, it.id, op.id);
  assert.equal(alvo.item_code, pub.mapping.items[it.id]);
  assert.ok(["E1", "E2", "E3", "E4", "NA"].includes(alvo.stage_code));
  assert.throws(() => resolverOpcao(pub.mapping, it.id, "deadbeef"), /desconhecido/);
  const outroItem = pub.blocks[0].items[1];
  assert.throws(() => resolverOpcao(pub.mapping, outroItem.id, op.id), /nao corresponde/);
});

test("resolverOpcao rejeita opção de OUTRO instrumento (outra sessão)", () => {
  const a = projecaoPublica(instrumento, { sessionSeed: "sessaoA" });
  const b = projecaoPublica(instrumento, { sessionSeed: "sessaoB" });
  const itemA = a.blocks[0].items[0].id;
  const opcaoB = b.blocks[0].items[0].options[0].id; // id de outra sessão
  assert.throws(() => resolverOpcao(a.mapping, itemA, opcaoB), /desconhecido/);
});

test("validarSubmissao: completa ok; incompleta/estágio inválido reprovam", () => {
  assert.equal(validarSubmissao(preencher("E3")), true);
  const faltando = preencher("E3"); delete faltando[instrumento.items[0].code];
  assert.throws(() => validarSubmissao(faltando), /incompleto/);
  const inv = preencher("E3"); inv[instrumento.items[0].code] = "E9";
  assert.throws(() => validarSubmissao(inv), /invalido/);
});

test("paraPublico: traz 0–100 agregado e rótulos; sem bp/estágio/pesos/regras/respostas", () => {
  const r = calcular({ respostas: preencher("E3"), assessment_unit: { id: "u", name: "Comercial" } });
  const pub = paraPublico(r);
  assert.equal(pub.contract_version, "PublicResultV1");
  const blob = JSON.stringify(pub);
  // proibidos: basis points, corte, checksum de entrada, evidências, pesos, estágio escolhido
  for (const proibido of ["score_bp", "provisional_cut_bp", "input_checksum",
    "evidence_item_codes", "weight", "peso", "\"E1\"", "\"E2\"", "\"E3\"", "\"E4\"", "stage_code"]) {
    assert.ok(!blob.includes(proibido), `PublicResultV1 vazou "${proibido}"`);
  }
  for (const it of instrumento.items) assert.ok(!blob.includes(it.code), `vazou item ${it.code}`);
  // RESULTADOS AGREGADOS presentes (0–100)
  assert.equal(pub.individual.overall, null); // indivíduo sem nota geral
  assert.equal(pub.individual.dimensions.length, 5);
  for (const d of pub.individual.dimensions) { assert.equal(typeof d.display_score, "number"); assert.ok(d.display_score >= 0 && d.display_score <= 100); assert.ok(d.band_label); }
  assert.equal(typeof pub.organization.index_display, "number");
  assert.equal(typeof pub.ai.index_display, "number");
  for (const d of pub.ai.dimensions) assert.equal(typeof d.display_score, "number");
  assert.equal(pub.respondent_scope.organization_label, "individual_perception");
  assert.ok(pub.priorities.every((p) => p.dimension_name && p.action && !("score_bp" in p)));
  assert.ok(pub.alignment.every((a) => a.dimension_name && a.direction && a.magnitude && !("gap_bp" in a)));
});

test("avaliarCredencialPrevia: hash confere, expira e revoga por vínculo", async () => {
  const key = "segredo-previa";
  const hash = await sha256Hex(key);
  const now = new Date("2026-09-10T12:00:00Z");
  assert.equal(await avaliarCredencialPrevia(key, { preview_credential_sha256: hash }, null, now), true);
  assert.equal(await avaliarCredencialPrevia("errada", { preview_credential_sha256: hash }, null, now), false);
  assert.equal(await avaliarCredencialPrevia(undefined, { preview_credential_sha256: hash }, null, now), false);
  // revogada no vínculo
  assert.equal(await avaliarCredencialPrevia(key, { preview_credential_sha256: hash, preview_revoked_at: "2026-09-01" }, null, now), false);
  // expirada
  assert.equal(await avaliarCredencialPrevia(key, { preview_credential_sha256: hash, preview_expires_at: "2026-09-05" }, null, now), false);
  // fallback por env
  assert.equal(await avaliarCredencialPrevia(key, {}, hash, now), true);
});

test("sha256Hex confere com valor conhecido", async () => {
  assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});
