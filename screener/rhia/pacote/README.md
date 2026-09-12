# Boomit — Diagnóstico RH + IA v2

Pacote de construção para um screener de até 30 questões e uma devolutiva executiva, analítica e acionável. A leitura descreve como uma **área** integra estratégia, dados, conhecimento sobre pessoas e adoção responsável de IA para orientar desenvolvimento e gerar valor organizacional.

## O que está travado para o piloto

- 30 questões literais: 3 de contexto, 24 escalares e 3 gates de governança.
- Unidade de análise: a área observada; o papel do respondente apenas contextualiza a linguagem.
- Cinco referências públicas: Operacional Ágil, Gestor Tático, Estrategista de Escala, Arquiteto de Soluções e Criador de Tecnologia.
- Governança não soma pontos; funciona como gate independente.
- NIST AI RMF — Governar, Mapear, Medir e Gerenciar — organiza a instrução, não a maturidade.
- Nenhuma nota por dimensão é exibida.
- O resultado é hipótese orientativa, não diagnóstico conclusivo.
- Criador de Tecnologia não exige tecnologia proprietária, modelos próprios ou agentes.

## Arquivos

- `instrumento-rh-ia-v1.json`: fonte literal das questões aprovadas.
- `ARQUITETURA-DEVOLUTIVA-V2.md`: método, composição e conteúdo esperado.
- `src/output-definition-v2.mjs`: nomenclatura e biblioteca editorial.
- `src/output-engine-v2.mjs`: implementação determinística de referência.
- `src/result-contract-v2.schema.json`: contrato de saída.
- `tests/output-engine-v2.test.mjs`: casos automatizados.
- `AMOSTRA-RESULTADO-V2.md`: exemplo editorial completo da devolutiva.
- `REFERENCIA-EDITORIAL-OUTPUTS-BOOMIT.docx`: biblioteca ampliada de textos já trabalhada.
- `PROMPT-CLAUDE-CONSTRUIR-V2.md`: instrução pronta para o Claude construir a experiência.
- `CHECKLIST-DE-ACEITE.md`: validação funcional, editorial, metodológica e visual.

## Execução dos testes

```bash
node --test tests/output-engine-v2.test.mjs
```

## Nota metodológica

Pesos, cortes, limiares de tensão e fórmula de referência são hipóteses heurísticas travadas para o piloto. Eles dão consistência ao protótipo, mas não constituem benchmark externo ou escala psicométrica validada. Antes de uso decisório, recomenda-se piloto, entrevistas cognitivas, análise de distribuição, estabilidade e revisão de validade de conteúdo.

Referência técnica: [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework).
