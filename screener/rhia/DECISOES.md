# Decisões — Diagnóstico Boomit RH, Desenvolvimento e IA ("rhia")

Registro das decisões de interface e de arquitetura, com a origem de cada uma.
As de UI são rastreadas às skills **Boomit Design** (`boomit-design-system`) e
**Boomit UI** (`boomit-ui`); as de arquitetura, ao contrato de construção
([CONTRATO.md](./CONTRATO.md)) e à direção da dona do produto. Quando o pacote
(`pacote/PROMPT-CLAUDE-CONSTRUIR-V2.md`, `pacote/ARQUITETURA-DEVOLUTIVA-V2.md`)
e a casa apontam para lados diferentes, a decisão diz qual venceu e por quê.

A lista comentada no topo de `frontend/rhia.css` é a fonte primária das decisões
de interface; este arquivo é o espelho legível, com o porquê de cada uma.

---

## Parte 1 — Interface

### 1.1 Tokens

- **Só tokens semânticos de `frontend/tokens.css`; nenhum hex em `rhia.css`.**
  Boomit Design: "componentes consomem tokens semânticos, nunca hex solto e
  nunca as escalas cruas". O `tokens.css` já existe no projeto e foi auditado
  contra a WCAG AA; recriar tokens à mão é o que a skill proíbe.
- **Tema claro e escuro pelo mesmo mecanismo do V1** (`data-theme` +
  `prefers-color-scheme`), sem cor definida só dentro de um bloco de tema. O
  verde oficial não é texto no escuro — o token `--text-brand` já resolve isso.
- **Cor de marca reservada.** O verde entra quando algo é da marca ou positivo;
  o preto, na ação principal. "Se três coisas na tela estão verdes, nenhuma é
  importante" (Boomit Design).

**O que foi feito.** `frontend/rhia.css` é carregado depois de `tokens.css` e
`screener.css`: reaproveita a base `sc-*` da casa (shell, cabeçalho, botões, cartão,
opções, progresso, revisão, notas, erro) e acrescenta só o que este instrumento pede,
com prefixo `rh-*`. Todas as cores vêm de tokens semânticos (`--bg-*`, `--text-*`,
`--border-*`, `--action-*`, `--status-*`); não há nenhum hex escrito no componente.
As únicas cores oficiais citadas diretamente aparecem no bloco de impressão, como rede
de segurança para papel (ver 1.6).

### 1.2 Tipografia

- **Inter como fallback declarado; PP Mori quando o kit estiver servido.** O
  head de `rhia.html` espelha o de `screener.html` (Inter via Google Fonts). A
  PP Mori é licenciada e não vem no pacote; o `--font-sans` já lista PP Mori
  antes de Inter, então basta servir os `.woff2` para trocar.
- **Sem bold.** Pesos 400 (corpo), 500 (rótulos, botões, dados) e 600
  (títulos). "Não existe bold na Boomit" (Boomit Design). O peso 600 é o mais
  forte que aparece em `rhia.css`.
- **Tracking só em título grande em caixa alta**; texto corrido nunca leva
  tracking.
- **Blocos curtos.** A devolutiva é longa por natureza (13 seções); a
  legibilidade vem de um bloco por ideia, com espaço generoso entre seções, não
  de reduzir o conteúdo aprovado.

**O que foi feito.** Inter nos pesos 400/500/600 (o `<head>` carrega só esses;
`screener.css` já fixa `--font-sans`). **Não há bold**: títulos em 600, rótulos e
números em 500, corpo em 400. A devolutiva é tratada como documento — coluna única
com linha de leitura limitada a ~65ch, como manda o Modo 3 (relatório de devolutiva).

### 1.3 Hierarquia sem cor

- **Peso, tamanho e espaço fazem a hierarquia.** Um título é maior e 600, não
  verde. Um card é `--bg-surface` sobre o fundo de página com borda sutil, não
  fundo colorido. Boomit UI: "card em repouso tem borda, não sombra".
- **Cartões de alternativa (questionário)** são cards clicáveis: o elemento
  inteiro é o controle (`radiogroup`/`radio`), ganha borda mais forte no hover
  e no estado selecionado; nada de botão pequeno dentro de card grande.
