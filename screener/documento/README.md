# O documento — a tela e o PDF, um renderizador só

O PDF do documento único sai pela edge, pelo mesmo serviço de impressão que o
relatório de liderança já usa há meses. O que muda em relação ao que existe é
uma coisa só, e é a que importa:

> **O PDF e a tela saem do MESMO renderizador.**

Não é preferência de arquitetura. Esta base já teve dois renderizadores para o
mesmo diagnóstico, e eles divergiram: a tela do relatório de liderança dizia
**R$ 39k–91k** e o PDF dizia **R$ 62k–273k** para a mesma pessoa — por meses, sem
ninguém notar. Duas implementações do mesmo documento divergem do mesmo jeito que
duas fórmulas; só que a divergência aparece em layout, que é mais fácil de não
ver.

Há teste que reprova se o corpo do documento imprimível deixar de ser
**byte a byte** o da tela.

## As peças

| Arquivo | O quê |
|---|---|
| [`imprimivel.mjs`](./imprimivel.mjs) | envolve `renderUnificado` num documento autocontido |
| [`pdf.mjs`](./pdf.mjs) | a chamada ao serviço de impressão, isolada para testar sem rede |
| `estilo.mjs` | **gerado** de `frontend/*.css` — não edite |

## O CSS é gerado, e o teste reprova se ficar velho

O documento precisa do estilo embutido: quem o abre é o navegador do serviço de
impressão, sem acesso aos `<link>` do site. `scripts/gerar-estilo-documento.mjs`
concatena os três `.css` de `frontend/` na mesma ordem em que o HTML os carrega.

```bash
node scripts/gerar-estilo-documento.mjs
```

A fonte de verdade continua sendo os `.css`. O módulo gerado mora **fora** do
diretório publicado: o CSS já vai ao navegador pelos `<link>`, e publicá-lo de
novo como JavaScript seria pagar duas vezes pela mesma folha.

Se o teste `o CSS do documento está EM DIA` reprovar, é porque alguém mexeu no
visual da tela e o PDF continuaria com o antigo. Rode o gerador.

## Três coisas que só existem no papel

**Tema claro forçado.** O serviço de impressão pode herdar o tema escuro do
sistema onde roda. Sem `data-theme="light"`, sai um PDF preto.

**`print-color-adjust: exact` nas barras.** Sem isso o navegador economiza tinta
e as barras imprimem vazias — o gráfico vira uma lista de números.

**Sem formulário de contato.** No papel não há onde clicar, e um formulário
impresso é ruído com aparência de tarefa pendente.

## O que a chamada ao serviço nunca registra

O HTML tem nome, empresa e cargo de uma pessoa, e o token é credencial. Quando o
serviço falha, o que atravessa é **só o status** — o corpo do erro pode ecoar
trechos do documento enviado. Teste com uma asserção de que o nome não aparece na
mensagem.

## O que falta para isto rodar de verdade

Duas coisas, e as duas são a mesma raiz: **a edge serve UM instrumento só**.

1. **O seletor de instrumento.** `getStartRhia` e `postStartRhia` chamam
   `apresentacaoPublica()` sem argumento — sempre o pacote local — e
   `instrumentoConfere` devolve 409 para qualquer vínculo que aponte para outro.
   Enquanto isso não mudar, não existe sessão do formulário único, e sem sessão
   não há o que imprimir.
2. **O CHECK do snapshot.** `screener_rhia_snap_contract` exige
   `result->'public'->>'version' = '2.0.0-pilot'`. O resultado unificado tem
   outra forma, então guardá-lo exige migration — revisada, como as outras.

Depois disso, a rota de PDF é curta: ler o resultado, `documentoImprimivel`,
`gerarPdf`, e o envio por e-mail que a `gate-and-send` já sabe fazer.

O secret do serviço de impressão (`BROWSERLESS_TOKEN`) existe hoje só na
`gate-and-send`. `gerarPdf` recusa sem ele, com mensagem própria — não com um 500
genérico —, então o código entra inerte, como tudo o mais desta trilha.
