# Metodologia · Diagnóstico Estratégico IBMEC

**Versão:** v1.0
**Data:** Junho 2026
**Status:** Implementado no protótipo do evento 8–10/06/2026

Este documento descreve em detalhe como o resultado do diagnóstico é gerado a partir das respostas do usuário. Tudo o que está aqui está implementado no `frontend/index.html` (função `computarResultado()` e funções de render correlatas).

---

## 1. Estrutura do questionário

### 1.1 Total: 13 perguntas

- **10 perguntas core** — usadas no cálculo de scores
- **3 perguntas de calibração** (C1, C2, C3) — usadas como metadado, não entram no score

### 1.2 As 10 perguntas core

Cada pergunta core cobre uma combinação de **dimensão × lente**.

**5 dimensões:**
- D1 · Visão & Direcionamento estratégico
- D2 · Pessoas & Desenvolvimento
- D3 · Decisão & Accountability
- D4 · Comportamento & Influência
- D5 · Cultura de Performance

**2 lentes:**
- **pessoa** — autoavaliação do respondente
- **empresa** — como o respondente lê a organização

Distribuição: **1 pergunta por dimensão × lente** = 10 perguntas core (D1-pessoa, D1-empresa, D2-pessoa, …, D5-empresa).

### 1.3 Tipos de pergunta (anti-viés)

Mix de 4 tipos para reduzir gaming e viés de resposta:

| Tipo | Como funciona |
|---|---|
| **Situational** | Cenário do dia-a-dia + 4 reações possíveis com scores 1–5 escondidos |
| **Frequency** | "Com que frequência…" + 4 opções (nunca → sempre) |
| **Forced choice** | 4 alternativas com prós/contras balanceados |
| **Reverse-coded** | Item invertido — pontuação alta na resposta significa baixa no construto |

Cada alternativa tem score 1–5 mapeado em `option.s` e ocultado do usuário.

### 1.4 Perguntas de calibração

| ID | Pergunta | Uso |
|---|---|---|
| C1 | Confiança do respondente nas suas respostas | Metadado · não modula score (v1) |
| C2 | Tempo na posição atual | Metadado · contexto de senioridade |
| C3 | Intenção de aplicar os aprendizados | Lead scoring complementar |

---

## 2. Cálculo dos scores

### 2.1 Score por dimensão

Para cada dimensão D ∈ {D1, D2, D3, D4, D5}:

```
scores[D].pessoa  = valor da resposta de "D-pessoa"   (1–5)
scores[D].empresa = valor da resposta de "D-empresa"  (1–5)
scores[D].gap     = scores[D].pessoa − scores[D].empresa
scores[D].media   = (scores[D].pessoa + scores[D].empresa) / 2
```

### 2.2 Score geral

```
scoreGeral = (Σ scores[Dᵢ].media) / 5
```

Valor entre 1.0 e 5.0.

### 2.3 Score 0–100 (display)

```
score100 = round(scoreGeral × 20)
```

---

## 3. Indicador de Maturidade · letter grade

Conversão do score geral para letra (escala CMMI-style):

| Score geral | Letra | Significado |
|---|---|---|
| ≥ 4.5 | **AAA** | Excelência |
| ≥ 4.0 | **AA**  | Avançado |
| ≥ 3.5 | **A**   | Consolidado |
| ≥ 3.0 | **B**   | Em desenvolvimento |
| ≥ 2.5 | **C**   | Inicial |
| < 2.5 | **D**   | Crítico |

Cada letra tem um texto-diagnóstico associado (fixo, não personalizado).

---

## 4. Régua de Posicionamento (Operacional / Tático / Estratégico)

### 4.1 Cálculo da posição atual

```
stratWeight = (D1.empresa + D3.empresa) / 2
tacWeight   = (D5.empresa + D2.empresa) / 2
opWeight    = (D4.empresa + D5.empresa) / 2

total       = stratWeight + tacWeight + opWeight
stratPct    = stratWeight / total
posiçãoAtual = stratPct × 90 + 5     (posição 5%–95% na régua)
```

### 4.2 Posição esperada por persona

```
A (Analista)          → 15%
C (Coordenador)       → 40%
G (Gerente/Diretor)   → 70%
X (C-Level)           → 90%
```

### 4.3 Leitura textual

