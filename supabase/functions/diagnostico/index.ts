// =============================================================
// Edge Function: diagnostico — Diagnóstico Boomit (slug `diagnosticoboomit`)
//
// POR QUE UMA FUNÇÃO NOVA, e não um ramo dentro da `gate-and-send`:
//   a gate-and-send atende IBMEC e a degustação em PRODUÇÃO. Enfiar um terceiro
//   instrumento, com outro motor, outro documento e outro contrato de payload
//   dentro dela transformaria qualquer erro deste evento em incidente daqueles.
//   O briefing pede isolamento entre eventos — isolar também o código é a
//   forma mais barata de garanti-lo. `gate-and-send` fica intocada.
//
// DUAS AÇÕES:
//   { acao: 'catalogo' }  → o evento + a projeção pública das 40 questões.
//   { acao: 'finalizar' } → grava e-mail, RECALCULA do banco, monta a
//                           devolutiva, gera o PDF, envia e devolve o
//                           resultado sanitizado para a tela.
//
// 🔒 O SERVIDOR CALCULA. O navegador nunca manda resultado: ele manda o token
//    e o e-mail. As respostas já estão no banco (o front grava uma a uma com
//    o cabeçalho x-sessao), então não há nada de fora em que confiar.
//
// 🔒 O catálogo NÃO é embutido no HTML publicado: ele chega por aqui, em
//    runtime. É a mesma fronteira que `screener/motor/fronteira-de-publicacao`
//    já provava para o instrumento V1.
//
// 🔒 ESCOPO DE EVENTO. Todo respondente tocado aqui tem que pertencer ao
//    evento `diagnosticoboomit`. Token de outro evento é recusado — mesmo
//    sendo um token válido. É o que impede esta função de virar uma porta
//    lateral para os dados do IBMEC.
// =============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// `_motor/` e GERADO por scripts/preparar-edge-diagnostico.mjs a partir de
// screener/publico/ — a mesma fonte dos testes. Nao editar ali: a pasta e
// ignorada pelo git e recriada a cada deploy, e um teste reprova se a copia
// divergir da fonte.
import { projecaoPublica, versoes, definicao } from "./_motor/definicao.mjs";
import { calcular, publicar } from "./_motor/motor.mjs";
import { montarDevolutiva } from "./_motor/devolutiva.mjs";
import { renderRelatorio, renderEmail } from "./_motor/relatorio-html.mjs";

