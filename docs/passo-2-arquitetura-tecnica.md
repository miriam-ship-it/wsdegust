# Passo 2 — Arquitetura Técnica e Stack (v2 — Python)

**Projeto:** Assessment Interativo de Liderança e Gestão
**Decisões travadas no diálogo com Miriam:**
- ✅ Stack Python (Django/FastAPI) — Django + DRF
- ✅ Sem CRM externo — captura de lead via email + export interno
- ✅ **Email obrigatório no FINAL** para liberar resultado (pedir email para liberar resposta)
- ✅ Retenção LGPD: 18 meses para dados identificáveis
- ✅ **TUDO grátis** — investimento total ≤ US$ 100 (one-time, ex: domínio)
- ✅ **Evento dura 3 dias** — escala de ~300-500 respondentes total, infraestrutura free tier basta com folga

**Premissas que vêm do Passo 1:**
- Web app + PDF instantâneo (≤10s pós-submit)
- 4 personas × 4 tamanhos × 8 segmentos
- Benchmark de mercado curado (catálogo v1.1: 47 entradas, 22 fontes)
- Multi-empresa, escala não definida → enxuto + escalável

---

## 1. Princípios da arquitetura

1. **Python como base** — backend, scoring, PDF tudo na mesma linguagem. Reduz cognitive overhead e facilita data tooling futuro.
2. **Postgres como verdade única** — uma fonte de dados; dados de respondente, catálogo de benchmark e operacionais no mesmo banco.
3. **Servidor único, não serverless** — Django consolidado é mais simples de operar em piloto que arquitetura distribuída. Escalamos depois.
4. **Reprodutibilidade** — todo relatório guarda versão do catálogo, do questionário e do motor de scoring.
5. **Free-tier first** — escolhas favorecem provedores com free tier robusto (Render, Neon, Brevo).

---

## 2. Stack recomendada (revisada para Python)

| Camada | Escolha | Por quê |
| :----- | :------ | :------ |
| **Backend** | **Django 5 + Django REST Framework** | Admin panel pronto para curador do catálogo editar fontes; ORM maduro; migrations versionadas; auth built-in; ecossistema BR forte |
| **Frontend** | **React 18 + Vite + Tailwind + shadcn/ui** | SPA leve (não precisa SSR para assessment de 5min); build estático servido pelo Django ou CDN |
| **Gráficos** | **Recharts** (radar, barras) | Já no toolkit; SVG nativo, ótimo para impressão |
| **Banco** | **PostgreSQL 16** (managed) | Mesma escolha do plano anterior; psycopg3 como driver |
| **PDF** | **WeasyPrint** | HTML/CSS → PDF, qualidade profissional, suporta SVG embed dos gráficos; pure Python; perfeito para templates |
| **Templates PDF** | **Jinja2** | Mesmo engine do Django; um template por persona |
| **Auth** | **Django auth + django-otp (magic link)** | Simples; só precisamos para área admin do curador; respondentes ficam anônimos até dar email no final |
| **Email** | **django-anymail + Brevo (ex-Sendinblue)** | Brevo tem 300 emails/dia free e servidor BR-friendly; troca de provedor em 1 linha de config |
| **Filas / tasks** | **Django-Q2** ou **Celery + Redis** | Geração de PDF roda assíncrono; Django-Q2 é mais leve para piloto |
| **Storage** | **Backend S3-compatible** (Backblaze B2 free tier ou Cloudflare R2) | Bucket para PDFs gerados; URL assinada com TTL 90 dias |
| **Hospedagem** | **Render.com** (free tier inicial → Starter US$7/mês quando crescer) | Suporta Django + Postgres + Redis no mesmo painel; região São Paulo disponível; deploy via git |
| **Alternativa hosting** | **Fly.io** ou **Railway** | Similar, ambos com região GRU/GIG |
| **CI/CD** | **GitHub Actions** | pytest + ruff + black + mypy rodando em PR; deploy automático ao merge |
| **Observabilidade** | **Sentry (free) + Django logs** | Errors em Sentry; logs no Render |
| **CAPTCHA** | **Cloudflare Turnstile** | Free, invisível, evita bot no formulário público |

**Custo total do projeto (evento de 3 dias, ≤500 respondentes):** **US$ 0** infraestrutura.

