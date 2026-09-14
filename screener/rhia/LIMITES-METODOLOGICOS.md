# Limites metodológicos — Diagnóstico Boomit RH, Desenvolvimento e IA

O que este screener afirma, o que não afirma, e o que falta para chamar a
escala de validada. Baseado em `pacote/PROMPT-CLAUDE-CONSTRUIR-V2.md` (§3),
`pacote/ARQUITETURA-DEVOLUTIVA-V2.md` (§2, §13) e na nota metodológica do
`pacote/README.md`.

## 1. O que o resultado é

Uma **hipótese orientativa**, baseada em evidências comportamentais
autodeclaradas, sobre como uma área integra estratégia, dados, conhecimento
sobre pessoas e adoção responsável de IA. Ele pode formular hipóteses sobre
padrões de prática, coerência entre frentes, condição de governança e
prioridades de experimentação.

O vocabulário do resultado é o do pacote: "as respostas sugerem", "há
indícios", "parece", "hipótese", "vale verificar". Nunca "você é", "sua empresa
está", "comprovamos", "diagnóstico definitivo", "benchmark".

## 2. O que o resultado NÃO afirma

- **Não é diagnóstico conclusivo.** Autorrelato de uma pessoa, em um momento,
  sem triangulação.
- **Não é avaliação individual.** Não mede competência, potencial nem adequação
  ao cargo de quem responde. O papel escolhido muda só a lente do texto final.
- **Não é maturidade da empresa.** A unidade é a área escolhida como referência
  durante o preenchimento; nada é dito sobre a organização inteira.
- **Não é benchmark.** Não há comparação com mercado, percentil, média de setor
  ou ranking. Nenhum número desse tipo existe no sistema para ser exibido.
- **Não é prova de ROI nem de causalidade.** Correlações entre práticas e
  resultados não são testadas nem sugeridas.
- **Não é auditoria de governança.** O gate lê três respostas autodeclaradas e
  aplica precaução; não verifica documentos, controles ou incidentes.
- **A referência de atuação não é meta.** Ela deriva de alcance e autoridade
  declarados; quando os dois divergem em dois pontos ou mais, o resultado é
  inconclusivo e nenhuma lacuna é afirmada.
- **"Criador de Tecnologia" não exige tecnologia proprietária, modelo próprio
  nem agentes de IA.** Descreve capacidade de criar ou compor soluções.
- **O degrau não é medalha, certificação, cargo nem sequência obrigatória.**

## 3. Pesos, cortes e limiares são heurísticos

Tudo abaixo foi **travado para o piloto** por decisão editorial, não por
calibração empírica. Dá consistência ao protótipo; não constitui escala
psicométrica validada.

| Regra | Valor travado | Origem |
|---|---|---|
| Escala interna por resposta | E1 = 0, E2 = 3333, E3 = 6667, E4 = 10000 pontos-base; NA nulo | motor |
| Dimensão válida | mínimo 3 de 4 itens | motor |
| Suficiência | 24 válidos = ampla; 21–23 = adequada; 18–20 = limitada; qualquer dimensão inválida = insuficiente | ARQUITETURA §3 |
| Eixos | Liderança = média(Estratégia, Influência); Processos = média(Talento, Desenvolvimento, Dados); IA = IA | motor |
| Índice interno | 35% Liderança + 35% Processos + 30% IA | motor |
| Cortes de degrau | P1 0–1999 · P2 2000–3999 · P3 4000–5999 · P4 6000–7999 · P5 8000–10000 | motor |
| Referência de atuação | arredondar((alcance + autoridade) / 2); divergência ≥ 2 = inconclusiva | motor |
| Sustentador / limitador | amplitude total < 833 pontos-base = nenhum extremo; com amplitude ≥ 833, destaca as dimensões que se afastam ≥ 833 do índice — e, se nenhuma se afasta tanto, ainda assim destaca a mais extrema (ver §4) | motor |
| Tensão | diferença ≥ 2500 entre dimensões pareadas; no máximo duas | motor |
| Assinatura | limiar de 1500 entre eixos; equilíbrio com amplitude < 1000 | motor |
| Gate de governança | pior resposta entre GOV01–GOV03; qualquer NA = insuficiente; nunca altera o degrau | motor |

Esses valores são internos: o participante nunca os vê, e a interface não os
exibe em nenhuma forma (nota, barra, percentual, radar). Eles também não devem
ser alterados silenciosamente depois que houver respostas reais — qualquer
recalibração é explícita, versionada (`scoring_version`/`report_version`) e
registrada.

## 4. Divergências conscientes em relação ao pacote