const EVENTO_SLUG = "diagnosticoboomit";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function emailValido(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function dataPt(d = new Date()) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function gerarPdf(html: string, token: string): Promise<Uint8Array> {
  const resp = await fetch(`https://chrome.browserless.io/pdf?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      // As margens vivem no @page do próprio documento: zerar aqui evita que
      // o Browserless some as duas e corte a última linha de cada página.
      options: { format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } },
      gotoOptions: { waitUntil: "networkidle0" },
    }),
  });
  if (!resp.ok) throw new Error(`Browserless ${resp.status}: ${await resp.text()}`);
  return new Uint8Array(await resp.arrayBuffer());
}

async function enviarEmail(opts: { to: string; toName: string; subject: string; html: string; pdf: Uint8Array | null; pdfName: string }) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY nao configurado");
  const body: any = {
    sender: { name: "Diagnostico Boomit", email: Deno.env.get("FROM_EMAIL") || "envio@boomit.com.br" },
    to: [{ email: opts.to, name: opts.toName || opts.to }],
    subject: opts.subject,
    htmlContent: opts.html,
  };
  if (opts.pdf) body.attachment = [{ name: opts.pdfName, content: uint8ToBase64(opts.pdf) }];
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return json({ ok: false, error: "corpo invalido" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // -----------------------------------------------------------
  // catálogo — público, sem token
  // -----------------------------------------------------------
  if (corpo.acao === "catalogo") {
    const { data: evento, error } = await supabase
      .from("eventos")
      .select("id, slug, nome, cliente, catalogo_versao, questionario_versao, ativo")
      .eq("slug", EVENTO_SLUG)
      .eq("ativo", true)
      .maybeSingle();
    if (error) return json({ ok: false, error: "falha ao resolver o evento" }, 500);
    if (!evento) return json({ ok: false, error: "evento_inativo" }, 404);
    return json({
      ok: true,
      evento: {
        id: evento.id,
        slug: evento.slug,
        nome: evento.nome,
        cliente: evento.cliente,
        catalogo_versao: evento.catalogo_versao,
        questionario_versao: evento.questionario_versao,
      },
      instrumento: projecaoPublica(),
    });
  }

  // -----------------------------------------------------------
  // finalizar — gate, cálculo, PDF e envio
  // -----------------------------------------------------------
  if (corpo.acao !== "finalizar") return json({ ok: false, error: "acao desconhecida" }, 400);

  const token = String(corpo.token || "");
  const email = String(corpo.email || "").trim();
  if (!token || !email) return json({ ok: false, error: "token e email obrigatorios" }, 400);
  if (!emailValido(email)) return json({ ok: false, error: "email invalido" }, 400);

  try {
    const { data: respondente, error: errResp } = await supabase
      .from("respondentes")
      .select("id, evento_id, nome, empresa, cargo, submetido_em, versao_questionario, iniciado_em")
      .eq("token_sessao", token)
      .maybeSingle();
    if (errResp) throw new Error(`Ler respondente: ${errResp.message}`);
    if (!respondente) return json({ ok: false, error: "token invalido" }, 404);

    // 🔒 A trava de escopo. Um token do IBMEC é um token válido — e não pode
    //    ser processado aqui, nem lido de volta pela resposta desta função.
    const { data: evento } = await supabase
      .from("eventos")
      .select("id, slug, nome, cliente, catalogo_versao, questionario_versao")
      .eq("id", respondente.evento_id)
      .single();
    if (!evento || evento.slug !== EVENTO_SLUG) {
      return json({ ok: false, error: "token nao pertence a este evento" }, 403);
    }

    const { data: linhas, error: errLinhas } = await supabase
      .from("respostas")
      .select("pergunta_id, opcao_codigo, texto_livre")
      .eq("respondente_id", respondente.id);
    if (errLinhas) throw new Error(`Ler respostas: ${errLinhas.message}`);

    const respostas: Record<string, string> = {};
    // 🔒 Texto digitado por quem responde. Ele é DADO: entra no perfil como
    //    texto escapado e não toca em calculo nenhum.
    const textos: Record<string, string> = {};
    for (const l of linhas ?? []) {
      if (!l.pergunta_id || !l.opcao_codigo) continue;
      respostas[l.pergunta_id] = l.opcao_codigo;
      if (l.texto_livre) textos[l.pergunta_id] = l.texto_livre;
    }

    // Completude: os 40 itens ativos têm que estar respondidos. Sem isso, a
    // devolutiva sairia falando de cobertura que a pessoa não deu.
    const faltantes = definicao()
      .itens.filter((i: any) => i.ativo && !respostas[i.codigo])
      .map((i: any) => i.codigo);
    if (faltantes.length) {
      return json({ ok: false, error: "respostas_incompletas", faltantes }, 409);
    }

    const agora = new Date().toISOString();
    const { error: errUpd } = await supabase
      .from("respondentes")
      .update({
        email,
        email_capturado_em: agora,
        consentimento_marketing: corpo.consentimento_marketing ?? false,
        submetido_em: respondente.submetido_em ?? agora,
        tempo_segundos: respondente.iniciado_em
          ? Math.max(0, Math.round((Date.now() - new Date(respondente.iniciado_em).getTime()) / 1000))
          : null,
      })
      .eq("id", respondente.id);
    if (errUpd) throw new Error(`Update respondente: ${errUpd.message}`);

    const resultado = calcular(respostas, undefined, textos);
    const pub = publicar(resultado);
    const contexto = {
      evento_nome: evento.nome,
      evento_cliente: evento.cliente,
      nome: respondente.nome,
      empresa: respondente.empresa,
      data: dataPt(),
    };
    const devolutiva = montarDevolutiva(pub, respostas, contexto);

    const v = versoes();
    const { data: relatorio, error: errRel } = await supabase
      .from("relatorios")
      .upsert(
        {
          respondente_id: respondente.id,
          catalogo_versao: evento.catalogo_versao,
          questionario_versao: evento.questionario_versao,
          motor_versao: v.motor,
          // 🔒 O bruto do servidor, com as versões congeladas. `maturidade_*`
          //    fica NULL de propósito enquanto E1–E4 não for confirmado:
          //    gravar um número provisório nessas colunas faria o painel e o
          //    export tratá-lo como validado.
          scores_json: { ...resultado, definicao_sha256: v.definicao_sha256, evento_slug: evento.slug },
          maturidade_letra: null,
          maturidade_score: null,
        },
        { onConflict: "respondente_id" }
      )
      .select()
      .single();
    if (errRel || !relatorio) throw new Error(`Insert relatorio: ${errRel?.message}`);

    // ---- PDF ----
    let pdf: Uint8Array | null = null;
    let pdfUrl: string | null = null;
    const nomeArquivo = `diagnostico-boomit-${respondente.id}.pdf`;
    try {
      const bl = Deno.env.get("BROWSERLESS_TOKEN");
      if (!bl) throw new Error("BROWSERLESS_TOKEN nao configurado");
      pdf = await gerarPdf(renderRelatorio(devolutiva), bl);
      const caminho = `${EVENTO_SLUG}/${nomeArquivo}`;
      const { error: errUp } = await supabase.storage
        .from("relatorios")
        .upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
      if (errUp) throw new Error(`Storage: ${errUp.message}`);
      const { data: signed } = await supabase.storage.from("relatorios").createSignedUrl(caminho, 60 * 60 * 24 * 90);
      pdfUrl = signed?.signedUrl ?? null;
      await supabase
        .from("relatorios")
        .update({ pdf_url: pdfUrl, pdf_gerado_em: new Date().toISOString(), pdf_tamanho_bytes: pdf.length, erro_geracao: null })
        .eq("id", relatorio.id);
    } catch (e) {
      // 🔑 Falha de PDF NÃO derruba a entrega: a tela de resultado já é a
      //    devolutiva completa. O erro fica registrado para o painel.
      console.error("diagnostico: falha no PDF", String(e));
      await supabase.from("relatorios").update({ erro_geracao: String(e) }).eq("id", relatorio.id);
      pdf = null;
    }

    // ---- e-mail ----
    let emailEnviado = false;
    try {
      await enviarEmail({
        to: email,
        toName: respondente.nome ?? "",
        subject: `${evento.nome} — sua devolutiva`,
        html: renderEmail(devolutiva, contexto),
        pdf,
        pdfName: nomeArquivo,
      });
      emailEnviado = true;
      await supabase.from("relatorios").update({ pdf_enviado_em: new Date().toISOString() }).eq("id", relatorio.id);
    } catch (e) {
      console.error("diagnostico: falha no e-mail", String(e));
      await supabase
        .from("relatorios")
        .update({ erro_geracao: `${relatorio.erro_geracao ?? ""} | email: ${String(e)}`.trim() })
        .eq("id", relatorio.id);
    }

    return json({
      ok: true,
      respondente_id: respondente.id,
      relatorio_id: relatorio.id,
      pdf_url: pdfUrl,
      pdf_gerado: pdf != null,
      email_enviado: emailEnviado,
      resultado: pub,
      devolutiva,
    });
  } catch (e) {
    console.error("diagnostico: erro", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});