Único custo opcional one-time: domínio próprio `.com.br` (~R$ 40/ano) ou subdomínio gratuito do Render/Fly.io. **Cap absoluto: US$ 100** — restante de budget reservado para emergência (ex: upgrade temporário no dia do evento).

| Serviço | Free tier usado | Capacidade folgada para evento |
| :------ | :-------------- | :----------------------------- |
| **Render Free** | 750h/mês, sleep após 15min | UptimeRobot pinga a cada 5min → fica acordado |
| **Alternativa: Fly.io Free** | 3 micro VMs 24/7 grátis | Sem sleep, região GRU disponível |
| Neon Postgres | 0.5GB, 191h compute/mês | Cobre 500 respondentes folgado |
| Brevo Email | 300/dia, ~9000/mês | Suficiente para 500 envios em 3 dias |
| Backblaze B2 | 10GB storage + 1GB egress/dia | PDFs ~300KB → 30k arquivos cabem |
| Cloudflare Turnstile | Ilimitado | Sem custo |
| Sentry Free | 5k eventos/mês | Cobre piloto sem ajuste |
| GitHub Actions | 2000 min/mês public repo | Cobre CI sem ajuste |

**Plano B no dia D** caso algo apertar: domínio é só DNS, podemos trocar de host em 10 minutos. Stack toda containerizada (Dockerfile) → deploy em qualquer cloud.

---

## 3. Diagrama de arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USUÁRIO (FEIRA / EVENTO)                   │
│              tablet / celular / desktop  —  ≤5 min                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
        ┌──────────────────────────────────────────────────┐
        │  Cloudflare CDN + Turnstile (CAPTCHA invisível)  │
        └────────────────────┬─────────────────────────────┘
                             │
                             ▼
        ┌──────────────────────────────────────────────────┐
        │             RENDER.COM (região GRU — SP)         │
        │                                                  │
        │  ┌────────────────────────────────────────────┐  │
        │  │  React SPA (Vite build)                    │  │
        │  │  servido como estático pelo Django         │  │
        │  │  /            → identificação (s/ email)   │  │
        │  │  /assessment  → 13 perguntas, 1 por tela   │  │
        │  │  /capture     → tela de captura de email   │  │
        │  │  /resultado/[id] → dashboard interativo    │  │
        │  └─────────────────┬──────────────────────────┘  │
        │                    │ /api/...                    │
        │                    ▼                             │
        │  ┌────────────────────────────────────────────┐  │
        │  │  Django 5 + DRF (Gunicorn + Uvicorn)       │  │
        │  │  • apps:                                   │  │
        │  │    - assessments (modelos + endpoints)     │  │
        │  │    - scoring     (engine de score+gap)     │  │
        │  │    - benchmark   (lookup + fallback)       │  │
        │  │    - reports     (geração PDF + storage)   │  │
        │  │    - catalog     (admin do curador)        │  │
        │  └─────────────────┬──────────────────────────┘  │
        │                    │                             │
        │  ┌─────────────────▼──────────────────────────┐  │
        │  │  Django-Q2 worker (tasks assíncronas)      │  │
        │  │  • generate_pdf_task                       │  │
        │  │  • send_report_email_task                  │  │
        │  └─────────────────┬──────────────────────────┘  │
        │                    │                             │
        │  ┌─────────────────▼──────────────────────────┐  │
        │  │  PostgreSQL 16 (Neon — região SA)          │  │
        │  │  + extensão pg_trgm (busca empresas)       │  │
        │  │  Tabelas core: 7 (ver §4)                  │  │
        │  │  Materialized view: agregado por empresa   │  │
        │  └────────────────────────────────────────────┘  │
        └────────────────────┬─────────────────────────────┘
                             │
                             ▼
        ┌──────────────────────────────────────────────────┐
        │  Storage S3-compat                               │
        │  • Backblaze B2: bucket relatorios-pdf/          │
        │  • URL assinada com TTL 90 dias                  │
        └──────────────────────────────────────────────────┘
                             │
                             ▼
        ┌──────────────────────────────────────────────────┐
        │  Brevo (transactional email + atachment do PDF)  │
        └──────────────────────────────────────────────────┘
