/**
 * Edge Function: gate-and-send (v4 — PDF com paridade total ao web)
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface GatePayload {
  token: string;
  email: string;
  consentimento_marketing?: boolean;
  scores_json: Record<string, any>;
  maturidade_letra?: string;
  maturidade_score?: number;
  cdl_min?: number;
  cdl_max?: number;
  risco_estrategico?: number;
}

interface GateResponse {
  ok: boolean;
  respondente_id?: string;
  relatorio_id?: string;
  pdf_url?: string;
  email_enviado?: boolean;
  error?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: GateResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
function isValidEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function fmtMoney(v: number | undefined | null): string {
  if (v == null) return '—';
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}

const NIVEL_LABEL: Record<string, string> = {
  A: 'Analista / Junior / Pleno',
  C: 'Coordenador / Senior / Especialista',
  G: 'Gerente / Diretor',
  X: 'C-Level / Socio',
};
const PORTE_LABEL: Record<string, string> = {
  S1: 'Ate 50 colaboradores',
  S2: '51 a 250 colaboradores',
  S3: '251 a 1.000 colaboradores',
  S4: 'Mais de 1.000 colaboradores',
};
const SETOR_LABEL: Record<string, string> = {
  V1: 'Tecnologia & Inovacao', V2: 'Financeiro & Fintech', V3: 'Varejo & Consumo',
  V4: 'Industria & Manufatura', V5: 'Servicos Profissionais', V6: 'Saude & Farma',
  V7: 'Educacao', V8: 'Setor Publico', V9: 'Outros',
};
const DIM_NOMES: Record<string, string> = {
  D1: 'Visao & Direcionamento', D2: 'Pessoas & Desenvolvimento', D3: 'Decisao & Accountability',
  D4: 'Comportamento & Influencia', D5: 'Cultura de Performance',
};
const ESPERADO_PERSONA: Record<string, number> = { A: 15, C: 40, G: 70, X: 90 };

function gerarRadarSVG(scores: Record<string, any>): string {
  const cx = 200, cy = 200, rMax = 140;
  const dims = ['D1', 'D2', 'D3', 'D4', 'D5'];
  const labels = ['Visao', 'Pessoas', 'Decisao', 'Comport.', 'Performance'];
  const n = dims.length;
  const angles = dims.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);

  let grid = '';
  for (const v of [1, 2, 3, 4, 5]) {
    const pts = dims.map((_, i) => {
      const r = (v / 5) * rMax;
      return `${(cx + r * Math.cos(angles[i])).toFixed(1)},${(cy + r * Math.sin(angles[i])).toFixed(1)}`;
    }).join(' ');
    grid += `<polygon points="${pts}" fill="none" stroke="#E2E6EF" stroke-width="1"/>`;
  }
  let axes = '';
  for (let i = 0; i < n; i++) {
    const x = cx + rMax * Math.cos(angles[i]);
    const y = cy + rMax * Math.sin(angles[i]);
    axes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E2E6EF" stroke-width="1"/>`;
  }
  function poly(getVal: (d: string) => number, color: string, opacity: number) {
    const pts = dims.map((d, i) => {
      const r = (getVal(d) / 5) * rMax;
      return `${(cx + r * Math.cos(angles[i])).toFixed(1)},${(cy + r * Math.sin(angles[i])).toFixed(1)}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="2"/>`;
  }
  const polys = poly((d) => scores[d]?.empresa || 0, '#F5AC00', 0.4)
              + poly((d) => scores[d]?.pessoa  || 0, '#002555', 0.5);

  let txt = '';
  for (let i = 0; i < n; i++) {
    const r = rMax + 22;
    const x = cx + r * Math.cos(angles[i]);
    const y = cy + r * Math.sin(angles[i]);
    const anchor = Math.cos(angles[i]) > 0.1 ? 'start' : Math.cos(angles[i]) < -0.1 ? 'end' : 'middle';
    txt += `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="${anchor}" font-size="13" font-weight="700" fill="#002555">${labels[i]}</text>`;
  }
  return `<svg viewBox="0 0 400 400" width="380" height="380">${grid}${axes}${polys}${txt}</svg>`;
}

function diagMaturidade(letra: string): string {
  const m: Record<string, string> = {
    AAA: 'Organizacao em patamar de excelencia em maturidade de lideranca. Pontos fortes consolidados em todas as dimensoes.',
    AA: 'Maturidade avancada com pontos fortes claros e poucos gaps. Empresa pronta para escalar praticas de lideranca.',
    A: 'Estrutura de lideranca consolidada com praticas bem estabelecidas. Oportunidades de evolucao especificas.',
    B: 'Empresa em fase de consolidacao estrutural. Processos definidos mas com execucao inconsistente.',
    C: 'Maturidade inicial. Processos em construcao e cultura de lideranca em formacao.',
    D: 'Patamar critico de maturidade. Gaps estruturais em multiplas dimensoes.',
  };
  return m[letra] || m.B;
}

function leituraRegua(atual: number, esperado: number, persona: string): string {
  const gap = esperado - atual;
  const personaLabel = NIVEL_LABEL[persona] || persona;
  if (Math.abs(gap) < 10) return `Posicionamento alinhado com o esperado para ${personaLabel}.`;
  if (gap > 0) return `Sua capacidade esta ${Math.round(gap)}% mais operacional do que o esperado para ${personaLabel}.`;
  return `Voce opera ${Math.round(Math.abs(gap))}% acima do nivel estrategico esperado para ${personaLabel}.`;
}

function classificaTag(v: number): { label: string; cls: string } {
  if (v >= 75) return { label: 'Forte', cls: 'tag-forte' };
  if (v >= 60) return { label: 'Saudavel', cls: 'tag-saudavel' };
  if (v >= 40) return { label: 'Em desenvolvimento', cls: 'tag-atencao' };
  return { label: 'Critico', cls: 'tag-critico' };
}

function detectaAutopercepcao(scores: Record<string, any>): string {
  let pos = 0, neg = 0;
  for (const d of ['D1', 'D2', 'D3', 'D4', 'D5']) {
    const gap = scores[d]?.gap || 0;
    if (gap > 0.7) pos++;
    if (gap < -0.7) neg++;
  }
  if (pos >= 3) return 'Talento sub-utilizado';
  if (neg >= 3) return 'Padrao impostor';
  if (pos === 0 && neg === 0) return 'Integrado';
  return 'Oscilante';
}

function textoAutopercepcao(padrao: string): string {
  const m: Record<string, string> = {
    'Talento sub-utilizado': 'Em multiplas dimensoes voce se avalia acima de como le a empresa.',
    'Padrao impostor': 'Voce se avalia consistentemente abaixo de como percebe a empresa.',
    'Integrado': 'Autopercepcao alinhada com a leitura organizacional. Boa calibracao interna.',
    'Oscilante': 'Gaps em direcoes opostas em dimensoes diferentes.',
  };
  return m[padrao] || '';
}

function renderPdfHtml(data: { respondente: any; relatorio: any; payload: GatePayload }): string {
  const r = data.respondente;
  const rel = data.relatorio;
  const scoresJson = data.payload.scores_json || {};
  const scores = scoresJson.scores || {};
  const scoreGeral = scoresJson.scoreGeral || 3.0;

  const stratWeight = ((scores.D1?.empresa || 3) + (scores.D3?.empresa || 3)) / 2;
  const tacWeight   = ((scores.D5?.empresa || 3) + (scores.D2?.empresa || 3)) / 2;
  const opWeight    = ((scores.D4?.empresa || 3) + (scores.D5?.empresa || 3)) / 2;
  const total = stratWeight + tacWeight + opWeight;
  const stratPct = total > 0 ? Math.round((stratWeight / total) * 90 + 5) : 50;
  const esperado = ESPERADO_PERSONA[r.persona] || 50;

  const componentes = [
    { nome: 'Alinhamento Cultural', desc: 'Aderencia aos valores', valor: (scores.D4?.empresa || 0) * 20 },
    { nome: 'Alinhamento Estrategico', desc: 'Foco nos objetivos', valor: (scores.D1?.empresa || 0) * 20 },
    { nome: 'Engajamento Comportamental', desc: 'Motivacao pessoal', valor: (scores.D4?.pessoa || 0) * 20 },
    { nome: 'Performance vs Expectativa', desc: 'Entrega vs esperado', valor: (scores.D5?.media || 0) * 20 },
  ];

  const competencias = ['D1', 'D2', 'D3', 'D4', 'D5'].map((d) => ({
    nome: DIM_NOMES[d],
    atual: scores[d]?.empresa || 0,
    esperado: 4.0,
    gap: (scores[d]?.empresa || 0) - 4.0,
  })).sort((a, b) => a.gap - b.gap);

  const autoPadrao = detectaAutopercepcao(scores);
  const autoTexto = textoAutopercepcao(autoPadrao);

  const risco = rel.risco_estrategico ?? Math.round((5 - scoreGeral) * 20);
  let riscoNivel = 'Baixo', riscoCor = '#10A981';
  if (risco >= 60) { riscoNivel = 'Alto'; riscoCor = '#D14343'; }
  else if (risco >= 40) { riscoNivel = 'Moderado'; riscoCor = '#F5AC00'; }

  const dataPt = new Date().toLocaleDateString('pt-BR');
  const cdlMin = rel.cdl_min || 0;
  const cdlMax = rel.cdl_max || 0;
  const cdlEst = Math.round(cdlMax * 0.40);
  const cdlTat = Math.round(cdlMax * 0.35);
  const cdlOp  = Math.round(cdlMax * 0.25);

  const compRows = competencias.slice(0, 5).map((c, i) => {
    const pctAtual = c.atual * 20;
    const gapSign = c.gap >= 0 ? '+' : '';
    const gapCls = c.gap < 0 ? 'neg' : '';
    return `<div class="comp-row"><div><span style="font-size:14pt;font-weight:800;color:#F5AC00;">#${i + 1}</span> <span class="comp-name">${c.nome}</span></div><div class="comp-bar-track"><div class="comp-bar-fill" style="width:${pctAtual}%;"></div><div class="comp-bar-exp" style="width:80%;"></div></div><div class="comp-gap ${gapCls}">${gapSign}${c.gap.toFixed(1)}</div></div>`;
  }).join('');

  const compsHtml = componentes.map(c => {
    const tag = classificaTag(c.valor);
    return `<div class="ind-row"><div><div style="font-weight:600;font-size:10pt;">${c.nome}</div><div style="font-size:8.5pt;color:#6C7A92;">${c.desc}</div></div><div class="ind-bar-track"><div class="ind-bar-fill" style="width:${c.valor}%;"></div></div><div class="ind-value">${c.valor.toFixed(0)}<span class="tag ${tag.cls}">${tag.label}</span></div></div>`;
  }).join('');

  const dimDestaque = competencias[0]?.nome || 'multiplas dimensoes';

  const css = `* { box-sizing: border-box; margin: 0; padding: 0; } @page { size: A4; margin: 16mm 14mm; } body { font-family: 'Krub', Tahoma, sans-serif; color: #2A3754; font-size: 11pt; line-height: 1.5; } h1 { font-size: 28pt; font-weight: 700; color: #002555; line-height: 1.05; } h2 { font-size: 14pt; font-weight: 600; color: #002555; margin-bottom: 4pt; padding-bottom: 5pt; border-bottom: 2pt solid #F5AC00; } h3 { font-size: 10pt; font-weight: 700; color: #002555; text-transform: uppercase; letter-spacing: 1pt; margin-top: 14pt; } p { margin-bottom: 8pt; } .eyebrow { font-size: 9pt; color: #F5AC00; text-transform: uppercase; letter-spacing: 3pt; font-weight: 700; } .card { padding: 14pt; border: 1pt solid #E2E6EF; margin: 10pt 0; page-break-inside: avoid; } .card-sub { font-size: 9.5pt; color: #6C7A92; margin-bottom: 8pt; font-style: italic; } .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-top: 14pt; } .meta-item { background: #EEF1F8; padding: 8pt 10pt; } .meta-label { font-size: 8pt; color: #6C7A92; text-transform: uppercase; letter-spacing: 1.5pt; } .meta-value { font-size: 10pt; font-weight: 700; color: #002555; margin-top: 2pt; } .header { padding-bottom: 14pt; border-bottom: 2pt solid #002555; margin-bottom: 18pt; } .conceito-block { background: #F4F5F8; padding: 12pt 14pt; border-left: 3pt solid #F5AC00; margin: 8pt 0 12pt; font-size: 9.5pt; line-height: 1.55; } .conceito-block strong { color: #002555; } .conceito-mini { background: white; padding: 8pt 10pt; margin-top: 8pt; font-size: 8.5pt; color: #6C7A92; line-height: 1.5; border-left: 2pt solid #E2E6EF; } .subsidios-block { background: #FFF4D6; padding: 11pt 14pt; margin: 12pt 0 0; border-left: 3pt solid #F5AC00; font-size: 9pt; line-height: 1.55; color: #4A5670; } .subsidios-block strong { display: block; color: #002555; text-transform: uppercase; letter-spacing: 1pt; font-size: 8pt; margin-bottom: 4pt; } .grade-hero { display: grid; grid-template-columns: auto 1fr; gap: 22pt; align-items: center; margin: 12pt 0; } .grade-circle { width: 90pt; height: 90pt; border-radius: 50%; background: #002555; color: white; display: flex; align-items: center; justify-content: center; font-size: 44pt; font-weight: 800; } .regua-zones { display: flex; justify-content: space-between; padding: 4pt 0; font-size: 9pt; color: #6C7A92; font-weight: 600; text-transform: uppercase; letter-spacing: 1pt; } .regua-track { background: linear-gradient(to right, #FFF4D6, #F5AC00, #002555); height: 26pt; position: relative; border: 1pt solid #E2E6EF; } .regua-marker { position: absolute; top: -8pt; transform: translateX(-50%); } .regua-dot { width: 14pt; height: 14pt; background: #002555; border-radius: 50%; border: 2pt solid white; margin: 0 auto; } .regua-label { font-size: 8pt; font-weight: 700; margin-top: 3pt; text-align: center; white-space: nowrap; } .comp-row { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8pt; padding: 7pt 0; border-bottom: 1pt solid #E2E6EF; align-items: center; } .comp-name { font-weight: 600; font-size: 10pt; } .comp-bar-track { height: 10pt; background: #E2E6EF; position: relative; } .comp-bar-fill { position: absolute; height: 100%; background: #002555; } .comp-bar-exp { position: absolute; height: 100%; border-right: 2pt solid #F5AC00; } .comp-gap { font-size: 10pt; font-weight: 700; } .comp-gap.neg { color: #D14343; } .ind-row { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8pt; padding: 8pt 0; border-bottom: 1pt solid #E2E6EF; align-items: center; } .ind-bar-track { height: 9pt; background: #E2E6EF; position: relative; } .ind-bar-fill { position: absolute; height: 100%; background: #002555; } .ind-value { font-weight: 700; font-size: 11pt; color: #002555; min-width: 50pt; text-align: right; } .tag { font-size: 8pt; padding: 2pt 6pt; text-transform: uppercase; letter-spacing: 0.5pt; font-weight: 700; margin-left: 4pt; } .tag-forte { background: #10A981; color: white; } .tag-saudavel { background: #F5AC00; color: #002555; } .tag-atencao { background: #E89B1F; color: white; } .tag-critico { background: #D14343; color: white; } .risco-hero { display: grid; grid-template-columns: auto 1fr; gap: 18pt; align-items: center; } .risco-circle { width: 80pt; height: 80pt; border-radius: 50%; border: 5pt solid ${riscoCor}; display: flex; align-items: center; justify-content: center; font-size: 22pt; font-weight: 800; color: #002555; } .cdl-box { background: #F4F5F8; padding: 14pt; border-left: 4pt solid #F5AC00; margin: 10pt 0; } .cdl-value { font-size: 20pt; font-weight: 800; color: #002555; margin: 6pt 0; } .cdl-decomp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-top: 10pt; } .cdl-decomp-item { background: white; padding: 8pt; border: 1pt solid #E2E6EF; } .cdl-decomp-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 1.5pt; color: #6C7A92; font-weight: 600; } .cdl-decomp-value { font-size: 10pt; font-weight: 700; color: #002555; margin-top: 3pt; } .plano-item { display: grid; grid-template-columns: 30pt 1fr; gap: 10pt; padding: 10pt 0; border-bottom: 1pt solid #E2E6EF; align-items: start; } .plano-num { width: 26pt; height: 26pt; border-radius: 50%; background: #002555; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11pt; } .plano-content h4 { font-size: 11pt; font-weight: 700; color: #002555; margin-bottom: 3pt; } .plano-content ul { margin-left: 14pt; font-size: 10pt; } .crono-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-top: 10pt; } .crono-etapa { background: #F4F5F8; padding: 10pt; border-top: 3pt solid #F5AC00; } .crono-num { font-size: 9pt; text-transform: uppercase; letter-spacing: 1.5pt; color: #6C7A92; font-weight: 700; } .crono-titulo { font-size: 11pt; font-weight: 700; color: #002555; margin: 3pt 0 6pt; } .crono-bullets { font-size: 9pt; color: #6C7A92; } .crono-bullets li { margin: 2pt 0 2pt 12pt; } .gloss-item { padding: 6pt 0; border-bottom: 1pt dashed #E2E6EF; font-size: 10pt; } .gloss-term { font-weight: 700; color: #002555; } .gloss-def { color: #6C7A92; } .sources { background: #F4F5F8; padding: 10pt 14pt; font-size: 9pt; color: #6C7A92; line-height: 1.6; } .footer-doc { text-align: center; font-size: 8pt; color: #6C7A92; padding: 10pt 0; margin-top: 14pt; border-top: 1pt solid #E2E6EF; } .radar-wrap { text-align: center; margin: 14pt 0; } .radar-legend { display: flex; justify-content: center; gap: 18pt; margin-top: 8pt; font-size: 9pt; color: #6C7A92; } .legend-sw { display: inline-block; width: 10pt; height: 10pt; vertical-align: middle; margin-right: 4pt; } .page-break { page-break-before: always; }`;

  const header = `<div class="header"><div style="display:flex;justify-content:space-between;align-items:end;"><div><div class="eyebrow">Relatorio Estrategico</div><h1 style="margin-top:6pt;">${r.empresa || r.nome || 'Diagnostico'}</h1></div><div style="text-align:right;"><div class="eyebrow">IBMEC</div><div style="font-size:9pt;color:#6C7A92;margin-top:3pt;">${dataPt}</div></div></div><div class="meta-grid"><div class="meta-item"><div class="meta-label">Respondente</div><div class="meta-value">${r.nome || '—'}</div></div><div class="meta-item"><div class="meta-label">Nivel</div><div class="meta-value">${NIVEL_LABEL[r.persona] || '—'}</div></div><div class="meta-item"><div class="meta-label">Porte / Setor</div><div class="meta-value">${PORTE_LABEL[r.tamanho] || '—'} · ${SETOR_LABEL[r.segmento] || '—'}</div></div></div></div>`;

  const sec1 = `<div class="card"><h2>Indicador de Maturidade</h2><p class="card-sub">Estagio de maturidade de lideranca da organizacao e do respondente, consolidado nas 5 dimensoes avaliadas.</p><div class="conceito-block">A maturidade de uma organizacao nao e uma virtude moral — e uma <strong>descricao estrutural</strong>. Inspirada em frameworks como o CMMI (Software Engineering Institute) e o Organizational Health Index (McKinsey), nossa escala D→AAA descreve em que estagio sua empresa joga hoje e calibra a regua de cobranca realista. Empresa em nivel B com cobranca de nivel AAA gera burnout sistemico; empresa AAA com governanca de B perde competitividade. <strong>A leitura honesta do estagio e o ponto de partida de qualquer plano de evolucao viavel.</strong><div class="conceito-mini">Como ler: a letra reflete o estagio dominante; o score 0-100 detalha a posicao dentro do estagio. Mudar de letra e um movimento de 12-18 meses; subir score dentro da mesma letra e alcancavel em 90 dias com intervencao estruturada.</div></div><div class="grade-hero"><div style="text-align:center;"><div class="grade-circle">${rel.maturidade_letra || 'B'}</div><div style="margin-top:6pt;font-size:9pt;color:#6C7A92;">Score: ${(rel.maturidade_score || 0).toFixed(0)}/100</div></div><div><h3 style="margin-top:0;">Diagnostico</h3><p style="font-size:10pt;">${diagMaturidade(rel.maturidade_letra || 'B')}</p></div></div><div class="subsidios-block"><strong>Subsidio para conversa</strong>Use o diagnostico textual acima para validar com seu time se a leitura ressoa. Divergencia forte entre o que o instrumento mostra e o que a equipe sente e sinal de pontos cegos que merecem investigacao dedicada nos proximos 30 dias.</div></div>`;

  const sec2 = `<div class="card page-break"><h2>Regua de Posicionamento</h2><p class="card-sub">Onde sua capacidade de lideranca esta sendo gasta hoje versus onde deveria estar, considerando seu nivel hierarquico.</p><div class="conceito-block">Toda funcao carrega uma <strong>assinatura esperada</strong> de distribuicao de tempo entre tres planos: Operacional (execucao do dia), Tatico (coordenacao trimestral) e Estrategico (visao de 6+ meses). Um Diretor com 60% do tempo no Operacional nao esta sendo dedicado — esta sendo <em>arrastado</em> pelo curto prazo, e a empresa paga o custo dessa centralizacao em gargalo de decisao e atraso estrutural. A Regua mostra onde sua capacidade esta concentrada hoje versus onde, dado seu nivel, ela deveria estar.<div class="conceito-mini">Como ler: ponto preto = posicao atual; ponto dourado = posicao esperada para seu nivel hierarquico. A distancia entre os dois e o <em>gap de posicionamento</em> — quanto maior, maior a indicacao de trabalho estrutural a fazer (delegacao, processos, sucessao).</div></div><div style="background:#F4F5F8;padding:18pt 14pt;margin:14pt 0;"><div class="regua-zones"><span>Operacional</span><span>Tatico</span><span>Estrategico</span></div><div class="regua-track"><div class="regua-marker" style="left:${stratPct}%;"><div class="regua-dot"></div><div class="regua-label">Atual</div></div><div class="regua-marker" style="left:${esperado}%;top:-8pt;"><div class="regua-dot" style="background:#F5AC00;"></div><div class="regua-label" style="color:#F5AC00;">Esperado</div></div></div></div><p style="font-size:10pt;">${leituraRegua(stratPct, esperado, r.persona)}</p><div class="subsidios-block"><strong>Subsidio para conversa</strong>Gap acima de 15% costuma sinalizar tres causas frequentes: (i) ausencia de camada de execucao madura abaixo de voce, (ii) falta de confianca nos diretos para delegar, ou (iii) processos nao documentados que forcam voce a operar no detalhe. Cada uma demanda uma intervencao distinta.</div></div>`;

  const sec3 = `<div class="card page-break"><h2>Componentes do Alinhamento</h2><p class="card-sub">Decomposicao em 4 dimensoes criticas — cultural, estrategica, comportamental e performance.</p><div class="conceito-block">Estar 'alinhado' <strong>nao e uma coisa so</strong> — sao quatro vetores distintos que podem se reforcar ou cancelar. Alguem pode ter alto alinhamento cultural (compra o jeito de fazer da empresa) e baixo alinhamento estrategico (nao entende para onde ela vai). Outra pessoa pode performar bem (entrega) com baixo engajamento (entrega sem fe). A decomposicao em 4 dimensoes revela <strong>o tipo de desalinhamento</strong> — e cada tipo demanda intervencao diferente.<div class="conceito-mini">Como ler: cores indicam patamar — Forte (verde), Saudavel (dourado), Em desenvolvimento (laranja), Critico (vermelho). Atente ao padrao, nao a barra isolada — dois 'Fortes' + dois 'Em desenvolvimento' geralmente indica problema mais profundo do que quatro 'Saudaveis'.</div></div>${compsHtml}<div class="subsidios-block"><strong>Subsidio para conversa</strong>O combo <em>cultural alto + estrategico baixo</em> e o mais comum em scale-ups: pessoas amam a empresa mas nao entendem para onde ela vai. <em>Engajamento baixo + performance alta</em> indica entregadores ceticos — risco de saida silenciosa.</div></div>`;

  const sec4 = `<div class="card page-break"><h2>Competencias Priorizadas</h2><p class="card-sub">Ordenadas pelo maior gap entre situacao atual e expectativa para seu nivel.</p><div class="conceito-block">Pareto vale para competencias como vale para vendas: <strong>20% dos gaps respondem por 80% do impacto</strong> em performance. Tentar fechar todos os gaps simultaneamente e receita garantida de nao fechar nenhum. O ranking abaixo ordena as cinco competencias do maior gap (em relacao ao esperado para seu nivel) ate o menor — e indica onde investir as proximas 12 semanas para o maior ROI de desenvolvimento.<div class="conceito-mini">Como ler: #1 = maior gap (prioridade #1). Barra mostra nivel atual contra esperado (linha dourada). Delta negativo = abaixo do esperado; positivo = acima. Foco nas <strong>duas primeiras</strong>.</div></div>${compRows}<div class="subsidios-block"><strong>Subsidio para acao</strong>Para cada uma das duas competencias prioritarias, abra calendario recorrente de 30 minutos semanais dedicado especificamente ao desenvolvimento. Sem espaco protegido, nenhuma competencia se desenvolve em meio a operacao do dia.</div></div>`;

  const sec5 = `<div class="card page-break"><h2>Radar de Competencias</h2><p class="card-sub">Visao consolidada das 5 dimensoes avaliadas — sua percepcao versus a realidade organizacional.</p><div class="conceito-block">Dois poligonos sobrepostos contam uma historia que numeros isolados nao contam: sua percepcao pessoal versus o que voce le da empresa. Quatro quadrantes possiveis: <strong>(i) sinergia</strong> — voce forte, empresa forte, capitalize; <strong>(ii) tensao produtiva</strong> — voce forte, empresa fraca, risco de turnover; <strong>(iii) oportunidade puxada</strong> — voce fraca, empresa forte, empresa te eleva; <strong>(iv) risco sistemico</strong> — ambos fracos, intervencao dupla necessaria.<div class="conceito-mini">Como ler: poligono escuro = voce; poligono dourado = sua leitura da empresa. Diferencas maiores que 1.5 pontos costumam indicar vies de percepcao.</div></div><div class="radar-wrap">${gerarRadarSVG(scores)}<div class="radar-legend"><span><span class="legend-sw" style="background:#002555;"></span> Voce</span><span><span class="legend-sw" style="background:#F5AC00;"></span> Empresa</span></div></div><div class="subsidios-block"><strong>Subsidio para conversa</strong>Identifique uma competencia onde os poligonos divergem mais de 1.0 ponto. Marque uma conversa com 2 pares dessa area para descobrir se a divergencia e vies seu ou ponto cego do time.</div></div>`;

  const sec6 = `<div class="card page-break"><h2>Analise de Risco Estrategico</h2><p class="card-sub">Probabilidade do plano estrategico nao acontecer com o time atual nas condicoes diagnosticadas.</p><div class="conceito-block">Estrategia bem desenhada com time despreparado <strong>nao acontece</strong>. Risco Estrategico e a probabilidade estimada de nao-execucao do plano vigente, calculada como funcao inversa da maturidade observada, ponderada por exposicao (porte, setor regulado, ciclo de mercado). Quando ultrapassa 60%, ajustar execucao ou ajustar pessoas deixa de ser opcional e vira <strong>prioridade trimestral do board</strong>.<div class="conceito-mini">Como ler: circulo = risco percentual; etiqueta = Baixo (&lt;40%), Moderado (40-60%), Alto (&gt;60%). Risco nao e destino — cada ponto de maturidade que sobe reduz o risco proporcionalmente.</div></div><div class="risco-hero"><div class="risco-circle">${risco}%</div><div><div style="font-size:12pt;font-weight:700;color:${riscoCor};">Risco ${riscoNivel}</div><p style="font-size:10pt;margin-top:6pt;">A maturidade observada ${risco < 40 ? 'sustenta confortavelmente' : risco < 60 ? 'sustenta com ressalvas' : 'compromete'} a execucao do plano.</p></div></div><div class="subsidios-block"><strong>Subsidio para o board</strong>Apresente esse percentual no proximo comite estrategico. Conversa sobre risco de execucao e mais produtiva que conversa sobre culpa por entrega — e abre espaco para discussao estrutural ao inves de individualizacao do problema.</div></div>`;

  const sec7 = `<div class="card page-break"><h2>CDL · Custo da Disfuncionalidade da Lideranca</h2><p class="card-sub">Estimativa financeira anual do impacto das disfuncoes identificadas — metodologia proprietaria IBMEC.</p><div class="conceito-block">O <strong>CDL — Custo da Disfuncionalidade da Lideranca</strong> — e uma metrica financeira proprietaria IBMEC que estima, em R$ anuais, o impacto economico das disfuncoes de lideranca identificadas neste diagnostico. Diferente de KPIs operacionais, o CDL captura o que normalmente fica <em>invisivel no PnL</em>: retrabalho por decisao atrasada, oportunidade perdida por desalinhamento estrategico, custo de churn de talento por feedback inexistente, gargalo de execucao por lideranca centralizadora. A metodologia pondera porte da empresa, nivel de decisao do respondente avaliado e magnitude dos gaps observados nas 5 dimensoes.<div class="conceito-mini">Como ler: faixa min-max anual — nao e numero exato (nenhuma metodologia honesta da numero exato sobre custo invisivel). Decomposicao em tres niveis mostra onde o dinheiro esta vazando: Estrategico · Tatico · Operacional.</div></div><div class="cdl-box"><div class="meta-label">Faixa anual estimada</div><div class="cdl-value">${fmtMoney(cdlMin)} – ${fmtMoney(cdlMax)}</div><div class="cdl-decomp"><div class="cdl-decomp-item"><div class="cdl-decomp-label">Estrategico</div><div class="cdl-decomp-value">${fmtMoney(cdlEst)}</div></div><div class="cdl-decomp-item"><div class="cdl-decomp-label">Tatico</div><div class="cdl-decomp-value">${fmtMoney(cdlTat)}</div></div><div class="cdl-decomp-item"><div class="cdl-decomp-label">Operacional</div><div class="cdl-decomp-value">${fmtMoney(cdlOp)}</div></div></div></div><div class="subsidios-block"><strong>Subsidio para financas e RH</strong>CDL acima de 5% da receita anual costuma justificar investimento em programa estruturado de desenvolvimento de lideranca — o ROI da intervencao paga em 18-24 meses se bem executada. Decomposicao estrategico-pesada indica que a alavanca esta em rituais de C-suite; operacional-pesada, em processos e ferramentas.</div></div>`;

  const sec8 = `<div class="card page-break"><h2>Analise de Autopercepcao</h2><p class="card-sub">Padrao comportamental identificado a partir do contraste entre como voce se ve e como percebe a empresa.</p><div class="conceito-block">Como voce se ve e como voce le o contexto <strong>raramente coincidem</strong> — e a forma da divergencia diz mais sobre voce do que cada nota isolada. Quatro padroes classicos descritos na literatura de avaliacao: <strong>o talento sub-utilizado</strong> (auto &gt; empresa em multiplas dimensoes) · <strong>o impostor</strong> (auto &lt; empresa consistentemente) · <strong>o integrado</strong> (autoimagem casa com a realidade lida) · <strong>o oscilante</strong> (gaps em direcoes opostas). Cada padrao tem implicacoes distintas para PDI.<div class="conceito-mini">Como ler: o texto abaixo descreve o padrao identificado nas suas respostas, baseado na contagem e direcao dos gaps significativos (acima de 0.7 ponto) entre suas notas pessoa-empresa.</div></div><h3>Padrao identificado: ${autoPadrao}</h3><p style="font-size:10pt;margin-top:6pt;">${autoTexto}</p><div class="subsidios-block"><strong>Subsidio para autoconhecimento</strong>Para cada nota que voce deu, tente identificar um KR (Key Result) ou comportamento factual dos ultimos 6 meses que sustente a auto-avaliacao. Onde nao houver evidencia, considere ajustar para o patamar de desenvolvimento — sinal claro de vies de autopercepcao.</div></div>`;

  const sec9 = `<div class="card page-break"><h2>Plano de Acao Prioritario</h2><p class="card-sub">Tres frentes mapeadas pela combinacao dos seus maiores gaps com benchmark de mercado do seu setor e porte.</p><div class="conceito-block"><strong>Tres frentes. Nao uma, nao cinco.</strong> Toda literatura sobre mudanca comportamental (BJ Fogg em <em>Tiny Habits</em>, James Clear em <em>Atomic Habits</em>, Marshall Goldsmith em <em>What Got You Here Won't Get You There</em>) converge no mesmo ponto: foco em poucas alavancas, alta repeticao, ritual de acompanhamento. As tres frentes abaixo derivam da interseccao entre seus maiores gaps internos e o benchmark de mercado — ordenadas pelo maior potencial de impacto nos proximos 90 dias.<div class="conceito-mini">Como ler: cada frente tem titulo, justificativa e tres praticas concretas. Nao tente as nove praticas — pegue <strong>uma de cada frente</strong> e implemente nas proximas 4 semanas.</div></div><p style="font-size:9.5pt;color:#6C7A92;">Dimensao de maior gap: <strong>${dimDestaque}</strong>.</p><div class="plano-item"><div class="plano-num">1</div><div class="plano-content"><h4>Construir cobertura estrategica de tempo</h4><ul><li>Bloco fixo de 4h/semana para trabalho estrategico</li><li>Delegacao de 2 decisoes operacionais</li><li>Ritual semanal de revisao</li></ul></div></div><div class="plano-item"><div class="plano-num">2</div><div class="plano-content"><h4>Cultura de feedback estruturado</h4><ul><li>1:1s semanais de 30min</li><li>Framework SBI em conversas dificeis</li><li>Avaliacao 360 em 60 dias</li></ul></div></div><div class="plano-item"><div class="plano-num">3</div><div class="plano-content"><h4>Performance e cadencia</h4><ul><li>OKRs vivos com check-in semanal</li><li>Business Review trimestral</li><li>Vinculacao a metricas de impacto</li></ul></div></div><div class="subsidios-block"><strong>Subsidio para os proximos 30 dias</strong>Nao tente as nove praticas. Escolha exatamente <strong>uma</strong> de cada frente (tres no total) e implemente nas proximas quatro semanas. Quando virar habito observavel, adicione a proxima.</div></div>`;

  const sec10 = `<div class="card page-break"><h2>Cronograma Macro de Desenvolvimento</h2><p class="card-sub">Roadmap sugerido para evolucao estruturada do diagnostico ao novo patamar de maturidade.</p><div class="conceito-block">Diagnostico sem cronograma <strong>vira gaveta</strong>. As tres ondas refletem a engenharia de mudanca organizacional baseada em ciclos PDCA aplicados a lideranca: primeiros 30 dias para <em>internalizar</em> (validar com o time, priorizar gaps), 60 dias para <em>fundar</em> (rituais, indicadores, capacitacao) e 90 dias para <em>colher</em> os primeiros sinais.<div class="conceito-mini">Como ler: cada etapa traz objetivos e praticas-ancora. O cronograma e ilustrativo — o ritmo real depende da maturidade inicial e da disponibilidade da lideranca.</div></div><div class="crono-grid"><div class="crono-etapa"><div class="crono-num">Etapa 1 · 30 dias</div><div class="crono-titulo">Diagnostico e Alinhamento</div><ul class="crono-bullets"><li>Compartilhamento dos achados com a lideranca</li><li>Priorizacao dos 3 gaps criticos</li><li>Definicao de indicadores</li></ul></div><div class="crono-etapa"><div class="crono-num">Etapa 2 · 60 dias</div><div class="crono-titulo">Fundacao Comportamental</div><ul class="crono-bullets"><li>Capacitacao nas competencias priorizadas</li><li>Implementacao de rituais de gestao</li><li>Estruturacao de feedback continuo</li></ul></div><div class="crono-etapa"><div class="crono-num">Etapa 3 · 90 dias</div><div class="crono-titulo">Aceleracao e Resultado</div><ul class="crono-bullets"><li>Intervencoes nos impactos organizacionais</li><li>Mentoria individual para talentos-chave</li><li>Avaliacao intermediaria e ajuste de rota</li></ul></div></div></div>`;

  const sec11 = `<div class="card page-break"><h2>Glossario</h2><p class="card-sub">O que cada indicador deste relatorio revela.</p><div class="gloss-item"><span class="gloss-term">Indicador de Maturidade</span> · <span class="gloss-def">Estagio em que a lideranca joga. Calibra a regua de cobranca.</span></div><div class="gloss-item"><span class="gloss-term">CDL · Custo da Disfuncionalidade da Lideranca</span> · <span class="gloss-def">Metrica financeira proprietaria IBMEC que estima, em R$ anuais, o impacto economico das disfuncoes de lideranca.</span></div><div class="gloss-item"><span class="gloss-term">Risco Estrategico</span> · <span class="gloss-def">Probabilidade do plano estrategico nao acontecer com o time atual. Acima de 60%, vira prioridade do trimestre.</span></div><div class="gloss-item"><span class="gloss-term">Regua de Posicionamento</span> · <span class="gloss-def">Onde sua capacidade esta sendo gasta (Operacional / Tatico / Estrategico).</span></div><div class="gloss-item"><span class="gloss-term">Componentes do Alinhamento</span> · <span class="gloss-def">Quatro dimensoes que medem aderencia da pessoa ao contexto.</span></div></div>`;

  const sources = `<div class="sources"><strong>Catalogo de Benchmark · v1.1</strong> · Os benchmarks usados neste relatorio vem de fontes publicas: Gallup State of the Global Workplace 2026, GPTW Brasil 2025, Deloitte Human Capital Trends 2026, McKinsey OHI, WEF Future of Jobs 2025, Korn Ferry CEO Survey 2025, PwC CEO Survey 2026, LinkedIn Workplace Learning 2025, ENAP LideraGOV, Anahp Observatorio 2025, Sebrae Maturidade Digital, Febraban, Abrasce, CNI, FIA, Instituto Semesp.</div>`;

  const footer = `<div class="footer-doc">Documento confidencial · Diagnostico Estrategico IBMEC · Gerado em ${dataPt}</div>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Diagnostico IBMEC</title><link href="https://fonts.googleapis.com/css2?family=Krub:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${css}</style></head><body>${header}${sec1}${sec2}${sec3}${sec4}${sec5}${sec6}${sec7}${sec8}${sec9}${sec10}${sec11}${sources}${footer}</body></html>`;
}

async function generatePdf(html: string, token: string): Promise<Uint8Array> {
  const url = `https://chrome.browserless.io/pdf?token=${token}`;
  const resp = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html, options: { format: 'A4', printBackground: true, margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' } },
      gotoOptions: { waitUntil: 'networkidle0' },
    }),
  });
  if (!resp.ok) throw new Error(`Browserless ${resp.status}: ${await resp.text()}`);
  return new Uint8Array(await resp.arrayBuffer());
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function sendEmailBrevo(opts: { to: string; toName: string; subject: string; html: string; pdfBytes: Uint8Array | null; pdfName: string }): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) throw new Error('BREVO_API_KEY nao configurado');
  const fromName = Deno.env.get('FROM_NAME') || 'Diagnostico IBMEC';
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'envio@boomit.com.br';

  const body: any = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: opts.to, name: opts.toName || opts.to }],
    subject: opts.subject,
    htmlContent: opts.html,
  };
  if (opts.pdfBytes) {
    body.attachment = [{ name: opts.pdfName, content: uint8ToBase64(opts.pdfBytes) }];
  }

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${text}`);
  }
}

function emailBodyHtml(r: any, rel: any): string {
  return `<!DOCTYPE html><html><body style="font-family: Tahoma, Arial, sans-serif; color: #2A3754; max-width: 600px; margin: 0 auto; padding: 32px 24px;"><div style="border-bottom: 3px solid #002555; padding-bottom: 16px; margin-bottom: 24px;"><div style="font-size: 11px; color: #F5AC00; text-transform: uppercase; letter-spacing: 3px; font-weight: 700;">Diagnostico Estrategico</div><h1 style="font-size: 24px; color: #002555; margin-top: 8px;">IBMEC · Seu relatorio esta pronto</h1></div><p>Ola ${r.nome || ''},</p><p>Seu <strong>Diagnostico Estrategico de Lideranca</strong> foi finalizado. O relatorio completo (8 paginas) esta em anexo.</p><div style="background: #EEF1F8; padding: 16px; margin: 20px 0; border-left: 4px solid #F5AC00;"><div style="font-size: 10px; color: #6C7A92; text-transform: uppercase; letter-spacing: 1.5px;">Indicador de Maturidade</div><div style="font-size: 28px; font-weight: 800; color: #002555; margin: 4px 0;">${rel.maturidade_letra} · ${(rel.maturidade_score || 0).toFixed(0)}</div></div><hr style="border: none; border-top: 1px solid #E2E6EF; margin: 24px 0;"><p style="font-size: 11px; color: #6C7A92;">IBMEC · Diagnostico Estrategico · Junho 2026</p></body></html>`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const payload: GatePayload = await req.json();
    if (!payload.token || !payload.email) return json({ ok: false, error: 'token e email obrigatorios' }, 400);
    if (!isValidEmail(payload.email)) return json({ ok: false, error: 'email invalido' }, 400);
    if (!payload.scores_json) return json({ ok: false, error: 'scores_json obrigatorio' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: respondente, error: errResp } = await supabase
      .from('respondentes').select('*').eq('token_sessao', payload.token).single();
    if (errResp || !respondente) return json({ ok: false, error: 'token invalido' }, 404);

    const { error: errUpd } = await supabase.from('respondentes').update({
      email: payload.email,
      email_capturado_em: new Date().toISOString(),
      consentimento_marketing: payload.consentimento_marketing ?? false,
      submetido_em: respondente.submetido_em ?? new Date().toISOString(),
    }).eq('id', respondente.id);
    if (errUpd) throw new Error(`Update respondente: ${errUpd.message}`);

    const relatorioBase = {
      respondente_id: respondente.id,
      catalogo_versao: 'v1.1',
      questionario_versao: respondente.versao_questionario || 'q-v1.0',
      motor_versao: 'engine-v1.0',
      scores_json: payload.scores_json,
      maturidade_letra: payload.maturidade_letra,
      maturidade_score: payload.maturidade_score,
      cdl_min: payload.cdl_min,
      cdl_max: payload.cdl_max,
      risco_estrategico: payload.risco_estrategico,
    };
    const { data: relatorio, error: errRel } = await supabase
      .from('relatorios').upsert(relatorioBase, { onConflict: 'respondente_id' }).select().single();
    if (errRel || !relatorio) throw new Error(`Insert relatorio: ${errRel?.message}`);

    let pdfBytes: Uint8Array | null = null;
    let pdfUrl: string | null = null;
    try {
      const html = renderPdfHtml({ respondente, relatorio, payload });
      const token = Deno.env.get('BROWSERLESS_TOKEN');
      if (!token) throw new Error('BROWSERLESS_TOKEN nao configurado');
      pdfBytes = await generatePdf(html, token);

      const pdfPath = `${respondente.evento_id}/${respondente.id}.pdf`;
      const { error: errUp } = await supabase.storage.from('relatorios')
        .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (errUp) throw new Error(`Upload Storage: ${errUp.message}`);

      const { data: signed } = await supabase.storage.from('relatorios')
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 90);
      pdfUrl = signed?.signedUrl ?? null;

      await supabase.from('relatorios').update({
        pdf_url: pdfUrl, pdf_gerado_em: new Date().toISOString(), pdf_tamanho_bytes: pdfBytes.byteLength,
      }).eq('id', relatorio.id);
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr);
      await supabase.from('relatorios').update({ erro_geracao: String(pdfErr) }).eq('id', relatorio.id);
    }

    let emailEnviado = false;
    try {
      const subject = `Diagnostico IBMEC · ${respondente.nome || respondente.empresa || 'Seu relatorio'}`;
      const bodyHtml = emailBodyHtml(respondente, relatorio);
      const safeName = (respondente.nome || 'relatorio').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await sendEmailBrevo({
        to: payload.email,
        toName: respondente.nome || '',
        subject,
        html: bodyHtml,
        pdfBytes,
        pdfName: `diagnostico-ibmec-${safeName}.pdf`,
      });
      emailEnviado = true;
      await supabase.from('relatorios').update({ pdf_enviado_em: new Date().toISOString() }).eq('id', relatorio.id);
    } catch (emailErr) {
      console.error('Email Brevo falhou:', emailErr);
    }

    return json({
      ok: true, respondente_id: respondente.id, relatorio_id: relatorio.id,
      pdf_url: pdfUrl ?? undefined, email_enviado: emailEnviado,
    });
  } catch (err) {
    console.error('Handler error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
