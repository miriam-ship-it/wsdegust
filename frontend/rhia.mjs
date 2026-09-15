// =============================================================
// DIAGNÓSTICO BOOMIT — RH, Desenvolvimento e IA ("rhia") — frontend.
//
// Fluxo: abertura → contexto (3 itens numa tela) → questões (uma por tela) →
// revisão (30 respostas em 3 grupos) → portão de lead (quando o vínculo exige)
// → resultado (anatomia do PROMPT §5 / ARQUITETURA §10).
//
// FRONTEIRA: o navegador NUNCA vê pontos-base, pesos, escala (E1–E4), códigos
// de dimensão ou o motor. As 30 questões chegam pela edge (GET /rhia/start) e o
// resultado chega como modelo PÚBLICO já calculado no servidor. Este módulo não
// embute nem enunciado, nem id de item: o campo condicional de texto livre é
// tratado pelo `conditional_field` que a apresentação traz. A fronteira é
// provada em screener/rhia/fronteira-rhia.test.mjs.
//
// SEGREDO: o token de sessão viaja SÓ no header `x-session-token`; uma eventual
// credencial de prévia, SÓ em `x-preview-key`. Nunca em URL, query ou HTML.
//
// RETOMADA: a chave "rhia:v1:<evento>" em localStorage guarda apenas
// { token, pos, tela }. As respostas ficam no servidor e voltam por
// GET /rhia/session. Se o armazenamento falhar, o preenchimento continua em
// memória e a página avisa que não será retomado depois.
// =============================================================

export const EVENTO_PADRAO = "boomit-degustacao-rh-ia";
const PREFIXO_ARMAZENAMENTO = "rhia:v1:";
const CHAVE_TEMA = "screener:tema";
export const TITULO = "Diagnóstico Boomit — RH, Desenvolvimento e IA";
/**
 * Título VISÍVEL da abertura. Nomeia o que a pessoa vai fazer, não o produto: a
 * marca já está no logo logo acima, e "diagnóstico do cenário" é exatamente o
 * primeiro dos quatro blocos do workshop — a mesma palavra que a devolutiva usa
 * no fecho. `TITULO`, o nome formal, segue valendo para a aba do navegador e
 * para o cabeçalho de impressão, onde não há logo ao lado.
 */
export const TITULO_HERO = "Diagnóstico de cenário";

/** Os cinco degraus públicos, na ordem (referência conhecida do público). */
export const ESCADA_PUBLICA = Object.freeze([
  "Operacional Ágil",
  "Gestor Tático",
  "Estrategista de Escala",
  "Arquiteto de Soluções",
  "Criador de Tecnologia",
]);

/**
 * Ressalva do quinto degrau, exibida SEMPRE junto da escada (não só a quem cai
 * nele). O motor só manda `positioning.clarification` no quinto degrau; a
 * restrição do método, porém, vale para qualquer pessoa que leia o nome
 * "Criador de Tecnologia" na escada.
 */
export const NOTA_QUINTO_DEGRAU = "O quinto degrau, Criador de Tecnologia, não exige tecnologia proprietária, modelos próprios ou agentes de IA. Exige capacidade consistente de desenhar, integrar, validar e governar soluções adequadas ao contexto.";

/** Eventos de analytics permitidos — nada além destes, nunca texto livre. */
/**
 * TEXTO DA OFERTA — a devolutiva é a isca de lead do workshop "RH de Negócios
 * com IA", e o documento fecha dizendo o que ele é e o que vem depois. Fica
 * aqui, num lugar só, porque é o único conteúdo da tela que muda quando o
 * evento muda. Quando o `branding` do vínculo passar a carregar isso, este
 * objeto vira o padrão e o vínculo sobrescreve.
 *
 * Tom: o da oferta — direto, adulto, sem entusiasmo performático. Nada de
 * promessa de resultado: o que o workshop promete é método e critério.
 */
export const OFERTA = Object.freeze({
  titulo: "Esta leitura é o primeiro dos quatro blocos",
  texto: "O que você acabou de ler é um diagnóstico do cenário: onde as práticas da sua área se situam hoje e o que ainda está invisível para a liderança. Os outros três blocos — performance preditiva, IA aplicada ao RH e plano de decisão — são o dia de trabalho do workshop, com os indicadores da sua própria operação.",
  fecho: "RH de Negócios com IA · 8 de outubro · Ibmec, Alameda Santos, São Paulo · das 9h às 17h",
});

export const EVENTOS_ANALYTICS = Object.freeze([
  "assessment_started", "context_completed", "question_answered", "assessment_completed",
  "result_viewed", "pdf_requested", "reassessment_clicked",
]);

// ---------- lógica pura (sem DOM, sem rede) ----------

/** Lê o slug do evento da query string, com fallback para o padrão. */
export function lerEvento(search, padrao = EVENTO_PADRAO) {
  const p = new URLSearchParams(search || "");
  const v = (p.get("evento") || "").trim();
  return v || padrao;
}

// O CONVITE DA LIDERANÇA, na chegada.
//
// Estas duas funções existem também em `screener/ponte/convite.mjs`, que é quem
// EMITE o convite do outro lado. A duplicação é deliberada: esta página é
// servida como módulo único e sem dependências, e puxar um arquivo de fora
// significaria publicar mais um. São dez linhas e dois testes de cada lado; o
// formato — 64 caracteres hexa — é o mesmo que o CHECK da tabela exige.

const FORMATO_CONVITE = /^[0-9a-f]{64}$/;

/** Lê o convite da URL de chegada, e só se tiver a forma certa. */
export function convitePresenteNaUrl(href) {
  let v = null;
  try { v = new URL(href).searchParams.get("convite"); } catch { return null; }
  return v && FORMATO_CONVITE.test(v) ? v : null;
}

/**
 * A mesma URL sem o convite, para trocar a barra de endereço assim que ele for
 * lido. Enquanto está lá, o código viaja em histórico, em "compartilhar esta
 * página" e no `Referer` de qualquer link clicado depois.
 */
export function urlSemConvite(href) {
  const u = new URL(href);
  u.searchParams.delete("convite");
  return u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash;
}

/**
 * O PERFIL — só existe quando o instrumento traz o bloco.
 *
 * O link público do diagnóstico é anônimo e a definição dele não tem `perfil`,
 * então esta tela simplesmente não acontece lá. O código entra inerte e o DADO
 * decide — a mesma regra que governa a tabela no banco.
 *
 * Devolve o que FALTA, nunca um booleano solto: a tela precisa dizer qual campo
 * está pendente, e "está incompleto" não ajuda ninguém a terminar. A validação
 * aqui é conveniência; a autoridade é o servidor, que confere de novo contra a
 * definição guardada.
 */
export function perfilFaltantes(campos, valores) {
  const faltam = [];
  for (const campo of campos || []) {
    if (!campo || !campo.obrigatorio) continue;
    const bruto = valores ? valores[campo.id] : null;
    const texto = typeof bruto === "string" ? bruto.trim() : "";
    if (!texto) { faltam.push(campo.id); continue; }
    if (campo.tipo === "escolha" && !(campo.opcoes || []).some((o) => o.id === texto)) {
      faltam.push(campo.id); continue;
    }
    if (campo.tipo === "texto" && campo.maximo && texto.length > campo.maximo) faltam.push(campo.id);
  }
  return faltam;
}

/**
 * Cabeçalhos de uma requisição à edge. A credencial só em `x-preview-key`; o
 * token só em `x-session-token`. `content-type` só quando há corpo.
 */
export function montarHeaders({ anonKey, previewKey, token, temCorpo } = {}) {
  const h = { apikey: anonKey, authorization: `Bearer ${anonKey}` };
  if (temCorpo) h["content-type"] = "application/json";
  if (previewKey) h["x-preview-key"] = previewKey;
  if (token) h["x-session-token"] = token;
  return h;
}

/** Progresso do preenchimento. */
export function progresso(respondidas, total) {
  const done = Math.max(0, Math.min(respondidas | 0, total | 0));
  const t = total | 0;
  return { respondidas: done, total: t, restante: Math.max(0, t - done), pct: t ? Math.round((done / t) * 100) : 0 };
}

/** Escapa texto para inserção segura como conteúdo HTML. */
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Validação leve de e-mail (o servidor revalida e normaliza). */
export function validarEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Campo condicional de texto livre, lido da apresentação (nunca por id fixo).
 * Devolve { itemId, id, opcao, min, max, prompt } ou null.
 */
export function campoCondicional(items) {
  const it = (items || []).find((i) => i && i.conditional_field);
  if (!it) return null;
  const cf = it.conditional_field;
  return {
    itemId: it.id,
    id: cf.id,
    opcao: cf.show_when && cf.show_when.option_id,
    min: Number.isFinite(cf.min_length) ? cf.min_length : 2,
    max: Number.isFinite(cf.max_length) ? cf.max_length : 120,
    prompt: cf.prompt || "",
  };
}

const CONTROLE = /[\u0000-\u001f\u007f]/;

/**
 * Validação LOCAL do texto livre: trim, min–max caracteres, sem caracteres de
 * controle. Espelha a regra do servidor. Retorna { ok, erro, valor }.
 */
export function validarTextoOutro(texto, cf) {
  const min = (cf && cf.min) || 2, max = (cf && cf.max) || 120;
  const valor = typeof texto === "string" ? texto.trim() : "";
  if (!valor.length) return { ok: false, erro: "vazio", valor };
  if (valor.length < min) return { ok: false, erro: "curto", valor };
  if (valor.length > max) return { ok: false, erro: "longo", valor };
  if (CONTROLE.test(valor)) return { ok: false, erro: "controle", valor };
  return { ok: true, erro: null, valor };
}

/** Mensagem de usuário para um erro de validarTextoOutro. */
export function mensagemTextoOutro(erro, cf) {
  const min = (cf && cf.min) || 2, max = (cf && cf.max) || 120;
  return {
    vazio: "Descreva o seu papel para continuar.",
    curto: `Use pelo menos ${min} caracteres.`,
    longo: `Use no máximo ${max} caracteres.`,
    controle: "O texto contém caracteres não permitidos.",
  }[erro] || "";
}

/**
 * Texto local após trocar a opção do item que abre o campo: ao sair da opção
 * que o exibe, o campo é ocultado E limpo (clear_when_hidden).
 */
export function textoAposTrocarOpcao(opcao, cf, textoAtual) {
  if (!cf) return "";
  return opcao === cf.opcao ? (textoAtual || "") : "";
}

/** Se o texto livre é exigido para o conjunto de respostas dado. */
export function textoExigido(respostas, cf) {
  return !!(cf && respostas && respostas[cf.itemId] === cf.opcao);
}

/** Agrupa os itens (já ordenados) pelos grupos públicos, na ordem dos grupos. */
export function agruparPorGrupo(items, groups) {
  return (groups || []).map((g) => ({ code: g.code, name: g.name, items: (items || []).filter((it) => it.group === g.code) }));
}

/** Ids dos itens do instrumento (sem o texto condicional). */
function idsDosItens(items) { return (items || []).map((it) => it.id); }

/** Item_ids (dos 30) ainda sem resposta. */
export function itensFaltantes(items, respostas) {
  return idsDosItens(items).filter((id) => !(respostas && respostas[id]));
}

/** Índice (na lista dada) do primeiro item sem resposta; length se completo. */
export function primeiraNaoRespondida(items, respostas) {
  const i = (items || []).findIndex((it) => !(respostas && respostas[it.id]));
  return i === -1 ? (items || []).length : i;
}

/**
 * Contexto completo: os itens de contexto respondidos e, quando a opção que
 * abre o texto está marcada, texto válido. `texto` é o rascunho local.
 */
export function contextoCompleto(itensContexto, respostas, texto, cf) {
  const faltam = itensFaltantes(itensContexto, respostas);
  const exige = textoExigido(respostas, cf);
  const v = exige ? validarTextoOutro(texto, cf) : { ok: true, erro: null };
  return { ok: faltam.length === 0 && v.ok, faltam, textoErro: exige ? v.erro : null };
}

/**
 * Submissão completa: os 30 itens respondidos e, se exigido, o texto livre
 * válido JÁ GRAVADO no servidor (respostas[cf.id]).
 */
export function submissaoCompleta(items, respostas, cf) {
  const faltam = itensFaltantes(items, respostas);
  const exige = textoExigido(respostas, cf);
  const textoOk = !exige || validarTextoOutro(respostas[cf.id], cf).ok;
  return { ok: faltam.length === 0 && textoOk, faltam, textoFalta: exige && !textoOk };
}

/** Modo de captura de lead efetivo: usa o do vínculo; null → opcional. */
export function leadModoEfetivo(leadCaptureMode) {
  const validos = ["none", "optional_after_submit", "required_before_result"];
  return validos.includes(leadCaptureMode) ? leadCaptureMode : "optional_after_submit";
}

/** Qualidade da evidência (evidence.status) → rótulo pt-BR. */
export function rotuloEvidencia(status) {
  return { BROAD: "ampla", ADEQUATE: "adequada", LIMITED: "limitada", INSUFFICIENT: "insuficiente" }[status] || "não informada";
}

/** Frase da qualidade da evidência. */
export function fraseEvidencia(status) {
  const r = rotuloEvidencia(status);
  const base = `As respostas oferecem evidência ${r} para compor uma hipótese sobre a área observada.`;
  if (status === "LIMITED") return `${base} Parte dos itens ficou sem resposta aplicável; leia com mais cautela e confronte com outras fontes.`;
  return `${base} Esta leitura deve ser confrontada com indicadores, decisões registradas e a perspectiva de outras pessoas.`;
}

/**
 * SÍNTESE EXECUTIVA — a leitura inteira num parágrafo, montada a partir do que o
 * motor JÁ emitiu. Não infere nada de novo: cada frase carrega uma palavra do
 * contrato (degrau, assinatura, referência, sustentador, limitador, tensão,
 * governança, próximo movimento) e só acrescenta as conjunções que ligam uma
 * evidência à outra.
 *
 * É a diferença entre "riqueza vinda da interpretação das relações entre
 * evidências" e "riqueza vinda de aumentar a certeza da linguagem": aqui não
 * existe adjetivo novo, previsão nem estimativa — existe a relação entre coisas
 * que o motor já afirmou separadamente, dita numa ordem que se lê de uma vez.
 *
 * Degrada sozinha: sem tensão, sem sustentador ou com referência inconclusiva,
 * a frase correspondente simplesmente não entra.
 */