```

---

## 4. Modelo de dados (Django models + Postgres schema)

Sete tabelas core + uma view materializada. Apresento como **Django models** (a linguagem do projeto) — o Django gera o SQL via migrations.

### 4.1 Models Django

```python
# assessments/models.py
import uuid
from django.db import models

class Evento(models.Model):
    """Programa/treinamento/feira — congela versão do catálogo."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=200)
    inicio_em = models.DateField()
    fim_em = models.DateField(null=True, blank=True)
    cohort_id = models.CharField(max_length=100, blank=True)
    catalogo_versao = models.CharField(max_length=20)  # 'v1.1'
    criado_em = models.DateTimeField(auto_now_add=True)


class Empresa(models.Model):
    """Multi-tenant lógico. Persona, tamanho e segmento NÃO entram em score."""
    TAMANHO_CHOICES = [('S1','S1'),('S2','S2'),('S3','S3'),('S4','S4')]
    SEGMENTO_CHOICES = [(f'V{i}', f'V{i}') for i in range(1,10)]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=200)
    cnpj = models.CharField(max_length=18, blank=True)
    tamanho = models.CharField(max_length=2, choices=TAMANHO_CHOICES)
    segmento = models.CharField(max_length=2, choices=SEGMENTO_CHOICES)
    evento = models.ForeignKey(Evento, on_delete=models.PROTECT, related_name='empresas')
    criada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['segmento', 'tamanho']),
            models.Index(fields=['evento']),
        ]


class Respondente(models.Model):
    """Email é OPCIONAL — só é capturado no final, após o preenchimento."""
    PERSONA_CHOICES = [('A','Analista'), ('C','Coordenador'),
                       ('G','Gerente/Diretor'), ('X','C-Level')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE)
    evento = models.ForeignKey(Evento, on_delete=models.PROTECT)
    nome = models.CharField(max_length=200, blank=True)
    cargo = models.CharField(max_length=200, blank=True)
    persona = models.CharField(max_length=1, choices=PERSONA_CHOICES)

    # Email opcional, capturado APÓS preencher o assessment
    email = models.EmailField(blank=True, null=True)
    email_capturado_em = models.DateTimeField(null=True, blank=True)

    consentimento_lgpd = models.BooleanField(default=False)
    iniciado_em = models.DateTimeField(auto_now_add=True)
    submetido_em = models.DateTimeField(null=True, blank=True)
    tempo_segundos = models.IntegerField(null=True, blank=True)
    versao_questionario = models.CharField(max_length=20)  # 'q-v1.0'
    token_sessao = models.UUIDField(default=uuid.uuid4, unique=True)  # acesso anônimo ao próprio resultado

    class Meta:
        indexes = [
            models.Index(fields=['empresa']),
            models.Index(fields=['persona']),
            models.Index(fields=['token_sessao']),
        ]


class Resposta(models.Model):
    """Uma linha por pergunta respondida."""
    DIMENSAO_CHOICES = [(f'D{i}', f'D{i}') for i in range(1,6)]
    LENTE_CHOICES = [('pessoa','pessoa'), ('empresa','empresa')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    respondente = models.ForeignKey(Respondente, on_delete=models.CASCADE,
                                    related_name='respostas')
    pergunta_id = models.CharField(max_length=50)  # ex 'D2-empresa-G'
    dimensao = models.CharField(max_length=2, choices=DIMENSAO_CHOICES)
    lente = models.CharField(max_length=10, choices=LENTE_CHOICES)
    valor = models.IntegerField()  # 1-5 (Likert)
    confianca = models.IntegerField(null=True, blank=True)  # calibração 1-5
    respondida_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['respondente', 'dimensao'])]
        constraints = [
            models.CheckConstraint(check=models.Q(valor__gte=1, valor__lte=5),
                                   name='valor_likert_valido'),
        ]


class BenchmarkCatalog(models.Model):
    """Carregado a partir do CSV v1.1. Tabela imutável após release."""
    NIVEL_CHOICES = [('alta','alta'), ('media','media'), ('baixa','baixa')]

    id = models.IntegerField(primary_key=True)  # mantém ID do CSV
    versao = models.CharField(max_length=20)  # 'v1.1'
    dimensao = models.CharField(max_length=2)
    persona = models.CharField(max_length=10)   # 'A','C','G','X','ALL','A_C'
    tamanho = models.CharField(max_length=10)   # 'S1'...'S2-S3'...'ALL'
    segmento = models.CharField(max_length=10)  # 'V1'...'ALL'...'ALL_BR'
    score_mediano = models.DecimalField(max_digits=3, decimal_places=2)
    quartil_1 = models.DecimalField(max_digits=3, decimal_places=2,
                                    null=True, blank=True)
    quartil_3 = models.DecimalField(max_digits=3, decimal_places=2,
                                    null=True, blank=True)
    fonte_id = models.CharField(max_length=10)
    fonte_nome = models.CharField(max_length=200)
    ano = models.IntegerField()
    nivel_confianca = models.CharField(max_length=10, choices=NIVEL_CHOICES)
    nota_normalizacao = models.TextField(blank=True)
    url_fonte = models.URLField(max_length=500)

    class Meta:
        indexes = [models.Index(fields=['versao','dimensao','persona',
                                        'tamanho','segmento'])]


class VersaoCatalogo(models.Model):
    """Changelog do catálogo."""
    versao = models.CharField(max_length=20, primary_key=True)
    publicada_em = models.DateField()
    n_entradas = models.IntegerField()
    n_fontes = models.IntegerField()
    changelog = models.TextField()


class Relatorio(models.Model):
    """Snapshot do que foi gerado — versão tripla congelada."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    respondente = models.OneToOneField(Respondente, on_delete=models.PROTECT)
    catalogo_versao = models.CharField(max_length=20)
    questionario_versao = models.CharField(max_length=20)
    motor_versao = models.CharField(max_length=20)
    scores_json = models.JSONField()       # {D1: {pessoa, empresa, gap}, ...}
    benchmarks_json = models.JSONField()   # {D1: {fonte, gap_mercado}, ...}
    bandeiras_json = models.JSONField()    # {D3: 'amarela', ...}
    pdf_url = models.URLField(max_length=500, blank=True)
    pdf_expira_em = models.DateTimeField(null=True, blank=True)
    gerado_em = models.DateTimeField(auto_now_add=True)
