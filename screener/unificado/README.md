# O formulário único — as duas metades na mesma sentada

Decisão da dona do produto, 16/09: **um formulário só, com tudo integrado**, no
pipeline novo. É a saída (b) do
[`relatorio-unico`](../relatorio-unico/README.md) — a que exige mais construção e
entrega a experiência mais limpa: uma identidade, um documento, nenhum casamento
entre bases.

## O que a pessoa responde

| Bloco | Quantas | De onde vem |
|---|---|---|
| Perfil | 6 campos | o que a liderança sempre pediu no começo |
| Contexto | 3 | pacote de IA (`CTX01–03`) |
| Liderança | 10 | extraídos **verbatim** do formulário no ar |
| RH e IA | 27 | pacote de IA |
| **Total de respostas** | **40** | mais os 6 campos de perfil |

São 40 respostas, não 43 — o "30" do diagnóstico de IA **inclui** as três de
contexto.

## As três decisões que sustentam o desenho

**Composição, não cópia.** A metade de IA entra **por referência** ao instrumento
do pacote. Nada é copiado, nada é reescrito, e o manifesto SHA256 continua
conferindo o que sempre conferiu. Nenhuma contagem de itens aparece como número
no código: os totais são derivados.

**O V1 da liderança não é tocado.** Continua rodando, por evento e com token, no
app antigo. Este é caminho novo, ao lado — a regra da casa.

**Os dois motores continuam inteiros.** Este módulo não recalcula nada: ele
separa as respostas e entrega a cada motor o que é dele. Uma terceira
implementação da mesma conta é exatamente como as fórmulas se separam sem
ninguém perceber — foi o que aconteceu entre a tela e o PDF da liderança, com
uma dizendo R$ 39k–91k e a outra R$ 62k–273k para a mesma pessoa.

## O que muda em relação ao rhia de hoje

**O ponto de liderança deixa de viajar até o navegador.** No app antigo, cada
alternativa carregava a sua nota no HTML; quem abrisse o console escolhia o
próprio resultado. Aqui o navegador recebe **id e rótulo**, e o ponto é resolvido
no servidor contra a definição privada. Há teste que reprova qualquer `score` na
apresentação pública.

**A identificação passa a vir no começo.** O rhia é anônimo e só captura contato
no portão, no fim. O formulário único pede nome, empresa e cargo **antes de
começar**, porque `porte` e `nível de decisão` são as duas entradas do CDL — sem
eles não há faixa em reais, que é o número que mais move conversa.

> **Isto precisa de decisão sua antes de ir ao ar.** Muda o aviso de privacidade
> e a história de retenção do pipeline. Por isso o formulário único nasce como
> **vínculo próprio, com aviso de privacidade próprio**; o link público do rhia
> segue anônimo, exatamente como está. O que não dá é reaproveitar o aviso atual,
> que promete uma coisa que este fluxo não cumpre.

## O que está pronto e o que falta

**Pronto:** a composição, a separação das respostas, o cálculo das duas metades,
a leitura cruzada e a síntese — com 16 testes, incluindo um que compara o JSON de
liderança, palavra por palavra e ponto por ponto, com o formulário que está no
ar. Se alguém editar as perguntas lá, este teste reprova.

**Falta:**

1. **O conjunto enxuto de IA** — decisão de conteúdo, sessão de 25/09 com a
   Carolina. Hoje cada dimensão se apoia em 4 itens; cortar para 2 deixa cada
   uma descansando em duas respostas. Quando o conjunto existir, é um **pacote
   novo**, e nada deste módulo muda.
2. ~~A trilha do perfil no banco~~ — escrita em
   `supabase/migrations/20260916120000_screener_rhia_perfil_do_formulario_unico.sql`,
   com 20 testes comportamentais. **Ainda não aplicada** — está no revisor.

   *Correção de uma afirmação anterior deste arquivo:* a tabela do rhia **não**
   tem lista cravada de respostas. `answer_code` é texto livre até 120 caracteres
   e a validação é contra a definição guardada (`options[].id`). O
   `stage_code in ('E1'..'E4','NA')` é da tabela do **V1**, outra. Os itens de
   liderança, com `O1–O4`, já passariam hoje sem tocar em CHECK nenhum.

3. **A carga** — o instrumento unificado e o vínculo. Fica para quando o conteúdo
   da metade de IA fechar (25/09): carregar antes seria pôr no ar a versão que
   será substituída, e o gerador de carga falha quando a versão existe com
   checksum diferente. `definicaoParaBanco()` já produz o formato que ele espera.
4. **O front** — um fluxo com perfil, e a pilha de uma pergunta por vez que já
   existe no rhia.
5. **O documento** — capa, síntese cruzada, as duas partes, fecho. E **um**
   caminho de PDF: hoje a liderança sai por `browserless` na edge e o de IA pela
   impressão do navegador.

## E a ponte?

Fica **aplicada e inerte**. Ela ligava uma sessão de liderança a uma de rhia, e
com um formulário só isso deixa de ser necessário para quem chega de agora em
diante. Continua útil no dia em que alguém quiser alcançar os 108 que já
responderam só a metade de liderança — decisão adiada em 16/09 ("não recebem nada
por enquanto"). A emissão do convite está escrita e desligada: são dois secrets
para acordá-la, e nenhum deles existe.