- O pacote previa cálculo no navegador sem backend obrigatório. A casa optou
  por motor na edge, persistência no banco e portão de lead no servidor
  (ver [DECISOES.md](./DECISOES.md), 2.1–2.2). O motor é o mesmo; muda onde
  roda e o que o navegador recebe.
- O JSON declara `assessment_unit = individual_in_role`; motor e documentos
  tratam a unidade como área. Seguimos motor e documentos; o campo fica
  gravado verbatim e sem efeito (DECISOES 2.6).
- **Extremos abaixo do limiar.** O PROMPT §6 descreve sustentador/limitador
  como desvio de pelo menos 833 pontos-base em relação ao índice. O motor
  (`selectExtremes`, em `output-engine-v2.mjs`) faz um passo a mais: se a
  amplitude entre dimensões chega a 833 mas nenhuma dimensão se afasta 833 do
  índice, ele ainda destaca a mais extrema. Exemplo real: todas as dimensões em
  E1 e um item de IA em E2 produzem índice 250, amplitude 833, e a devolutiva
  traz "Adoção responsável de IA" como sustentador (desvio 583) e "Estratégia e
  valor para o negócio" como limitador (desvio 250) — ambos abaixo dos 833.
  **Seguimos o motor** (precedência 2 do PROMPT §1, "importar sem alterar
  semântica"): a divergência é do pacote consigo mesmo, não uma escolha nossa,
  e corrigi-la seria mudar o cálculo. Fica registrada para a revisão do
  instrumento decidir qual das duas regras vale.
- **Nomes de dimensão.** Cinco das seis dimensões têm nomes diferentes no JSON
  (questionário) e no motor (devolutiva) — o participante lê "Inteligência de
  talentos e força de trabalho" na pergunta e "Talento e capacidades" no
  resultado. Nenhuma das duas fontes foi reescrita; a tabela completa e a
  decisão estão em [DECISOES.md](./DECISOES.md), 2.6.1.

## 5. Agenda de validação pós-piloto

Antes de chamar a escala de validada ou usar o resultado de forma decisória:

1. **Entrevistas cognitivas** com perfis diferentes (RH, CEO/proprietário,
   liderança de negócio, especialista, outro), verificando se cada alternativa
   é lida como a evidência observável que o instrumento pretende.
2. **Análise de NA e abandono**: itens com NA acima do esperado ou onde o
   preenchimento para; revisar redação ou pertinência.
3. **Distribuição por item e por dimensão**: teto, piso, itens que não
   discriminam.
4. **Consistência interna como sinal exploratório** (não como prova): itens da
   mesma dimensão devem caminhar juntos; se não caminham, a dimensão pode estar
   misturando construtos.
5. **Relação com evidências externas**: confrontar leituras com indicadores,
   decisões registradas e a perspectiva de outras pessoas da mesma área.
6. **Teste-reteste**: a mesma pessoa, mesma área, intervalo curto; mudanças
   sem evento explicável indicam instabilidade do item.
7. **Revisão de viés e acessibilidade**: leitura com leitor de tela, teclado,
   baixa visão; linguagem que não penalize áreas pequenas, setores específicos
   ou papéis sem autoridade formal.
8. **Recalibração explícita** de pesos, cortes e limiares, com versão nova de
   `scoring_version` e registro da decisão. Nunca ajuste silencioso.

A reavaliação recomendada ao participante (90 dias, mesmo perímetro de área,
registrando o que explica cada mudança de resposta) é parte dessa agenda: a
comparação só faz sentido se a unidade analisada for a mesma.

## 6. Dados e privacidade

- A base de cálculo (respostas e resultado interno) fica no banco, em tabelas
  sem acesso direto de nenhum papel público; a edge só lê e escreve pelas RPC.
- O texto livre de "Outro" nunca vai para analytics nem para o motor.
- Retenção declarada no vínculo, e o que cada prazo protege — dito com precisão,
  porque a versão anterior desta linha era imprecisa:
  - **180 dias** apagam o **conteúdo da avaliação** (respostas e resultado), de
    todo mundo, sem exceção.
  - **365 dias** apagam o **contato** e **o registro da sessão a que ele está
    vinculado**. Essa linha de sessão **não é anônima** enquanto o contato
    existe: ela guarda data, ciência do aviso de privacidade e o hash do token,
    e o `session_id` do lead é único, então as duas tabelas juntas dizem quem
    respondeu e quando.
  - Quem **não** deixou contato tem tudo apagado aos 180 dias.
  A purga é executada por job diário (`boomit_screener_rhia_purga_v1`); os
  prazos vêm do vínculo, e vínculo sem retenção declarada não é purgado. Ver
  [DEPLOY.md](./DEPLOY.md), passo 8.