- **A escada de referências não é ranking.** Ver 1.5.
- **Nenhum número "gamificado".** Cartões de evidência (sustentadores,
  limitadores, tensões) têm rótulos verbais. Não há barra, radar, percentual
  nem nota por dimensão em lugar nenhum do DOM público — exigência do pacote
  (PROMPT §3, ARQUITETURA §10) que coincide com a estética da casa.

**O que foi feito.** Um título é título por tamanho e peso, não por cor. Cartões são
superfície branca com borda sutil e **sem sombra em repouso**. O verde da marca aparece
só na ação de marca (enviar o contato, ver a leitura) e no traço de foco; o preto, na
ação principal. Nenhuma seção da devolutiva é colorida para “destacar” — a ordem e o
espaço fazem esse trabalho.

### 1.4 Estados semânticos

- **Gate de governança = alerta semântico com ícone + texto.** Boomit Design:
  "cor nunca é o único sinal de estado". Mapeamento:
  - `CRITICAL` e `INSUFFICIENT` → tokens `danger-*`, `role="alert"` (interrompe:
    a restrição domina a decisão), restrição `NO_SCALE` escrita por extenso
    ("não ampliar o uso").
  - `ATTENTION` → tokens `warning-*`, `role="status"`, restrição
    `CONTROLLED_EXPERIMENTS` por extenso ("só experimentos controlados").
  - `MONITORED` e `ESTABLISHED` → tokens `info-*`/neutros, `role="status"`.
  O terracota (`danger`) é o único tom fora do manual e existe justamente para
  que atenção e erro não se confundam num banner.
- **Erro de validação** abaixo do campo, em `--text-danger`, com ícone,
  `aria-invalid="true"` e `aria-describedby`. Texto de ajuda vem antes do erro
  e não é substituído por ele (Boomit UI, campos).
- **Autosave visível** como `role="status"` discreto ("Salvo"), nunca toast
  colorido por resposta.
- **Storage indisponível** é aviso `warning` persistente com o texto exato do
  contrato: "Este navegador não permite guardar o progresso; se você atualizar a
  página, o preenchimento recomeça."
- **Ação destrutiva ("recomeçar")** é botão secundário com texto em
  `--text-danger` e confirmação nativa `confirm()` com texto claro — não um
  botão vermelho na tela (Boomit UI, botões).

**O que foi feito.** O gate de governança usa os tokens de estado — `danger` para
condição crítica, `warning` para atenção e para informação insuficiente, neutro para
controles monitorados, `success` para governança estabelecida — **sempre com ícone +
rótulo + texto**: cor nunca é o único sinal. Crítico e insuficiente ganham borda de 2px
e escala maior (a prioridade visual que o método exige), não um bloco chapado de cor.
A restrição (`NO_SCALE`, `CONTROLLED_EXPERIMENTS`) é dita por extenso, não inferida do tom.

### 1.5 Escada de cinco referências

- **Componente novo em `rhia.css`, monocromático.** Cinco degraus na ordem
  pública (Operacional Ágil → Criador de Tecnologia). O degrau atual se destaca
  por peso (500), borda `--border-strong` e fundo `--bg-surface`; os demais em
  `--text-secondary` sobre `--bg-muted`. Nada de verde chapado, nada de medalha,
  nada de barra de progresso: o pacote proíbe apresentar o degrau como prêmio e
  a casa proíbe cor como hierarquia.
- **Só o degrau atual é destacado**; a referência de atuação (`reference.stage`)
  aparece no texto do bloco 3, não como segundo destaque na escada, para não
  virar "onde você deveria estar".
- **Responsiva:** em 320px a escada vira lista vertical; em telas largas, linha
  horizontal. Sem overflow lateral.
- **Impressão:** a escada preserva o destaque por borda e peso, que sobrevive ao
  preto e branco.