```

### 4.2 Materialized view (gap cross-hierárquico)

```sql
-- migration crua (RunSQL no Django) — refresca quando a empresa atinge ≥3 respondentes
CREATE MATERIALIZED VIEW mv_agregado_empresa AS
SELECT
  r.empresa_id,
  resp.persona,
  resp.dimensao,
  resp.lente,
  AVG(resp.valor)::NUMERIC(3,2) AS media,
  COUNT(*) AS n_respostas
FROM assessments_resposta resp
JOIN assessments_respondente r ON r.id = resp.respondente_id
WHERE r.submetido_em IS NOT NULL
GROUP BY r.empresa_id, resp.persona, resp.dimensao, resp.lente;
CREATE UNIQUE INDEX idx_mv_unq ON mv_agregado_empresa(empresa_id, persona, dimensao, lente);
```

### 4.3 Permissões e isolamento

Como respondentes ficam **anônimos até dar email no final**, o acesso ao próprio resultado é via `token_sessao` (UUID gerado no início). O Django expõe endpoint `/api/resultado/<token>/` que valida o token sem precisar de auth.

**Admin do catálogo** usa Django Admin tradicional, com login/senha — apenas o curador (1-2 pessoas) tem acesso.

---

## 5. Fluxos principais (revisados — email só no final)

### 5.1 Fluxo de preenchimento

```
1. / (landing + identificação)
   • Campos: nome, empresa, cargo, persona, tamanho, segmento
   • SEM EMAIL nesta tela (reduz atrito inicial)
   • CAPTCHA Turnstile invisível
   • Aceita LGPD (checkbox)
   • Cria respondente (email=null) + empresa (upsert)
   • Retorna token_sessao no localStorage

2. /assessment (13 perguntas, 1 por tela)
   • Cada resposta = POST /api/respostas (otimista)
   • Barra de progresso, tempo médio
   • Ordem aleatorizada por seed do respondente_id (reprodutível)

3. /assessment/finalizar (botão "Ver meu resultado")
   • Marca submetido_em
   • Dispara generate_pdf_task assíncrono (Django-Q2)
   • Redireciona para /gate