Diferença entre posição esperada e atual:
- **|gap| < 10%** → "Posicionamento alinhado"
- **gap > 0** → "Capacidade X% mais operacional/tática do que esperado"
- **gap < 0** → "Opera X% acima do estratégico esperado — possível centralização"

---

## 5. 4 Componentes do Alinhamento

Quatro barras horizontais, cada uma com tag classificatória:

| Componente | Fórmula |
|---|---|
| Alinhamento Cultural | D4.empresa × 20 |
| Alinhamento Estratégico | D1.empresa × 20 |
| Engajamento Comportamental | D4.pessoa × 20 |
| Performance vs Expectativa | D5.media × 20 |

**Tags:**
- valor ≥ 75 → **Forte** (verde)
- valor ≥ 60 → **Saudável** (amarelo)
- valor ≥ 40 → **Em desenvolvimento** (laranja)
- valor < 40 → **Crítico** (vermelho)

---

## 6. Top 5 Competências priorizadas

**Status v1:** comparação contra benchmark hardcoded **4.0** (esperado uniforme).

**Roadmap (próxima versão):** plugar lookup real ao `BenchmarkCatalog v1.1` no Supabase, com cascata de fallback (persona + tamanho + segmento → 4 níveis de fallback). Issue/task #30.

Cálculo por dimensão:

```
gap_competencia = score.empresa − benchmark_esperado
```

Ordenação: do gap mais negativo (pior) para o melhor. Top 5 é exibida com bar bicolor (atual navy vs esperado amarelo).

---

## 7. Radar Pessoa × Empresa

SVG pentágono nas 5 dimensões com 2 polígonos sobrepostos:

- **Polígono navy** (pessoa) — `scores[D].pessoa` em cada eixo
- **Polígono amarelo** (empresa) — `scores[D].empresa` em cada eixo

Eixo: escala 1–5. Insight: área onde pessoa &gt; empresa é capital sub-utilizado; onde pessoa &lt; empresa é cobrança/medo ou síndrome do impostor.

---

## 8. Risco Estratégico

Probabilidade estimada de não-execução do plano com o time atual.

```
risco = round((5 − scoreGeral) × 20)   [resultado: 0–100%]
```

**Níveis:**
- < 40% → **Baixo** (verde)
- 40–60% → **Moderado** (amarelo)
- > 60% → **Alto** (vermelho)

Cada nível tem texto-leitura associado (fixo).

---

## 9. CDL · Custo da Disfuncionalidade da Liderança

Estimativa financeira anual do impacto das disfunções identificadas. Métrica proprietária.

### 9.1 Fórmula

```
porteFator   = { S1: 1,    S2: 3,    S3: 8,    S4: 25 }
personaFator = { A: 0.3,   C: 0.7,   G: 1.5,   X: 3 }
gapFator     = (5 − scoreGeral) / 5

CDL_min = porteFator × personaFator × gapFator × 80.000
CDL_max = porteFator × personaFator × gapFator × 350.000
```

### 9.2 Origem das constantes

- **porteFator** — escala não-linear refletindo crescimento de complexidade organizacional (1 → 3 → 8 → 25). Empresas grandes (S4) absorvem mais ineficiência financeira com folha + estrutura.
- **personaFator** — autoridade decisória do respondente. C-Level (X=3) influencia decisões com 10× mais impacto financeiro que Analista (A=0.3).
- **gapFator** — proporção do "espaço de melhoria" da maturidade. Quanto mais baixo o score, mais alto o gap, mais alto o CDL.
- **Faixa 80k–350k** — banda base calibrada para o respondente típico de evento corporativo no Brasil. Magnitude validada como razoável para conversa de PnL com board.

### 9.3 Decomposição (apenas display)

CDL é mostrado quebrado em três níveis de origem:
- **Estratégico** ≈ 40% do CDL_max
- **Tático** ≈ 35% do CDL_max
- **Operacional** ≈ 25% do CDL_max

Estes percentuais são fixos para v1 (não derivados das respostas).

---

## 10. Análise de Autopercepção

Padrão classificado a partir da contagem e direção dos gaps significativos (|gap| ≥ 0.7) entre lentes pessoa e empresa.

| Padrão | Critério |
|---|---|
| **Talento sub-utilizado** | pessoa &gt; empresa em ≥ 3 dimensões |
| **Impostor / autocobrança** | pessoa &lt; empresa em ≥ 3 dimensões |
| **Integrado** | Nenhum gap significativo |
| **Oscilante** | Gaps em direções opostas em dimensões diferentes |

