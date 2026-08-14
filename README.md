# IBMEC · Diagnóstico Estratégico de Liderança

Aplicação web para o evento IBMEC de 8 a 10 de junho de 2026. Diagnóstico de 5 minutos que entrega ao respondente um relatório executivo personalizado (PDF) com indicador de maturidade, régua de posicionamento, CDL, plano de ação.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML single-file (Krub/Google Fonts) hospedado em Netlify |
| Banco | Supabase Postgres (4 tabelas + RLS) |
| API | Supabase Edge Function (Deno + denomailer) |
| PDF | Browserless.io (HTML → PDF via API) |
| Email | SMTP boomit.com.br (envio@boomit.com.br) |
| Storage | Supabase Storage (bucket `relatorios`, 90 dias) |

## Estrutura

```
ibmec-assessment/
├── README.md                  (este arquivo)
├── SETUP.md                   (passo-a-passo completo de configuração)
├── .gitignore
├── frontend/
│   └── index.html             (protótipo white-label IBMEC, self-contained)
├── supabase/
│   ├── functions/
│   │   └── gate-and-send/
│   │       └── index.ts       (Edge Function: PDF + email)
│   ├── migrations/
│   │   └── 20260526000001_schema_inicial.sql
│   └── smoke_test.sql         (testes manuais pós-deploy)
├── brand-ibmec/
│   ├── README.md
│   ├── palette.json           (paleta oficial Pantone 655/1235/2387)
│   ├── css/brand.css          (CSS variables prontas)
│   └── logos/                 (5 versões: positiva, negativa, sobre amarelo/royal/símbolo)
├── docs/
│   ├── passo-1-publico-e-modelo.md
│   ├── passo-2-arquitetura-tecnica.md
│   ├── passo-3-perguntas-calibradas.md
│   ├── briefing-comercial-assessment.md
│   ├── catalogo-benchmark-fontes-publicas.md
│   └── benchmark_catalog_v1.csv
└── scripts/
    └── deploy-edge.ps1        (deploy da Edge Function via PowerShell)
```

## Setup rápido

Leia `SETUP.md` para o passo-a-passo completo. Resumo:

1. **Aplicar schema** no SQL Editor do Supabase (cole `supabase/migrations/20260526000001_schema_inicial.sql`)
2. **Criar bucket `relatorios`** no Storage (privado)
3. **Configurar secrets** em Edge Functions > Manage Secrets (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, FROM_NAME, FROM_EMAIL, BROWSERLESS_TOKEN)
4. **Deploy Edge Function** via PowerShell: `.\scripts\deploy-edge.ps1`
5. **Editar `frontend/index.html`** com Project URL + anon key (bloco `window.APP_CONFIG`)
6. **Subir `frontend/index.html`** no Netlify (drag & drop em [app.netlify.com/drop](https://app.netlify.com/drop))
7. **Smoke test** preenchendo o assessment com email seu

## Cronograma

- **26/05 ter:** setup contas + schema + Edge Function deployed
- **27/05 qua:** integração frontend + smoke test inicial
- **28/05 qui:** admin para export CSV + LGPD + ajustes
- **29/05 sex:** smoke test E2E + docs operacionais → **funcional**
- **8-10/06:** evento

## Operação durante o evento

Export de leads em CSV pelo Supabase Dashboard:
1. Table Editor > `v_leads_export` (view com filtros prontos)
2. Botão Export CSV no canto

Dashboard ao vivo: `SELECT * FROM v_resumo_evento;` no SQL Editor.

## LGPD

Retenção 18 meses para dados identificáveis. Exclusão sob demanda:
```sql
DELETE FROM public.respondentes WHERE email = 'pessoa@email.com';
-- cascade limpa respostas e relatorios automaticamente
```

---

**Contato técnico:** miriam@boomit.com.br
**Cliente:** IBMEC
**Evento:** 8-10/06/2026
