# Diagnóstico Boomit — RH, Desenvolvimento e IA ("rhia")

Módulo do `wsdegust` que entrega o **Diagnóstico Boomit — RH, Desenvolvimento e IA**
como degustação pública: 30 questões literais do pacote aprovado, motor
determinístico do pacote rodando na edge, devolutiva executiva sem notas, e
portão de lead no servidor.

> **Estado:** construído e testado; **nada aplicado à produção**. As migrations
> desta pasta trazem o cabeçalho "NÃO APLICADA À PRODUÇÃO" e o roteiro de
> colocação no ar está em [DEPLOY.md](./DEPLOY.md), sob autorização por passo.

## O que é

Uma leitura orientativa, baseada em evidências comportamentais autodeclaradas,
sobre como uma **área** integra estratégia, dados, conhecimento sobre pessoas e
adoção responsável de IA para orientar decisões de desenvolvimento e gerar valor
organizacional. Quem responde escolhe o próprio papel (RH, CEO, liderança de
negócio, especialista, outro), mas analisa a área do início ao fim.

O resultado posiciona a área em uma de cinco referências públicas — Operacional
Ágil, Gestor Tático, Estrategista de Escala, Arquiteto de Soluções, Criador de
Tecnologia — e entrega assinatura, sustentadores, limitadores, tensões, gate de
governança, rota NIST, plano 30–60–90, indicadores, perguntas executivas e
disclaimer. Sem notas por dimensão, sem radar, sem pontos, sem pesos.

## O que NÃO é

- **Não usa LLM** para pontuar nem para redigir. O motor é determinístico e a
  biblioteca editorial é fixa (`pacote/src/output-definition-v2.mjs`).
- **Não é benchmark.** Não compara com mercado, não gera percentil, não inventa
  estatística.
- **Não é diagnóstico conclusivo, avaliação individual, auditoria nem prova de
  ROI.** É hipótese orientativa. Os limites estão em
  [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md).
- **Não reescreve o instrumento.** As 30 questões e alternativas são as do JSON,
  verbatim; a apresentação pública só remove o que é interno.

## Arquitetura

O CONTEÚDO é do pacote; o SERVIDOR é o da casa (mesmo padrão do screener V1).
O motor roda na edge; o navegador nunca recebe pontos-base, pesos, códigos de
estágio ou respostas de volta como número — só o modelo público do motor.

```
navegador (frontend/rhia.html + rhia.mjs + rhia.css)
   │  questões chegam pela edge (nunca embutidas no HTML)
   │  token só em header x-session-token; credencial só em x-preview-key
   ▼
edge Supabase — função `screener`, rotas /rhia/*
   (screener/edge/handlers-rhia.mjs ← screener/rhia/definicao.mjs + logica.mjs
    + pacote/src/output-engine-v2.mjs)
   │  valida resposta e submissão; calcula o contrato; projeta o público
   │  conecta como `screener_runtime` (só EXECUTE nas RPC)
   ▼
RPC SECURITY DEFINER  screener_rhia_op_{start,resume,save_response,finalize,get_result,capturar_lead,get_binding}
   (supabase/migrations/20260912120000_screener_rhia_tabelas_e_rpc.sql; dono screener_owner)
   │  valida item/opção contra a definição gravada; canônico; snapshot imutável; gate de lead
   ▼
tabelas  screener_rhia_sessions · screener_rhia_responses
         screener_rhia_result_snapshots · screener_rhia_leads
   (RLS ligado; anon/authenticated/service_role/screener_runtime sem acesso direto)
```

Pontos fixos:

- **Identidade do instrumento:** `boomit_rh_ia_maturity_v1` / `1.0.0-rc.1`. A
  definição gravada em `screener_instrument_versions` é o JSON verbatim; o
  checksum é sha256 da serialização canônica (chaves ordenadas), o mesmo
  `canonicalize` do motor V1, reimplementado sem `node:` para rodar na edge.
- **Evento público:** slug `boomit-degustacao-rh-ia`, status `public_pilot`,
  `lead_capture_mode = required_before_result`, retenção 180 dias (sessão) e
  365 dias (lead), `branding {}`.
- **Portão de lead no servidor:** `POST /rhia/submit` calcula e grava o snapshot,
  mas responde só `{ submitted, lead_required }`; `GET /rhia/result` devolve 403
  até `POST /rhia/lead`. Não dá para pular o portão pelo cliente.
- **Regra da casa:** o que existe não se sobrescreve. O V1 (`screener/motor`,
  `screener/instrumento`, `handlers.mjs`, `logica.mjs`, `frontend/screener.*`) é
  intocável; o rhia entrou por caminho novo, com só dois pontos de roteamento
  compartilhados (`screener/edge/http.mjs` e `supabase/functions/screener/index.ts`).

## Comandos

Na raiz do repositório:

