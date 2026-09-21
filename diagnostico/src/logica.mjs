// =============================================================
// DIAGNÓSTICO BOOMIT — lógica pura do front (questionário e painel).
//
// Sem DOM, sem rede, sem `window`. Vive separada porque `diagnostico.mjs` e
// `admin.mjs` importam o cliente Supabase por URL (esm.sh), e o Node não
// resolve import por HTTPS: sem esta separação, nada disso teria teste.
//
// Mesmo padrão de `screener/edge/logica.mjs`.
// =============================================================

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// ---------------------------------------------------------------
// questionário
// ---------------------------------------------------------------

/** Progresso do instrumento INTEIRO — nunca o da seção. */
export function progresso(respondidas, total) {
  const t = total | 0;
  const d = Math.max(0, Math.min(respondidas | 0, t));
  return { respondidas: d, total: t, restante: Math.max(0, t - d), pct: t ? Math.round((d / t) * 100) : 0 };
}

/** Índice do primeiro item sem resposta; `total` se tudo respondido. */
export function primeiraNaoRespondida(itens, respostas) {
  const i = (itens || []).findIndex((it) => !(respostas && respostas[it.codigo]));
  return i === -1 ? (itens || []).length : i;
}

export function itensFaltantes(itens, respostas) {
  return (itens || []).filter((it) => !(respostas && respostas[it.codigo])).map((it) => it.codigo);
}

/**
 * A alternativa que abre campo de texto, se o item tiver uma.
 *
 * 🔑 Quem DECLARA o campo aberto é o instrumento (`texto_livre` na projeção
 *    pública), não a tela. A tela nunca adivinha pelo código do item — se
 *    adivinhasse, passaria a carregar conteúdo do instrumento dentro do bundle
 *    publicado, e a fronteira deixaria de valer.
 */
export function opcaoLivre(item) {
  return (item?.opcoes || []).find((o) => o.texto_livre) || null;
}

/** True quando a questão anterior pertencia a outro bloco (mostra transição). */
export function entrouEmNovoBloco(itens, i) {
  if (i <= 0 || i >= (itens || []).length) return false;
  return itens[i].bloco !== itens[i - 1].bloco;
}

/**
 * Um UUID v4 sem depender de `crypto.randomUUID`.
 *
 * 🔴 randomUUID só existe em contexto seguro e a partir do Safari 15.4 /
 *    Chrome 92. Num iPad corporativo antigo, ou num preview aberto por http://
 *    na rede local, ele é undefined e a chamada estourava antes de a pessoa
 *    conseguir começar.
 */
export function novoToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emailValido(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}

// ---------------------------------------------------------------
// painel
// ---------------------------------------------------------------

/** Contagens do evento, a partir das linhas do export. */
export function resumo(linhas) {
  const l = linhas || [];
  return {
    respondentes: l.length,
    finalizados: l.filter((x) => x.submetido_em).length,
    com_email: l.filter((x) => x.email).length,
    pdf_enviados: l.filter((x) => x.pdf_enviado_em).length,
    erros: l.filter((x) => x.erro_geracao).length,
    aceitaram_contato: l.filter((x) => x.consentimento_marketing).length,
  };
}

/** Filtro livre sobre nome, empresa, cargo, e-mail e papel, mais o gate. */
export function filtrar(linhas, termo, gate) {
  const t = String(termo || "").trim().toLowerCase();
  return (linhas || []).filter((l) => {
    if (gate && gate !== "todos" && l.governanca_gate !== gate) return false;
    if (!t) return true;
    return ["nome", "empresa", "cargo", "email", "papel"].some((c) =>
      String(l[c] ?? "").toLowerCase().includes(t)
    );
  });
}

/** Data em pt-BR, ou travessão. Nunca inventa "hoje" quando o campo é nulo. */
export function dataPt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const COLUNAS = [
  { campo: "nome", rotulo: "Nome" },
  { campo: "empresa", rotulo: "Empresa" },
  { campo: "cargo", rotulo: "Cargo" },
  { campo: "email", rotulo: "E-mail" },
  { campo: "papel", rotulo: "Papel declarado" },
  { campo: "alcance", rotulo: "Alcance" },
  { campo: "participacao_em_decisao", rotulo: "Participação na decisão" },
  { campo: "governanca_gate", rotulo: "Gate de governança" },
  { campo: "governanca_item", rotulo: "Item que define o gate" },
  { campo: "itens_respondidos", rotulo: "Itens respondidos" },
  { campo: "itens_sem_exposicao", rotulo: "Itens sem exposição" },
  { campo: "consentimento_marketing", rotulo: "Aceita contato" },
  { campo: "iniciado_em", rotulo: "Iniciado em" },
  { campo: "submetido_em", rotulo: "Finalizado em" },
  { campo: "pdf_enviado_em", rotulo: "PDF enviado em" },
  { campo: "erro_geracao", rotulo: "Erro" },
  { campo: "catalogo_versao", rotulo: "Versão do catálogo" },
  { campo: "versao_questionario", rotulo: "Versão do questionário" },
  { campo: "motor_versao", rotulo: "Versão do motor" },
];

/**
 * CSV com BOM UTF-8 (para o Excel ler acentos) e aspas escapadas.
 *
 * 🔒 Exporta EXATAMENTE as linhas recebidas — e elas vêm de uma view que já
 *    filtra por slug dentro dela. Não há caminho aqui para trazer outro
 *    universo.
 *
 * 🔴 Separador `;`: no Excel em pt-BR a vírgula é separador DECIMAL, e um CSV
 *    com vírgula abre com tudo numa coluna só.
 */
export function montarCsv(linhas, colunas = COLUNAS) {
  const celula = (v) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const linhasCsv = [
    colunas.map((c) => c.rotulo),
    ...(linhas || []).map((l) => colunas.map((c) => l[c.campo])),
  ];
  return "﻿" + linhasCsv.map((r) => r.map(celula).join(";")).join("\r\n");
}