export function sinteseExecutiva(pub) {
  const p = pub || {};
  const pos = p.positioning || {}, ref = p.reference || {}, gap = p.gap || {}, sig = p.signature || {};
  const sup = (p.supporters || [])[0], lim = (p.limiters || [])[0], ten = (p.tensions || [])[0];
  const gov = p.governance || {};
  const r = p.restriction ? rotuloRestricao(p.restriction) : null;

  // Sem degrau não há leitura para resumir (ramo INSUFFICIENT, entrada vazia).
  if (!pos.stage) return "";

  const frases = [];
  const juntar = (texto, opcional = false) => texto && frases.push({ texto, opcional });

  juntar(`As práticas que você descreveu situam a área no degrau ${pos.stage}.`);
  if (sig.label) juntar(`O padrão que se repete é o de ${minuscula(sig.label)}.`, true);

  if (ref.status === "VALID" && ref.stage) {
    juntar(ref.stage === pos.stage
      ? `O alcance e a autoridade que você informou apontam para o mesmo degrau: ${minuscula(gap.label || "capacidade e referência alinhadas")}.`
      : `O alcance e a autoridade que você informou apontam para ${ref.stage}, e a distância entre as duas posições é o que o bloco seguinte detalha.`);
  } else {
    juntar("O alcance e a autoridade que você informou divergem entre si, então a referência de posição ficou inconclusiva.");
  }

  if (sup) juntar(`O que mais sustenta o avanço vem de ${sup.name}, com ${minuscula(sup.evidence || "")}.`, true);
  if (lim) juntar(`O que mais limita está em ${lim.name}: ${minuscula(lim.risk || "")}.`);
  if (ten) juntar(`A assimetria a verificar primeiro é ${minuscula(ten.label)}.`, true);
  // Sem sustentador e sem limitador não é falta de informação: é a informação de
  // que nada se destaca. Dizer isso vale mais que omitir a frase.
  if (!sup && !lim) {
    juntar("Nenhuma frente se destaca acima ou abaixo das outras: o que as respostas descrevem é uma evolução homogênea, sem alavanca nem gargalo evidente.");
  }

  if (gov.label) {
    // "Na governança, governança estabelecida" seria eco; quando o próprio
    // rótulo já diz a palavra, ele fala sozinho.
    const jaDiz = /^governan/i.test(String(gov.label));
    const base = jaDiz ? gov.label : `Na governança, ${minuscula(gov.label)}`;
    juntar(r && p.restriction !== "NONE" ? `${base}, o que condiciona o avanço: ${minuscula(r.label)}.` : `${base}.`);
  }
  if (pos.next) juntar(`O próximo movimento é ${minuscula(pos.next)}`);

  // Alvo de ~150 palavras. Passando de 175, saem as frases marcadas como
  // opcionais, da última para a primeira — a leitura perde nuance, nunca a
  // espinha (degrau, distância, limitador, governança, próximo movimento).
  const contar = (lista) => lista.join(" ").split(/\s+/).filter(Boolean).length;
  let texto = frases.map((f) => f.texto);
  for (let i = frases.length - 1; i >= 0 && contar(texto) > 175; i--) {
    if (frases[i].opcional) texto = frases.filter((_, j) => j !== i || !frases[j].opcional).map((f) => f.texto);
  }
  return texto.join(" ");
}

/** Primeira letra em minúscula, preservando siglas como "IA". */
function minuscula(t) {
  const s = String(t || "").trim();
  if (!s) return "";
  if (s.length > 1 && s[1] === s[1].toUpperCase() && /[A-ZÀ-Ý]/.test(s[1])) return s; // "IA...", sigla
  return s[0].toLowerCase() + s.slice(1);
}

/** Restrição de escala (route.restriction) → texto explícito. */
export function rotuloRestricao(restriction) {
  return {
    NO_SCALE: { label: "Escala bloqueada", texto: "Não ampliar o uso de IA até conter o risco e definir controles mínimos." },
    CONTROLLED_EXPERIMENTS: { label: "Somente experimentos controlados", texto: "Avançar apenas em ambiente controlado, com finalidade, supervisão humana e registro de decisão explícitos." },
    NONE: { label: "Sem restrição de escala", texto: "A governança observada não impõe restrição à ampliação; o monitoramento continua necessário." },
  }[restriction] || { label: "Restrição não informada", texto: "" };
}

/**
 * Tom visual do gate de governança. Cor nunca é o único sinal: o rótulo e o
 * ícone acompanham. CRITICAL e INSUFFICIENT têm prioridade visual.
 */
export function tomGovernanca(id) {
  return {
    CRITICAL: { tom: "danger", prioridade: true, icone: "aviso" },
    INSUFFICIENT: { tom: "warning", prioridade: true, icone: "info" },
    ATTENTION: { tom: "warning", prioridade: false, icone: "aviso" },
    MONITORED: { tom: "neutral", prioridade: false, icone: "info" },
    ESTABLISHED: { tom: "success", prioridade: false, icone: "check" },
  }[id] || { tom: "neutral", prioridade: false, icone: "info" };
}

/**
 * Escada de 5 degraus com SÓ o degrau atual marcado. A referência de atuação
 * (`reference.stage`) aparece no bloco 3, em prosa: um segundo destaque aqui
 * leria como "onde você deveria estar" — o que o método proíbe (PROMPT §5.2).
 */