4. /gate (GATE OBRIGATÓRIO — email LIBERA o resultado)
   • Headline: "Seu diagnóstico está pronto."
   • Sub: "Informe seu email para receber o relatório completo e
          liberar o acesso aos seus resultados."
   • Campo email (obrigatório) + checkbox LGPD re-confirmação
   • CAPTCHA Turnstile
   • Botão único: [Liberar resultado]
   • Ao enviar:
       - salva respondente.email + email_capturado_em
       - dispara send_report_email_task (envia PDF anexo)
       - libera acesso ao /resultado
   • SEM "ver sem enviar" — email é mandatório

5. /resultado/[token]
   • Polling de 2s no GET /api/relatorio/<token>
   • Quando pronto, renderiza dashboard interativo (Recharts)
   • Botões: [Baixar PDF] [Reenviar por email]
   • Sem CRM webhook — exportação manual no admin (CSV)
```

### 5.2 Por que email-gate no final (e não no início)

Decisão da Miriam: email **libera** o resultado. Combina dois benefícios:

| Vantagem | Mecanismo |
| :------- | :-------- |
| Conversão de preenchimento alta | Atrito zero no início — respondente já investiu 5min antes de "pagar" com o email |
| Lead 100% qualificado | Quem chegou ao final já está engajado; gate força conversão sem desperdiçar leads frios |
| Reduz LGPD load | Dados pessoais coletados só de quem efetivamente quer o relatório |
| Hook de valor concreto | "Pronto, agora libera" — gatilho psicológico forte de fechamento |

**Trade-off honesto:** alguns respondentes vão preencher 13 perguntas e abandonar no `/gate`. Para esses, a empresa fica com **dados agregados anonimizados** (úteis para benchmark interno) mas sem lead. Aceitável.

**Mitigação contra abandono no gate:** preview ofuscado no `/gate` mostrando "Score geral: ★★★★☆ (revelado após email)" — cria curiosidade sem dar tudo.

### 5.3 Pipeline de geração do relatório

```
POST /api/assessment/submeter
  ↓
generate_pdf_task (Django-Q2, ~6-8s total)
  │
  ├─ compute_score()       (~100ms)
  │    Lê respostas → calcula Pᵢ, Eᵢ, Gapᵢ por dimensão
  │    Persiste em relatorio.scores_json
  │
  ├─ apply_benchmark()     (~150ms)
  │    Para cada Dᵢ: lookup com cascata de 5 fallbacks no catalog
  │    Calcula GapMercadoᵢ, define bandeiras 🟢🟡🔴
  │    Persiste em relatorio.benchmarks_json + bandeiras_json
  │
  ├─ render_pdf()          (~3-5s)
  │    Carrega template Jinja2 da persona (4 templates: A/C/G/X)
  │    WeasyPrint renderiza HTML/CSS → PDF
  │    Gráficos SVG inline (Recharts no React não roda; usar matplotlib
  │    ou bibliotecas SVG puras no backend)
  │
  └─ upload_pdf()          (~300ms)
       Upload no Backblaze B2 → URL assinada (TTL 90 dias)
       Atualiza relatorio.pdf_url
```

Quando email é capturado depois (passo 4 do fluxo §5.1), dispara:
```
send_report_email_task (Django-Q2, ~1s)
  └─ Brevo envia email com PDF anexo
```

### 5.4 Algoritmo de fallback do benchmark (Python)

```python
# benchmark/services.py
from django.db.models import Q
from .models import BenchmarkCatalog

