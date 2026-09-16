// A devolutiva do link público não pode mudar por efeito colateral.
//
// Em 16/09 o renderizador foi reorganizado para o documento único poder
// intercalar as seções de IA com a metade de liderança. Os .html desta pasta
// foram gerados ANTES disso; se a saída de hoje diferir deles, alguma coisa
// mudou no documento que está no ar — e isso só pode acontecer de propósito.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cenarios } from "./cenarios.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
for (const c of cenarios()) {
  test(`golden: a devolutiva do link público continua idêntica — ${c.nome}`, () => {
    const esperado = fs.readFileSync(path.join(AQUI, `${c.nome}.html`), "utf8").replace(/\r\n/g, "\n");
    const atual = c.html().replace(/\r\n/g, "\n");
    if (atual !== esperado) {
      // aponta ONDE diverge, em vez de despejar dois documentos inteiros
      let i = 0; while (i < atual.length && atual[i] === esperado[i]) i++;
      assert.fail(`${c.nome}: diverge no caractere ${i}\n  esperado: …${esperado.slice(Math.max(0, i - 60), i + 60)}…\n  atual   : …${atual.slice(Math.max(0, i - 60), i + 60)}…`);
    }
  });
}
