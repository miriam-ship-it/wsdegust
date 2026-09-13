// =============================================================
// CAPTURAS — as telas do diagnóstico, em desktop e mobile, como ARQUIVO.
//
// Sobe o dev server, dirige um Chrome headless pelo protocolo de depuração
// (sem dependência nova: o node já traz WebSocket) e grava os PNGs em
// screener/rhia/capturas/. Percorre o fluxo de verdade — contexto, as 30
// respostas, o portão de lead — em vez de posar cada tela.
//
//   npm run capturas
// =============================================================
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { criarServidor } from "./dev-rhia.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = path.join(RAIZ, "screener", "rhia", "capturas");

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const acharNavegador = () => CHROMES.find((p) => fs.existsSync(p));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cliente mínimo do protocolo de depuração do Chrome. */
async function conectar(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, erro) => { ws.onopen = ok; ws.onerror = () => erro(new Error("não conectou ao navegador")); });
  let id = 0;
  const pendentes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); }
  };
  const enviar = (method, params = {}) => new Promise((ok, erro) => {
    const n = ++id;
    pendentes.set(n, (m) => (m.error ? erro(new Error(method + ": " + m.error.message)) : ok(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { enviar, fechar: () => ws.close() };
}

/** Avalia JS na página e devolve o valor (com await, se for promessa). */
async function avaliar(cdp, expressao) {
  const r = await cdp.enviar("Runtime.evaluate", {
    expression: `(async () => { ${expressao} })()`,
    awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error("erro na página: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

/** Imprime a página em PDF (A4, com fundos) — o mesmo caminho do botão. */
async function imprimir(cdp, arquivo) {
  const { data } = await cdp.enviar("Page.printToPDF", {
    printBackground: true, paperWidth: 8.27, paperHeight: 11.69,
    marginTop: 0.6, marginBottom: 0.6, marginLeft: 0.6, marginRight: 0.6,
    preferCSSPageSize: false,
  });
  fs.writeFileSync(path.join(DESTINO, arquivo), Buffer.from(data, "base64"));
  const kb = Math.round(fs.statSync(path.join(DESTINO, arquivo)).size / 1024);
  console.log(`  ${arquivo} (${kb} KB)`);
}

async function capturar(cdp, arquivo) {
  const { data } = await cdp.enviar("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(DESTINO, arquivo), Buffer.from(data, "base64"));
  const kb = Math.round(fs.statSync(path.join(DESTINO, arquivo)).size / 1024);
  console.log(`  ${arquivo} (${kb} KB)`);
}

/** Percorre o fluxo inteiro, capturando abertura, questão e resultado. */
async function percorrer(cdp, base, sufixo, { largura, altura, mobile }) {
  await cdp.enviar("Emulation.setDeviceMetricsOverride", {
    width: largura, height: altura, deviceScaleFactor: 2, mobile,
  });
  await cdp.enviar("Page.navigate", { url: base + "/rhia.html" });
  await dormir(1800);
  await avaliar(cdp, "try { localStorage.clear(); } catch (e) {} return true;");
  await cdp.enviar("Page.navigate", { url: base + "/rhia.html" });
  await dormir(1800);

  await capturar(cdp, `abertura-${sufixo}.png`);

  // Abertura → contexto → primeira questão.
  await avaliar(cdp, `
    document.querySelector('[data-acao="comecar"]').click();
    await new Promise(r => setTimeout(r, 1200));
    // Cada resposta repinta a tela: consultar o DOM de novo antes de cada
    // clique, senão o nó guardado já está órfão e o clique não faz nada.
    const escolher = async (v) => {
      const el = [...document.querySelectorAll('input[type=radio]')].find(x => x.value === v);
      if (!el) throw new Error("alternativa não encontrada: " + v);
      el.click();
      await new Promise(r => setTimeout(r, 700));
    };
    await escolher("HR_LEADER");
    await escolher("AREA");
    await escolher("DECIDE_SCOPE");
    document.querySelector('[data-acao="concluir-contexto"]').click();
    await new Promise(r => setTimeout(r, 1600));
    if (location.hash !== "#questoes") throw new Error("não avançou do contexto: " + location.hash);
    return location.hash;
  `);
  await dormir(600);
  await capturar(cdp, `questao-${sufixo}.png`);

  // Responde as 27 restantes com um perfil desigual (a devolutiva fica rica:
  // dois sustentadores, dois limitadores, duas tensões).
  await avaliar(cdp, `
    const PLANO = { EST: "E4", INF: "E4", TAL: "E3", DAD: "E3", DES: "E2", IA: "E2" };
    const ORDEM = ["EST","EST","EST","EST","TAL","TAL","TAL","TAL","DES","DES","DES","DES",
                   "INF","INF","INF","INF","DAD","DAD","DAD","DAD","IA","IA","IA","IA"];
    for (let i = 0; i < 30; i++) {
      const cont = (document.querySelector(".sc-progress__count") || {}).textContent || "";
      const m = cont.match(/Pergunta (\\d+) de 30/);
      if (!m) break;
      const n = Number(m[1]);
      const alvo = n <= 27 ? PLANO[ORDEM[n - 4]] : "E3";   // 28-30 são os gates
      const rad = [...document.querySelectorAll('input[type=radio]')];
      (rad.find(x => x.value === alvo) || rad[0]).click();
      await new Promise(r => setTimeout(r, 220));
      const b = document.querySelector('[data-acao="avancar-nav"]');
      if (!b) break;
      b.click();
      await new Promise(r => setTimeout(r, 380));
      if (location.hash !== "#questoes") break;
    }
    return { hash: location.hash, progresso: (document.querySelector(".sc-progress__count") || {}).textContent || null,
             titulo: (document.querySelector("h1") || {}).textContent || null };
  `).then((d) => { console.log("    após responder:", JSON.stringify(d)); });
  await dormir(900);

  // Revisão → envia → portão de lead → devolutiva.
  await avaliar(cdp, `
    document.querySelector('[data-acao="enviar"]').click();
    await new Promise(r => setTimeout(r, 2200));
    const em = document.querySelector('input[type=email]');
    if (em) {
      const nm = document.querySelector('input[type=text]');
      if (nm) { nm.value = "Ana Ribeiro"; nm.dispatchEvent(new Event("input", { bubbles: true })); }
      em.value = "ana@empresa.com"; em.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('form[data-acao="lead"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 2500));
    }
    return location.hash + " | " + (document.querySelector("h1") || {}).textContent;
  `);
  await dormir(1000);
  await capturar(cdp, `resultado-${sufixo}.png`);

  // O papel. É a única saída que nenhum teste automatizado cobre, e é a que o
  // participante leva para a reunião: sai aqui como PDF, no fluxo de verdade.
  if (!mobile) await imprimir(cdp, "devolutiva-impressa.pdf");

  // A mesma devolutiva no tema escuro. O botão de tema só troca o atributo no
  // <html>, sem repintar a tela: a sessão e o resultado continuam de pé.
  await avaliar(cdp, `
    const b = document.querySelector('[data-acao="tema"]');
    if (!b) throw new Error("sem botão de tema");
    b.click();
    await new Promise(r => setTimeout(r, 400));
    return document.documentElement.getAttribute("data-theme");
  `);
  await dormir(400);
  await capturar(cdp, `resultado-${sufixo}-escuro.png`);
}

const navegador = acharNavegador();
if (!navegador) {
  console.error("\nNenhum Chrome ou Edge encontrado nos caminhos padrão do Windows.\n");
  process.exit(1);
}
fs.mkdirSync(DESTINO, { recursive: true });

const srv = await criarServidor({ porta: 0 });
const base = `http://localhost:${srv.porta}`;
console.log(`dev server em ${base}`);

const perfilTmp = path.join(process.env.TEMP || "/tmp", "rhia-capturas-perfil");
fs.rmSync(perfilTmp, { recursive: true, force: true });
const chrome = spawn(navegador, [
  "--headless=new", "--remote-debugging-port=9333", "--disable-gpu",
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  `--user-data-dir=${perfilTmp}`, "about:blank",
], { stdio: "ignore" });

try {
  // Espera a porta de depuração responder.
  let alvo = null;
  for (let i = 0; i < 40 && !alvo; i++) {
    await dormir(500);
    try {
      const abas = await (await fetch("http://localhost:9333/json/list")).json();
      alvo = abas.find((t) => t.type === "page");
    } catch { /* ainda subindo */ }
  }
  if (!alvo) throw new Error("o navegador não abriu a porta de depuração");

  const cdp = await conectar(alvo.webSocketDebuggerUrl);
  await cdp.enviar("Page.enable");
  await cdp.enviar("Runtime.enable");

  console.log("desktop (1280×900):");
  await percorrer(cdp, base, "desktop", { largura: 1280, altura: 900, mobile: false });
  console.log("mobile (390×844):");
  await percorrer(cdp, base, "mobile", { largura: 390, altura: 844, mobile: true });

  cdp.fechar();
  console.log(`\nCapturas em ${path.relative(RAIZ, DESTINO)}`);
} finally {
  chrome.kill();
  await srv.fechar();
  // O Windows ainda segura arquivos do perfil por um instante depois do kill;
  // falhar aqui esconderia o erro de verdade lá de cima.
  await dormir(400);
  try { fs.rmSync(perfilTmp, { recursive: true, force: true }); } catch { /* some depois */ }
}
