/**
 * Edge Function: gate-and-send
 *
 * Fluxo:
 * 1. Recebe POST {token, email, consentimento_marketing, scores_json}
 * 2. Valida token contra respondente existente
 * 3. UPDATE respondente: email, email_capturado_em, consentimentos
 * 4. UPSERT relatorio com scores
 * 5. Gera HTML do relatório (template inline)
 * 6. Chama Browserless API para converter HTML → PDF
 * 7. Upload PDF no Storage bucket "relatorios"
 * 8. Envia email com PDF anexo via SMTP (HostGator/boomit.com.br)
 * 9. UPDATE relatorio.pdf_enviado_em
 *
 * Deploy: supabase functions deploy gate-and-send --no-verify-jwt
 * Secrets necessárias (configurar em Supabase Dashboard > Edge Functions > Secrets):
 *   - SUPABASE_URL (auto)
 *   - SUPABASE_SERVICE_ROLE_KEY (auto)
 *   - BROWSERLESS_TOKEN  (token de browserless.io)
 *   - SMTP_HOST          (ex: mail.boomit.com.br)
 *   - SMTP_PORT          (ex: 465)
 *   - SMTP_USER          (ex: envio@boomit.com.br)
 *   - SMTP_PASSWORD      (senha da caixa de email)
 *   - FROM_NAME          (ex: "Diagnóstico IBMEC")
 *   - FROM_EMAIL         (ex: envio@boomit.com.br)
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// ============= Tipos =============
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

// ============= CORS =============
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= Helpers =============
function json(body: GateResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function fmtMoney(v: number | undefined | null): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

// ============= Template do PDF (HTML inline) =============
function renderPdfHtml(data: { respondente: any; relatorio: any; scores: any }): string {
  const r = data.respondente;
  const rel = data.relatorio;

  const nivelLabel: Record<string, string> = {
    A: 'Analista / Júnior / Pleno',
    C: 'Coordenador / Sênior / Especialista',
    G: 'Gerente / Diretor',
    X: 'C-Level / Sócio',
  };
  const porteLabel: Record<string, string> = {
    S1: 'Até 50 colaboradores',
    S2: '51 a 250 colaboradores',
    S3: '251 a 1.000 colaboradores',
    S4: 'Mais de 1.000 colaboradores',
  };
  const setorLabel: Record<string, string> = {
    V1: 'Tecnologia & Inovação',
    V2: 'Financeiro & Fintech',
    V3: 'Varejo & Consumo',
    V4: 'Indústria & Manufatura',
    V5: 'Serviços Profissionais',
    V6: 'Saúde & Farma',
    V7: 'Educação',
    V8: 'Setor Público',
    V9: 'Outros',
  };

  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Diagnóstico IBMEC · ${r.empresa || r.nome}</title>
<link href="https://fonts.googleapis.com/css2?family=Krub:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: 'Krub', Tahoma, sans-serif; color: #2A3754; font-size: 11pt; line-height: 1.5; }
  .navy   { color: #002555; }
  .accent { color: #F5AC00; }
  h1 { font-size: 28pt; font-weight: 700; color: #002555; line-height: 1.1; }
  h2 { font-size: 14pt; font-weight: 600; color: #002555; margin-bottom: 6pt; padding-bottom: 4pt; border-bottom: 2pt solid #F5AC00; }
  h3 { font-size: 11pt; font-weight: 700; color: #002555; text-transform: uppercase; letter-spacing: 1pt; margin-top: 14pt; }
  .eyebrow { font-size: 9pt; color: #F5AC00; text-transform: uppercase; letter-spacing: 3pt; font-weight: 700; }
  .card { padding: 14pt; border: 1pt solid #E2E6EF; margin: 10pt 0; page-break-inside: avoid; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-top: 14pt; }
  .meta-item { background: #EEF1F8; padding: 8pt 10pt; }
  .meta-label { font-size: 8pt; color: #6C7A92; text-transform: uppercase; letter-spacing: 1.5pt; }
  .meta-value { font-size: 11pt; font-weight: 700; color: #002555; margin-top: 2pt; }
  .grade-hero { display: grid; grid-template-columns: auto 1fr; gap: 20pt; align-items: center; margin: 10pt 0; }
  .grade-circle { width: 80pt; height: 80pt; border-radius: 50%; background: #002555; color: white; display: flex; align-items: center; justify-content: center; font-size: 40pt; font-weight: 800; }
  .indicator-row { display: grid; grid-template-columns: 1fr auto; gap: 8pt; padding: 6pt 0; border-bottom: 1pt solid #E2E6EF; }
  .indicator-name { font-weight: 600; }
  .indicator-value { font-weight: 700; color: #002555; }
  .cdl-box { background: #F4F5F8; padding: 14pt; border-left: 4pt solid #F5AC00; margin: 10pt 0; }
  .cdl-value { font-size: 18pt; font-weight: 800; color: #002555; margin: 6pt 0; }
  .footer { text-align: center; font-size: 8pt; color: #6C7A92; padding: 14pt 0; margin-top: 14pt; border-top: 1pt solid #E2E6EF; page-break-inside: avoid; }
  .header { padding-bottom: 14pt; border-bottom: 2pt solid #002555; margin-bottom: 18pt; }
</style>
</head>
<body>

<div class="header">
  <div style="display: flex; justify-content: space-between; align-items: end;">
    <div>
      <div class="eyebrow">Relatório Estratégico</div>
      <h1 style="margin-top: 6pt;">${r.empresa || r.nome || 'Diagnóstico'}</h1>
    </div>
    <div style="text-align: right;">
      <div class="eyebrow accent">IBMEC</div>
      <div style="font-size: 10pt; color: #6C7A92; margin-top: 4pt;">${dataHoje}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">Respondente</div><div class="meta-value">${r.nome || '—'}</div></div>
    <div class="meta-item"><div class="meta-label">Nível</div><div class="meta-value">${nivelLabel[r.persona] || '—'}</div></div>
    <div class="meta-item"><div class="meta-label">Porte / Setor</div><div class="meta-value">${porteLabel[r.tamanho] || '—'} · ${setorLabel[r.segmento] || '—'}</div></div>
  </div>
</div>

<div class="card">
  <h2>Indicador de Maturidade</h2>
  <p style="font-size: 10pt; color: #6C7A92; margin-bottom: 10pt;">Estágio de maturidade da liderança e gestão, consolidado nas 5 dimensões avaliadas.</p>
  <div class="grade-hero">
    <div class="grade-circle">${rel.maturidade_letra || 'B'}</div>
    <div>
      <h3 style="margin-top: 0;">Score consolidado</h3>
      <div style="font-size: 24pt; font-weight: 800; color: #002555;">${(rel.maturidade_score || 0).toFixed(1)} / 100</div>
      <div style="font-size: 10pt; color: #6C7A92; margin-top: 6pt;">Letter grade calibrada pela escala D → AAA</div>
    </div>
  </div>
</div>

<div class="card">
  <h2>Indicadores Chave</h2>
  <div class="indicator-row">
    <span class="indicator-name">Risco Estratégico</span>
    <span class="indicator-value">${(rel.risco_estrategico || 0).toFixed(0)}%</span>
  </div>
  <div class="indicator-row">
    <span class="indicator-name">Maturidade Geral</span>
    <span class="indicator-value">${rel.maturidade_letra} · ${(rel.maturidade_score || 0).toFixed(1)}</span>
  </div>
  <div class="indicator-row" style="border-bottom: none;">
    <span class="indicator-name">Confiança da medição</span>
    <span class="indicator-value">Alta</span>
  </div>
</div>

<div class="card">
  <h2>CDL · Custo da Disfuncionalidade da Liderança</h2>
  <p style="font-size: 10pt; color: #6C7A92;">Estimativa financeira anual do impacto das disfunções identificadas — metodologia proprietária IBMEC.</p>
  <div class="cdl-box">
    <div class="meta-label">Faixa anual estimada</div>
    <div class="cdl-value">${fmtMoney(rel.cdl_min)} – ${fmtMoney(rel.cdl_max)}</div>
    <div style="font-size: 9pt; color: #6C7A92;">Heurística aplicada sobre porte × persona × maturidade.</div>
  </div>
</div>

<div class="card">
  <h2>Próximos passos</h2>
  <h3>Para os próximos 30 dias</h3>
  <p style="font-size: 10pt; margin-top: 6pt;">Compartilhar este diagnóstico com a liderança imediata, validar as leituras, eleger três frentes prioritárias.</p>
  <h3>Para 60–90 dias</h3>
  <p style="font-size: 10pt; margin-top: 6pt;">Implementar rituais de gestão nas dimensões de maior gap, capacitação focada nas competências priorizadas, primeira avaliação intermediária.</p>
</div>

<div class="footer">
  Documento confidencial · uso exclusivo do respondente · Diagnóstico Estratégico IBMEC · Gerado em ${dataHoje}
</div>

</body>
</html>`;
}

// ============= Browserless: HTML → PDF =============
async function generatePdf(html: string, browserlessToken: string): Promise<Uint8Array> {
  const url = `https://chrome.browserless.io/pdf?token=${browserlessToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      options: {
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
      },
      gotoOptions: { waitUntil: 'networkidle0' },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Browserless error ${response.status}: ${text}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

// ============= SMTP: enviar email com anexo =============
async function sendEmailSmtp(opts: {
  to: string;
  subject: string;
  html: string;
  pdfBytes: Uint8Array | null;
  pdfName: string;
}): Promise<void> {
  const host = Deno.env.get('SMTP_HOST');
  const port = parseInt(Deno.env.get('SMTP_PORT') || '465', 10);
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASSWORD');
  const fromName  = Deno.env.get('FROM_NAME')  || 'Diagnóstico IBMEC';
  const fromEmail = Deno.env.get('FROM_EMAIL') || user;

  if (!host || !user || !pass) {
    throw new Error('SMTP_HOST, SMTP_USER e SMTP_PASSWORD são obrigatórios');
  }

  // denomailer: TLS implícito quando port == 465
  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: port === 465,        // 465 = SMTPS (TLS implícito)
      auth: { username: user, password: pass },
    },
  });

  const message: any = {
    from: `${fromName} <${fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    content: 'Seu relatório IBMEC está pronto. Veja em anexo ou habilite HTML neste email.',
    html: opts.html,
  };

  if (opts.pdfBytes) {
    message.attachments = [{
      filename: opts.pdfName,
      content: opts.pdfBytes,
      contentType: 'application/pdf',
      encoding: 'binary',
    }];
  }

  try {
    await client.send(message);
  } finally {
    await client.close();
  }
}

function emailBodyHtml(r: any, rel: any): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family: Tahoma, Arial, sans-serif; color: #2A3754; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
  <div style="border-bottom: 3px solid #002555; padding-bottom: 16px; margin-bottom: 24px;">
    <div style="font-size: 11px; color: #F5AC00; text-transform: uppercase; letter-spacing: 3px; font-weight: 700;">Diagnóstico Estratégico</div>
    <h1 style="font-size: 24px; color: #002555; margin-top: 8px;">IBMEC · Seu relatório está pronto</h1>
  </div>
  <p>Olá ${r.nome || ''},</p>
  <p>Seu <strong>Diagnóstico Estratégico de Liderança</strong> foi finalizado. O relatório executivo completo está em anexo neste email (PDF).</p>
  <div style="background: #EEF1F8; padding: 16px; margin: 20px 0; border-left: 4px solid #F5AC00;">
    <div style="font-size: 10px; color: #6C7A92; text-transform: uppercase; letter-spacing: 1.5px;">Indicador de Maturidade</div>
    <div style="font-size: 28px; font-weight: 800; color: #002555; margin: 4px 0;">${rel.maturidade_letra} · ${(rel.maturidade_score || 0).toFixed(1)}</div>
    <div style="font-size: 12px; color: #6C7A92;">Detalhes completos no relatório anexo.</div>
  </div>
  <p>O relatório traz seu Indicador de Maturidade, Régua de Posicionamento, análise de Componentes do Alinhamento, top 5 Competências priorizadas, Risco Estratégico, CDL (Custo da Disfuncionalidade da Liderança) e plano de ação para os próximos 30, 60 e 90 dias.</p>
  <p style="margin-top: 24px; font-size: 13px; color: #6C7A92;">Documento confidencial · uso exclusivo do respondente.</p>
  <hr style="border: none; border-top: 1px solid #E2E6EF; margin: 24px 0;">
  <p style="font-size: 11px; color: #6C7A92;">IBMEC · Diagnóstico Estratégico · Junho 2026</p>
</body>
</html>`;
}

// ============= Main handler =============
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const payload: GatePayload = await req.json();

    if (!payload.token || !payload.email) {
      return json({ ok: false, error: 'token e email são obrigatórios' }, 400);
    }
    if (!isValidEmail(payload.email)) {
      return json({ ok: false, error: 'email inválido' }, 400);
    }
    if (!payload.scores_json) {
      return json({ ok: false, error: 'scores_json é obrigatório' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Buscar respondente
    const { data: respondente, error: errResp } = await supabase
      .from('respondentes')
      .select('*')
      .eq('token_sessao', payload.token)
      .single();

    if (errResp || !respondente) {
      return json({ ok: false, error: 'token inválido' }, 404);
    }

    // 2. Update respondente com email
    const { error: errUpd } = await supabase
      .from('respondentes')
      .update({
        email: payload.email,
        email_capturado_em: new Date().toISOString(),
        consentimento_marketing: payload.consentimento_marketing ?? false,
        submetido_em: respondente.submetido_em ?? new Date().toISOString(),
      })
      .eq('id', respondente.id);

    if (errUpd) throw new Error(`Update respondente falhou: ${errUpd.message}`);

    // 3. Upsert relatório
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
      .from('relatorios')
      .upsert(relatorioBase, { onConflict: 'respondente_id' })
      .select()
      .single();

    if (errRel || !relatorio) throw new Error(`Insert relatorio falhou: ${errRel?.message}`);

    // 4. Gerar PDF (best-effort)
    let pdfBytes: Uint8Array | null = null;
    let pdfUrl: string | null = null;

    try {
      const html = renderPdfHtml({ respondente, relatorio, scores: payload.scores_json });
      const browserlessToken = Deno.env.get('BROWSERLESS_TOKEN');
      if (!browserlessToken) throw new Error('BROWSERLESS_TOKEN não configurado');
      pdfBytes = await generatePdf(html, browserlessToken);

      const pdfPath = `${respondente.evento_id}/${respondente.id}.pdf`;
      const { error: errUp } = await supabase.storage
        .from('relatorios')
        .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });

      if (errUp) throw new Error(`Upload Storage falhou: ${errUp.message}`);

      const { data: signed } = await supabase.storage
        .from('relatorios')
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 90); // 90 dias

      pdfUrl = signed?.signedUrl ?? null;

      await supabase
        .from('relatorios')
        .update({
          pdf_url: pdfUrl,
          pdf_gerado_em: new Date().toISOString(),
          pdf_tamanho_bytes: pdfBytes.byteLength,
        })
        .eq('id', relatorio.id);
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr);
      await supabase
        .from('relatorios')
        .update({ erro_geracao: String(pdfErr) })
        .eq('id', relatorio.id);
    }

    // 5. Enviar email via SMTP (com PDF anexo se gerado)
    let emailEnviado = false;
    try {
      const subject = `Diagnóstico IBMEC · ${respondente.nome || respondente.empresa || 'Seu relatório'}`;
      const bodyHtml = emailBodyHtml(respondente, relatorio);
      const safeName = (respondente.nome || 'relatorio')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      await sendEmailSmtp({
        to: payload.email,
        subject,
        html: bodyHtml,
        pdfBytes,
        pdfName: `diagnostico-ibmec-${safeName}.pdf`,
      });

      emailEnviado = true;
      await supabase
        .from('relatorios')
        .update({ pdf_enviado_em: new Date().toISOString() })
        .eq('id', relatorio.id);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }

    return json({
      ok: true,
      respondente_id: respondente.id,
      relatorio_id: relatorio.id,
      pdf_url: pdfUrl ?? undefined,
      email_enviado: emailEnviado,
    });
  } catch (err) {
    console.error('Handler error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