- **Ressalva do quinto degrau, sempre visível.** O nome “Criador de Tecnologia”
  está na escada para todo mundo, e o método afirma que ele **não exige
  tecnologia proprietária, modelo próprio nem agentes** (PROMPT §3; item do
  CHECKLIST-DE-ACEITE). O motor só manda essa clarificação a quem cai no quinto
  degrau, então a nota acompanha a escada em todos os casos: quando o motor
  manda, vale a palavra dele; senão, a mesma ressalva em terceira pessoa
  (`NOTA_QUINTO_DEGRAU` em `rhia.mjs`).

**O que foi feito.** Componente novo e monocromático: cinco degraus como colunas de
altura crescente (a metáfora da escada). **Um único destaque**: o degrau atual, por
borda forte, superfície própria, peso 500 e o rótulo textual **“Degrau atual”**. A
referência de atuação aparece só em prosa, no bloco 3 — um segundo destaque aqui
leria como “onde você deveria estar”. Sem verde chapado, sem número grande, sem
medalha — a leitura não pode soar premiação. Abaixo de 40rem a escada vira lista
vertical, preservando a ordem. Sob a escada, a ressalva do quinto degrau.

> Correção (12/09): a primeira versão marcava também o degrau de referência
> (borda tracejada + rótulo “Referência”), contra o próprio bullet acima e
> contra o PROMPT §5.2. Removido de `rhia.mjs` e de `rhia.css`, e o teste que
> exigia o segundo destaque foi corrigido.

> Redesenho (13/09) — **a escada virou o gráfico da devolutiva.** A dona do
> produto pediu que a entrega tivesse gráficos e que a escada se inspirasse na
> escada do deck do curso (`Curso Leadrix — CEO — Business apresentação WS.pdf`,
> slide “Nível 1 … Nível 5”). O deck desenha cinco blocos isométricos com
> degradê do preto ao verde e sombra. Três coisas de lá **não** vieram, porque
> a skill Boomit Design proíbe em gráfico: **3D, degradê e sombra em barra**.
> O que veio foi a estrutura — cinco degraus subindo da esquerda para a direita,
> o nome de cada um acima do bloco, o tamanho crescendo com a posição.
>
> No lugar do degradê, a **rampa sequencial sancionada pela própria skill**
> (“sequencial `moss-100 → moss-900`”): cinco preenchimentos chapados da família
> moss, do claro ao escuro. O degrau atual **não entra na rampa** — recebe o
> preto oficial, uma faixa quente atrás da coluna e a etiqueta contornada
> “Degrau atual”. Continua um único destaque, e nunca só por cor (etiqueta +
> posição + `aria-current="step"`). No tema escuro a rampa é invertida
> (moss-700 → moss-300): um moss-800 sobre o canvas preto seria um degrau
> invisível.
>
> Esta é a única exceção de escala crua em `rhia.css`, confinada ao componente
> e declarada como variáveis locais de `.rh-escada-fig`. A skill a prevê:
> série de gráfico é o caso em que a escala crua é o valor certo.
>
> Abaixo de 40rem a escada gira: a altura do degrau vira a **largura da barra**,
> e a leitura de ascensão se mantém sem picotar os nomes em cinco colunas.

### 1.6 Impressão

- `@media print`: fundo branco, sem sombra, sem botões, cards com
  `break-inside: avoid`, cabeçalho com data (`emitido_em`) e versão
  (`instrument.version`), disclaimer integral sempre presente. Exigência do
  pacote (PROMPT §4: "não cortar cartões ou esconder disclaimer").
- O CTA "Imprimir / salvar PDF" chama `window.print()`; não há geração de PDF
  no servidor.

**O que foi feito.** `@media print`: fundo branco (o app troca para o tema claro em
`beforeprint`, então os tokens semânticos já resolvem para os valores claros), sem
sombra, sem botões nem controles, cartões e tabela com `break-inside: avoid`, cabeçalho
de impressão com **data de emissão e versão do instrumento** (`.rh-print-head`) e o
disclaimer sempre presente. As cores oficiais do manual entram aqui apenas como rede de
segurança de texto e borda no papel.

### 1.7 Acessibilidade (WCAG 2.2 AA)

