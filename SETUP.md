# Setup do Diagnóstico IBMEC · Backend Supabase

**Stack:** Supabase (Postgres + Storage + Edge Functions) · SMTP boomit.com.br (email) · Browserless (PDF) · Netlify (frontend)
**Custo:** US$ 0 (todos free tiers cobrem 500 respondentes em 3 dias com folga)
**Tempo estimado:** ~30 minutos para configurar tudo

---

## Passo 0 · Contas necessárias

Você já tem todas as contas:

| Serviço | Status | Para que serve |
|---|---|---|
| **Supabase** | ✅ Já tem | Banco Postgres + Edge Functions + Storage |
| **SMTP boomit.com.br** | ✅ Já tem (HostGator cPanel, conta `envio@boomit.com.br`) | Envio de email transacional |
| **Browserless** | Falta criar em [browserless.io](https://browserless.io) (~1 min) | Geração de PDF (free tier 6h/mês ≈ 4.300 PDFs) |
| **Netlify** | ✅ Já tem | Hospedagem do HTML |

---

## Passo 1 · Criar projeto Supabase

1. Em [supabase.com](https://supabase.com) → **New Project**
2. **Nome:** `ibmec-assessment`
3. **Database Password:** gere um forte e salve no seu gerenciador (você vai usar uma vez)
4. **Região:** South America (São Paulo) — `sa-east-1`
5. Aguarde ~2 minutos a provision do banco
6. Copie e guarde:
   - **Project URL** (ex: `https://abcdef.supabase.co`)
   - **anon public key** (em Settings > API)
   - **service_role key** (em Settings > API — secreta, nunca colocar no front)

---

## Passo 2 · Aplicar schema SQL

1. No painel Supabase, vá em **SQL Editor** → **New query**
2. Cole o conteúdo do arquivo `database/schema.sql`
3. Clique em **Run**
4. Espere "Success. No rows returned" — deve criar 4 tabelas + 2 views + RLS policies

**Validação:** rode `tests/smoke_test.sql` no mesmo SQL Editor. Você deve ver 8 mensagens `NOTICE: OK test X`.

Se algum teste falhar, mande o erro para eu corrigir.

---

## Passo 3 · Criar bucket Storage para PDFs

1. No painel Supabase → **Storage** → **Create a new bucket**
2. **Name:** `relatorios`
3. **Public bucket:** ❌ **NÃO marcar** (privado, acesso via URL assinada)
4. Em **Bucket policies**, adicione policy permitindo `service_role` upload (já é default)

---

## Passo 4 · SMTP boomit.com.br (já configurado)

Você já tem a caixa `envio@boomit.com.br` no HostGator/cPanel. Configurações que vamos usar:

| Campo | Valor |
|---|---|
| **SMTP_HOST** | `mail.boomit.com.br` |
| **SMTP_PORT** | `465` (SSL/TLS implícito) |
| **SMTP_USER** | `envio@boomit.com.br` |
| **SMTP_PASSWORD** | a senha da caixa (a mesma do webmail) |
| **FROM_NAME** | `Diagnóstico IBMEC` |
| **FROM_EMAIL** | `envio@boomit.com.br` |

**Como aparecerá no email do respondente:**
- Display name: **Diagnóstico IBMEC**
- Endereço (visível em "ver detalhes" do email): `envio@boomit.com.br`
- Reply-To: idem

**Boa prática para deliverability:**
- Verifique no cPanel se o domínio `boomit.com.br` tem **SPF e DKIM** habilitados (Email > E-mail Deliverability). HostGator normalmente já configura por default. Se status estiver verde, está pronto.
- Limite do HostGator em conta compartilhada: tipicamente **500 emails/hora** — cobre folgado o evento de 500 respondentes em 3 dias.

---

## Passo 5 · Setup Browserless (PDF)

1. Em [browserless.io](https://browserless.io) → criar conta
2. No dashboard, copie seu **API token**

**Alternativas se quiser trocar:**
- [PDFShift](https://pdfshift.io) — 50 PDFs grátis/mês (insuficiente para o evento)
- [HTMLCSStoImage](https://htmlcsstoimage.com) — pode adaptar Edge Function
- **Self-hosted Puppeteer no Vercel** — mais complexo, mas free tier maior

---

## Passo 6 · Configurar secrets da Edge Function

No painel Supabase → **Edge Functions** → **Manage Secrets** → **Add new secret**, adicione **6 secrets**:

| Secret | Valor |
|---|---|
| `SMTP_HOST` | `mail.boomit.com.br` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `envio@boomit.com.br` |
| `SMTP_PASSWORD` | (a senha da caixa de email) |
| `FROM_NAME` | `Diagnóstico IBMEC` |
| `FROM_EMAIL` | `envio@boomit.com.br` |
| `BROWSERLESS_TOKEN` | seu token de browserless.io |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetados automaticamente — não precisa adicionar.

---

## Passo 7 · Deploy da Edge Function

**Opção A — Via Supabase CLI (recomendado):**

```bash
# Instale Supabase CLI (uma vez)
npm install -g supabase

# Login (abre browser)
supabase login

# Link com seu projeto (cole o Project ID quando pedir)
supabase link --project-ref SEU-PROJECT-REF

# Copie a função
mkdir -p supabase/functions/gate-and-send
cp backend-supabase/functions/gate-and-send/index.ts supabase/functions/gate-and-send/

# Deploy
supabase functions deploy gate-and-send --no-verify-jwt
```

**Opção B — Via Dashboard (sem CLI):**

1. Painel Supabase → **Edge Functions** → **Create new function**
2. Nome: `gate-and-send`
3. Cole o conteúdo de `functions/gate-and-send/index.ts` no editor
4. Em **Settings > JWT verification** → desativar (já desabilitamos com `--no-verify-jwt`)
5. **Deploy**

**Teste rápido (via curl):**
```bash
curl -X POST \
  "https://SEU-PROJETO.supabase.co/functions/v1/gate-and-send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SUA-ANON-KEY" \
  -d '{"token":"00000000-0000-0000-0000-000000000000","email":"test@test.com","scores_json":{}}'
```
Deve retornar `{"ok":false,"error":"token inválido"}` — confirma que a função respondeu.

---

## Passo 8 · Configurar HTML com credenciais

1. Abra `frontend/index.html` E `frontend/admin.html`
2. Em **ambos**, procure pelo bloco:
```html
<script>
window.APP_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'SUA-ANON-KEY-AQUI',
  ...
};
</script>
```
3. Substitua `SEU-PROJETO.supabase.co` pela sua URL real do passo 1
4. Substitua `SUA-ANON-KEY-AQUI` pela anon key do passo 1
5. Salve

---

## Passo 9 · Deploy do HTML no Netlify

**Opção mais rápida — Netlify Drop:**

1. Em [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arraste o `prototipo-assessment-ibmec-supabase.html` (renomeie para `index.html` antes)
3. Em ~30s você tem uma URL `https://xxx.netlify.app`
4. Em **Site settings > Domain management** você pode trocar para um nome custom (ex: `ibmec-diagnostico.netlify.app`)

**Opção via GitHub:**

1. Crie repo no GitHub: `ibmec-assessment-frontend`
2. Suba só o `index.html`
3. Em Netlify → **Add new site > Import from Git** → selecione o repo
4. Deploy automático em push

---

## Passo 10 · Smoke test E2E

Abra a URL Netlify, preencha o assessment com dados fake:
- Nome: Test Miriam · Empresa: Test IBMEC · Cargo: Test
- Persona: Gerente · Tamanho: S2 · Setor: Educação
- LGPD ☑
- Responda as 13 perguntas
- No gate, coloque **seu email real** (para ver o relatório chegar)
- Clique "Liberar"

**Checklist:**
- [ ] Tela de resultado aparece em <5s
- [ ] Email chega na sua caixa em <60s
- [ ] PDF anexo abre corretamente
- [ ] No Supabase Dashboard → Table Editor → **respondentes**, tem 1 linha
- [ ] Em **respostas**, tem 10 linhas (10 perguntas core)
- [ ] Em **relatorios**, tem 1 linha com `pdf_enviado_em` preenchido

Se falhar em algum ponto, abra DevTools (F12) → Console e copia o erro.

---

## Passo 9b · Criar usuário admin (para acessar admin.html)

A página `frontend/admin.html` usa Supabase Auth para você acessar leads durante o evento.

1. Painel Supabase → **Authentication** → **Users** → **Add user** → **Create new user**
2. Email: `miriam@boomit.com.br`
3. Password: gere uma forte e salve no gerenciador
4. ☑ **Auto Confirm User** (pula confirmação por email)
5. **Create user**

Agora você acessa `https://[seu-netlify].netlify.app/admin.html` com esse email/senha.

⚠️ `index.html` é público (qualquer respondente acessa) · `admin.html` exige login. Não dê o link admin para os congressistas.

---

## Operação durante o evento (8–10/06)

**Caminho A — Pela página admin (recomendado):**

1. Acesse `https://[seu-netlify].netlify.app/admin.html`
2. Login com seu usuário Supabase (criado no passo 9b)
3. Dashboard mostra cards: total respondentes, finalizados, leads, PDFs enviados, erros
4. Filtre por persona/porte/setor/score/busca livre
5. Botão **Exportar CSV** baixa lista filtrada (com BOM UTF-8 para Excel ler acentos)

**Caminho B — Direto no Supabase Dashboard:**

1. Table Editor → `v_leads_export`
2. Filtros na UI
3. Botão **Export CSV** no canto

**Monitorar em tempo real:**

1. Dashboard → **Database** → **Query**
2. Cole: `SELECT * FROM v_resumo_evento;`
3. Recarregue para ver contagem atualizada

**Se algo der errado:**

- Edge Function logs: Supabase Dashboard → **Edge Functions** → `gate-and-send` → **Logs**
- SMTP: cPanel HostGator → ver fila de email da conta `envio@boomit.com.br`
- Browserless: dashboard Browserless → uso de horas

---

## LGPD · pedido de exclusão de dados

Se algum respondente pedir exclusão dos dados durante ou depois do evento:

```sql
-- No SQL Editor, substitua o email:
delete from public.respondentes where email = 'pessoa@email.com';
-- cascade já remove respostas e relatorios via FK on delete cascade
```

---

## 