def lookup_benchmark(versao: str, dimensao: str, persona: str,
                     tamanho: str, segmento: str) -> dict:
    """
    Cascata de 5 níveis de fallback. Retorna primeiro hit.
    Quando não acha, retorna marker 'sem_benchmark'.
    """
    cascades = [
        {'persona': persona,  'tamanho': tamanho,  'segmento': segmento},
        {'persona': persona,  'tamanho': 'ALL',    'segmento': segmento},
        {'persona': persona,  'tamanho': tamanho,  'segmento': 'ALL'},
        {'persona': persona,  'tamanho': 'ALL',    'segmento': 'ALL'},
        {'persona': 'ALL',    'tamanho': 'ALL',    'segmento': 'ALL'},
    ]

    nivel_order = {'alta': 0, 'media': 1, 'baixa': 2}

    for idx, cut in enumerate(cascades):
        # 'persona' aceita match exato OR 'ALL' OR 'A_C' se persona in (A,C)
        persona_q = Q(persona=cut['persona']) | Q(persona='ALL')
        if cut['persona'] in ('A', 'C'):
            persona_q |= Q(persona='A_C')

        # 'tamanho' aceita match exato OR ranges como 'S2-S3' contendo S2
        tamanho_q = Q(tamanho=cut['tamanho'])
        if cut['tamanho'].startswith('S'):
            tamanho_q |= Q(tamanho__contains=cut['tamanho'])

        hits = BenchmarkCatalog.objects.filter(
            versao=versao,
            dimensao=dimensao,
        ).filter(persona_q).filter(tamanho_q).filter(
            segmento=cut['segmento']
        )

        if hits.exists():
            # Ordena por nível de confiança (alta > media > baixa)
            best = sorted(hits, key=lambda x: nivel_order[x.nivel_confianca])[0]
            return {
                'score_mediano': float(best.score_mediano),
                'fonte_id': best.fonte_id,
                'fonte_nome': best.fonte_nome,
                'nivel_confianca': best.nivel_confianca,
                'escopo_aplicado': cut,
                'cascata_nivel': idx,  # 0=exato, 4=fallback global
            }

    return {'tipo': 'sem_benchmark',
            'mensagem': 'Amostra de mercado em formação'}
```

---

## 6. Geração de PDF — WeasyPrint + Jinja2

### 6.1 Stack escolhida e por quê

| Opção | Prós | Contras | Veredito |
| :---- | :--- | :------ | :------- |
| **WeasyPrint** | HTML/CSS profissional, suporta SVG, pure Python | ~3-5s para 8 páginas | ✅ **Escolhida** |
| ReportLab | Mais rápido, controle pixel-perfect | Layout mais difícil, escrever em código | ❌ Layout custa caro |
| Playwright headless | Render igual ao web | Pesado (~Chromium), overkill | ❌ Não justifica |
| pdfkit (wkhtmltopdf) | Maduro | Projeto morto, sem update | ❌ Sem futuro |

### 6.2 Estrutura dos templates

```
reports/
└─ templates/reports/
   ├─ base.html              # estrutura comum, CSS print
   ├─ pdf_analista.html      # extende base, copy de A
   ├─ pdf_coordenador.html   # extende base, copy de C
   ├─ pdf_gerente.html       # extende base, copy de G
   ├─ pdf_clevel.html        # extende base, copy de X
   └─ components/
      ├─ capa.html
      ├─ sumario.html
      ├─ radar.html          # SVG gerado por pygal ou matplotlib
      ├─ tabela_gaps.html
      ├─ bandeiras.html
      ├─ benchmark_mercado.html
      ├─ recomendacoes.html
      ├─ custo_desconexao.html
      └─ fontes.html
```

### 6.3 Performance

- Pre-cache da CSS compilada no startup do worker
- Fonts em base64 inline (evita download a cada render)
- Gráficos como SVG inline gerados via **pygal** (Python nativo, SVG limpo)
- PDF final ~250-400KB

---

## 7. Captura e gestão de lead (sem CRM externo)

### 7.1 Como funciona sem CRM

Decisão da Miriam: não usar CRM nesta v1. Substituição:

1. **Email capturado no gate** (mandatório) fica em `respondentes.email` + `email_capturado_em`
2. **Admin Django** lista todos os respondentes com filtros: persona, segmento, score crítico, presença de bandeira vermelha
3. **Export CSV** sob demanda — o operador do programa baixa lista qualificada quando quiser (durante e após os 3 dias)
4. **Email transacional automático** (o relatório em si) já é o primeiro contato

Em 3 dias com ~500 respondentes, expectativa realista de conversão no gate é **70-85%** = 350-425 leads efetivos. O resto fica como dados agregados anônimos.

### 7.2 Tela de admin do operador do programa

```
Django Admin → /admin/assessments/respondente/

Filtros disponíveis:
  ☐ Persona: [A] [C] [G] [X]
  ☐ Tamanho: [S1] [S2] [S3] [S4]
  ☐ Segmento: [V1] [V2] ... [V9]
  ☐ Tem email: [sim] [não]
  ☐ Score geral: [< 2.5] [2.5–3.5] [> 3.5]
  ☐ Bandeira vermelha em D[1-5]
  ☐ Evento: [seleção]

