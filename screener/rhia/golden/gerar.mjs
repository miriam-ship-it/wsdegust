// Gera as saídas de referência ("golden") da devolutiva de IA do link público.
//
// POR QUE EXISTE. Em 16/09 o renderizador foi reorganizado para que o documento
// único pudesse intercalar as seções de IA com a metade de liderança. Essa
// função serve o link público que está no ar — e a reorganização não podia
// mudar uma vírgula dele. Estes arquivos foram gerados ANTES da reorganização;
// `golden.test.mjs` compara a saída de hoje com eles.
//
// Rode só quando uma mudança na devolutiva do link público for INTENCIONAL — e
// revise o diff dos .html antes de commitar.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cenarios } from "./cenarios.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
for (const c of cenarios()) {
  fs.writeFileSync(path.join(AQUI, `${c.nome}.html`), c.html(), { encoding: "utf8" });
  console.log("golden:", c.nome);
}