| Comando | O que faz |
|---|---|
| `npm run setup` | **Uma vez, num clone novo.** Instala o pglite (o banco de desenvolvimento), que vive em `screener/loader/behavioral`. Sem ele, `npm run dev`, `npm run test:dev` e `npm run test:behavioral` não rodam. |
| `npm run dev` | Sobe `http://localhost:4600` servindo `frontend/` e montando `/functions/v1/screener/*` sobre um Postgres efêmero (pglite) com as migrations `20260902143339`, `20260903120000`, `20260904120000`, `20260905120000`, `20260912120000` e `20260913120000`. Abra **http://localhost:4600/rhia.html**. O dev server injeta `window.SCREENER_RHIA_CONFIG` em `rhia.html` só em dev; o arquivo não é editado. CORS liberado só para localhost. |
| `npm run preview` | Só o estático de `frontend/`, em `http://localhost:4601` (sem edge; serve para conferir layout e impressão). |
| `npm test` | Testes estáticos: núcleo rhia, frontend rhia, gerador de carga rhia, edge, motor V1, frontend V1, loader V1. |
| `npm run test:behavioral` | Testes de comportamento contra pglite (`screener/loader/behavioral/*.behavioral.test.mjs`) — exigem `npm run setup` antes. |
| `npm run test:dev` | Sobe o dev server numa porta livre e percorre o fluxo inteiro por HTTP real (30 respostas, portão de lead, resultado). |
| `npm run build` | `npm test` + a prova de fronteira (`screener/rhia/fronteira-rhia.test.mjs`). Não há bundling: o Netlify publica `frontend/` como está (`netlify.toml`). |

Testes por pasta, sem o `package.json`:

```bash
node --test screener/rhia/*.test.mjs
node --test frontend/rhia.test.mjs
node --test screener/loader/gerar-carga-rhia.test.mjs
cd screener/loader/behavioral && node --test rhia-rpc.behavioral.test.mjs edge-rhia.behavioral.test.mjs carga-rhia.behavioral.test.mjs
```

## Estrutura

```
screener/rhia/
├── README.md                     este arquivo
├── CONTRATO.md                   contrato de construção (referência de cada módulo)
├── DECISOES.md                   decisões de UI (rastreadas às skills Boomit) e de arquitetura
├── LIMITES-METODOLOGICOS.md      o que o screener não afirma; agenda de validação
├── DEPLOY.md                     roteiro de colocação no ar, sob autorização
├── definicao.mjs                 instrumento (JSON verbatim), canonicalize, checksum(), apresentacaoPublica()
├── logica.mjs                    validarResposta, validarSubmissao, canonico, calcularContrato, paraPublico
├── definicao.test.mjs · logica.test.mjs · fronteira-rhia.test.mjs
└── pacote/                       fonte de verdade, verbatim (ver precedência abaixo)
    ├── instrumento-rh-ia-v1.json
    ├── src/output-engine-v2.mjs · output-definition-v2.mjs · result-contract-v2.schema.json
    ├── tests/output-engine-v2.test.mjs
    └── PROMPT-CLAUDE-CONSTRUIR-V2.md · ARQUITETURA-DEVOLUTIVA-V2.md · CHECKLIST-DE-ACEITE.md
        AMOSTRA-RESULTADO-V2.md · README.md · REFERENCIA-EDITORIAL-OUTPUTS-BOOMIT.docx

screener/edge/handlers-rhia.mjs               7 handlers + rotasRhia
screener/edge/http.mjs                        + métodos das rotas /rhia/* (único toque no V1)
supabase/functions/screener/index.ts          + import e roteamento /rhia/* (único toque no V1)
supabase/migrations/20260912120000_screener_rhia_tabelas_e_rpc.sql
supabase/migrations/20260913120000_screener_rhia_carga_publica.sql
screener/loader/gerar-carga-rhia.mjs (+ .test.mjs)
screener/loader/behavioral/{rhia-rpc,edge-rhia,carga-rhia}.behavioral.test.mjs
frontend/rhia.html · rhia.mjs · rhia.css · rhia.test.mjs
scripts/dev-rhia.mjs · scripts/preview-static.mjs · scripts/dev-rhia.test.mjs
package.json (raiz)
```

## Precedência das fontes

Em conflito, vale a de cima (ordem do `PROMPT-CLAUDE-CONSTRUIR-V2.md`):

1. `pacote/instrumento-rh-ia-v1.json` — 30 questões literais; não se reescreve.
2. `pacote/src/output-engine-v2.mjs` — motor determinístico; importado sem
   alterar semântica.
3. `pacote/src/output-definition-v2.mjs` — nomenclatura e biblioteca editorial.
4. `pacote/ARQUITETURA-DEVOLUTIVA-V2.md` — experiência e interpretação.
5. `pacote/src/result-contract-v2.schema.json` — contrato da saída.
6. `pacote/CHECKLIST-DE-ACEITE.md` — definição de pronto.

Ambiguidade não bloqueante segue o motor e fica registrada em
[DECISOES.md](./DECISOES.md). Conteúdo aprovado não se altera "para melhorar a UX".

## Fronteira de publicação

O Netlify publica só `frontend/`. `screener/rhia/fronteira-rhia.test.mjs` prova
que nenhum arquivo de `frontend/` contém os enunciados, os ids de item ou o
código do instrumento rhia: as questões chegam pela edge. Isso mantém o
instrumento fora do ar como arquivo estático e permite trocar de versão sem
republicar o site.
