// Os cenários congelados — os mesmos perfis que os testes do renderizador usam.
import instrumento from "../pacote/instrumento-rh-ia-v1.json" with { type: "json" };
import { buildResultContractV2 } from "../pacote/src/output-engine-v2.mjs";
import { paraPublico } from "../logica.mjs";
import { renderResultado } from "../../../frontend/rhia.mjs";

const DIMS = instrumento.dimensions.map((d) => d.id);
const CTX = instrumento.items.filter((it) => it.kind === "context");

function respostas({ porDimensao = {}, gates = "E3", ctx = [0, 2, 2], na = {} } = {}) {
  const out = {};
  CTX.forEach((it, i) => { out[it.id] = it.options[ctx[i]].id; });
  for (const it of instrumento.items) {
    if (it.kind === "scored") out[it.id] = porDimensao[it.dimension] ?? "E3";
    else if (it.kind === "governance_gate") out[it.id] = gates;
  }
  for (const [dim, quantos] of Object.entries(na)) {
    const ids = instrumento.dimensions.find((d) => d.id === dim).items.slice(0, quantos);
    for (const id of ids) out[id] = "NA";
  }
  return out;
}
function publico(answers) {
  const c = buildResultContractV2({ instrument: instrumento, answers });
  c.internal.generatedAt = "2026-09-12T12:00:00.000Z";
  const p = paraPublico(c);
  p.emitido_em = "2026-09-12T12:00:00.000Z"; // data fixa: o golden não pode depender do relógio
  return p;
}

export function cenarios() {
  const rico = publico(respostas({
    porDimensao: { [DIMS[0]]: "E4", [DIMS[1]]: "E3", [DIMS[2]]: "E2", [DIMS[3]]: "E3", [DIMS[4]]: "E4", [DIMS[5]]: "E2" },
    gates: "E2", ctx: [0, 2, 2],
  }));
  const plano = publico(respostas({ gates: "E3" }));
  const critico = publico(respostas({ gates: "E1", porDimensao: { [DIMS[5]]: "E1" } }));
  return [
    { nome: "ia-perfil-rico", html: () => renderResultado(rico, { instrumentVersion: "1.0.0-rc.1" }) },
    { nome: "ia-perfil-plano", html: () => renderResultado(plano, { instrumentVersion: "1.0.0-rc.1" }) },
    { nome: "ia-governanca-critica", html: () => renderResultado(critico, { instrumentVersion: "1.0.0-rc.1" }) },
    { nome: "ia-com-lead", html: () => renderResultado(rico, { instrumentVersion: "1.0.0-rc.1", leadHtml: "<section>LEAD</section>" }) },
  ];
}
