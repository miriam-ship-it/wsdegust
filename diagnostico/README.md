# Diagnóstico Boomit · documento operacional

Screener público de 40 itens sobre gestão de pessoas, processos e decisão de IA.
Roda como **evento próprio** dentro do banco compartilhado, com link dedicado.

| | |
|---|---|
| **Link do respondente** | https://diagnosticoboomit.netlify.app |
| **Painel** | https://diagnosticoboomit.netlify.app/admin.html |
| **Slug do evento** | `diagnosticoboomit` |
| **Nome / cliente** | Diagnóstico Boomit · Boomit |
| **Janela** | link permanente (sem `inicio_em` / `fim_em`) |
| **Questionário** | `screener-publico-v1` |
| **Catálogo** | `blueprint-40-final` |
| **Motor** | `engine-screener-publico-v1-provisorio` |
| **Supabase** | `klnpnjumogojspubyabi` (o mesmo do IBMEC e da degustação) |
| **Edge Function** | `diagnostico` |
| **Netlify** | projeto `diagnosticoboomit`, separado do site principal |

---

## ⚠️ O que ainda não pode ir para o mercado

**A nota numérica de maturidade não é publicada.** O documento aprovado informa
que E1–E4 "Pontua", mas **não define os valores numéricos**. Enquanto isso não
for confirmado por quem aprovou o instrumento:

- o motor calcula tudo internamente e grava o resultado bruto em `relatorios`;
- `publicar()` remove toda pontuação antes de servir — tela, PDF e e-mail saem
  **sem nota**;
- `relatorios.maturidade_letra` e `maturidade_score` gravam `null` de propósito,
  para que painel e export nunca tratem um número provisório como validado;
- o export **não tem coluna de temperatura de lead**: ela dependeria da nota.

A devolutiva continua completa: evidência relatada, hipótese, consequência
possível, verificação e prioridade — mais o gate de governança, que é regra
aprovada e não depende de número.

**Para publicar a nota**, depois de confirmado o mapeamento:

1. em `screener/publico/instrumento/DIAGNOSTICO_BOOMIT_40.json`, ajuste
   `pontuacao.mapa_provisorio` e vire `pontuacao.e1_e4_confirmado` para `true`;
2. troque `versoes.motor` para tirar o sufixo `-provisorio` (os relatórios já
   gerados continuam rastreáveis pela versão antiga);
3. `npm run build:diagnostico` e `npm run deploy:diagnostico`;
4. os testes que hoje exigem `nota_publicavel === false` vão reprovar — **isso é
   proposital**. Atualize-os junto, de forma consciente.

---

## Estrutura

```
diagnostico/
├── netlify.toml       config do projeto Netlify (base directory = diagnostico)
├── build.mjs          monta public/ a partir de src/ + frontend/
├── servir.mjs         servidor local, porta 4700
├── src/               o site: questionário, painel, estilo, lógica pura
├── public/            GERADO — nunca editar, nunca versionar
├── fronteira.test.mjs prova que o publicado não carrega o instrumento
└── logica.test.mjs    lógica do questionário e do painel

screener/publico/      PRIVADO — nunca vai ao ar
├── fonte/             extração literal do blueprint, com sha256 do .xlsx
├── instrumento/       o instrumento aprovado + o módulo ESM gerado dele
├── definicao.mjs      carga e projeção pública (lista branca de chaves)
├── motor.mjs          pontuação, N/A, gate, duas lentes
├── conteudo-devolutiva.mjs  a leitura autoral por item
├── devolutiva.mjs     as sete páginas
└── relatorio-html.mjs o documento e o e-mail

supabase/functions/diagnostico/   a edge (o motor roda aqui, nunca no navegador)
```

## Comandos

```bash
npm test                      # 317 testes, o repositório inteiro
npm run build:diagnostico     # regenera o instrumento embutido e monta public/
node diagnostico/servir.mjs   # http://localhost:4700
npm run deploy:diagnostico    # prepara _motor/ e faz deploy da edge
```

Publicar o site:

```bash
npx netlify-cli deploy --prod --dir=diagnostico/public --site=diagnosticoboomit --no-build
```

> **Pendência de configuração:** o projeto Netlify foi criado e recebeu um
> deploy manual, então o link já está no ar. Ele **ainda não está ligado ao
> GitHub** — isso é um passo único na interface do Netlify: *Project
> configuration → Build & deploy → Link repository*, apontando para
> `miriam-ship-it/wsdegust` com **Base directory `diagnostico`**. O
> `diagnostico/netlify.toml` já traz comando e pasta de publicação; depois
> disso, todo push passa a publicar sozinho.

---

## Desativar o evento sem apagar nada

```sql
update public.eventos set ativo = false where slug = 'diagnosticoboomit';
```

O link para de resolver o evento (o front filtra por `ativo = true` e a edge
devolve `evento_inativo`), e a policy de insert de anon deixa de aceitar
respondente novo. **Respondentes, respostas, relatórios e PDFs já gravados
permanecem**, e o painel continua lendo. Para reabrir, `set ativo = true`.

## Excluir os dados de uma pessoa (LGPD)

```sql
delete from public.respondentes
where email = 'pessoa@email.com'
  and evento_id = (select id from public.eventos where slug = 'diagnosticoboomit');
```

