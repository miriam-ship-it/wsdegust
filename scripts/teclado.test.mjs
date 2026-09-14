// =============================================================
// TECLADO NAS QUESTÕES — com eventos de teclado REAIS, num navegador real.
//
// Por que este teste existe, e por que ele não podia ser unitário: quando o
// questionário passou a avançar sozinho ao escolher, apareceu um risco que só
// se enxerga rodando. Percorrer as alternativas com ↑↓ num radiogroup executa o
// comportamento de ativação do navegador: ele MARCA o radio e dispara `click` e
// `change` — indistinguíveis dos de um toque. A primeira versão do avanço
// automático se guiava pelo `click` e, por isso, avançava a cada seta: o teclado
// ficava inutilizável, e nenhum teste de função pura acusaria.
//
// A correção foi discriminar pela TECLA, no `keydown`, que roda antes da ação
// padrão. Este teste tranca esse comportamento:
//   ↑↓ percorrem e marcam, mas NÃO avançam;
//   Espaço confirma e avança (inclusive quando a seta já marcou);
//   1–9 escolhem e avançam;
//   ← volta.
//
//   npm run test:dev
// =============================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { criarServidor } from "./dev-rhia.mjs";

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const navegador = CHROMES.find((p) => fs.existsSync(p));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

test("teclado: percorrer não avança, escolher avança", { skip: navegador ? false : "sem Chrome/Edge instalado" }, async (t) => {
  const srv = await criarServidor({ porta: 0 });
  const base = `http://localhost:${srv.porta}`;
  const perfil = path.join(process.env.TEMP || "/tmp", "rhia-teclado-perfil");
  fs.rmSync(perfil, { recursive: true, force: true });
  const ch = spawn(navegador, ["--headless=new", "--remote-debugging-port=9412", "--disable-gpu",
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    `--user-data-dir=${perfil}`, "about:blank"], { stdio: "ignore" });
  t.after(async () => {
    ch.kill(); await srv.fechar(); await dormir(400);
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* some depois */ }
  });

  let alvo = null;
  for (let i = 0; i < 40 && !alvo; i++) {
    await dormir(500);
    try { alvo = (await (await fetch("http://localhost:9412/json/list")).json()).find((x) => x.type === "page"); } catch { /* subindo */ }
  }
  assert.ok(alvo, "o navegador abriu a porta de depuração");

  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.onopen = r; ws.onerror = () => e(new Error("não conectou")); });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cmd = (me, p = {}) => new Promise((r, e) => {
    const n = ++id; pend.set(n, (x) => (x.error ? e(new Error(me + ": " + x.error.message)) : r(x.result)));
    ws.send(JSON.stringify({ id: n, method: me, params: p }));
  });
  const js = async (expr) => {
    const r = await cmd("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // Tecla de verdade, na sequência que o navegador entrega.
  const tecla = async (key, code, texto) => {
    await cmd("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code });
    if (texto) await cmd("Input.dispatchKeyEvent", { type: "char", text: texto, key });
    await cmd("Input.dispatchKeyEvent", { type: "keyUp", key, code });
    await dormir(650);
  };
  const progresso = () => js('return (document.querySelector(".sc-progress__count")||{}).textContent;');

  await cmd("Page.enable"); await cmd("Runtime.enable");
  await cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cmd("Page.navigate", { url: base + "/rhia.html" }); await dormir(2000);
  await js("try { localStorage.clear(); } catch (e) {} return 1;");
  await cmd("Page.navigate", { url: base + "/rhia.html" }); await dormir(2000);

  await js(`
    document.querySelector('[data-acao="comecar"]').click(); await new Promise(z=>setTimeout(z,1800));
    // O contexto também é uma pergunta por vez e avança ao escolher: não há
    // botão para clicar, então esperamos a tela trocar sozinha.
    const cnt = () => (document.querySelector(".sc-progress__count")||{}).textContent || "";
    const esc = async (v) => {
      const e=[...document.querySelectorAll('input[type=radio]')].find(x=>x.value===v);
      if(!e) return false;
      // Esperar o CONTADOR mudar, não o texto da página: o primeiro repinte
      // (marcar a alternativa) já muda o texto, e sairíamos antes do avanço.
      const antes = cnt();
      e.click();
      for (let t=0;t<60;t++){ await new Promise(z=>setTimeout(z,120)); if (cnt() !== antes) return true; }
      return false;
    };
    await esc("HR_LEADER"); await esc("AREA"); await esc("DECIDE_SCOPE");
    for (let t=0;t<50 && location.hash!=="#questoes";t++) await new Promise(z=>setTimeout(z,150));
    return location.hash;`);

  const primeira = await progresso();
  assert.match(String(primeira), /Pergunta 4 de 30/, "chegou à primeira pergunta");

  // ↑↓ percorrem: marcam a alternativa, mas NÃO avançam. É o coração do teste.
  await js("const r = document.querySelector('input[type=radio]'); if (r) r.focus(); return 1;");
  await tecla("ArrowDown", "ArrowDown");
  await tecla("ArrowDown", "ArrowDown");
  assert.equal(await progresso(), primeira, "percorrer com ↑↓ NÃO pode avançar de pergunta");
  assert.equal(await js('return document.querySelectorAll("input[type=radio]:checked").length;'), 1,
    "as setas marcam a alternativa focada, como um radiogroup deve fazer");

  // Espaço confirma a alternativa que a seta marcou, e avança.
  await tecla(" ", "Space", " ");
  const depoisDoEspaco = await progresso();
  assert.notEqual(depoisDoEspaco, primeira, "Espaço confirma e avança");

  // Tecla numérica escolhe e avança.
  await tecla("3", "Digit3", "3");
  const depoisDoNumero = await progresso();
  assert.notEqual(depoisDoNumero, depoisDoEspaco, "tecla numérica escolhe e avança");

  // ← volta.
  await tecla("ArrowLeft", "ArrowLeft");
  assert.equal(await progresso(), depoisDoEspaco, "← volta uma pergunta");

  ws.close();
});
