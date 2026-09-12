# Checklist de aceite

## Conteúdo e método

- [ ] As 30 questões vêm literalmente de `instrumento-rh-ia-v1.json`.
- [ ] CTX01=OTHER abre texto obrigatório e o limpa quando a opção muda.
- [ ] A tela orienta o participante a manter a mesma área como referência.
- [ ] Há 3 contexto + 24 escalares + 3 gates; nenhuma questão adicional.
- [ ] Cada dimensão exige 3/4 respostas válidas.
- [ ] Pesos: 35% Liderança, 35% Processos, 30% IA.
- [ ] Cortes e arredondamentos seguem o motor de referência.
- [ ] Gate usa pior condição e não integra a nota.
- [ ] NIST aparece como ciclo de instrução, não como escada.
- [ ] “Criador de Tecnologia” não exige propriedade, modelo próprio ou agentes.

## Devolutiva

- [ ] Exibe degrau, referência/distância, assinatura, evidências, governança, NIST e plano.
- [ ] Exibe no máximo 2 sustentadores, 2 limitadores e 2 tensões.
- [ ] Não exibe notas por dimensão, radar, pontos-base, códigos ou pesos.
- [ ] Resultado usa linguagem probabilística e contém disclaimer.
- [ ] Gate crítico bloqueia escala e domina a orientação.
- [ ] Informação insuficiente não força um posicionamento.
- [ ] Plano de 30–60–90 dias contém evidência verificável de conclusão.
- [ ] Linguagem se adapta ao papel sem alterar o cálculo.

## Produto e interface

- [ ] Mobile-first, teclado, foco visível, contraste AA e redução de movimento.
- [ ] Atualizar/reabrir preserva respostas localmente.
- [ ] Voltar não perde respostas; progresso é correto.
- [ ] PDF/impressão não corta seções essenciais.
- [ ] Não há dependência obrigatória de backend ou LLM.
- [ ] Sem erros no console; funciona por servidor local estático.
- [ ] Estados vazio, carregando, erro e insuficiente estão desenhados.

## Testes obrigatórios

- [ ] `node --test tests/output-engine-v2.test.mjs` passa.
- [ ] E1 uniforme, E2 uniforme, E3 uniforme e E4 uniforme.
- [ ] Um ou dois NA na mesma dimensão.
- [ ] Referência inconclusiva por divergência de alcance/autoridade.
- [ ] Capacidade alta + gate crítico.
- [ ] IA muito à frente e IA muito atrás.
- [ ] Resultado equilibrado sem falsos extremos.
- [ ] CTX01 Outro: mostrar, validar, persistir e limpar.