Texto de leitura associado a cada padrão (fixo, não personalizado por gap específico).

---

## 11. Plano de Ação

**Status v1:** template fixo por dimensão com maior gap. 3 frentes pré-escritas, 3 práticas concretas por frente.

**Roadmap (próxima versão):** gerador dinâmico que:
1. Identifica as 3 dimensões com maior gap real
2. Mapeia para frentes do pool curado (biblioteca de 15–20 práticas por dimensão)
3. Personaliza copy por persona
4. Sorteia 3 práticas por frente

Issue/task #32.

---

## 12. Cronograma 30/60/90

Três etapas fixas, não personalizadas:

| Etapa | Foco | Práticas-âncora |
|---|---|---|
| **30 dias — Diagnóstico & Alinhamento** | Internalizar | Compartilhar achados, priorizar gaps, definir indicadores |
| **60 dias — Fundação Comportamental** | Fundar | Capacitação, rituais de gestão, feedback contínuo |
| **90 dias — Aceleração & Resultado** | Colher | Intervenções organizacionais, mentoria, avaliação intermediária |

Texto identical para qualquer perfil/score (em v1).

---

## 13. Limitações honestas

Trade-offs assumidos para entregar em 5 minutos:

1. **N=2 por dimensão (psicometricamente fraco)** — só 1 pergunta pessoa + 1 empresa cobre cada dimensão. O ideal seria 3–5 perguntas por dimensão. Mitigação: usar mix de tipos (situational + frequency + forced + reverse) reduz viés de resposta única.
2. **Sem benchmark de mercado real ativo (v1)** — comparação contra 4.0 hardcoded. Catálogo v1.1 com 47 entradas curadas existe (`docs/catalogo-benchmark-fontes-publicas.md`) mas ainda não está plugado no scoring. Issue #30.
3. **CDL é heurística, não modelo econométrico** — magnitudes razoáveis mas não validadas empiricamente contra dados de empresas reais. Comunicar como "estimativa" no relatório (já está).
4. **Scoring no front (JavaScript)** — qualquer usuário com DevTools vê as fórmulas. Sem proteção de IP. Aceitável para v1 dado que metodologia também está documentada publicamente neste arquivo.
5. **Plano de ação não personaliza por gap real** — template fixo. Issue #32.
6. **Calibração C1/C2/C3 não modula score** — apenas guardadas como metadado. Roadmap considerar ponderar relatório por C1 (alta/média/baixa confiança).

---

## 14. Reprodutibilidade

Cada relatório guarda **versão tripla congelada** no Supabase:

- `catalogo_versao` (v1.1) — qual snapshot do BenchmarkCatalog
- `questionario_versao` (q-v1.0) — quais perguntas e em que ordem
- `motor_versao` (engine-v1.0) — quais pesos e fórmulas

Daqui a 24 meses, qualquer auditoria reconstrói exatamente o cálculo.

---

## 15. Roadmap pós-evento

Em ordem de prioridade após validação no evento:

1. **Plugar BenchmarkCatalog real** (#30) — substitui hardcoded 4.0
2. **Plano de Ação dinâmico** (#32) — biblioteca de práticas + seleção por gap real
3. **Catálogo benchmark v1.2** (#10) — fechar lacunas Analista e Coordenador
4. **Ponderação por C1 (confiança)** — selo "alta/média/baixa confiança" no relatório
5. **A/B test de copys** do plano de ação e tom geral
6. **Modelo CDL validado empiricamente** — coletar dados de respondentes durante 12 meses para calibrar fatores com base em estudos longitudinais
7. **Multi-tenant Marca** — preparar arquitetura para outras instituições além de IBMEC

---

## Anexos

- `frontend/index.html` — implementação completa do scoring (função `computarResultado` linha ~850)
- `docs/catalogo-benchmark-fontes-publicas.md` — catálogo v1.1 com 22 fontes públicas
- `docs/passo-3-perguntas-calibradas.md` — texto das 13 perguntas por persona
- `supabase/migrations/20260526000001_schema_inicial.sql` — schema completo do banco

---

*Documento de versão controlada via Git. Próxima revisão: pós-evento, baseado em telemetria real de uso.*