O `and evento_id` não é enfeite: **o mesmo e-mail pode existir em outro evento**,
e sem ele o delete levaria junto o respondente do IBMEC. Respostas e relatório
saem por cascade; o PDF no Storage fica em `relatorios/diagnosticoboomit/` e é
removido em separado — **o banco recusa `delete` direto em `storage.objects`**,
de propósito, para não deixar arquivo órfão. Vai pela API do Storage:

```bash
curl -X DELETE "https://klnpnjumogojspubyabi.supabase.co/storage/v1/object/relatorios" \
  -H "apikey: $SERVICE_ROLE" \
  -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{"prefixes":["diagnosticoboomit/diagnostico-boomit-<respondente_id>.pdf"]}'
```

> A `supabase storage rm` da CLI responde `{"deleted":[]}` sem apagar nada neste
> projeto — não confie no silêncio dela; confira com
> `select count(*) from storage.objects where name like 'diagnosticoboomit/%'`.

---

## Como o isolamento entre eventos é sustentado

Quatro níveis, todos verificados no teste de ponta a ponta:

1. **Seleção do evento** — o front resolve por `slug = 'diagnosticoboomit'` e
   `ativo = true`. Nunca por nome, e-mail ou empresa, que se repetem entre
   eventos.
2. **Criação do respondente** — nasce com o `evento_id` dessa linha. A policy
   `respondentes_anon_insert_evento_ativo` recusa evento inativo.
3. **Sessão** — o token viaja no cabeçalho `x-sessao` e a RLS devolve **só a
   própria linha**. Sem cabeçalho, zero linha; com token de outra pessoa,
   zero linha.
4. **Administração e export** — `v_diagnosticoboomit_export` filtra por slug
   **dentro da view**, roda com `security_invoker` e não tem `select` para
   `anon`. O painel exige Supabase Auth, e `eventos_do_usuario()` ainda filtra
   por e-mail do JWT.

A edge tem uma quinta trava: um token válido **de outro evento** é recusado com
403 antes de qualquer leitura de respostas.

## Segredos

Ficam todos em Edge Functions → Manage Secrets, nunca no front:
`BREVO_API_KEY`, `BROWSERLESS_TOKEN`, `FROM_EMAIL`.
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pelo Supabase.
No HTML só existe a **anon key**, que é publicável.

---

## O instrumento

40 itens, na estrutura aprovada:

| Bloco | Itens | Função |
|---|---|---|
| Contexto e autoridade | 3 | perfil — **não pontua** |
| Estratégia do negócio e pessoas | 6 | 20% |
| Liderança e funcionalidade | 10 | 20%, em **duas lentes** (Pessoa e Organização) |
| Processos e dados | 6 | 20% |
| Decisão e implementação de IA | 6 | 20% |
| Competências, capacidade e organização futura | 6 | 20% |
| Governança | 3 | **gate**, não pontos |

Regras que o motor implementa e os testes protegem:

- **N/A fica fora do numerador e do denominador.** Não é baixa maturidade. Bloco
  sem cobertura mínima (50%) recebe `null`, nunca zero, e sai da média.
- **Governança é gate**: a pior condição entre GOV01–GOV03 governa a leitura de
  prontidão e não é compensada por resultado alto nos demais blocos.
- **Liderança nunca colapsa numa média** — as duas lentes são reportadas
  separadas, porque o desalinhamento entre elas é o que interessa à conversa.
- **IA01** distingue inação (E1) de discussão sem caminho **e** de não adoção
  conscientemente justificada com revisão prevista (E2). IA01, IA02 e IA03
  permanecem itens separados.

### Correções rastreadas do blueprint

Estão registradas em `correcoes_rastreadas`, dentro do próprio instrumento, com
motivo e origem — nenhuma é edição silenciosa:

| Item | O que havia | O que foi feito |
|---|---|---|
| **EST06** | enunciado **vazio** na aba `Questões` | recuperado literal da aba `Documento aprovado`, parágrafo 60, que o próprio blueprint declara fonte de auditoria |
| **FUT04** | repetia as alternativas do FUT05 (tempo liberado), que não correspondem ao seu enunciado | conjunto correto fornecido por Miriam em 21/09/2026 |
| **CTX01/OUTRO** | `"Outro — abrir campo de texto"` | o trecho após o travessão é instrução de implementação, não texto a exibir: a alternativa é `"Outro"` e a instrução virou o atributo `texto_livre` |

---

## Pendências que dependem de decisão humana

1. **Valores numéricos de E1–E4.** Bloqueia a publicação da nota. Ver o topo
   deste documento.
2. **Ligar o projeto Netlify ao GitHub.** Passo único na interface; hoje o site
   sobe por deploy manual.
3. **Domínio próprio.** Hoje é `diagnosticoboomit.netlify.app`. Apontar um
   subdomínio de `boomit.com.br` é configuração de DNS mais um passo no Netlify.
4. **Revisão editorial da leitura autoral.** `conteudo-devolutiva.mjs` tem uma
   hipótese, uma consequência e uma verificação para cada um dos 37 itens
   pontuáveis. Os textos seguem a voz da casa e a linguagem condicional exigida,
   mas **não passaram por revisão de quem assina o método**.