- Foco visível de 2px com `--focus-ring` em tudo que é clicável.
- Alternativas em `radiogroup`/`radio`; teclado 1–9 seleciona, Enter avança,
  setas navegam (mesmo padrão do V1).
- Alvo de toque mínimo de 44px (Boomit UI).
- `aria-live` **nos avisos** (autosave, validação, storage, erro de topo) — e
  só neles. O `<main id="sc-app">` NÃO é live region: `pintar()` troca todo o
  conteúdo dele a cada resposta, e um leitor de tela re-anunciaria a tela
  inteira a cada interação.
- Nome acessível do grupo = o **enunciado** (`aria-labelledby` apontando para a
  `<legend>`/`<p>` da pergunta), nunca a palavra "Alternativas": na tela de
  contexto há três grupos e eles precisam se distinguir.
- O foco sobrevive à repintura: `pintar()` guarda quem estava em foco (por id
  ou por `data-item`/`data-opcao`) e devolve o foco depois de trocar o DOM.
  Sem isso, cada seta do radiogroup jogava o foco no `<body>` e o Tab seguinte
  recomeçava no cabeçalho.
- `prefers-reduced-motion` desliga transições.
- 320px sem overflow horizontal; tabela do plano 30–60–90 vira cards em tela
  estreita (Boomit UI, tabelas: "transforme cada linha em card em vez de rolar na
  horizontal").
- Borda de campo em `--border-strong` (WCAG 1.4.11 exige 3:1 no limite do
  controle).

**O que foi feito.** Anel de foco de 2px com offset 2px (herdado de `tokens.css`) em
tudo que é clicável; alvo mínimo de 44px (2.75rem) em botões e opções; `radiogroup` com
`fieldset`/`legend` na tela de contexto; erro de campo abaixo do campo, com ícone e
`aria-describedby` (no texto livre do contexto **e** no e-mail do portão de lead, que
também recebe o foco quando a validação falha); `prefers-reduced-motion` desliga as
animações; **320px sem overflow horizontal** — os grids colapsam e a tabela do plano
vira cartão com o rótulo da coluna.

> Correções (12/09), todas comprovadas no navegador: (a) o título da abertura
> usava os 48px fixos do V1 e estourava a largura em 320px (a palavra
> "Desenvolvimento" sozinha media 403px numa caixa de 272px) — agora
> `clamp()` só no rhia; (b) o `<main>` era `aria-live="polite"` inteiro; (c) os
> radiogroups tinham todos o mesmo `aria-label="Alternativas"`; (d) responder
> na tela de contexto jogava o foco no `<body>`; (e) o erro do portão de lead
> não estava ligado ao campo. A afirmação de "zero overflow a 320px" do
> RELATORIO-DE-TESTES estava errada e foi corrigida lá.

### 1.8 Tom de voz

- Direto, adulto, "você", sem exclamação, emoji ou gerundismo (Boomit Design).
- Os textos da devolutiva são os da biblioteca do pacote, verbatim. O frontend
  só acrescenta rótulos de seção e mensagens de estado, e estas seguem a voz da
  casa: dizem o que houve e o que fazer, sem pedir desculpa.
- Rótulos de qualidade da evidência: `BROAD` → "ampla", `ADEQUATE` →
  "adequada", `LIMITED` → "limitada" (ARQUITETURA §3).

---

### 1.9b NÚMEROS na devolutiva — exceção a uma regra do pacote (14/09)

**A regra que está sendo aberta.** `ARQUITETURA-DEVOLUTIVA-V2.md` §10 manda "não
exibir radar, barras ou números por dimensão", e `LIMITES-METODOLOGICOS.md`
dizia que o participante nunca vê nota, barra, percentual ou radar. A devolutiva
passa a exibir índice 0–100, os três eixos com seus pesos e as seis dimensões
com barra.

**Quem decidiu e por quê.** A dona do produto, depois de a restrição ter sido
apresentada duas vezes e mantida. A razão é de produto, e é boa: o Relatório
Estratégico de liderança que a Boomit já entrega é analítico e acionável
**porque quantifica**, e a devolutiva de IA ficava ao lado dele parecendo
entregar menos. Um método que se dobra em silêncio deixa de valer; um que
registra a exceção continua valendo — por isso esta seção existe, datada.

**De onde vêm os números.** Das funções **exportadas pelo próprio motor do
pacote**: `scoreAllDimensions`, `calculateAxes`, `calculatePosition`,
`calculateReference`. Nada é recalculado por nós. Não existe uma segunda
implementação da matemática para divergir da primeira em silêncio — se o pacote
mudar, os números mudam junto.

**A escala.** O motor trabalha em pontos-base (0–10000); publicamos 0–100
dividindo por 100, que é exato e não é reescala. É o mesmo registro do relatório
de liderança ("74/100"), o que permite os dois conviverem num documento só.

**O que continua fora, porque seria invenção e não exibição:** benchmark de
setor e percentil (o instrumento não coleta comparação); valor em reais (CDL) e
risco em percentual (metodologia de **outro** instrumento); letra D→AAA (escala
do diagnóstico de liderança). Dimensão sem evidência sai `null`, nunca zero, e
no ramo insuficiente não há número nenhum.

**Um teste que passava pelo motivo errado.** `frontend-rhia.test.mjs` afirmava
`!/\d+\s*\/\s*100/` ("nota 0–100 no DOM"). Depois da mudança ele continuaria
**verde por acaso**, porque o índice é renderizado como "74" e "de 100" em
elementos separados, sem a barra que o padrão procurava. Foi substituído pelo
que de fato vale agora: o índice existe, está em 0–100, e ponto-base não
atravessa. Na mesma passagem descobriu-se que o helper `publico()` do teste
montava o modelo à mão e **contornava `paraPublico`** — ou seja, não exercitava
a projeção real; agora passa por ela.

**Aberto com a Carolina.** Esta exceção mexe na saída do instrumento aprovado e
está registrada em [PEDIDO-AO-INSTRUMENTO.md](./PEDIDO-AO-INSTRUMENTO.md) como
decisão tomada, não como pedido.

---

### 1.9 A devolutiva como documento (redesenho de 13/09)

Pedido da dona do produto: *"o layout da entrega precisa ser profissional,
encantador, com tom de voz acolhedor, analítico, de valor e com muita entrega"*.
O problema é que **"encantador" e a skill Boomit Design puxam para lados
opostos** — a skill manda a interface ser quieta, quase monocromática, e diz
para "errar para o lado do discreto". A decisão foi buscar o encantamento onde
ele não custa sobriedade: **escala, respiro, hierarquia tipográfica e estrutura
de documento** — não cor, não ornamento, não mais números.

O que entrou:

- **Capa.** A devolutiva abre como documento, em superfície quente
  (`--bg-surface-warm`), com respiro largo, título grande e a qualidade da
  evidência como dado de abertura. É o Modo 3 da skill Boomit UI ("trate como
  documento, não como dashboard"; "a capa pode levar tratamento próprio").
- **Ordem do texto de abertura invertida.** Antes a primeira frase era a
  ressalva ("não é avaliação de pessoa nem diagnóstico da empresa"); quem
  acabou de responder 30 itens recebia uma negativa antes da leitura que pediu.
  Agora abre agradecendo e dizendo o que vem, e a ressalva vem na frase
  seguinte — **inteira**, mais o disclaimer integral no bloco final. Nada de
  rigor metodológico foi trocado por acolhimento; só a ordem mudou.
- **Mapa de leitura.** Um índice de duas colunas logo depois da capa, montado a
  partir das seções **realmente renderizadas** (quando não há tensão a relatar,
  a seção some do documento e do mapa). Não são links: a tela é roteada por
  hash e uma âncora mudaria a rota.
- **Seções numeradas.** O numeral é informação, não ornamento: a devolutiva tem
  ordem de leitura real (a escada situa, a referência compara, a governança
  condiciona, o plano executa), e o mapa promete exatamente essa sequência.
  Fica fora da árvore de acessibilidade, porque o `<h2>` já nomeia a seção.
- **Assinatura como citação.** É a frase mais densa do documento; ganha escala
  de citação com filete à esquerda em vez de virar mais um cartão igual aos
  outros. Sem aspas decorativas.
- **Colofão.** Data, versão do instrumento e versão da devolutiva no pé. Sem
  isso a leitura não é auditável seis meses depois.

O que **não** entrou, e por quê: nenhum gráfico por dimensão, nenhum radar,
nenhum número, nenhuma porcentagem. O método proíbe expor nota por dimensão e
pontos-base (PROMPT §5; `fronteira-rhia.test.mjs` falha o build se vazarem), e
"mais entrega" não pode virar "mais métrica". A entrega cresceu em profundidade
analítica e em legibilidade, não em instrumentação.

**Verificação.** `npm run capturas` percorre o fluxo de verdade e grava agora
**nove** artefatos: abertura, questão e devolutiva em desktop e mobile, a
devolutiva **nos dois temas**, e `devolutiva-impressa.pdf` — o papel, que era o
único item do §9 sem verificação mecânica, gerado pelo mesmo caminho do botão
"Imprimir ou salvar PDF".

---

## Parte 2 — Arquitetura

### 2.1 Pacote + servidor da casa

O pacote pede um projeto estático com cálculo no navegador e sem backend
obrigatório (PROMPT §4). A dona do produto decidiu diferente: **o conteúdo é do
pacote, o servidor é o da casa.** Motivos:

- A degustação é isca de lead; sem servidor não há portão nem lead.
- A casa já tem fronteira de segurança provada (papéis, `SECURITY DEFINER`,
  token só em header, rate limit) e a regra "o que existe não se sobrescreve";
  entrar por caminho novo (`screener_rhia_*`, `/rhia/*`) custa menos e não toca
  o V1.
- O checklist do pacote ("não há dependência obrigatória de backend") fica
  registrado como divergência consciente em
  [LIMITES-METODOLOGICOS.md](./LIMITES-METODOLOGICOS.md).

### 2.2 Por que o motor roda na edge

- O navegador **nunca** recebe pontos-base, pesos, cortes, códigos de estágio
  ou dimensão: só o modelo público (`contrato.public` + `emitido_em`). Isso é
  provado em `logica.test.mjs` (`paraPublico` sem `internal`, sem "bp", sem
  3333/6667) e nos testes comportamentais da edge.
- O motor é importado do pacote sem alterar semântica; a edge só faz a ponte
  (`calcularContrato`) e a projeção. O snapshot gravado guarda `public` e
  `internal` (com as respostas) para auditoria futura, e é imutável por trigger.
- O cálculo no cliente permitiria forjar resultado e pular o portão.

### 2.3 Questões pela edge (fronteira de publicação)

O Netlify publica `frontend/` como está. Se o JSON do instrumento vivesse ali,
o instrumento inteiro estaria no ar como arquivo estático. Por isso
`apresentacaoPublica()` roda na edge e as 30 questões chegam por `GET
/rhia/start`; `fronteira-rhia.test.mjs` prova que nenhum arquivo de `frontend/`
contém enunciados, ids de item ou o código do instrumento. Mesmo padrão do V1
(`screener/motor/fronteira-de-publicacao.test.mjs`).

### 2.4 Retomada com localStorage

O pacote exige que "atualizar/reabrir preserva respostas localmente"
(CHECKLIST) e "persistência local versionada" (PROMPT §4). Na arquitetura da
casa, as respostas ficam no servidor e voltam por `GET /rhia/session`; o que
precisa sobreviver ao reload é o **token de sessão**. Decisão:

- `localStorage`, chave `rhia:v1:<evento>`, guardando só `{ token, pos, tela }`.
  Não guarda respostas nem texto livre.
- `sessionStorage` não serve: "reabrir" (fechar a aba e voltar) é requisito
  explícito.
- Todo acesso em `try/catch`; se o storage falhar, o app continua em memória e
  mostra o aviso do item 1.4. O token continua trafegando só em
  `x-session-token`, nunca em URL.
- Versionada pelo prefixo `v1`: mudar o formato é mudar a chave, sem migrar.

### 2.5 Portão de lead `required_before_result`, no servidor

- `POST /rhia/submit` calcula, grava o snapshot e responde só `{ submitted:
  true, lead_required: true }`; `GET /rhia/result` responde 403 até o lead
  existir; `POST /rhia/lead` exige sessão submetida. A regra vive na RPC
  `screener_rhia_op_get_result`, não no frontend.
- Quando `GET/POST /rhia/start` passa pelas funções genéricas do V1
  (`get_binding`/`preview_authorize`), o binding não traz `lead_capture_mode`.
  A edge devolve o campo se existir, senão `null`, e o frontend trata `null`
  como `optional_after_submit` (o modo padrão do banco). Nas rotas de sessão,
  submissão e resultado, o binding vem da RPC rhia e traz o modo real — é ele
  que decide.

### 2.6 `assessment_unit`: `individual_in_role` no JSON, área no motor e nos docs

O JSON declara `"assessment_unit": "individual_in_role"`. O motor, a
ARQUITETURA (§1) e o PROMPT (§2) dizem que a unidade analisada é **a área**,
e que o papel muda só a lente do texto (`roleLens`). Pela precedência, o JSON
vence em conteúdo literal das questões; mas o campo não é lido pelo motor e
não altera cálculo. Seguimos o motor e os documentos: a interface reforça
"Responda pensando na mesma área do início ao fim", e o campo fica gravado
verbatim na definição, sem efeito. Registrado aqui para a revisão do
instrumento decidir se o valor do JSON deve mudar.

### 2.6.1 Nomes de dimensão: o JSON e o motor divergem em cinco das seis

As duas fontes do pacote nomeiam as mesmas dimensões de formas diferentes:

| id | JSON (`instrumento-rh-ia-v1.json`, usado no questionário) | Motor (`output-definition-v2.mjs`, usado na devolutiva) |
|---|---|---|
| EST | Estratégia e valor para o negócio | Estratégia e valor para o negócio |
| TAL | Inteligência de talentos e força de trabalho | Talento e capacidades |
| DES | Performance e desenvolvimento | Desenvolvimento e aprendizagem |
| INF | Influência, liderança e mudança | Influência e mobilização |
| DAD | Dados e inteligência de decisão | Dados e evidências |
| IA | Redesenho do trabalho e adoção de IA | Adoção responsável de IA |

Na prática o participante vê dois nomes para o mesmo construto: o cabeçalho da
questão traz o `dimension_name` do JSON ("Práticas · Inteligência de talentos e
força de trabalho") e o resultado traz o nome do motor ("Talento e
capacidades"). Nenhuma das duas fontes é lida pela outra e o cálculo não muda.

**Decisão.** Cada camada continua usando a sua fonte, sem reescrever nenhuma das
duas: o questionário é conteúdo literal do JSON (precedência 1) e a devolutiva é
o vocabulário do motor (precedência 2). Nada é traduzido por conta própria — uma
tabela de-para nossa seria texto novo do instrumento, que não nos cabe escrever.
Fica **registrado para a revisão do instrumento**: as duas fontes do pacote
precisam convergir num nome só por dimensão. Enquanto não convergem, a
ambiguidade está aqui e em LIMITES-METODOLOGICOS §4.

### 2.7 Textos ampliados do `.docx`

`pacote/REFERENCIA-EDITORIAL-OUTPUTS-BOOMIT.docx` traz uma biblioteca editorial
maior do que a usada pelo motor. O motor só lê `output-definition-v2.mjs`; o
`.docx` fica como referência para revisão editorial futura e não entra no
código nem no resultado.

### 2.8 Canônico das respostas e idempotência

A serialização canônica das respostas (`item + "\t" + value`, ordenada por code
unit) é idêntica na edge (`logica.canonico`) e no SQL (`string_agg(... order by
item_code collate "C")`). Inclui o texto livre quando gravado. O snapshot é
único por `(session, instrument_checksum, input_checksum, scoring_version,
report_version)`; repetir o submit devolve o mesmo resultado sem recalcular, e
uma corrida entre autosave e submit é resolvida por até três tentativas em
`respostas_mudaram`.

### 2.9 Texto livre de CTX01 = OTHER

- O servidor valida e grava `CTX01_OTHER_TEXT` como item (2–120 caracteres após
  trim, sem caracteres de controle), mas nunca envia ao motor.
- O frontend mantém o texto local até ficar válido e só então faz o `PUT`; ao
  trocar CTX01 para outra opção, limpa o campo local e envia só o `PUT CTX01`.
  Um texto órfão gravado é ignorado: `validarSubmissao` só o exige quando
  CTX01 = OTHER. Não existe "PUT com string vazia" porque seria inválido.
- O texto livre nunca vai para analytics (ARQUITETURA §12).

### 2.10 Analytics como adaptador opcional

`window.SCREENER_RHIA_ANALYTICS` é opcional; ausente, é no-op. Eventos
exatamente os do pacote (`assessment_started`, `context_completed`,
`question_answered {id, option}`, `assessment_completed`, `result_viewed`,
`pdf_requested`, `reassessment_clicked`), sem texto livre.

### 2.11 Dev server sem editar `rhia.html`

O frontend lê `window.SCREENER_RHIA_CONFIG`. Em produção esse objeto vem do
HTML publicado; em desenvolvimento, `scripts/dev-rhia.mjs` intercepta `GET
/rhia.html` e injeta o `<script>` de configuração antes de `</head>`. O arquivo
em disco é o mesmo que o Netlify publica.

### 2.12 A ponte com a liderança (15/09)

Caminho **(c) com (a) como rede**: quem termina a liderança recebe o link do
rhia com um **convite** opaco, de uso único — ligação **certa**; quem chegou
pelos dois lados em momentos diferentes é reconciliado pelo e-mail — ligação
**provável**. A confiança fica gravada na ponte, e o documento único precisa
dizer qual das duas tem nas mãos.

**A emissão parte do `token_sessao`, nunca de um `respondente_id`.** O id não é
segredo — viaja no corpo de respostas da edge antiga. A edge lê o token do
cabeçalho `x-sessao` e o banco deriva a pessoa lá dentro. Aceitar um id pelo
corpo deixaria qualquer chamador emitir convite para qualquer pessoa.

**Ambiguidade é divergência, não contagem.** Duas linhas com o mesmo e-mail
quase sempre são a mesma pessoa em dois eventos — a liderança roda por evento, e
são 108 respondentes em eventos recorrentes. Contar linhas recusaria justamente
quem a rede existe para pegar. O que indica duas pessoas atrás de um endereço
(`contato@empresa.com`) é **nome ou empresa divergentes**; sem divergência, liga
à linha **mais recente**, que é a que descreve a pessoa hoje — e ainda assim como
*provável*. Campo vazio é silêncio, não contradição.

**A ponte não ganha privilégio sobre `respondentes`.** `grant select` não
bastaria: a tabela tem RLS ligada e nenhuma policy alcança `screener_owner`, que
não é dona dela — dentro do SECURITY DEFINER ela enxergaria zero linhas e a
ponte ficaria muda, sem erro e sem log. A leitura passa por duas funções
auxiliares de **pergunta fechada**, cujo dono é o dono de `respondentes`, e que
devolvem um id e *contagens* de nomes/empresas distintos — nunca o texto.

**O convite vive até `expira_em`**, e a purga noturna apaga os vencidos. O prazo
vem do próprio registro, como em 20260914170000: nenhuma constante de retenção
escondida no código. Um convite vencido é só um ponteiro para PII sem uso — a
proveniência da ligação já está em `screener_rhia_vinculos.origem`. Com **teto de
90 dias na tabela**, não só na RPC: a purga só alcança o que venceu, então um
prazo absurdo faria o ponteiro viver para sempre — e o teto na tabela vale para
qualquer escritor futuro, não só para a função de hoje.

**Vincular não trabalha sobre sessão morta.** Sem essa checagem, quem abrisse o
link numa aba velha queimaria o convite numa sessão expirada, reabriria direito e
receberia `convite_ja_usado` — ficando sem ponte para sempre, sem erro e sem log.
É a mesma checagem que `screener_rhia_op_capturar_lead` já fazia; não se exige
`submitted`, porque o vínculo por convite acontece no começo do rhia.
