# A ponte — as duas metades na mesma pessoa

O diagnóstico de **liderança** e o de **RH + IA** nascem de fluxos com
identidades separadas. Sem uma ponte entre eles não existe documento único:
medido em 15/09, eram 108 respondentes de um lado, 3 do outro, e **zero** pessoas
nos dois.

A ponte é isto: quem termina a liderança recebe, no e-mail de fecho, um **convite**
para a outra metade. O convite liga as duas na mesma pessoa.

## O caminho inteiro

| Onde | O quê |
|---|---|
| `gate-and-send` (edge da liderança) | emite o convite e põe o link no e-mail |
| `convite.mjs` | gera o código, calcula o hash, monta o link — testado sozinho |
| `screener_rhia_op_emitir_convite` | grava **só o sha256**, derivando a pessoa do `token_sessao` |
| e-mail | o link, com o código cru, que só existe ali |
| `frontend/rhia.mjs` | lê o código da URL e **tira-o da barra de endereço** |
| `POST /rhia/vincular` | troca o código pela ligação |
| `screener_rhia_op_vincular_por_convite` | grava o vínculo, marcado como **certo** |

## As decisões que sustentam o desenho

**Por que um convite, e não o token da liderança no link.** A regra da casa é que
token de sessão só trafega em cabeçalho. No link, o `token_sessao` ficaria em
histórico de navegador, em link compartilhado e no `Referer`. O convite é outra
coisa: opaco, de uso único, com validade, e **não dá acesso a nada** — ele só diz
de quem é aquela sessão de rhia.

**A emissão parte do token, nunca de um `respondente_id`.** O id não é segredo:
viaja no corpo de respostas da edge antiga. A RPC do banco nem aceita um id —
deriva a pessoa do token, lá dentro. Quem alcançasse a função sem isso emitiria
convite para qualquer pessoa.

**O código sai da barra de endereço assim que chega.** Ele é de uso único e não
abre nada, mas enquanto está na URL viaja em histórico, em "compartilhar esta
página" e no `Referer` de todo link clicado depois. Fica guardado no
armazenamento local até ser consumido — sem isso, um simples recarregar perderia
a ponte em silêncio, que é precisamente a falha que ela existe para evitar.

**A rota não devolve o `respondente_id`.** A RPC devolve, porque quem monta o
documento precisa. O navegador, não: o que a pessoa precisa saber é se o link
funcionou.

**Ligação certa e ligação provável não são a mesma coisa.** O convite *sabe* quem
é a pessoa; o casamento por e-mail (a rede, para quem chegou pelos dois lados em
momentos diferentes) apenas supõe. A confiança fica gravada no vínculo, e o
documento único precisa dizer qual das duas tem nas mãos.

## Três travas na emissão, e por que cada uma existe

1. **Só com os dois secrets.** Sem `SCREENER_DB_POOLER_URL` e `SCREENER_RHIA_URL`,
   a `gate-and-send` se comporta exatamente como antes. É assim que o código vai
   ao ar inerte e é ligado depois, num passo separado e reversível — o mesmo
   desenho do rate limiting do screener.
2. **Só para a Boomit.** O diagnóstico de RH + IA é produto da Boomit. Mandar o
   convite a quem respondeu um evento do IBMEC seria oferecer, com a marca deles,
   uma coisa que não é deles. Para o IBMEC a mudança tem de ser invisível — a
   mesma regra que já governa o PDF.
3. **Nunca derruba a entrega.** O relatório é o que a pessoa pediu; o convite é um
   acréscimo. Qualquer falha vira log e o e-mail sai sem o link.

## Para ligar em produção

Nenhum dos dois secrets existe hoje na `gate-and-send`, então **o código no ar é
inerte** até que sejam definidos.

1. `SCREENER_DB_POOLER_URL` — a mesma URL do transaction pooler que a edge
   `screener` já usa, com o papel **`screener_runtime`**. Nunca `postgres`, e
   nunca a `service_role` da própria função: ela não tem, e não pode ter, EXECUTE
   nas funções da ponte.
2. `SCREENER_RHIA_URL` — `https://diagnosticoboomit.netlify.app/rhia.html`.
3. Redeploy da `gate-and-send` e da `screener` (a rota `/rhia/vincular` é nova).
4. Publicar o `frontend/` (o `rhia.mjs` passou a ler o convite).

Ligar a emissão **antes** de a rota de consumo estar no ar geraria links que a
página ignora — o convite expiraria sem uso. A ordem é: edge `screener` e
frontend primeiro, `gate-and-send` e os secrets depois.

## O que ainda falta para o documento único

A ponte liga; ela não desenha. Falta o renderizador — capa com a pessoa, síntese
cruzada, as duas partes e o fecho — e **um** caminho de geração de PDF. Hoje o da
liderança sai por `browserless` na edge e o de IA sai pela impressão do navegador;
o documento único precisa de um só, e o da edge é o que já entrega por e-mail.
A leitura cruzada, que é o que justifica juntar, já está pronta em
[`screener/relatorio-unico/`](../relatorio-unico/README.md).

## Uma coisa que é decisão de produto, não de código

O convite vai no e-mail do relatório, para todo mundo que responde um evento da
Boomit — não só para quem marcou `consentimento_marketing`. A leitura por trás
disso é que o convite completa o mesmo diagnóstico que a pessoa começou naquele
evento, e não é comunicação de outra natureza. Se a leitura preferida for a
conservadora, a trava é de uma linha em `linkDaPonte`: exigir
`respondente.consentimento_marketing`.