Ações em lote:
  • Exportar CSV (com scores e bandeiras)
  • Reenviar relatório por email
  • Marcar como "contatado"
```

### 7.3 Lógica de qualificação (sem ação automática)

- **🔥 Quente** = score <3.0 + ≥1 bandeira vermelha → operador prioriza contato (email já existe pois é gate mandatório)
- **🌡️ Morno** = score 3.0-3.5 → seguindo o programa
- **❄️ Frio** = abandonou no gate (sem email) → entra só em dados agregados, sem contato possível

Quando quiser integrar a um CRM no futuro (v2), basta adicionar `webhook_url` no model `Evento` e disparar POST no submit. Modelo de dados já preparado.

---

## 8. Performance e escala (calibrado para evento de 3 dias)

| Métrica | Alvo evento 3d | Mecanismo |
| :------ | :------------- | :-------- |
| Pico de concurrent users | 20-30 | Free tier aguenta com folga |
| Tempo de carregamento inicial | <2s | SPA estático + CDN Cloudflare |
| Tempo entre perguntas | <200ms | API DRF leve, INSERT otimista |
| Tempo de geração de PDF | <8s | Django-Q2 worker dedicado |
| Volume total do evento | 300-500 | Free tier coberto folgado |
| Picos por dia | ~150-200 | Plot abre/almoço/encerra |

**Plano antifragility no evento de 3 dias:**

- **UptimeRobot** (free) pinga `/health` a cada 5min → Render free não dorme
- **Pre-warm worker** ao iniciar dia do evento (script `make warm`)
- **PDF cache via fallback HTML** caso WeasyPrint falhar (`/resultado` exibe HTML printable se PDF não estiver pronto em 12s)
- **Plano B de hosting** com Dockerfile pronto → deploy em Fly.io ou Railway em 10min se Render der problema
- **Monitor em tempo real** durante evento: Sentry ativo + dashboard Render aberto + checklist horário

Ao final dos 3 dias, sistema fica online em modo "consulta" (admin export, reenvio de email). Após 30 dias sem uso, pode hibernar.

---

## 9. LGPD e segurança

### 9.1 Compliance LGPD

- **Consentimento explícito** na entrada (sem email) e re-confirmado na captura final
- **Email é opcional** — respondente pode ver resultado sem fornecer (reduz exposição)
- **Finalidades declaradas:** (i) gerar relatório, (ii) envio do PDF (se email fornecido), (iii) benchmark anonimizado de programa (futuro)
- **Retenção:** 18 meses para dados identificáveis (decisão da Miriam #4); respostas anonimizadas mantidas para benchmark interno
- **Direito de acesso/exclusão:** endpoint `/api/conta/exclusao` (POST com token_sessao + confirmação por email se houver) + processo manual no admin
- **Encarregado (DPO):** a definir; sugestão: DPO da Boomit ou contato dedicado do programa
- **Pseudonimização** automática após 18 meses: script Django command `anonimizar_respondentes_expirados` removendo email/nome/cargo

### 9.2 Segurança

- **HTTPS obrigatório** (Render + Cloudflare automático)
- **CSRF tokens** padrão Django
- **Rate limit** por IP: `django-ratelimit` 10 req/min no `/api/respondentes/` (criação) e 5 req/min no `/api/capture-email/`
- **Turnstile** invisível na criação de respondente
- **Secrets** em env vars Render, nunca em código
- **Auditoria:** Sentry para erros; Django logs estruturados (json) para análise

---

## 10. Versionamento e reprodutibilidade

Mantém o tripé do plano anterior:

- `catalogo_versao` (`v1.1`) — qual snapshot do `BenchmarkCatalog`
- `questionario_versao` (`q-v1.0`) — quais perguntas e ordem
- `motor_versao` (`engine-v1.0`) — quais pesos e fórmulas

Cada `Relatorio` guarda os três. Daqui a 24 meses, qualquer auditoria reconstrói exatamente o cálculo.

---

## 11. CI/CD e testes (atende à preferência "testes antes do commit")

### 11.1 Pipeline GitHub Actions

```yaml
# .github/workflows/ci.yml
on: [pull_request, push]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: {POSTGRES_PASSWORD: ci, POSTGRES_DB: assessment_test}
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: '3.12'}
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check .                  # linter rápido
      - run: black --check .               # formatação
      - run: mypy backend/                 # types
      - run: pytest --cov=backend --cov-fail-under=85
      - run: python manage.py makemigrations --check  # migrations consistentes
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST $RENDER_DEPLOY_HOOK
```

### 11.2 Cobertura de testes mínima

| Camada | Cobertura | Foco |
| :----- | :-------- | :--- |
| Scoring engine | 95% | toda fórmula, fixtures por persona/segmento |
| Fallback de benchmark | 100% | 5 níveis de cascata + caso "sem dado" |
| API endpoints | 90% | criação, persistência, captura de email final |
| Render do PDF | snapshot test | mudança visual exige aprovação manual |
| LGPD flows | 100% | submit sem consentimento falha; exclusão funciona |
| Admin do curador | 80% | export CSV correto, filtros corretos |

Sem teste verde, sem deploy.

---

## 12. Roadmap de implementação

| Sprint | Entregas | Duração |
| :----- | :------- | :------ |
| **S1** | Setup Render+Neon, models Django, migrations, seed do catálogo v1.1, admin do curador | 1 semana |
| **S2** | SPA React + Vite, telas de identificação e assessment, persistência otimista | 1 semana |
| **S3** | Engine de scoring + fallback de benchmark + bandeiras (com testes 95%) | 1 semana |
| **S4** | Geração de PDF (4 templates persona) com WeasyPrint + dashboard de resultado | 1.5 semanas |
| **S5** | Tela de captura de email + envio Brevo + admin com filtros e export CSV | 0.5 semana |
| **S6** | Testes E2E (Playwright), hardening LGPD, piloto interno (10 respondentes) | 1 semana |
| **S7** | Piloto controlado (100 respondentes em ambiente real) + ajustes | 1 semana |
| **GA** | Release oficial para o programa | — |

**Total ao GA: ~7 semanas** (1 dev Python full-time + design part-time).

---

## 13. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
| :---- | :------------ | :------ | :-------- |
| Conversão no gate menor que 70% | Média | Alto | Copy do gate testada com 5 usuários antes do evento; preview ofuscado para criar curiosidade |
| WeasyPrint lento em pico | Média | Médio | Pre-warm worker; fallback HTML printable se >12s |
| Render free dorme (cold start 30s) | Média | Médio | UptimeRobot ping 5min; **Plano B: Fly.io free 24/7 sem sleep** |
| Neon free estourar (0.5GB) | Baixa | Baixo | 500 respostas × ~5KB = 2.5MB total. Folga gigante. |
| Brevo 300/dia estourar em pico | Baixa | Médio | Fila com retry; alternativa Resend (100/d) ou Mailtrap |
| Bot/spam | Alta | Baixo | Turnstile + rate limit + IP throttle |
| LGPD: pedido de exclusão durante evento | Baixa | Alto | Endpoint funcional + processo manual documentado |
| Versão do motor/catálogo quebra relatório antigo | Baixa | Médio | Versionamento descrito em §10 |
| Internet ruim no local do evento | Média | Alto | App SPA cache local; respostas guardadas em IndexedDB; sincroniza ao voltar |
| Falha total no provider no dia D | Baixa | Crítico | Dockerfile testado em 2 providers (Render + Fly); DNS muda em 10min |

---

## 14. Próximos passos (para aprovação)

Tudo travado para iniciar o **Passo 3 — Modelagem das perguntas e escalas**. Antes:

1. **Operador do admin** — quem terá acesso ao Django Admin do programa? Apenas Miriam? Time Boomit? (Define se precisa de auth por grupo/permissão ou superuser único basta.)
2. **Data do evento** — quando exatamente? Define o pacing dos 7 sprints e se preciso comprimir o plano (ex: piloto interno reduzido).
3. **Domínio** — usa subdomínio grátis do Render (`assessment-xpto.onrender.com`) ou Boomit registra um `.com.br` próprio (~R$ 40/ano)?

Com isso confirmado, **Passo 3** entrega: 13 perguntas finalizadas (calibradas por persona), escala Likert 1-5 com âncoras escritas, ordem de apresentação, perguntas de calibração de confiança, dados como tabela `Pergunta` no Django pronta para popular via `loaddata`.