export function escadaComAtual(atual) {
  return ESCADA_PUBLICA.map((nome, i) => ({ nome, posicao: i + 1, atual: nome === atual }));
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (sem Date: não depende de fuso). */
export function formatarData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Mensagem de usuário para uma falha da edge (tarja/inline). */
export function mensagemErro(status, body) {
  const e = body && body.error;
  if (status === 400 && (e === "opcao_invalida" || e === "texto_invalido")) return "Esta resposta não foi aceita. Escolha uma alternativa válida e tente de novo.";
  if (status === 400 && e === "submissao_incompleta") return "Ainda faltam respostas. Responda todos os itens antes de enviar.";
  if (status === 400 && e === "email_invalido") return "Informe um e-mail válido.";
  if (status === 403 && e === "lead_required") return "Deixe seu contato para ver o resultado.";
  if (status === 403 || e === "indisponivel" || e === "fora_de_vigencia") return "Este evento não está aberto para respostas no momento.";
  if (status === 404) return "Não localizamos este evento ou esta sessão. Confira o link recebido.";
  if (status === 409 && e === "aviso_desatualizado") return "O aviso de privacidade foi atualizado. Recarregue a página para ver a versão vigente.";
  if (status === 409) return "O instrumento foi atualizado desde o início desta sessão. Recomece para responder à versão vigente.";
  if (status === 410) return "Esta sessão expirou. Comece uma nova para continuar.";
  if (status === 413) return "O envio ficou grande demais. Recarregue a página e tente novamente.";
  if (status === 429) return "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.";
  return "Não foi possível concluir agora. Tente novamente em instantes.";
}

/** Descreve um erro TERMINAL para a tela dedicada. Genérico e sem PII. */
export function descreverErro(status, body) {
  const e = body && body.error;
  if (status === 410) return { titulo: "Sua sessão expirou", mensagem: "As respostas ficam guardadas por tempo limitado. Comece uma nova sessão para continuar.", recuperavel: false, icone: "relogio", tom: "warning" };
  if (status === 403 || e === "indisponivel" || e === "fora_de_vigencia") return { titulo: "Evento indisponível", mensagem: "Este evento não está aberto para respostas no momento.", recuperavel: false, icone: "aviso", tom: "neutral" };
  if (status === 404) return { titulo: "Sessão não encontrada", mensagem: "Não localizamos esta sessão ou este evento. Confira o link e comece de novo.", recuperavel: false, icone: "aviso", tom: "neutral" };
  if (status === 409) return { titulo: "Instrumento atualizado", mensagem: "O diagnóstico mudou desde o início desta sessão. Comece de novo para responder à versão vigente.", recuperavel: false, icone: "info", tom: "neutral" };
  if (status === 429) return { titulo: "Muitas tentativas em pouco tempo", mensagem: "Aguarde um instante e tente novamente.", recuperavel: true, icone: "relogio", tom: "warning" };
  return { titulo: "Algo não saiu como esperado", mensagem: "Não foi possível concluir agora. Tente novamente em instantes.", recuperavel: true, icone: "aviso", tom: "neutral" };
}

// ---------- persistência versionada (localStorage; degrada com elegância) ----------

export function chaveArmazenamento(evento) {
  return PREFIXO_ARMAZENAMENTO + (evento || EVENTO_PADRAO);
}
/**
 * Guarda só { token, pos, tela, convite }. Devolve false se o armazenamento falhar.
 *
 * O CONVITE FICA GUARDADO ATÉ SER CONSUMIDO. Ele é tirado da barra de endereço
 * assim que chega (lá ele viajaria em histórico, em "compartilhar" e em
 * `Referer`), e sem guardá-lo em algum lugar um simples recarregar da página
 * perderia a ponte em silêncio — que é exatamente a falha que a ponte inteira
 * existe para evitar. Aqui ele não sai do aparelho da própria pessoa, e não dá
 * acesso a nada.
 */
export function guardarSessao(evento, dados, store) {
  try {
    const s = store || globalThis.localStorage;
    const min = { token: dados.token, pos: dados.pos | 0, tela: dados.tela || null,
                  convite: FORMATO_CONVITE.test(dados.convite || "") ? dados.convite : null };
    s.setItem(chaveArmazenamento(evento), JSON.stringify(min));
    return true;
  } catch { return false; }
}
export function lerSessao(evento, store) {
  try {
    const s = store || globalThis.localStorage;
    const v = s.getItem(chaveArmazenamento(evento));
    if (!v) return null;
    const d = JSON.parse(v);
    if (!d || typeof d.token !== "string" || !d.token) return null;
    return { token: d.token, pos: Number.isFinite(d.pos) ? d.pos : 0, tela: typeof d.tela === "string" ? d.tela : null,
             convite: FORMATO_CONVITE.test(d.convite || "") ? d.convite : null };
  } catch { return null; }
}
export function limparSessao(evento, store) {
  try { (store || globalThis.localStorage).removeItem(chaveArmazenamento(evento)); } catch { /* ignora */ }
}

// ---------- rotas por hash ----------

/** Hash de cada tela (telas transitórias não tocam a URL). */
export const HASH_DA_TELA = Object.freeze({
  abertura: "abertura", perfil: "perfil", contexto: "contexto", questoes: "questoes", revisao: "revisao",
  lead_gate: "resultado", resultado: "resultado", insuficiente: "resultado", erro: "erro",
});

/**
 * Tela permitida para um hash, dado o estado. URL direta de #resultado sem
 * sessão → abertura; #revisao sem sessão → abertura; sessão aberta só anda
 * entre contexto/questões/revisão; sessão submetida só vê resultado/revisão.
 */
export function telaDoHash(hash, { temSessao = false, submitido = false, contextoOk = false, perfilOk = true } = {}) {
  const h = String(hash || "").replace(/^#/, "");
  if (!temSessao) return "abertura";
  if (submitido) return h === "revisao" ? "revisao" : "resultado";
  // O perfil vem antes de tudo: sem porte e nível não existe faixa de CDL, e
  // descobrir isso no fim obrigaria a pessoa a voltar. `perfilOk` nasce `true`
  // para que o fluxo anônimo — que não tem perfil — não mude de comportamento.
  if (!perfilOk) return "perfil";
  if (h === "perfil") return "perfil";
  if (h === "contexto") return "contexto";
  if (h === "questoes" || h === "revisao") return contextoOk ? h : "contexto";
  return contextoOk ? "questoes" : "contexto";
}

// ---------- analytics (adaptador opcional; no-op se ausente) ----------

/**
 * Rastreador: chama `adaptador.track(evento, dados)` (ou o adaptador como
 * função). Só eventos da lista; `question_answered` leva {id, option} e nunca
 * o texto livre. Falhas do adaptador são engolidas.
 */
export function criarRastreador(adaptador, cf) {
  return function rastrear(evento, dados) {
    if (!EVENTOS_ANALYTICS.includes(evento)) return false;
    if (evento === "question_answered" && cf && dados && dados.id === cf.id) return false;
    const fn = typeof adaptador === "function" ? adaptador : (adaptador && typeof adaptador.track === "function" ? adaptador.track.bind(adaptador) : null);
    if (!fn) return false;
    try { fn(evento, evento === "question_answered" ? { id: dados.id, option: dados.option } : undefined); return true; } catch { return false; }
  };
}

// ---------- cliente HTTP da edge (injetável) ----------

export function criarCliente({ edgeUrl, anonKey, transporte } = {}) {
  const fetchImpl = transporte || ((...a) => globalThis.fetch(...a));
  async function chamar(metodo, rota, { query, corpo, previewKey, token } = {}) {
    const url = new URL(String(edgeUrl).replace(/\/$/, "") + rota);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
    const headers = montarHeaders({ anonKey, previewKey, token, temCorpo: corpo != null });
    let resp;
    try {
      resp = await fetchImpl(url.toString(), { method: metodo, headers, body: corpo != null ? JSON.stringify(corpo) : undefined });
    } catch { return { status: 0, body: null }; }
    let body = null;
    try { body = await resp.json(); } catch { body = null; }
    return { status: resp.status, body };
  }
  return {
    apresentacao: (evento, previewKey) => chamar("GET", "/rhia/start", { query: { event_slug: evento }, previewKey }),
    iniciar: (evento, previewKey, avisoVersao) => chamar("POST", "/rhia/start", { corpo: { event_slug: evento, privacy_ack: true, privacy_notice_version: avisoVersao }, previewKey }),
    retomar: (previewKey, token) => chamar("GET", "/rhia/session", { previewKey, token }),
    salvar: (previewKey, token, item_id, value) => chamar("PUT", "/rhia/response", { corpo: { item_id, value }, previewKey, token }),
    enviar: (previewKey, token) => chamar("POST", "/rhia/submit", { corpo: {}, previewKey, token }),
    resultado: (previewKey, token) => chamar("GET", "/rhia/result", { previewKey, token }),
    lead: (previewKey, token, dados) => chamar("POST", "/rhia/lead", { corpo: dados, previewKey, token }),
    // O convite vai no CORPO, nunca em query: é de uso único e não tem por que
    // ficar em log de servidor.
    vincular: (previewKey, token, convite) => chamar("POST", "/rhia/vincular", { corpo: { convite }, previewKey, token }),
    salvarPerfil: (previewKey, token, valores) => chamar("POST", "/rhia/perfil", { corpo: valores, previewKey, token }),
    lerPerfil: (previewKey, token) => chamar("GET", "/rhia/perfil", { previewKey, token }),
  };
}

// ---------- ícones (inline) ----------
const ICONE = {
  aviso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  sol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  lua: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  volta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  imprimir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
  ciclo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg>',
};

const LOGO = `<img class="sc-logo" src="logo-boomit.png" alt="Boomit" width="1464" height="236">`;

// =============================================================
// Render puro da tela de RESULTADO (testável sem DOM)
// =============================================================

function secao(id, titulo, subtitulo, corpo, extra = "", n = 0) {
  // O numeral não é ornamento: a devolutiva TEM ordem de leitura (a escada
  // situa, a referência compara, a governança condiciona, o plano executa) e
  // o mapa no início promete exatamente esta sequência. Fica fora da árvore
  // de acessibilidade porque o <h2> já carrega o nome da seção.
  const num = n ? `<span class="rh-sec__n" aria-hidden="true">${String(n).padStart(2, "0")}</span>` : "";
  return `<section class="rh-sec ${extra}" aria-labelledby="rh-sec-${id}">
    <div class="rh-sec__head">${num}<h2 class="rh-sec__title" id="rh-sec-${id}">${escapeHtml(titulo)}</h2>${subtitulo ? `<p class="rh-sec__sub">${escapeHtml(subtitulo)}</p>` : ""}</div>
    ${corpo}
  </section>`;
}

/**
 * Mapa de leitura: o que vem pela frente, na ordem. Montado a partir das
 * seções REALMENTE renderizadas (tensões, por exemplo, somem quando não há
 * assimetria a relatar) — um índice que promete uma seção inexistente é pior
 * do que não existir.
 */
function mapaHtml(mapa) {
  if (mapa.length < 2) return "";
  const li = mapa.map((s, i) => `<li class="rh-mapa__i">
      <span class="rh-mapa__n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
      <span class="rh-mapa__t">${escapeHtml(s.titulo)}</span>
    </li>`).join("");
  return `<nav class="rh-mapa" aria-label="O que esta leitura traz">
      <p class="rh-mapa__k">O que esta leitura traz</p>
      <p class="rh-mapa__arco">Do cenário de hoje ao que dá para levar ao próximo ciclo.</p>
      <ol class="rh-mapa__l">${li}</ol>
    </nav>`;
}

function cabecalhoImpressao(pub, instrumentVersion) {
  const data = formatarData(pub.emitido_em);
  const partes = [TITULO, data ? `Emitido em ${data}` : "", instrumentVersion ? `Instrumento ${instrumentVersion}` : "", pub.version ? `Devolutiva ${pub.version}` : ""].filter(Boolean);
  return `<div class="rh-print-head" aria-hidden="true">${partes.map(escapeHtml).join(" · ")}</div>`;
}

function escadaHtml(pos) {
  const degraus = escadaComAtual(pos && pos.stage);
  const li = degraus.map((d) => `<li class="rh-escada__degrau ${d.atual ? "is-atual" : ""}" ${d.atual ? 'aria-current="step"' : ""}>
      <span class="rh-escada__rot">
        <span class="rh-escada__num">Degrau ${d.posicao}</span>
        <span class="rh-escada__nome">${escapeHtml(d.nome)}</span>
        ${d.atual ? `<span class="rh-escada__tag">Degrau atual</span>` : ""}
      </span>
      <span class="rh-escada__face" aria-hidden="true"></span>
    </li>`).join("");
  // A ressalva do quinto degrau vale para quem LÊ a escada, não só para quem
  // cai nele: o nome "Criador de Tecnologia" sugere propriedade de tecnologia,
  // e o método afirma o contrário (PROMPT §3; item do CHECKLIST-DE-ACEITE).
  // Quando o motor manda a clarificação (o respondente está no quinto degrau),
  // usamos a palavra dele; caso contrário, a mesma ressalva em terceira pessoa.
  const nota = (pos && pos.clarification) || NOTA_QUINTO_DEGRAU;
  return `<figure class="rh-escada-fig">
      <ol class="rh-escada" aria-label="Escada de cinco referências, do primeiro ao quinto degrau">${li}</ol>
      <figcaption class="rh-escada__cap">
        <p class="rh-escada__nota">Cinco referências de atuação, não um ranking de pessoas nem uma sequência obrigatória.</p>
        <p class="rh-escada__nota">${escapeHtml(nota)}</p>
      </figcaption>
    </figure>`;
}

/**
 * NÚMEROS — decisão de produto de 14/09/2026. A arquitetura aprovada pedia
 * devolutiva sem número; a dona do produto decidiu o contrário, porque o
 * relatório de liderança que a Boomit já entrega é acionável justamente por
 * quantificar. A exceção está registrada em DECISOES.md e endereçada a quem
 * aprovou o instrumento.
 *
 * Barra chapada, sem degradê, sem 3D e sem sombra — o design system permite
 * barra e proíbe as três coisas. Sem radar: além de proibido, radar com seis
 * eixos esconde ordem, e ordem é o que a pessoa procura aqui.
 *
 * As dimensões saem em ordem decrescente: a leitura vira um ranking, que é a
 * pergunta real ("onde estou melhor e onde estou pior"), não um inventário.
 */
function metricasHtml(m) {
  if (!m || m.indice == null) return "";
  const barra = (valor, forte) => `<span class="rh-barra" aria-hidden="true"><span class="rh-barra__fill ${forte ? "is-forte" : ""}" style="width:${Math.max(0, Math.min(100, valor))}%"></span></span>`;
  const linha = (nome, valor, extra, forte) => `<li class="rh-metrica">
      <span class="rh-metrica__n">${escapeHtml(nome)}${extra ? `<span class="rh-metrica__x">${escapeHtml(extra)}</span>` : ""}</span>
      ${barra(valor, forte)}
      <span class="rh-metrica__v">${valor}</span>
    </li>`;

  const dims = [...(m.porDimensao || [])].filter((d) => d.valor != null).sort((a, b) => b.valor - a.valor);
  const eixos = (m.eixos || []).map((e) => linha(e.nome, e.valor, `peso ${e.peso}`, true)).join("");

  // Onde o índice cai dentro da faixa do próprio degrau.
  const dentro = m.faixa && m.faixa.ate > m.faixa.de
    ? Math.round(((m.indice - m.faixa.de) / (m.faixa.ate - m.faixa.de)) * 100) : null;

  return `<div class="rh-indice">
      <p class="rh-indice__n"><span class="rh-indice__v">${m.indice}</span><span class="rh-indice__d">de 100</span></p>
      <div class="rh-indice__t">
        <p class="rh-indice__degrau">${escapeHtml((m.degrau && m.degrau.nome) || "")}</p>
        ${m.faixa ? `<p class="rh-indice__faixa">Este degrau vai de ${m.faixa.de} a ${m.faixa.ate}${dentro != null ? `, e você está a ${dentro}% de percorrê-lo` : ""}.</p>` : ""}
        ${m.distancia != null ? `<p class="rh-indice__faixa">${m.distancia === 0
            ? "A referência de atuação aponta para este mesmo degrau."
            : m.distancia > 0
              ? `As práticas estão ${m.distancia} ${m.distancia === 1 ? "degrau" : "degraus"} acima da referência de atuação.`
              : `As práticas estão ${-m.distancia} ${m.distancia === -1 ? "degrau" : "degraus"} abaixo da referência de atuação.`}</p>` : ""}
      </div>
    </div>
    <h3 class="rh-metricas__t">Como o índice se compõe</h3>
    <ul class="rh-metricas">${eixos}</ul>
    <p class="sc-help sc-muted">O índice é a média ponderada dos três eixos, com os pesos acima. Não é nota de pessoa nem comparação com outras empresas.</p>
    <h3 class="rh-metricas__t">Por dimensão, da mais forte à mais frágil</h3>
    <ul class="rh-metricas">${dims.map((d) => linha(d.nome, d.valor, d.eixo)).join("")}</ul>`;
}

function gateHtml(gov, restriction) {
  const g = gov || {};
  const t = tomGovernanca(g.id);
  const r = rotuloRestricao(restriction);
  return `<div class="rh-gate rh-gate--${t.tom} ${t.prioridade ? "rh-gate--prioridade" : ""}">
      <div class="rh-gate__ic">${ICONE[t.icone] || ICONE.info}</div>
      <div class="rh-gate__body">
        <p class="rh-gate__k">Gate de governança${t.prioridade ? " · condição que domina a decisão" : ""}</p>
        <p class="rh-gate__v">${escapeHtml(g.label || "Não informado")}</p>
        <p class="rh-gate__t">${escapeHtml(g.text || "")}</p>
        ${restriction ? `<p class="rh-gate__r"><span class="rh-gate__rk">${escapeHtml(r.label)}.</span> ${escapeHtml(r.texto)}</p>` : ""}
      </div>
    </div>`;
}

/**
 * Tela de resultado como string. Recebe o modelo PÚBLICO (paraPublico) e
 * opções de apresentação. Puro: sem estado, sem DOM. Os CTAs saem com
 * data-acao para a delegação de eventos do app.
 */
export function renderResultado(pub, { instrumentVersion = "", leadHtml = "", semCapa = false } = {}) {
  const p = pub || {};
  const pos = p.positioning || {}, ref = p.reference || {}, gap = p.gap || {}, sig = p.signature || {};
  const sup = p.supporters || [], lim = p.limiters || [], ten = p.tensions || [];
  const data = formatarData(p.emitido_em);

  // Índice das seções REALMENTE renderizadas, na ordem em que são montadas.
  // Alimenta o mapa de leitura da capa e o numeral de cada seção.
  const mapa = [];
  const sec = (id, titulo, sub, corpo, extra = "") => {
    mapa.push({ id, titulo });
    return secao(id, titulo, sub, corpo, extra, mapa.length);
  };

  // 0. Capa — abre acolhendo e só então delimita o que o documento é. A ordem
  // importa: abrir pela ressalva ("não é avaliação de pessoa") faz o leitor
  // receber uma negativa antes de receber a leitura que ele pediu. A ressalva
  // continua inteira, uma frase abaixo, e integral no bloco final.
  const s1 = `<header class="rh-capa">
      <p class="sc-eyebrow">Devolutiva</p>
      <h1 class="sc-title sc-title--lg rh-capa__t">Sua leitura orientativa</h1>
      <p class="sc-lead rh-capa__lead">Obrigada pelos minutos que você dedicou a responder. O que vem a seguir não é mais um dado sobre pessoas: é o começo de um critério para decidir, sobre a área que você tomou como referência e a partir das suas próprias respostas.</p>
      <p class="rh-capa__nota">É uma hipótese orientativa sobre práticas observáveis. Não é avaliação da sua pessoa nem diagnóstico da empresa, e não decide no seu lugar.</p>
      <dl class="rh-evid">
        <dt class="rh-evid__k">Qualidade da evidência</dt>
        <dd class="rh-evid__v">${escapeHtml(rotuloEvidencia(p.evidence && p.evidence.status))}</dd>
      </dl>
      <p class="rh-evid__t">${escapeHtml(fraseEvidencia(p.evidence && p.evidence.status))}</p>
      ${data ? `<p class="rh-capa__data">Emitido em ${escapeHtml(data)}</p>` : ""}
    </header>
    ${p.roleLens ? `<aside class="rh-lente" aria-label="Lente do seu papel"><span class="rh-lente__k">Lente do seu papel</span><p class="rh-lente__t">${escapeHtml(p.roleLens)}</p></aside>` : ""}`;

  // 2. Escada + degrau atual
  const s2 = sec("escada", "Onde as práticas se situam", "Onde as práticas da sua área se situam hoje. Cinco referências, e só o degrau atual em destaque.",
    escadaHtml(pos) +
    `<div class="rh-degrau">
      <p class="rh-degrau__k">Seu degrau</p>
      <h3 class="rh-degrau__nome">${escapeHtml(pos.stage || "")}</h3>
      <p class="rh-degrau__headline">${escapeHtml(pos.headline || "")}</p>
      <p class="rh-prosa">${escapeHtml(pos.reading || "")}</p>
      ${pos.next ? `<p class="rh-prosa"><span class="rh-k">Próximo movimento.</span> ${escapeHtml(pos.next)}</p>` : ""}
    </div>`);

  // 2b. Os números por trás da posição (decisão de 14/09)
  const s2b = (p.metricas && p.metricas.indice != null)
    ? sec("numeros", "Os números por trás da posição",
        "De onde vem o degrau: seis dimensões, três eixos e um índice ponderado.",
        metricasHtml(p.metricas))
    : "";

  // 3. Referência de atuação e distância (ou inconclusiva)
  const refOk = ref.status === "VALID" && ref.stage;
  const s3 = sec("referencia", "Referência de atuação e distância", "A distância entre o que você decide e o que a área sustenta. Alcance e autoridade compõem a referência; o cargo não a altera.",
    refOk
      ? `<p class="rh-prosa">Sua referência de atuação aponta para <span class="rh-k">${escapeHtml(ref.stage)}</span>.</p>
         <div class="rh-card"><h3 class="rh-card__t">${escapeHtml(gap.label || "")}</h3><p class="rh-card__p">${escapeHtml(gap.text || "")}</p></div>`
      : `<div class="rh-card rh-card--info"><div class="rh-card__ic">${ICONE.info}</div><div><h3 class="rh-card__t">${escapeHtml(gap.label || "Referência de posição inconclusiva")}</h3><p class="rh-card__p">${escapeHtml(gap.text || "")}</p></div></div>`);

  // 4. Assinatura
  const s4 = sec("assinatura", "Assinatura de posicionamento", "Como liderança, processos e IA se relacionam. Sem notas, sem ranking: é a forma do conjunto.",
    `<blockquote class="rh-cite"><h3 class="rh-cite__t">${escapeHtml(sig.label || "")}</h3><p class="rh-cite__p">${escapeHtml(sig.text || "")}</p></blockquote>`);

  // 5. Sustentadores / limitadores
  const colSup = sup.length ? `<div class="rh-col"><h3 class="rh-col__t">O que sustenta o avanço</h3>${sup.map((x) => `<div class="rh-evc"><span class="rh-evc__n">${escapeHtml(x.name)}</span><p class="rh-evc__p">${escapeHtml(x.evidence || "")}</p></div>`).join("")}</div>` : "";
  const colLim = lim.length ? `<div class="rh-col"><h3 class="rh-col__t">O que limita o avanço</h3>${lim.map((x) => `<div class="rh-evc rh-evc--lim"><span class="rh-evc__n">${escapeHtml(x.name)}</span><p class="rh-evc__p">${escapeHtml(x.risk || "")}</p>${x.action ? `<p class="rh-evc__a"><span class="rh-k">Próximo movimento.</span> ${escapeHtml(x.action)}</p>` : ""}</div>`).join("")}</div>` : "";
  const s5 = sec("forcas", "Sustentadores e limitadores", "Onde o desenvolvimento rende mais: o que já sustenta o avanço e o que o segura.",
    (colSup || colLim) ? `<div class="rh-cols">${colSup}${colLim}</div>` : `<div class="rh-card rh-card--quiet"><p class="rh-card__p">As respostas não diferenciam uma dimensão das demais: a evolução parece homogênea. Não há sustentador nem limitador a destacar.</p></div>`);

  // 6. Tensões (oculta se vazia)
  const s6 = ten.length ? sec("tensoes", ten.length === 1 ? "Tensão relevante" : "Tensões relevantes", "Assimetrias entre frentes. Costumam aparecer tarde, quando já viraram custo.",
    `<div class="rh-lista">${ten.map((t) => `<div class="rh-card"><h3 class="rh-card__t">${escapeHtml(t.label)}</h3><p class="rh-card__p">${escapeHtml(t.text || "")}</p></div>`).join("")}</div>`) : "";

  // 7. Gate de governança (sempre visível)
  const s7 = sec("governanca", "Governança", "A condição que decide se dá para escalar, e o que se responde quando perguntarem. Não soma nem subtrai degraus.", gateHtml(p.governance, p.restriction), "rh-sec--gate");

  // 8. Rota NIST como ciclo
  const nist = p.nistRoute || [];
  const s8 = sec("nist", "Rota de ação — NIST AI RMF", "Funções complementares e recorrentes, não estágios.",
    `<ol class="rh-ciclo" aria-label="Ciclo de funções">${nist.map((f) => `<li class="rh-ciclo__f"><span class="rh-ciclo__ic">${ICONE.ciclo}</span><div><span class="rh-ciclo__n">${escapeHtml(f.function)}</span><p class="rh-ciclo__t">${escapeHtml(f.instruction || "")}</p></div></li>`).join("")}</ol>
     <p class="sc-help sc-muted">Essas funções são complementares e recorrentes, não estágios: o ciclo se repete a cada decisão.</p>`);

  // 9. Plano 30–60–90
  const plano = p.actionPlan || [];
  const s9 = sec("plano", "Plano 30–60–90 dias", "Cada etapa com ação e evidência verificável — o que dá para pactuar para o próximo ciclo.",
    `<div class="rh-tabela-wrap"><table class="rh-tabela"><thead><tr><th scope="col">Horizonte</th><th scope="col">Ação</th><th scope="col">Evidência de conclusão</th></tr></thead>
      <tbody>${plano.map((e) => `<tr><th scope="row" data-col="Horizonte">${escapeHtml(e.horizon)}</th><td data-col="Ação">${escapeHtml(e.action)}</td><td data-col="Evidência de conclusão">${escapeHtml(e.evidence)}</td></tr>`).join("")}</tbody></table></div>`);

  // 10. Indicadores
  const ind = (p.indicators || []).slice(0, 3);
  const s10 = sec("indicadores", "Indicadores para começar", "Até três, para esta leitura virar acompanhamento em vez de impressão.",
    `<ul class="rh-bullets">${ind.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`);

  // 11. Perguntas executivas
  const q = (p.executiveQuestions || []).slice(0, 3);
  const s11 = sec("perguntas", "Perguntas para a conversa executiva", "Para levar à diretoria com critério, não com impressão.",
    `<ol class="rh-perguntas">${q.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>`);

  // 12. Reavaliação + disclaimer integral
  const s12 = sec("reavaliacao", "Reavaliação e limite da leitura", null,
    `<p class="rh-prosa">${escapeHtml(p.reassessment || "")}</p>
     <div class="rh-disclaimer"><span class="rh-k">Limite da leitura.</span> ${escapeHtml(p.disclaimer || "")}</div>`);

  // 13. Colofão + CTAs. O colofão é o que um documento sério carrega no pé:
  // de onde a leitura saiu e em que versão — sem isso, a devolutiva não é
  // auditável seis meses depois.
  const colofao = [data ? `Emitido em ${data}` : "", instrumentVersion ? `Instrumento ${instrumentVersion}` : "", p.version ? `Devolutiva ${p.version}` : ""].filter(Boolean);
  const oferta = `<aside class="rh-oferta" aria-labelledby="rh-oferta-t">
      <p class="rh-oferta__k">O que vem depois</p>
      <h2 class="rh-oferta__t" id="rh-oferta-t">${escapeHtml(OFERTA.titulo)}</h2>
      <p class="rh-oferta__p">${escapeHtml(OFERTA.texto)}</p>
      <p class="rh-oferta__f">${escapeHtml(OFERTA.fecho)}</p>
    </aside>`;

  const s13 = `${oferta}${colofao.length ? `<p class="rh-colofao">${colofao.map(escapeHtml).join(" · ")}</p>` : ""}
    <div class="rh-ctas">
      <button class="sc-btn sc-btn--primary" type="button" data-acao="imprimir">${ICONE.imprimir} Imprimir ou salvar PDF</button>
      <button class="sc-btn sc-btn--ghost" type="button" data-acao="rever">Rever respostas</button>
      <button class="sc-btn sc-btn--ghost" type="button" data-acao="recomecar">Recomeçar</button>
    </div>`;

  // O mapa só pode ser montado depois das seções (ele lista as que existem),
  // mas é impresso logo após a capa.
  const sintese = sinteseExecutiva(p);
  const blocoSintese = sintese ? `<aside class="rh-sintese" aria-labelledby="rh-sintese-t">
      <h2 class="rh-sintese__k" id="rh-sintese-t">A leitura em um parágrafo</h2>
      <p class="rh-sintese__p">${escapeHtml(sintese)}</p>
    </aside>` : "";

  // `semCapa`: quando esta devolutiva é a SEGUNDA PARTE de um documento maior,
  // a capa e o cabeçalho de impressão são do documento, não desta metade. O
  // resto — inclusive a síntese e o mapa desta parte — continua inteiro.
  const abertura = semCapa ? "" : `${cabecalhoImpressao(p, instrumentVersion)}${s1}`;
  const corpoHtml = `${blocoSintese}${mapaHtml(mapa)}${s2}${s2b}${s3}${s4}${s5}${s6}${s7}${s8}${s9}${s10}${s11}${s12}${leadHtml}${s13}`;
  if (semCapa) return corpoHtml;
  return `<article class="rh-result">${abertura}${corpoHtml}</article>`;
}

/** Faixa em reais, sem centavo: a precisão que a estimativa NÃO tem. */
export function faixaEmReais(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const f = (v) => "R$ " + Math.round(v).toLocaleString("pt-BR");
  return `${f(min)} – ${f(max)}`;
}

/**
 * O DOCUMENTO ÚNICO — as duas leituras e a relação entre elas.
 *
 * O que justifica um documento só não é empilhar um relatório depois do outro:
 * se fosse, bastaria grampear os PDFs. É a RELAÇÃO entre as duas medidas, e por
 * isso ela vem primeiro, logo na capa, antes de qualquer metade.
 *
 * Não existe índice combinado, aqui nem em lugar nenhum: seria número novo, sem
 * instrumento que o sustente, e ninguém decidiu o peso de cada metade. As duas
 * medidas ficam lado a lado, na mesma escala de 0 a 100, e a ressalva de que são
 * instrumentos distintos viaja junto da leitura — não escondida no fim.
 */
export function renderUnificado(r, { instrumentVersion = "", leadHtml = "" } = {}) {
  const res = r || {};
  const perfil = res.perfil || {};
  const L = res.liderancaPublica || {};
  const cruz = res.cruzamento;
  const data = formatarData(res.ia && res.ia.emitido_em);

  const quem = [perfil.nome, perfil.cargo, perfil.empresa].filter(Boolean).map(escapeHtml).join(" · ");

  const capa = `<header class="rh-capa">
      <p class="sc-eyebrow">Devolutiva</p>
      <h1 class="sc-title sc-title--lg rh-capa__t">Diagnóstico de cenário</h1>
      ${quem ? `<p class="rh-capa__quem">${quem}</p>` : ""}
      <p class="sc-lead rh-capa__lead">Obrigada pelos minutos que você dedicou a responder. O que vem a seguir são duas leituras — como a liderança se estrutura e como a sua área integra pessoas, dados e IA — e, antes das duas, o que elas dizem quando lidas juntas.</p>
      <p class="rh-capa__nota">São hipóteses orientativas sobre práticas observáveis. Não são avaliação da sua pessoa nem diagnóstico da empresa, e não decidem no seu lugar.</p>
      ${data ? `<p class="rh-capa__data">Emitido em ${escapeHtml(data)}</p>` : ""}
    </header>`;

  const mapa = mapaHtml([
    { id: "cruzamento", titulo: "As duas leituras, juntas" },
    { id: "parte-lideranca", titulo: "Parte 1 · Liderança" },
    { id: "parte-ia", titulo: "Parte 2 · RH, desenvolvimento e IA" },
  ]);

  // --- a leitura cruzada, que é o que justifica o documento -----------------
  const barraComparativa = (rotulo, valor, forte) => `<li class="rh-metrica">
      <span class="rh-metrica__n">${escapeHtml(rotulo)}</span>
      <span class="rh-barra" aria-hidden="true"><span class="rh-barra__fill ${forte ? "is-forte" : ""}" style="width:${Math.max(0, Math.min(100, valor))}%"></span></span>
      <span class="rh-metrica__v">${valor}</span>
    </li>`;

  const secCruz = cruz
    ? secao("cruzamento", "As duas leituras, juntas",
        "O que muda decisão não é cada medida sozinha: é a distância entre elas.",
        `${res.sintese ? `<p class="rh-prosa">${escapeHtml(res.sintese)}</p>` : ""}
         <ul class="rh-metricas">
           ${barraComparativa("Liderança", cruz.lideranca.valor, true)}
           ${barraComparativa("RH, desenvolvimento e IA", cruz.ia.valor, true)}
         </ul>
         <div class="rh-card">
           <h3 class="rh-card__t">${escapeHtml(cruz.padrao.titulo || "")}</h3>
           <p class="rh-card__p">${escapeHtml(cruz.padrao.texto || "")}</p>
           ${cruz.padrao.consequencia ? `<p class="rh-card__p">${escapeHtml(cruz.padrao.consequencia)}</p>` : ""}
         </div>
         <p class="sc-help sc-muted">${escapeHtml(cruz.ressalva || "")}</p>`, "", 1)
    : secao("cruzamento", "As duas leituras, juntas",
        "A leitura cruzada aparece quando as duas metades existem.",
        `<div class="rh-card rh-card--info"><div class="rh-card__ic">${ICONE.info}</div><div>
           <h3 class="rh-card__t">Este documento traz apenas uma das duas leituras</h3>
           <p class="rh-card__p">Ler a distância entre as duas exigiria as duas. Com meia medida, a comparação seria invenção — e por isso ela não aparece.</p>
         </div></div>`, "", 1);

  // --- parte 1: liderança ---------------------------------------------------
  const dims = (L.dimensoes || []).map((d) => `<li class="rh-metrica rh-metrica--par">
      <span class="rh-metrica__n">${escapeHtml(d.nome)}${d.distancia ? `<span class="rh-metrica__x">distância ${d.distancia}</span>` : ""}</span>
      <span class="rh-barra" aria-hidden="true"><span class="rh-barra__fill is-forte" style="width:${Math.max(0, Math.min(100, d.pessoa))}%"></span></span>
      <span class="rh-metrica__v">${d.pessoa}</span>
      <span class="rh-metrica__n rh-metrica__n--sub">na empresa</span>
      <span class="rh-barra" aria-hidden="true"><span class="rh-barra__fill" style="width:${Math.max(0, Math.min(100, d.empresa))}%"></span></span>
      <span class="rh-metrica__v">${d.empresa}</span>
    </li>`).join("");

  const cdlFaixa = L.cdl ? faixaEmReais(L.cdl.min, L.cdl.max) : null;
  const corpoLideranca = L.status === "OK"
    ? `<div class="rh-indice">
         <p class="rh-indice__n"><span class="rh-indice__v">${L.maturidade.valor}</span><span class="rh-indice__d">de 100</span></p>
         <div class="rh-indice__t">
           <p class="rh-indice__degrau">Estágio ${escapeHtml(L.maturidade.letra)} · ${escapeHtml(L.maturidade.label || "")}</p>
           ${L.maturidade.diagnostico ? `<p class="rh-indice__faixa">${escapeHtml(L.maturidade.diagnostico)}</p>` : ""}
         </div>
       </div>
       <h3 class="rh-metricas__t">Cada dimensão, por duas lentes</h3>
       <p class="rh-prosa">A primeira barra é como você atua; a segunda, como você lê o que a empresa sustenta. A distância entre elas costuma dizer mais que qualquer uma sozinha.</p>
       <ul class="rh-metricas">${dims}</ul>
       <div class="rh-card">
         <h3 class="rh-card__t">Risco estratégico: ${L.risco.valor}%</h3>
         <p class="rh-card__p">Chance de o plano não acontecer com a estrutura de decisão atual. Nível ${escapeHtml(L.risco.nivel || "")}.</p>
       </div>
       ${cdlFaixa ? `<div class="rh-card">
         <h3 class="rh-card__t">Custo estimado das disfunções: ${escapeHtml(cdlFaixa)} ao ano</h3>
         <p class="rh-card__p">Uma faixa, não um número: retrabalho por decisão atrasada, saída de gente boa e execução travada não aparecem no resultado com esse nome. Nenhuma estimativa honesta sobre custo invisível dá valor exato.</p>
       </div>` : ""}`
    : `<div class="rh-card rh-card--info"><div class="rh-card__ic">${ICONE.info}</div><div>
         <h3 class="rh-card__t">Metade de liderança incompleta</h3>
         <p class="rh-card__p">Faltam respostas para compor esta leitura${(L.faltantes || []).length ? ` (${L.faltantes.length})` : ""}. O que está aqui é o que foi respondido — nada foi estimado no lugar do que falta.</p>
       </div></div>`;

  const secLideranca = secao("parte-lideranca", "Parte 1 · Liderança",
    "Em que estágio a estrutura de decisão joga hoje, nas cinco dimensões avaliadas.",
    corpoLideranca, "", 2);

  // --- parte 2: a devolutiva de IA, inteira, sem a capa dela ----------------
  const secIA = res.ia
    ? `<section class="rh-sec" id="parte-ia">
         <h2 class="rh-sec__t"><span class="rh-sec__n">3</span>Parte 2 · RH, desenvolvimento e IA</h2>
         ${renderResultado(res.ia, { instrumentVersion, leadHtml, semCapa: true })}
       </section>`
    : "";

  return `<article class="rh-result">${cabecalhoImpressao(res.ia || {}, instrumentVersion)}${capa}${mapa}${secCruz}${secLideranca}${secIA}</article>`;
}

/** Tela própria para status INSUFFICIENT: mensagem do motor + gate + CTAs. */
export function renderInsuficiente(pub, { instrumentVersion = "" } = {}) {
  const p = pub || {};
  return `<article class="rh-result">${cabecalhoImpressao(p, instrumentVersion)}
    <header class="rh-capa">
      <p class="sc-eyebrow">Devolutiva</p>
      <h1 class="sc-title sc-title--lg rh-capa__t">Evidência insuficiente para uma leitura</h1>
      <p class="sc-lead rh-capa__lead">${escapeHtml(p.missingMessage || "Não há evidência suficiente para compor uma hipótese de posicionamento.")}</p>
      <dl class="rh-evid"><dt class="rh-evid__k">Qualidade da evidência</dt><dd class="rh-evid__v">${escapeHtml(rotuloEvidencia(p.evidence && p.evidence.status))}</dd></dl>
      <p class="sc-help sc-muted">Muitas respostas “não se aplica” numa mesma dimensão impedem a síntese. A sessão está fechada: reveja as respostas ou recomece pensando na mesma área do início ao fim.</p>
    </header>
    ${secao("governanca", "Governança", "Condição de avanço, à parte do posicionamento.", gateHtml(p.governance, null), "rh-sec--gate")}
    ${secao("reavaliacao", "Limite da leitura", null, `<div class="rh-disclaimer">${escapeHtml(p.disclaimer || "")}</div>`)}
    <div class="rh-ctas">
      <button class="sc-btn sc-btn--primary" type="button" data-acao="rever">Rever respostas</button>
      <button class="sc-btn sc-btn--ghost" type="button" data-acao="recomecar">Recomeçar</button>
    </div>
  </article>`;
}

// =============================================================
// Arranque no navegador
// =============================================================

export function iniciarApp(cfg) {
  const doc = globalThis.document;
  const raiz = doc.getElementById("sc-app");
  const loc = globalThis.location || { search: "", hash: "" };
  const evento = lerEvento(loc.search);
  const cliente = criarCliente({ edgeUrl: cfg.EDGE_URL, anonKey: cfg.ANON_KEY, transporte: cfg.transporte });
  const store = cfg.store || (() => { try { return globalThis.localStorage; } catch { return null; } })();

  const st = {
    tela: "carregando",
    token: null, previewKey: null, avisoVersao: "v1",
    branding: {}, instrument: null, groups: [], itens: [], contexto: [], flat: [], cf: null,
    respostas: {}, textoOutro: "", textoErro: null, pos: 0,
    submitido: false, resultado: null, modoLeitura: false,
    leadMode: "optional_after_submit", leadEnviado: false, leadEnviando: false, leadErro: null, leadErroCampo: false,
    salvando: 0, salvoRecente: false, erroTopo: null, tentandoEnviar: false,
    erro: null, storageOk: true, ignorarHash: false,
    convite: null, avisoPonte: null,
    perfilCampos: [], perfilValores: {}, perfilErro: null, perfilFaltam: [], perfilSalvando: false,
  };

  // --- o convite da liderança, se a pessoa chegou por ele ---
  // Lê-se da barra de endereço e TIRA-SE DA BARRA no mesmo instante: enquanto
  // está lá, o código viaja em histórico, em "compartilhar esta página" e no
  // `Referer` de qualquer link clicado depois. Ele é de uso único e não dá
  // acesso a nada — mas não há razão para deixá-lo circular.
  st.convite = convitePresenteNaUrl(String(loc.href || "")) || (lerSessao(evento, store) || {}).convite || null;
  if (st.convite) {
    try {
      const limpa = urlSemConvite(String(loc.href));
      if (globalThis.history && globalThis.history.replaceState) globalThis.history.replaceState(null, "", limpa);
    } catch { /* barra de endereço é conforto, não requisito */ }
  }

  /**
   * Troca o convite pela ligação entre as duas metades. Silencioso quando não
   * há o que fazer; nunca impede a pessoa de responder.
   *
   * O aviso na tela existe porque o contrário seria a falha que esta ponte
   * inteira combate: perder a ligação sem ninguém saber. Quando o link não é
   * aceito, dizemos o que ainda pode acontecer — a reconciliação pelo e-mail no
   * fim — em vez de só lamentar.
   */
  async function trocarConvite() {
    if (!st.convite || !st.token) return;
    const r = await cliente.vincular(st.previewKey, st.token, st.convite);
    // 0 é rede caída, 429/503 é temporário: guarda-se o convite para a próxima.
    if (r.status === 0 || r.status === 429 || r.status === 503) return;
    st.avisoPonte = r.status === 200 ? "ok" : "falhou";
    st.convite = null;
    persistir();
  }
  let rastrear = criarRastreador(globalThis.SCREENER_RHIA_ANALYTICS, null);

  // --- tema ---
  function temaAtual() {
    try { return doc.documentElement.getAttribute("data-theme") || (globalThis.matchMedia && globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
    catch { return "light"; }
  }
  function alternarTema() {
    const proximo = temaAtual() === "dark" ? "light" : "dark";
    doc.documentElement.setAttribute("data-theme", proximo);
    try { globalThis.localStorage.setItem(CHAVE_TEMA, proximo); } catch { /* ok */ }
    pintar();
  }

  // --- navegação / hash ---
  function scrollTopo() { try { globalThis.scrollTo(0, 0); } catch { /* ok */ } }
  function sincronizarHash(tela) {
    const h = HASH_DA_TELA[tela]; if (!h) return;
    try { if (loc.hash !== "#" + h) { st.ignorarHash = true; loc.hash = h; } } catch { /* ok */ }
  }
  function irPara(tela) { st.tela = tela; st.erroTopo = null; pintar(); sincronizarHash(tela); scrollTopo(); }
  function irParaErro(status, body, retry) {
    st.erro = { ...descreverErro(status, body), retry: retry || null };
    st.erroTopo = null; irPara("erro");
  }
  const persistir = () => { const ok = guardarSessao(evento, { token: st.token, pos: st.pos, tela: st.tela, convite: st.convite }, store); if (!ok) st.storageOk = false; };
  const contextoOk = () => contextoCompleto(st.contexto, st.respostas, st.textoOutro, st.cf).ok;
  /** Sem bloco de perfil, não há o que completar — e o fluxo anônimo segue igual. */
  const perfilOk = () => !st.perfilCampos.length || perfilFaltantes(st.perfilCampos, st.perfilValores).length === 0;

  async function concluirPerfil() {
    const faltam = perfilFaltantes(st.perfilCampos, st.perfilValores);
    st.perfilFaltam = faltam;
    if (faltam.length) {
      st.perfilErro = null; pintar();
      return focar(`#rh-perfil-${faltam[0]}`);
    }
    st.perfilSalvando = true; st.perfilErro = null; pintar();
    const r = await cliente.salvarPerfil(st.previewKey, st.token, st.perfilValores);
    st.perfilSalvando = false;
    if (r.status !== 200) {
      // O servidor confere de novo, contra a definição guardada. Quando ele
      // recusa um campo, é esse campo que precisa ficar em evidência.
      const campo = r.body && r.body.campo;
      st.perfilFaltam = campo && campo !== 'tamanho' ? [campo] : [];
      st.perfilErro = mensagemErro(r.status, r.body);
      pintar();
      return focar(campo ? `#rh-perfil-${campo}` : null);
    }
    st.perfilErro = null; st.perfilFaltam = [];
    persistir(); irPara('contexto');
  }

  // --- rede ---
  function aplicarApresentacao(body) {
    st.instrument = body.instrument; st.groups = body.groups || []; st.itens = body.items || [];
    // Ausente no instrumento anônimo — e é essa ausência que mantém a tela
    // de perfil fora do caminho de quem responde o link público.
    if (Array.isArray(body.perfil)) st.perfilCampos = body.perfil;
    st.contexto = st.itens.filter((it) => it.group === "contexto");
    st.flat = st.itens.filter((it) => it.group !== "contexto");
    st.cf = campoCondicional(st.itens);
    rastrear = criarRastreador(globalThis.SCREENER_RHIA_ANALYTICS, st.cf);
    if (body.branding) st.branding = body.branding;
    if (body.privacy_notice_version) st.avisoVersao = body.privacy_notice_version;
    if ("lead_capture_mode" in body) st.leadMode = leadModoEfetivo(body.lead_capture_mode);
  }
  async function carregarApresentacao() {
    st.tela = "carregando"; pintar();
    const r = await cliente.apresentacao(evento, st.previewKey);
    if (r.status !== 200) return irParaErro(r.status, r.body, carregarApresentacao);
    aplicarApresentacao(r.body);
    irPara("abertura");
  }
  async function comecar() {
    st.tentandoEnviar = true; pintar();
    const r = await cliente.iniciar(evento, st.previewKey, st.avisoVersao);
    st.tentandoEnviar = false;
    if (r.status !== 201) { st.erroTopo = mensagemErro(r.status, r.body); return pintar(); }
    st.token = r.body.token; aplicarApresentacao(r.body);
    st.respostas = {}; st.textoOutro = ""; st.textoErro = null; st.pos = 0; st.submitido = false; st.resultado = null; st.leadEnviado = false; st.modoLeitura = false;
    const primeira = st.perfilCampos.length ? "perfil" : "contexto";
    st.tela = primeira; persistir();
    rastrear("assessment_started");
    irPara(primeira);
    trocarConvite().then(pintar, () => {});
  }
  async function retomar(salva) {
    st.token = salva.token; st.tela = "carregando"; pintar();
    const r = await cliente.retomar(st.previewKey, st.token);
    if (r.status === 410) { limparSessao(evento, store); st.token = null; return irParaErro(410, r.body); }
    if (r.status !== 200) { limparSessao(evento, store); st.token = null; return carregarApresentacao(); }
    aplicarApresentacao(r.body);
    st.respostas = r.body.answered || {};
    st.textoOutro = (st.cf && st.respostas[st.cf.id]) || "";
    st.submitido = !!r.body.submitted;
    if (r.body.lead_capture_mode !== undefined) st.leadMode = leadModoEfetivo(r.body.lead_capture_mode);
    if (st.submitido) return carregarResultado();
    const nova = primeiraNaoRespondida(st.flat, st.respostas);
    st.pos = Math.min(Number.isFinite(salva.pos) ? salva.pos : nova, Math.max(0, st.flat.length - 1));
    // Quem retoma pode ter fechado a aba antes de preencher o perfil: quem sabe
    // se ele existe é o servidor, não o armazenamento local.
    if (st.perfilCampos.length) {
      const pf = await cliente.lerPerfil(st.previewKey, st.token);
      if (pf.status === 200 && pf.body && pf.body.perfil) st.perfilValores = { ...pf.body.perfil };
    }
    const hashAtual = String(loc.hash || "").replace(/^#/, "");
    const alvo = telaDoHash(hashAtual || salva.tela || "", {
      temSessao: true, submitido: false, contextoOk: contextoOk(), perfilOk: perfilOk(),
    });
    persistir(); irPara(alvo);
    trocarConvite().then(pintar, () => {});
  }
  // `repintar: false` = atualização leve (sem trocar o DOM). Necessário para o
  // texto livre: o blur do campo dispara `change` no MEIO de um clique numa
  // alternativa; se o DOM fosse trocado ali, o clique se perderia.
  async function salvarResposta(item_id, value, { repintar = true } = {}) {
    st.respostas[item_id] = value; st.salvando++; st.salvoRecente = false;
    if (repintar) pintar(); else refrescarLeve();
    const r = await cliente.salvar(st.previewKey, st.token, item_id, value);
    st.salvando--;
    if (r.status === 410 || r.status === 403 || r.status === 404 || r.status === 409) return irParaErro(r.status, r.body);
    if (r.status !== 200) { st.erroTopo = mensagemErro(r.status, r.body); return pintar(); }
    st.salvoRecente = true; st.erroTopo = null; rastrear("question_answered", { id: item_id, option: value });
    if (repintar) pintar(); else refrescarLeve();

    // Avanço automático: só depois de a resposta estar GRAVADA (avançar antes
    // esconderia uma falha de rede) e só quando a escolha foi deliberada —
    // clique, toque ou tecla numérica. Nunca por `change` de navegação: as
    // setas ↑↓ percorrem as alternativas de um radiogroup e disparam `change` a
    // cada parada; avançar ali tornaria o teclado inutilizável.
    if (foiEscolhaDeliberada() && (st.tela === "questoes" || st.tela === "contexto") && !st.avancando) {
      escolhaDeliberadaEm = 0;   // uma escolha, um avanço
      st.avancando = true;
      // A pausa é para a pessoa VER a escolha marcar antes de a tela trocar.
      setTimeout(() => { st.avancando = false; if (st.tela === "questoes") avancar(); else if (st.tela === "contexto") avancarContexto(); }, 340);
    }
  }
  // Texto livre: sai para o servidor só quando válido (o servidor recusa 2–120 inválido).
  async function salvarTextoOutro() {
    const v = validarTextoOutro(st.textoOutro, st.cf);
    st.textoErro = v.ok ? null : v.erro;
    if (!v.ok || !st.cf) { refrescarLeve(); return false; }
    if (st.respostas[st.cf.id] === v.valor) { refrescarLeve(); return true; }
    await salvarResposta(st.cf.id, v.valor, { repintar: false });
    return !st.erroTopo;
  }
  // Atualização leve da tela de contexto: status do autosave, erro inline do
  // texto e estado do botão Avançar — sem recriar o DOM.
  function refrescarLeve() {
    try {
      const save = raiz.querySelector(".sc-save"); if (save) save.outerHTML = autosaveHtml();
      const btn = raiz.querySelector('[data-acao="concluir-contexto"]');
      if (btn) { if (contextoOk()) btn.removeAttribute("aria-disabled"); else btn.setAttribute("aria-disabled", "true"); }
      const campo = raiz.querySelector("#rh-texto-outro"); if (!campo) return;
      let el = raiz.querySelector("#rh-texto-erro");
      const msg = st.textoErro ? mensagemTextoOutro(st.textoErro, st.cf) : "";
      if (msg) {
        if (!el) { el = doc.createElement("p"); el.className = "rh-field__erro"; el.id = "rh-texto-erro"; el.setAttribute("role", "alert"); campo.parentNode.appendChild(el); }
        el.innerHTML = `${ICONE.info}<span>${escapeHtml(msg)}</span>`;
        campo.setAttribute("aria-invalid", "true"); campo.setAttribute("aria-describedby", "rh-texto-ajuda rh-texto-erro");
      } else {
        if (el) el.remove();
        campo.removeAttribute("aria-invalid"); campo.setAttribute("aria-describedby", "rh-texto-ajuda");
      }
    } catch { /* ok */ }
  }
  function mostrarResultado(body) {
    st.resultado = body; st.submitido = true;
    rastrear("result_viewed");
    irPara(body && body.status === "INSUFFICIENT" ? "insuficiente" : "resultado");
  }
  async function carregarResultado() {
    st.tela = "carregando"; pintar();
    const r = await cliente.resultado(st.previewKey, st.token);
    if (r.status === 200) return mostrarResultado(r.body);
    if (r.status === 403 && r.body && r.body.error === "lead_required") { st.leadMode = "required_before_result"; return irPara("lead_gate"); }
    return irParaErro(r.status, r.body, carregarResultado);
  }
  async function enviar() {
    st.tentandoEnviar = true; pintar();
    const r = await cliente.enviar(st.previewKey, st.token);
    st.tentandoEnviar = false;
    if (r.status === 400) { st.erroTopo = mensagemErro(r.status, r.body); return pintar(); }
    if (r.status !== 200) return irParaErro(r.status, r.body, enviar);
    st.submitido = true; persistir();
    rastrear("assessment_completed");
    if (r.body && r.body.lead_required) { st.leadMode = "required_before_result"; return irPara("lead_gate"); }
    mostrarResultado(r.body);
  }
  async function enviarLead(nome, email, optIn) {
    if (!validarEmail(email)) {
      st.leadErro = "Informe um e-mail válido."; st.leadErroCampo = true;
      pintar(); focar("#sc-lead-email"); return;
    }
    st.leadEnviando = true; st.leadErro = null; st.leadErroCampo = false; pintar();
    const r = await cliente.lead(st.previewKey, st.token, { nome: (nome || "").trim() || null, email: email.trim(), marketing_opt_in: !!optIn });
    st.leadEnviando = false;
    if (r.status !== 200) {
      st.leadErro = mensagemErro(r.status, r.body);
      st.leadErroCampo = r.status === 400 && !!r.body && r.body.error === "email_invalido";
      pintar();
      if (st.leadErroCampo) focar("#sc-lead-email");
      return;
    }
    st.leadEnviado = true; st.leadErro = null; st.leadErroCampo = false;
    if (st.tela === "lead_gate") return carregarResultado();
    pintar();
  }
  async function reverRespostas() {
    st.tela = "carregando"; pintar();
    const r = await cliente.retomar(st.previewKey, st.token);
    if (r.status !== 200) return irParaErro(r.status, r.body, reverRespostas);
    aplicarApresentacao(r.body); st.respostas = r.body.answered || {}; st.modoLeitura = true;
    irPara("revisao");
  }
  function recomecar(confirmar = true) {
    if (confirmar && st.token) {
      let ok = true;
      try { ok = globalThis.confirm("Recomeçar apaga o vínculo deste navegador com a sessão atual e inicia um novo preenchimento do zero. Continuar?"); } catch { ok = true; }
      if (!ok) return;
      rastrear("reassessment_clicked");
    }
    limparSessao(evento, store);
    Object.assign(st, { token: null, respostas: {}, textoOutro: "", textoErro: null, pos: 0, resultado: null, submitido: false, modoLeitura: false, leadEnviado: false, leadErro: null, leadErroCampo: false, erro: null, erroTopo: null });
    if (st.itens.length) irPara("abertura"); else carregarApresentacao();
  }

  // --- navegação do questionário ---
  function concluirContexto() {
    const c = contextoCompleto(st.contexto, st.respostas, st.textoOutro, st.cf);
    if (!c.ok) { st.textoErro = c.textoErro; st.erroTopo = c.faltam.length ? "Responda os três itens de contexto para continuar." : null; pintar(); focar("#rh-texto-outro"); return; }
    if (textoExigido(st.respostas, st.cf)) {
      salvarTextoOutro().then((ok) => { if (!ok) return pintar(); st.pos = 0; persistir(); rastrear("context_completed"); irPara("questoes"); });
      return;
    }
    st.pos = 0; persistir(); rastrear("context_completed"); irPara("questoes");
  }
  // ESCOLHA DELIBERADA vs. NAVEGAÇÃO. O avanço automático não pode depender da
  // ordem entre `click` e `change`, que varia entre navegadores. Em vez de um
  // sinalizador consumido na ordem errada, guardamos QUANDO houve uma escolha
  // deliberada e perguntamos, na hora de avançar, se foi agora.
  //
  // Contam como deliberadas: toque, clique (inclusive Espaço num radio com
  // foco, que dispara `click`) e tecla numérica. NÃO conta a navegação por ↑↓
  // dentro do radiogroup, que dispara `change` a cada parada sem `click` — se
  // ela avançasse, o teclado ficaria inutilizável.
  //
  // O DISCRIMINADOR NÃO PODE SER O `click`. Descoberto medindo, não supondo:
  // percorrer um radiogroup com ↑↓ executa o comportamento de ativação do
  // navegador, que MARCA o radio e dispara `click` e `change` — indistinguíveis
  // dos de um toque. A única coisa que separa navegar de escolher é saber qual
  // TECLA foi pressionada, e isso só o `keydown` sabe (ele roda antes da ação
  // padrão). Por isso a seta anota "estou navegando" e o Espaço a desanota.
  let escolhaDeliberadaEm = 0;
  let navegandoPorSetaEm = 0;
  const marcarEscolhaDeliberada = () => { escolhaDeliberadaEm = Date.now(); };
  const foiEscolhaDeliberada = () =>
    Date.now() - escolhaDeliberadaEm < 1500 && Date.now() - navegandoPorSetaEm > 900;

  /** Avança dentro do contexto; no último item, conclui e vai às práticas. */
  function avancarContexto() {
    const it = st.contexto[st.posCtx]; if (!it) return;
    // "Outro" abriu o campo: não empurra ninguém para frente antes de escrever.
    if (st.cf && it.id === st.cf.itemId && st.respostas[it.id] === st.cf.opcao) {
      if (validarTextoOutro(st.textoOutro, st.cf)) { focar("#rh-texto-outro"); return; }
    }
    if (st.posCtx >= st.contexto.length - 1) return concluirContexto();
    st.posCtx += 1; persistir(); pintar(); scrollTopo();
  }
  function voltarContexto() {
    if (st.posCtx <= 0) return irPara("abertura");
    st.posCtx -= 1; persistir(); pintar(); scrollTopo();
  }

  function avancar() {
    if (st.pos >= st.flat.length - 1) { st.pos = st.flat.length - 1; persistir(); return irPara("revisao"); }
    st.pos += 1; persistir(); pintar(); scrollTopo();
  }
  function voltar() {
    if (st.tela === "contexto") return voltarContexto();
    if (st.pos <= 0) { st.posCtx = st.contexto.length - 1; return irPara("contexto"); }
    st.pos -= 1; persistir(); pintar(); scrollTopo();
  }
  function editarItem(id) {
    const i = st.flat.findIndex((it) => it.id === id);
    if (i === -1) return irPara("contexto");
    st.pos = i; persistir(); irPara("questoes");
  }
  function focar(sel) { try { const el = raiz.querySelector(sel); if (el) el.focus(); } catch { /* ok */ } }

  // ---------- render: comuns ----------
  function cabecalho(compacto) {
    const ic = temaAtual() === "dark" ? ICONE.sol : ICONE.lua;
    // Sem subtítulo ao lado da marca: na abertura ele repetia palavra por palavra
    // o título logo abaixo, e nas demais telas não acrescentava nada.
    const sub = "";
    return `<header class="sc-head">
      <div class="sc-brand">${LOGO}${sub}</div>
      <button class="sc-theme" type="button" data-acao="tema" aria-label="Alternar tema claro e escuro">${ic}</button>
    </header>`;
  }
  const noteTopo = () => st.erroTopo ? `<div class="sc-note sc-note--danger" role="alert">${ICONE.info}<span>${escapeHtml(st.erroTopo)}</span></div>` : "";
  const notePonte = () => {
    if (!st.avisoPonte) return "";
    if (st.avisoPonte === "ok") {
      return `<div class="sc-note" role="status">${ICONE.check}<span>Reconhecemos o seu diagnóstico de liderança. As duas leituras vão para o mesmo documento.</span></div>`;
    }
    return `<div class="sc-note" role="status">${ICONE.info}<span>Não foi possível usar o link do seu diagnóstico de liderança — ele vale uma vez só e por tempo limitado. Siga normalmente: no fim, o contato que você deixar pode reunir as duas leituras.</span></div>`;
  };
  const avisoStorage = () => st.storageOk ? "" : `<div class="sc-note rh-note--warning" role="status">${ICONE.aviso}<span>Este navegador não permite guardar o progresso; se você atualizar a página, o preenchimento recomeça.</span></div>`;
  function autosaveHtml() {
    if (st.salvando > 0) return `<span class="sc-save sc-save--ativo" role="status">Salvando…</span>`;
    if (st.salvoRecente) return `<span class="sc-save sc-save--ok" role="status">${ICONE.check} Resposta salva</span>`;
    return `<span class="sc-save" role="status">Salvo automaticamente</span>`;
  }
  function progressoHtml(rotulo, contagem) {
    const prog = progresso(Object.keys(st.respostas).filter((k) => !st.cf || k !== st.cf.id).length, st.itens.length);
    return `<div class="sc-progress">
      <div class="sc-progress__row"><span class="sc-progress__label">${rotulo}</span><span class="sc-progress__count">${contagem}</span></div>
      <div class="sc-track" role="progressbar" aria-label="Progresso do preenchimento" aria-valuemin="0" aria-valuemax="${prog.total}" aria-valuenow="${prog.respondidas}"><div class="sc-track__fill" style="width:${prog.pct}%"></div></div>
      <p class="rh-progress__txt">${prog.respondidas} de ${prog.total} respondidas</p>
    </div>`;
  }
  function opcoesHtml(it, escolhido, comNumero) {
    const naUltima = it.kind !== "context";
    return it.options.map((op, i) => {
      const na = naUltima && i === it.options.length - 1;
      const checked = escolhido === op.id ? "checked" : "";
      return `<label class="sc-opt ${na ? "sc-opt--na" : ""} ${checked ? "is-checked" : ""}">
        <input type="radio" name="it_${escapeHtml(it.id)}" value="${escapeHtml(op.id)}" ${checked} data-acao="resposta" data-item="${escapeHtml(it.id)}" data-opcao="${escapeHtml(op.id)}">
        <span class="sc-opt__dot" aria-hidden="true"></span>
        <span class="sc-opt__txt">${escapeHtml(op.label)}</span>
        ${comNumero ? `<span class="sc-opt__num" aria-hidden="true">${i + 1}</span>` : ""}
      </label>`;
    }).join("");
  }

  // ---------- render: abertura ----------
  function telaAbertura() {
    const ins = st.instrument || {};
    const retomavel = !!st.token && !st.submitido;
    return `<div class="sc-hero rh-hero">
      <div class="sc-hero__logo">${LOGO}</div>
      <h1 class="sc-hero__title">${escapeHtml(TITULO_HERO)}</h1>
      <p class="sc-hero__lead">${escapeHtml(ins.purpose || "")}</p>
      <ul class="rh-hero__fatos" aria-label="Antes de começar">
        <li>${ICONE.relogio}<span>Leva cerca de ${escapeHtml(ins.estimated_minutes || "8–10")} minutos.</span></li>
        <li>${ICONE.info}<span>O resultado é uma hipótese orientativa baseada em autorrelato — não é diagnóstico conclusivo nem avaliação de pessoa.</span></li>
        <li>${ICONE.check}<span>Responda pensando na mesma área do início ao fim.</span></li>
      </ul>
      ${noteTopo()}
      <div class="sc-actions">
        ${retomavel ? `<button class="sc-btn sc-btn--primary" type="button" data-acao="continuar">Continuar de onde parei ${ICONE.seta}</button>` : `<button class="sc-btn sc-btn--primary" type="button" data-acao="comecar" ${st.tentandoEnviar ? "disabled" : ""}>${st.tentandoEnviar ? "Iniciando…" : `Começar leitura ${ICONE.seta}`}</button>`}
      </div>
    </div>`;
  }

  // ---------- render: contexto (uma por vez, como as demais) ----------
  // Eram três numa tela só, com um botão "Avançar". Agora seguem a mesma
  // mecânica das outras 27: uma pergunta em evidência, vizinhos esmaecidos e
  // avanço ao escolher. A ÚNICA exceção é o campo de texto de "Outro": ali o
  // avanço espera o texto ficar válido, senão a pessoa seria empurrada para
  // frente antes de escrever.
  function telaPerfil() {
    const campo = (c) => {
      const pendente = st.perfilFaltam.includes(c.id);
      const idHtml = `rh-perfil-${escapeHtml(c.id)}`;
      const valor = st.perfilValores[c.id] || "";
      const aria = pendente ? `aria-invalid="true" aria-describedby="${idHtml}-erro"` : "";
      const erro = pendente
        ? `<p class="rh-field__erro" id="${idHtml}-erro" role="alert">${ICONE.info}<span>Preencha para continuar.</span></p>` : "";
      const controle = c.tipo === "escolha"
        ? `<select class="sc-input" id="${idHtml}" data-acao="perfil" data-campo="${escapeHtml(c.id)}" ${aria} required>
             <option value="">Selecione…</option>
             ${(c.opcoes || []).map((o) => `<option value="${escapeHtml(o.id)}" ${o.id === valor ? "selected" : ""}>${escapeHtml(o.rotulo)}</option>`).join("")}
           </select>`
        : `<input class="sc-input" id="${idHtml}" type="text" data-acao="perfil" data-campo="${escapeHtml(c.id)}"
             value="${escapeHtml(valor)}" maxlength="${c.maximo || 120}" autocomplete="${c.id === "nome" ? "name" : c.id === "empresa" ? "organization" : "organization-title"}" ${aria} required>`;
      return `<div class="sc-field">
        <label class="sc-label" for="${idHtml}">${escapeHtml(c.rotulo)}</label>
        ${controle}${erro}
      </div>`;
    };
    const erroTopo = st.perfilErro
      ? `<div class="sc-note sc-note--danger" role="alert">${ICONE.info}<span>${escapeHtml(st.perfilErro)}</span></div>` : "";
    return `<div class="sc-card">
      ${progressoHtml("", "Antes de começar")}
      <p class="sc-eyebrow">Antes de começar</p>
      <h1 class="sc-title">Sobre você e a sua empresa</h1>
      <p class="sc-lead">Porte e nível de decisão mudam a leitura: a mesma resposta significa coisas diferentes numa equipe de dez e numa de mil.</p>
      ${avisoStorage()}${erroTopo}
      <form class="sc-leadform" data-acao="form-perfil" novalidate>
        ${st.perfilCampos.map(campo).join("")}
        <div class="sc-actions">
          <button class="sc-btn sc-btn--primary" type="submit" ${st.perfilSalvando ? "disabled" : ""}>${st.perfilSalvando ? "Salvando…" : `Continuar ${ICONE.seta}`}</button>
        </div>
      </form>
    </div>`;
  }

  function telaContexto() {
    if (st.posCtx == null) st.posCtx = Math.max(0, primeiraNaoRespondida(st.contexto, st.respostas));
    if (st.posCtx > st.contexto.length - 1) st.posCtx = st.contexto.length - 1;
    const it = st.contexto[st.posCtx]; if (!it) return carregando();
    const cf = st.cf;
    const escolhido = st.respostas[it.id];
    const abriuTexto = !!(cf && it.id === cf.itemId && escolhido === cf.opcao);
    const erro = abriuTexto && st.textoErro ? mensagemTextoOutro(st.textoErro, cf) : "";
    const texto = abriuTexto ? `<div class="sc-field rh-texto">
        <label class="sc-label" for="rh-texto-outro">${escapeHtml(cf.prompt)}</label>
        <input class="sc-input" id="rh-texto-outro" type="text" autocomplete="organization-title" maxlength="${cf.max}" value="${escapeHtml(st.textoOutro)}" data-acao="texto-outro" aria-describedby="rh-texto-ajuda${erro ? " rh-texto-erro" : ""}" ${erro ? 'aria-invalid="true"' : ""} required>
        <p class="sc-help" id="rh-texto-ajuda">Entre ${cf.min} e ${cf.max} caracteres. Ao sair do campo, a leitura continua.</p>
        ${erro ? `<p class="rh-field__erro" id="rh-texto-erro" role="alert">${ICONE.info}<span>${escapeHtml(erro)}</span></p>` : ""}
      </div>` : "";

    const anterior = st.posCtx > 0 ? st.contexto[st.posCtx - 1] : null;
    const proxima = st.posCtx < st.contexto.length - 1 ? st.contexto[st.posCtx + 1] : st.flat[0];
    const antesHtml = `<button class="rh-viz rh-viz--antes" type="button" data-acao="voltar-nav"
        aria-label="${anterior ? `Voltar para a pergunta ${anterior.order}` : "Voltar para o início"}">
        <span class="rh-viz__k">${anterior ? `Pergunta ${anterior.order}` : "Início"}</span>
        <span class="rh-viz__t">${escapeHtml(anterior ? anterior.prompt : "A apresentação do diagnóstico")}</span>
      </button>`;
    const depoisHtml = `<p class="rh-viz rh-viz--depois" aria-hidden="true">
        <span class="rh-viz__k">${proxima ? `Pergunta ${proxima.order}` : "A seguir"}</span>
        <span class="rh-viz__t">${escapeHtml(proxima ? proxima.prompt : "As perguntas sobre práticas")}</span>
      </p>`;

    return `${progressoHtml("", `Pergunta ${it.order} de ${st.itens.length}`)}
      ${avisoStorage()}${noteTopo()}${notePonte()}
      <div class="rh-pilha">
        ${antesHtml}
        <article class="sc-item rh-pilha__atual" id="sc-questao" tabindex="-1" aria-label="Pergunta ${it.order} de ${st.itens.length}">
          <p class="sc-item__prompt" id="rh-item-prompt">${escapeHtml(it.prompt)}</p>
          <div class="sc-opts" role="radiogroup" aria-labelledby="rh-item-prompt">${opcoesHtml(it, escolhido, true)}</div>
          ${texto}
        </article>
        ${depoisHtml}
      </div>
      <p class="sc-kbd">Escolher já avança · <kbd>1</kbd>–<kbd>${it.options.length}</kbd> escolhe · <kbd>↑</kbd><kbd>↓</kbd> percorrem · <kbd>Espaço</kbd> confirma · <kbd>←</kbd> volta</p>
      <div class="sc-nav rh-nav--simples">${autosaveHtml()}</div>`;
  }

  // ---------- render: questões (uma por tela) ----------
  function telaQuestoes() {
    const it = st.flat[st.pos]; if (!it) return carregando();
    const escolhido = st.respostas[it.id];
    const ultimo = st.pos === st.flat.length - 1;
    // Vizinhos esmaecidos: dão contexto do percurso sem competir com a questão
    // atual. O ANTERIOR é clicável (é o caminho de volta, e a seta ← faz o
    // mesmo); o PRÓXIMO não é — ver ainda não é poder pular.
    const anterior = st.pos > 0 ? st.flat[st.pos - 1] : null;
    const proxima = st.pos < st.flat.length - 1 ? st.flat[st.pos + 1] : null;
    const antesHtml = `<button class="rh-viz rh-viz--antes" type="button" data-acao="voltar-nav"
        aria-label="${anterior ? `Voltar para a pergunta ${anterior.order}` : "Voltar para o contexto"}">
        <span class="rh-viz__k">${anterior ? `Pergunta ${anterior.order}` : "Contexto"}</span>
        <span class="rh-viz__t">${escapeHtml(anterior ? anterior.prompt : "As três perguntas de contexto")}</span>
      </button>`;
    const depoisHtml = `<p class="rh-viz rh-viz--depois" aria-hidden="true">
        <span class="rh-viz__k">${proxima ? `Pergunta ${proxima.order}` : "Para encerrar"}</span>
        <span class="rh-viz__t">${escapeHtml(proxima ? proxima.prompt : "Conferir as respostas e enviar")}</span>
      </p>`;
    // Sem nome de grupo nem de dimensão no alto: além de ocupar a altura que a
    // pergunta precisa, o nome de dimensão do QUESTIONÁRIO diverge do nome que a
    // DEVOLUTIVA usa para a mesma dimensão (divergência do pacote aprovado) — o
    // participante lia dois nomes para a mesma coisa. Fora daqui, some o problema.
    return `${progressoHtml("", `Pergunta ${it.order} de ${st.itens.length}`)}
      ${avisoStorage()}${noteTopo()}
      <div class="rh-pilha">
        ${antesHtml}
        <article class="sc-item rh-pilha__atual" id="sc-questao" tabindex="-1" aria-label="Pergunta ${it.order} de ${st.itens.length}">
          <p class="sc-item__prompt" id="rh-item-prompt">${escapeHtml(it.prompt)}</p>
          <div class="sc-opts" role="radiogroup" aria-labelledby="rh-item-prompt">${opcoesHtml(it, escolhido, true)}</div>
        </article>
        ${depoisHtml}
      </div>
      <p class="sc-kbd">Escolher já avança · <kbd>1</kbd>–<kbd>${it.options.length}</kbd> escolhe · <kbd>↑</kbd><kbd>↓</kbd> percorrem · <kbd>Espaço</kbd> confirma · <kbd>←</kbd> volta</p>
      <div class="sc-nav rh-nav--simples">${autosaveHtml()}</div>`;
  }

  // ---------- render: revisão ----------
  function telaRevisao() {
    const leitura = st.modoLeitura || st.submitido;
    const comp = submissaoCompleta(st.itens, st.respostas, st.cf);
    const grupos = agruparPorGrupo(st.itens, st.groups).map((g) => {
      const linhas = g.items.map((it) => {
        const val = st.respostas[it.id];
        const op = it.options.find((o) => o.id === val);
        let txt = op ? escapeHtml(op.label) : `<span class="sc-rev__vazio">Sem resposta</span>`;
        if (op && st.cf && it.id === st.cf.itemId && val === st.cf.opcao) {
          const t = st.respostas[st.cf.id];
          txt += t ? ` — <span class="rh-rev__texto">${escapeHtml(t)}</span>` : ` — <span class="sc-rev__vazio">descrição do papel pendente</span>`;
        }
        const editar = leitura ? "" : `<button class="sc-btn sc-btn--ghost sc-btn--sm" type="button" data-acao="editar" data-item="${escapeHtml(it.id)}" aria-label="Editar a pergunta ${it.order}">Editar</button>`;
        return `<div class="sc-rev__linha ${op ? "" : "is-vazio"}">
          <div class="sc-rev__q"><span class="sc-rev__n">${it.order}</span><span>${escapeHtml(it.prompt)}</span></div>
          <div class="sc-rev__a">${txt}</div>
          ${editar}
        </div>`;
      }).join("");
      return `<section class="sc-rev__bloco" aria-label="${escapeHtml(g.name)}"><h2 class="sc-rev__bnome">${escapeHtml(g.name)}</h2>${linhas}</section>`;
    }).join("");
    const titulo = leitura ? "Suas respostas" : (comp.ok ? "Confira antes de enviar" : `Faltam ${comp.faltam.length + (comp.textoFalta ? 1 : 0)} ${comp.faltam.length + (comp.textoFalta ? 1 : 0) === 1 ? "resposta" : "respostas"}`);
    const lead = leitura ? "A sessão está fechada: as respostas ficam como registro e não podem ser alteradas." : (comp.ok ? "Ao enviar, a leitura é calculada e a sessão é fechada — não dá para alterar respostas depois. Nenhuma nota aparece aqui." : "Responda os itens marcados como “Sem resposta” para poder enviar.");
    const rodape = leitura
      ? `<div class="sc-footbar"><button class="sc-btn sc-btn--primary" type="button" data-acao="voltar-resultado">${ICONE.volta} Voltar ao resultado</button></div>`
      : `<div class="sc-footbar">
          <button class="sc-btn sc-btn--ghost" type="button" data-acao="voltar-item">${ICONE.volta} Voltar ao questionário</button>
          <button class="sc-btn sc-btn--brand" type="button" data-acao="enviar" ${comp.ok && !st.tentandoEnviar ? "" : "disabled"}>${st.tentandoEnviar ? "Enviando…" : "Confirmar e enviar"}</button>
        </div>`;
    return `<div class="sc-rev">
      <p class="sc-eyebrow">Revisão</p>
      <h1 class="sc-title sc-title--lg">${titulo}</h1>
      <p class="sc-lead">${lead}</p>
      ${avisoStorage()}${noteTopo()}
      ${grupos}
      ${rodape}
    </div>`;
  }

  // ---------- render: portão de lead ----------
  function formLeadHtml(titulo, subtitulo) {
    if (st.leadEnviado) return `<div class="sc-note sc-note--ok" role="status">${ICONE.check}<span>Contato registrado. A Boomit pode falar com você sobre esta leitura.</span></div>`;
    // Erro DO CAMPO (e-mail inválido) fica abaixo do campo, com ícone e ligado
    // por aria-describedby — o padrão da casa, já usado no texto livre do
    // contexto. Erro que não é do campo (rede, limite, lead desativado) segue
    // como tarja no topo do formulário.
    const noCampo = !!st.leadErro && st.leadErroCampo;
    const erroTopo = st.leadErro && !st.leadErroCampo
      ? `<div class="sc-note sc-note--danger" role="alert">${ICONE.info}<span>${escapeHtml(st.leadErro)}</span></div>` : "";
    const erroCampo = noCampo
      ? `<p class="rh-field__erro" id="sc-lead-email-erro" role="alert">${ICONE.info}<span>${escapeHtml(st.leadErro)}</span></p>` : "";
    return `<form class="sc-leadform" data-acao="lead" novalidate>
      <p class="sc-eyebrow">${escapeHtml(titulo)}</p>
      ${subtitulo ? `<p class="sc-leadform__sub">${escapeHtml(subtitulo)}</p>` : ""}
      ${erroTopo}
      <div class="sc-field"><label class="sc-label" for="sc-lead-nome">Nome <span class="sc-muted">(opcional)</span></label>
        <input class="sc-input" id="sc-lead-nome" name="nome" type="text" autocomplete="name" placeholder="Seu nome"></div>
      <div class="sc-field"><label class="sc-label" for="sc-lead-email">E-mail</label>
        <input class="sc-input" id="sc-lead-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="voce@empresa.com" required ${noCampo ? 'aria-invalid="true" aria-describedby="sc-lead-email-erro"' : ""}>
        ${erroCampo}</div>
      <label class="sc-ack"><input type="checkbox" id="sc-lead-opt"><span>Aceito receber contato da Boomit sobre este diagnóstico.</span></label>
      <div class="sc-actions"><button class="sc-btn sc-btn--brand sc-btn--block" type="submit" ${st.leadEnviando ? "disabled" : ""}>${st.leadEnviando ? "Enviando…" : "Ver minha leitura"}</button></div>
    </form>`;
  }
  function telaLeadGate() {
    return `<div class="sc-card">
      <div class="rh-gate-head"><p class="sc-eyebrow">Antes do resultado</p><h1 class="sc-title">Sua leitura está pronta</h1><p class="sc-lead">Deixe seu contato para ver o resultado. O e-mail fica guardado à parte das respostas.</p></div>
      ${formLeadHtml("Para acessar a devolutiva", null)}
    </div>`;
  }

  // ---------- render: resultado ----------
  function telaResultado() {
    const leadHtml = (st.leadMode === "optional_after_submit")
      ? `<section class="rh-sec rh-sec--lead"><div class="sc-card sc-card--lead">${formLeadHtml("Vamos conversar?", "Se quiser aprofundar esta leitura com a Boomit, deixe seu contato.")}</div></section>` : "";
    const version = st.instrument && st.instrument.version;
    // O formato do resultado decide qual documento sai. Quando a metade de
    // liderança vem junto, o que se entrega é o documento único — e a leitura
    // cruzada, que é o que justifica juntar, abre o documento.
    const ehUnificado = st.resultado && (st.resultado.liderancaPublica || st.resultado.cruzamento);
    if (ehUnificado) return renderUnificado(st.resultado, { instrumentVersion: version, leadHtml });
    return renderResultado(st.resultado, { instrumentVersion: version, leadHtml });
  }
  function telaInsuficiente() {
    return renderInsuficiente(st.resultado, { instrumentVersion: st.instrument && st.instrument.version });
  }

  function telaErro() {
    const d = st.erro || {};
    const ic = ICONE[d.icone] || ICONE.aviso;
    const tom = d.tom || "neutral";
    const retry = (d.recuperavel && d.retry)
      ? `<button class="sc-btn sc-btn--primary" type="button" data-acao="retry">Tentar novamente</button>` : "";
    return `<div class="sc-erro">
      <div class="sc-erro__card">
        <img class="sc-erro__grafismo" src="grafismo-boomit.png" alt="" aria-hidden="true" width="900" height="900">
        <div class="sc-erro__corpo">
          <div class="sc-erro__ic sc-erro__ic--${tom}" aria-hidden="true">${ic}</div>
          <h1 class="sc-title">${escapeHtml(d.titulo || "Algo não saiu como esperado")}</h1>
          <p class="sc-lead">${escapeHtml(d.mensagem || "")}</p>
          <div class="sc-actions">
            ${retry}
            <button class="sc-btn ${retry ? "sc-btn--ghost" : "sc-btn--primary"}" type="button" data-acao="recomecar-sem-confirmar">Começar de novo</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function carregando() { return `<div class="sc-loading"><span class="sc-spin" aria-hidden="true"></span> Carregando…</div>`; }

  function corpo() {
    switch (st.tela) {
      case "abertura": return telaAbertura();
      case "perfil": return telaPerfil();
      case "contexto": return telaContexto();
      case "questoes": return telaQuestoes();
      case "revisao": return telaRevisao();
      case "lead_gate": return telaLeadGate();
      case "resultado": return telaResultado();
      case "insuficiente": return telaInsuficiente();
      case "erro": return telaErro();
      default: return carregando();
    }
  }
  /**
   * Como reencontrar, depois da repintura, o elemento que estava em foco.
   * `pintar()` troca todo o innerHTML: sem isto o foco cai no <body> e o
   * próximo Tab recomeça no cabeçalho — inviável para quem navega por teclado
   * (na tela de contexto, cada seta do radiogroup destruiria o foco).
   */
  function marcaDeFoco() {
    const el = doc.activeElement;
    if (!el || !el.getAttribute || el === doc.body || !raiz.contains(el)) return null;
    if (el.id) return `#${el.id}`;
    const item = el.getAttribute("data-item"), opcao = el.getAttribute("data-opcao");
    if (item && opcao) return `input[data-item="${item}"][data-opcao="${opcao}"]`;
    const acao = el.getAttribute("data-acao");
    return acao ? `[data-acao="${acao}"]` : null;
  }
  // Qual tela estava pintada da última vez — para distinguir TROCA DE TELA de
  // repintura dentro da mesma tela (responder um item, salvar, validar).
  let telaPintada = null;

  function pintar() {
    const compacto = st.tela === "questoes" || st.tela === "contexto";
    const foco = marcaDeFoco();
    const trocouDeTela = st.tela !== telaPintada;
    raiz.innerHTML = `<div class="sc-shell rh-shell rh-tela--${st.tela}">` + cabecalho(compacto) + corpo() + `</div>`;
    telaPintada = st.tela;
    if (st.tela === "questoes") {
      const q = raiz.querySelector("#sc-questao");
      if (q) { try { q.focus({ preventScroll: true }); } catch { /* ok */ } }
      return;
    }
    // TROCA DE TELA: leva o foco ao título. Sem isto nada é anunciado a quem usa
    // leitor de tela — o <main> não é live region (seria pior: reanunciaria a
    // tela inteira a cada resposta), então é o foco que precisa dizer "mudou".
    if (trocouDeTela) {
      const h1 = raiz.querySelector("h1");
      if (h1) {
        h1.setAttribute("tabindex", "-1");
        try { h1.focus({ preventScroll: true }); } catch { /* ok */ }
        return;
      }
    }
    // Repintura na MESMA tela: devolve o foco a quem o tinha (mesmo elemento,
    // mesma alternativa). Se o elemento não existe mais, o foco simplesmente
    // não é roubado — nenhuma tela depende disso para funcionar.
    if (foco) focar(foco);
  }

  // --- eventos ---
  raiz.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-acao]"); if (!alvo) return;
    const acao = alvo.getAttribute("data-acao");
    if (alvo.getAttribute("aria-disabled") === "true") { if (acao === "concluir-contexto") concluirContexto(); return; }
    const fns = {
      tema: alternarTema, comecar,
      continuar: () => irPara(!perfilOk() ? "perfil" : contextoOk() ? "questoes" : "contexto"),
      "concluir-perfil": concluirPerfil,
      "voltar-abertura": () => irPara("abertura"), "concluir-contexto": concluirContexto,
      "voltar-nav": voltar, "avancar-nav": avancar, "voltar-item": () => irPara("questoes"),
      enviar, recomecar: () => recomecar(true), "recomecar-sem-confirmar": () => recomecar(false),
      rever: reverRespostas, "voltar-resultado": () => { st.modoLeitura = false; irPara(st.resultado && st.resultado.status === "INSUFFICIENT" ? "insuficiente" : "resultado"); },
      imprimir: () => { rastrear("pdf_requested"); try { globalThis.print(); } catch { /* ok */ } },
      retry: () => { const f = st.erro && st.erro.retry; if (f) f(); },
    };
    if (acao === "editar") return editarItem(alvo.getAttribute("data-item"));
    if (fns[acao]) return fns[acao]();
  });
  for (const tipo of ["pointerdown", "click"]) {
    raiz.addEventListener(tipo, (ev) => {
      const alvo = ev.target && ev.target.closest ? ev.target.closest('[data-acao="resposta"], .sc-opt') : null;
      if (alvo) marcarEscolhaDeliberada();
    }, true);   // captura: roda antes de qualquer `change`, em qualquer navegador
  }
  raiz.addEventListener("change", (ev) => {
    const alvo = ev.target; if (!alvo.getAttribute) return;
    const acao = alvo.getAttribute("data-acao");
    if (acao === "perfil") {
      // Guarda e some com a marca de pendência DAQUELE campo, sem repintar a
      // tela: repintar no meio da digitação tira o foco de quem está escrevendo.
      const campo = alvo.getAttribute("data-campo");
      st.perfilValores = { ...st.perfilValores, [campo]: alvo.value };
      if (st.perfilFaltam.includes(campo) && !perfilFaltantes(st.perfilCampos, st.perfilValores).includes(campo)) {
        st.perfilFaltam = st.perfilFaltam.filter((c) => c !== campo);
        refrescarLeve();
      }
      return;
    }
    if (acao === "resposta") {
      const item = alvo.getAttribute("data-item"), opcao = alvo.getAttribute("data-opcao");
      if (st.cf && item === st.cf.itemId) {
        // Trocar a opção que abre o texto: oculta E limpa o rascunho local.
        st.textoOutro = textoAposTrocarOpcao(opcao, st.cf, st.textoOutro); st.textoErro = null;
        salvarResposta(item, opcao).then(() => { if (opcao === st.cf.opcao) focar("#rh-texto-outro"); });
        return;
      }
      return salvarResposta(item, opcao);
    }
    if (acao === "texto-outro") {
      // change = ao sair do campo: valida e envia se válido, SEM recriar o DOM
      // (o blur pode estar no meio de um clique numa alternativa).
      st.textoOutro = alvo.value;
      salvarTextoOutro().then((ok) => {
        refrescarLeve();
        // Sem botão, o texto válido é o que continua a leitura. Só avança se
        // gravou e continua válido — texto curto demais mantém a pessoa aqui.
        if (ok && st.tela === "contexto" && !validarTextoOutro(st.textoOutro, st.cf)) {
          setTimeout(() => { if (st.tela === "contexto") avancarContexto(); }, 340);
        }
      });
    }
  });
  raiz.addEventListener("input", (ev) => {
    const alvo = ev.target; if (!alvo.getAttribute) return;
    if (alvo.getAttribute("data-acao") === "perfil") {
      st.perfilValores = { ...st.perfilValores, [alvo.getAttribute("data-campo")]: alvo.value };
      return;
    }
    if (alvo.getAttribute("data-acao") === "texto-outro") { st.textoOutro = alvo.value; if (st.textoErro) st.textoErro = null; refrescarLeve(); }
  });
  raiz.addEventListener("submit", (ev) => {
    const form = ev.target; if (!form.getAttribute) return;
    if (form.getAttribute("data-acao") === "lead") {
      ev.preventDefault();
      const nome = form.querySelector("#sc-lead-nome"); const email = form.querySelector("#sc-lead-email"); const opt = form.querySelector("#sc-lead-opt");
      enviarLead(nome && nome.value, email && email.value, opt && opt.checked);
    }
    if (form.getAttribute("data-acao") === "form-perfil") {
      ev.preventDefault();
      concluirPerfil();
    }
  });

  // Teclado nas questões: 1–9 escolhe; Enter/→ avança (se respondida); ← volta.
  doc.addEventListener("keydown", (ev) => {
    if (st.tela !== "questoes") return;
    const t = ev.target;
    if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== "radio") return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const it = st.flat[st.pos]; if (!it) return;
    if (ev.key >= "1" && ev.key <= "9") {
      const idx = Number(ev.key) - 1;
      if (idx < it.options.length) { ev.preventDefault(); marcarEscolhaDeliberada(); salvarResposta(it.id, it.options[idx].id); }
    } else if (ev.key === "Enter" || ev.key === "ArrowRight") {
      if (st.respostas[it.id]) { ev.preventDefault(); avancar(); }
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      // Navegação entre alternativas: NÃO é escolha, e não pode avançar.
      navegandoPorSetaEm = Date.now();
    } else if (ev.key === " " || ev.key === "Spacebar") {
      // Espaço numa alternativa com foco É escolha. Dois caminhos:
      //  - alternativa ainda não marcada: o navegador marca, dispara `change`,
      //    e o avanço automático acontece pelo caminho normal;
      //  - alternativa JÁ marcada (veio de ↑↓, que marca ao navegar): não há
      //    mudança de estado, logo não há `change` nem avanço — então avançamos
      //    aqui. É o que faz o teclado terminar o percurso sem botão.
      navegandoPorSetaEm = 0; marcarEscolhaDeliberada();
      if (st.respostas[it.id]) { ev.preventDefault(); avancar(); }
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault(); voltar();
    }
  });

  // Impressão sempre no tema claro (fundo branco no papel): troca em beforeprint
  // e restaura em afterprint. Vale para o botão e para Ctrl+P.
  if (globalThis.addEventListener) {
    let temaAntes = null;
    globalThis.addEventListener("beforeprint", () => { temaAntes = doc.documentElement.getAttribute("data-theme"); doc.documentElement.setAttribute("data-theme", "light"); });
    globalThis.addEventListener("afterprint", () => { if (temaAntes) doc.documentElement.setAttribute("data-theme", temaAntes); else doc.documentElement.removeAttribute("data-theme"); });
  }

  // Hash: URL direta só chega onde o estado permite.
  globalThis.addEventListener && globalThis.addEventListener("hashchange", () => {
    if (st.ignorarHash) { st.ignorarHash = false; return; }
    if (st.tela === "carregando") return;
    const alvo = telaDoHash(loc.hash, { temSessao: !!st.token, submitido: st.submitido, contextoOk: contextoOk() });
    if (HASH_DA_TELA[alvo] === HASH_DA_TELA[st.tela]) return sincronizarHash(st.tela);
    if (alvo === "resultado") return st.resultado ? irPara(st.resultado.status === "INSUFFICIENT" ? "insuficiente" : "resultado") : carregarResultado();
    if (alvo === "revisao" && st.submitido) return reverRespostas();
    irPara(alvo);
  });

  // --- arranque ---
  (function bootstrap() {
    try { const t = globalThis.localStorage.getItem(CHAVE_TEMA); if (t) doc.documentElement.setAttribute("data-theme", t); } catch { /* ok */ }
    if (!store) st.storageOk = false;
    const salva = lerSessao(evento, store);
    if (salva && salva.token) retomar(salva);
    else carregarApresentacao();
  })();

  return { st, pintar };
}

// Arranque automático no navegador (pulável no harness; nunca em node --test).
if (typeof globalThis.document !== "undefined") {
  const cfg = globalThis.SCREENER_RHIA_CONFIG;
  const raiz = globalThis.document.getElementById("sc-app");
  const falhar = (msg) => { if (raiz) raiz.innerHTML = `<div class="sc-shell"><div class="sc-card" role="alert"><h1 class="sc-title">Não foi possível iniciar o diagnóstico</h1><p class="sc-lead">${escapeHtml(msg)}</p></div></div>`; };
  if (!cfg || !cfg.EDGE_URL || !cfg.ANON_KEY) {
    falhar("A configuração da página está incompleta (endereço da API ausente). Recarregue a página; se persistir, avise quem enviou o link.");
  } else if (cfg.autostart !== false) {
    const start = () => { try { iniciarApp(cfg); globalThis.__rhiaPronto = true; } catch (e) { falhar("Ocorreu uma falha ao carregar a aplicação. Recarregue a página ou tente outro navegador."); } };
    if (globalThis.document.readyState === "loading") globalThis.document.addEventListener("DOMContentLoaded", start);
    else start();
  }
}
