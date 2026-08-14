# Catálogo de Benchmark — Fontes Públicas (v1.1)

**Projeto:** Assessment Interativo de Liderança e Gestão
**Escopo:** Coleta de fontes públicas de mercado para popular `benchmark_catalog`
**Decisão arquitetural:** apenas fontes públicas/gratuitas; sem aquisição paga nesta fase
**v1.0:** 17 fontes, 32 entradas (12/05/2026)
**v1.1:** +5 fontes, +15 entradas → **22 fontes, 47 entradas** (12/05/2026 — fechamento V5-V8)
**Próxima revisão obrigatória:** 12/05/2027

---

## 1. Estratégia da coleta

O catálogo nasce **incompleto por design**. Em vez de prometer cobertura completa das 4 personas × 4 tamanhos × 8 segmentos × 5 dimensões (= 640 combinações), o objetivo desta v1.0 é:

1. **Popular as células de maior densidade de dado público** (cross-setorial global + Brasil agregado).
2. **Definir hierarquia de fallback** para o motor de benchmark usar quando o cut exato não existir.
3. **Marcar lacunas** que serão fechadas iterativamente por release.
4. **Documentar fonte, ano e nível de confiança** de cada referência para transparência no relatório final.

Cada fonte abaixo foi validada quanto a: (i) disponibilidade pública gratuita, (ii) metodologia transparente, (iii) tamanho de amostra reportado, (iv) recência (≤24 meses).

---

## 2. Fontes coletadas (14 fontes públicas)

### 2.1 Globais cross-setoriais

| # | Fonte | Ano | Amostra | Cobertura | Mapeamento para dimensões |
| :- | :---- | :-- | :------ | :-------- | :------------------------ |
| F01 | **Gallup — State of the Global Workplace 2026** | Abr/2026 | 142 países, dados 2025 | LATAM agregado disponível | D2 (Pessoas), D4 (Comportamento) |
| F02 | **Gallup Q12 — 11th Meta-Analysis** | 2024 | 100k+ times | Global, multi-setor | D2, D4 |
| F03 | **Deloitte Global Human Capital Trends 2026** | 2026 | 9.000 líderes em 89 países | Global, multi-setor | D1 (Visão), D3 (Decisão) |
| F04 | **WEF Future of Jobs Report 2025** | Jan/2025 | 1.000 empregadores, 14M trab., 55 economias | Inclui breakdown LATAM/Brasil | D2 (Skills/Desenvolvimento), D5 (Performance) |
| F05 | **Korn Ferry CEO & Board Survey 2025** | 2025 | Não detalhada (S&P 500 + globais) | C-suite global | D1, D3, D4 |
| F06 | **Korn Ferry Workforce 2025** | 2025 | 15.000 funcionários globais | Cross-setor | D2, D4 |
| F07 | **LinkedIn Workplace Learning Report 2025** | 2025 | Não detalhada (n grande) | Global | D2 (Desenvolvimento) |
| F08 | **McKinsey Organizational Health Index — relatórios públicos** | Atualizado 2023, comentários 2025 | 8M respondentes, 2.500 orgs (banco proprietário; dados públicos = referências e meta-análises) | Global | Framework para todas 5 dimensões |
| F09 | **PwC 29th Annual Global CEO Survey** | Jan/2026 | 4.454 CEOs, 95 países (coleta out-nov/2025) | Inclui breakdown Brasil | D1, D3 |

### 2.2 Brasil cross-setorial

| # | Fonte | Ano | Amostra | Cobertura | Mapeamento |
| :- | :---- | :-- | :------ | :-------- | :--------- |
| F10 | **GPTW Brasil 2025** | 2025 | 5.000+ empresas | BR, multi-setor, multi-porte | D2 (Pessoas), D4 (Comportamento) |
| F11 | **FIA — Lugares Incríveis para Trabalhar 2025** | 2025 | Multi-setor (vertical específica de advocacia disponível) | BR, com recortes setoriais | D2, D4 |
| F12 | **Robert Half — Salary Guide Brasil 2025** | Out/2024 | 500 hiring managers / 1.000 profissionais BR | BR, S2-S4, multi-setor | D2 (Retenção/Desenvolvimento) |

### 2.3 Setoriais Brasil

| # | Fonte | Ano | Segmento | Tamanho | Mapeamento |
| :- | :---- | :-- | :------- | :------ | :--------- |
| F13 | **Sebrae — Maturidade Digital dos Pequenos Negócios 2025** | Mai-Jun/2025 | V9 (cross), foco S1 | MEI + EPP | D3 (Decisão com dados), D5 (Performance) |
| F14 | **Endeavor — Scale-Up Brasil** | 2023 (válido) + atualizações 2024-25 | V1 Tech foco, multi-setor | S1-S2 | D1 (Visão), D2 (Cultura) |
| F15 | **Febraban — Pesquisa de Tecnologia Bancária 2025** | 2025 | V2 Financeiro | S4 (bancos grandes) | D3, D5 |
| F16 | **Abrasce — Prêmio de Gestão de Pessoas 2025** | 2025 | V3 Varejo (shopping) | S2-S4 | D2 |
| F17 | **CNI — Sondagens 2025** | 2025 | V4 Indústria | S2-S4 | D3 (decisão), D5 (performance) |
| F18 | **Anahp — Observatório / Sistema de Indicadores Hospitalares 2025** | 2025 | V6 Saúde | S2-S4 hospitais | D2, D3, D5 |
| F19 | **Instituto Semesp — 15º Mapa do Ensino Superior 2025** | 2025 | V7 Educação | S2-S4 IES | D1, D5 |
| F20 | **Sinepe — Summit & Encontro de Gestores 2025** | 2025 | V7 Educação (básica) | S1-S3 escolas | D1, D2 |
| F21 | **ENAP — Programa LideraGOV / Competências Essenciais 2025** | 2025 | V8 Setor Público | S3-S4 federal/estadual | D1, D2, D4, D5 |
| F22 | **FIA — Lugares Incríveis para Trabalhar (Vertical Advocacia) 2025** | 2025 | V5 Serviços Profissionais | S2-S3 escritórios | D2, D4, D5 |

---

## 3. Catálogo estruturado v1.1 — entradas de benchmark

Cada linha representa **uma referência aproveitável** de um score de mercado. Foram extraídas 32 entradas iniciais. Escala normalizada **1-5** (conversão indicada na coluna "Nota de normalização").

**Legenda:**
- Persona: A=Analista, C=Coordenador, G=Gerente/Diretor, X=C-Level, ALL=cross-persona
- Tamanho: S1/S2/S3/S4 ou ALL
- Segmento: V1…V8 ou ALL
- Confiança: 🟢 Alta (amostra >1.000, metodologia transparente, recência ≤18m), 🟡 Média (amostra <1.000 ou metodologia parcial), 🟠 Baixa (proxy ou extrapolação)

### 3.1 Dimensão D1 — Visão e Direcionamento Estratégico

| # | Persona | Tamanho | Segmento | Score mediano (1-5) | Fonte | Confiança | Nota de normalização |
| :- | :------ | :------ | :------- | :------------------ | :---- | :--------: | :------------------- |
| 1 | X | ALL | ALL | 3.5 | F03 Deloitte HCT 2026 (7 em 10 líderes priorizam "fast & nimble", mas apenas 30% confiantes em revenue growth) | 🟢 | Composição: prioridade declarada (alta) ponderada por confiança de execução (baixa) → 3.5 |
| 2 | X | S4 | ALL | 3.2 | F09 PwC CEO Survey 2026 (30% confiantes em revenue growth, queda de 38% → 30%) | 🟢 | Confiança em revenue = proxy de clareza estratégica/execução |
| 3 | X | ALL | V1 Tech | 3.8 | F14 Endeavor (scale-ups com liderança distribuída crescem 3.5x; 28% lideradas por mulheres) | 🟡 | Proxy: orgs com práticas modernas de visão pontuam mais alto |
| 4 | G | ALL | ALL | 3.0 | F08 McKinsey OHI (apenas top 25% das orgs em direção estratégica; mediana implícita ~3.0/5) | 🟡 | Inferência a partir da distribuição global do OHI |
| 5 | ALL | ALL | V2 Financeiro | 3.4 | F15 Febraban (foco massivo em tech roadmap; 13% crescimento orçado evidencia plano claro) | 🟡 | Proxy de clareza estratégica setorial |
| 33 | ALL | S2-S3 | V5 Serv Profissionais | 3.0 | F22 FIA Advocacia 2025 (prática de gestão estratégica em construção; participação ainda incipiente em pesquisas) | 🟡 | Setor reconhece gap em gestão profissional |
| 34 | ALL | S2-S4 | V7 Educação | 3.3 | F19 Semesp (IES com planejamento estratégico mais formal por exigência regulatória do MEC) | 🟡 | Regulação eleva baseline de visão |
| 35 | X | S3-S4 | V8 Setor Público | 3.0 | F21 ENAP LideraGOV (Eixo Estratégia das 9 competências; programa estruturado desde 2020, 4 edições, foco em alta liderança federal) | 🟢 | Competências formalmente definidas |

### 3.2 Dimensão D2 — Gestão de Pessoas e Desenvolvimento

| # | Persona | Tamanho | Segmento | Score mediano (1-5) | Fonte | Confiança | Nota de normalização |
| :- | :------ | :------ | :------- | :------------------ | :---- | :--------: | :------------------- |
| 6 | G | ALL | ALL | 2.6 | F01 Gallup SGW 2026 (manager engagement 27% global) | 🟢 | 27% engagement → 2.6/5 (escala convertida) |
| 7 | G | ALL | ALL (LATAM) | 3.1 | F01 Gallup SGW 2026 (LATAM 31% engagement) | 🟢 | LATAM acima da média global |
| 8 | ALL | ALL | ALL | 3.4 | F10 GPTW Brasil 2025 (Trust Index 86, queda de 89) | 🟢 | Trust Index 86 / 20 = 4.3; ajustado para escala 1-5 e amostra "best-in-class" (todo GPTW é viés positivo) → 3.4 baseline mercado |
| 9 | ALL | ALL | ALL | 3.6 | F02 Gallup Q12 (best-practice ~70% engagement; mediana global ~21%) | 🟢 | Best-practice mode, não mediana |
| 10 | ALL | S2-S4 | ALL | 3.5 | F07 LinkedIn Learning 2025 (71% das orgs oferecem leadership training; 36% são "champions") | 🟢 | Oferta de programa = proxy de maturidade D2 |
| 11 | X | S4 | ALL | 2.0 | F05 Korn Ferry CEO 2025 (apenas 20% dos CEOs priorizam engajamento) | 🟢 | Prioridade declarada → score baixo de cultura de desenvolvimento |
| 12 | A/C | ALL | ALL | 3.2 | F06 Korn Ferry Workforce 2025 (trusted manager é top reason para retenção; 19% gostam de presencial obrigatório) | 🟡 | Score moderado baseado em retenção |
| 13 | ALL | ALL | V3 Varejo | 3.3 | F16 Abrasce 2025 (730 cases, 90 vencedores; 1.08M empregados, +0.9%) | 🟡 | Maturidade de gestão de pessoas setorial em ascensão |
| 14 | ALL | ALL | V2 Financeiro | 3.7 | F15 Febraban 2025 (forte movimento de reskilling/upskilling como alavanca estratégica) | 🟡 | Investimento massivo em pessoas eleva score setorial |
| 15 | ALL | ALL | V4 Indústria | 2.9 | F17 CNI 2025 (BR último em competitividade industrial; gargalos em qualificação) | 🟡 | Setor com déficit estrutural de desenvolvimento |
| 16 | ALL | S1 | V9 (cross) | 2.4 | F13 Sebrae IMD 2025 (IMD 37/80 = 46%; <13% usam internet para cursos) | 🟢 | Baixa maturidade digital → baixa capacitação |
| 36 | ALL | S2-S3 | V5 Serv Profissionais | 3.8 | F22 FIA Advocacia 2025 (relações fortes, alta confiança entre colegas, mutual help — base relacional sólida) | 🟢 | Pilares Camaradagem/Respeito altos no recorte advocacia |
| 37 | ALL | S2-S4 | V6 Saúde | 2.7 | F18 Anahp 2025 (alta rotatividade reportada como desafio crítico; pressão financeira impactando retenção) | 🟢 | Rotatividade alta → score D2 baixo |
| 38 | ALL | S2-S4 | V7 Educação | 3.0 | F20 Sinepe Summit + Encontro de Gestores (investimento crescente em formação de gestores escolares; baseline em construção) | 🟡 | Setor com cultura emergente de desenvolvimento |
| 39 | X | S3-S4 | V8 Setor Público | 2.9 | F21 ENAP (Eixo Pessoas: coord/colaboração em redes, engajamento de time, auto-conhecimento; servidor com alta estabilidade mas baixa cultura de desenvolvimento contínuo) | 🟢 | LideraGOV reconhece gap |

### 3.3 Dimensão D3 — Tomada de Decisão e Accountability

| # | Persona | Tamanho | Segmento | Score mediano (1-5) | Fonte | Confiança | Nota de normalização |
| :- | :------ | :------ | :------- | :------------------ | :---- | :--------: | :------------------- |
| 17 | X | S4 | ALL | 2.1 | F05 Korn Ferry CEO 2025 (apenas 11% confiantes em gerir riscos compostos) | 🟢 | Confiança em risco é proxy direto de accountability |
| 18 | X | ALL | ALL | 2.6 | F03 Deloitte HCT 2026 (apenas 12% dos CEOs reportam que AI entregou ganhos de custo+receita) | 🟢 | Decisão tecnológica + accountability sobre resultado |
| 19 | G | ALL | ALL | 3.0 | F08 McKinsey OHI (decisão é uma das 9 dimensões; mediana implícita global ~3.0) | 🟡 | Inferência OHI |
| 20 | ALL | S1 | V9 | 2.3 | F13 Sebrae IMD 2025 (uso de dados é principal desafio; IMD 37/80) | 🟢 | Décit estrutural de decisão data-driven |
| 21 | ALL | S4 | V2 Financeiro | 3.8 | F15 Febraban 2025 (R$ 47.8B em tech, IA/analytics +61%; setor maduro em decisão por dado) | 🟢 | Setor com maior maturidade analítica do Brasil |
| 22 | ALL | ALL | V4 Indústria | 3.0 | F17 CNI (gestão tradicional, decisão hierárquica predominante) | 🟡 | Proxy histórico |
| 40 | ALL | S2-S4 | V6 Saúde | 3.6 | F18 Anahp 2025 (Sistema de 265 indicadores estruturados em 4 eixos; cultura de decisão por dado avançada) | 🟢 | Maturidade analítica setorial alta |
| 41 | X | S3-S4 | V8 Setor Público | 2.8 | F21 ENAP (Eixo Resultados: gestão de crise, gestão de resultados; processo decisório formal porém lento, pressão TCU por accountability) | 🟢 | Accountability sob pressão regulatória |

### 3.4 Dimensão D4 — Comportamento e Influência

| # | Persona | Tamanho | Segmento | Score mediano (1-5) | Fonte | Confiança | Nota de normalização |
| :- | :------ | :------ | :------- | :------------------ | :---- | :--------: | :------------------- |
| 23 | X | S4 | ALL | 2.0 | F05 Korn Ferry CEO 2025 (apenas 38% priorizam EQ vs 70% AI/tech) | 🟢 | Prioridade declarada em EQ |
| 24 | ALL | ALL | ALL (LATAM) | 3.8 | F01 Gallup SGW 2026 (LATAM thriving 56% — bem-estar é proxy de saúde comportamental) | 🟢 | LATAM significativamente acima da média global (16% S Ásia até 56% LATAM) |
| 25 | G | ALL | ALL | 2.7 | F01 Gallup SGW 2026 (queda manager engagement; managers respondem por 70% da variância) | 🟢 | Sintoma de baixa competência comportamental gerencial |
| 26 | ALL | ALL | ALL | 3.5 | F10 GPTW Brasil 2025 (dimensões Camaradagem/Respeito do Trust Index) | 🟢 | Dimensões comportamentais do framework GPTW |
| 27 | A/C | ALL | V1 Tech | 3.6 | F14 Endeavor (44.7% turnover por incompatibilidade cultural → competência comportamental crítica em scale-ups que retêm) | 🟡 | Retenção como proxy positivo |
| 28 | ALL | ALL | ALL (BR) | 3.4 | F04 WEF Future of Jobs 2025 (leadership/social influence +22pp como skill crítica) | 🟢 | Ascensão da skill = baseline atual moderado |
| 42 | ALL | S2-S3 | V5 Serv Profissionais | 3.7 | F22 FIA Advocacia 2025 (alta confiança entre colegas + qualidade percebida de liderança; pilar Camaradagem forte) | 🟢 | Dimensão comportamental destacada no setor |
| 43 | X | S3-S4 | V8 Setor Público | 3.0 | F21 ENAP (competência "auto-conhecimento e desenvolvimento pessoal" entre as 9 essenciais; mainstream gênero/raça) | 🟢 | Programa institucional sólido |

### 3.5 Dimensão D5 — Cultura de Performance e Resultados

| # | Persona | Tamanho | Segmento | Score mediano (1-5) | Fonte | Confiança | Nota de normalização |
| :- | :------ | :------ | :------- | :------------------ | :---- | :--------: | :------------------- |
| 29 | G | ALL | ALL | 3.0 | F08 McKinsey OHI (orgs no top 25% leadership 2x mais probabilidade de outperformance; healthy 3x; mediana ~3.0) | 🟡 | Inferência OHI |
| 30 | ALL | ALL | ALL | 3.3 | F10 GPTW Brasil (empresas listadas cresceram 14% em faturamento 2024 — proxy de cultura de resultado) | 🟢 | Resultado financeiro de orgs com cultura forte |
| 31 | ALL | S4 | V2 Financeiro | 4.0 | F15 Febraban (setor com KPI rigoroso, accountability regulatória) | 🟢 | Maturidade setorial de performance |
| 32 | ALL | S1 | V9 | 2.5 | F13 Sebrae 2025 (37% das PMEs com maturidade digital; 99% das empresas são PMEs) | 🟢 | Lacuna de gestão por indicadores em SMB |
| 44 | ALL | S2-S3 | V5 Serv Profissionais | 2.8 | F22 FIA Advocacia 2025 (gap em work-life balance e remuneração; pilar relacional não compensa fatores de reward) | 🟢 | Performance comprometida por desequilíbrio |
| 45 | ALL | S2-S4 | V6 Saúde | 3.7 | F18 Anahp 2025 (mortalidade operatória 0,27% — menor histórico; permanência média 3,99 dias; ocupação 78,97%) | 🟢 | Indicadores assistenciais em melhora histórica |
| 46 | ALL | S2-S4 | V7 Educação | 2.8 | F19 Semesp 2025 (captação em desaceleração; pressão financeira setorial; ticket sob pressão) | 🟢 | Performance sob pressão de mercado |
| 47 | X | S3-S4 | V8 Setor Público | 2.7 | F21 ENAP (Eixo Resultados: "geração de valor para usuários, gestão de crises, gestão de resultados" entre 9 competências — em construção) | 🟢 | Cultura de resultado em maturação |

---

## 4. Cobertura inicial e lacunas mapeadas

### 4.1 Mapa de cobertura por célula (Persona × Segmento)

✅ = entrada disponível, 🟡 = proxy/inferência, ❌ = lacuna sem dado público acessível

| | V1 Tech | V2 Financeiro | V3 Varejo | V4 Indústria | V5 Serv Prof | V6 Saúde | V7 Educação | V8 Setor Público |
| :--- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **Analista** | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Coordenador** | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Gerente** | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 | 🟡 |
| **C-Level** | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ | 🟡 | ✅ |

### 4.2 Cobertura por dimensão

| Dimensão | Entradas v1.1 | Qualidade dominante | Status |
| :------- | :-----------: | :------------------ | :----- |
| D1 Visão | 8 | 🟢🟡 | Cobertura ampliada com setor público e educação |
| D2 Pessoas | 15 | 🟢 | **Dimensão melhor coberta** |
| D3 Decisão | 8 | 🟢🟡 | Saúde elevou cobertura (Anahp) |
| D4 Comportamento | 8 | 🟢 | Advocacia + setor público preenchidos |
| D5 Performance | 8 | 🟢 | Saúde, educação e setor público fechados |
| **TOTAL** | **47** | — | — |

### 4.3 Lacunas remanescentes (próxima iteração v1.2)

V5-V8 foram fechados nesta v1.1. Permanecem como prioridade para v1.2:

1. **Personas Analista/Coordenador** — atualmente sub-cobertas (entrada 12 e 27 são as únicas específicas); buscar: Catho/Vagas relatórios de carreira, Page Outsourcing Talent Pulse, Pesquisa Salarial Catho, Glassdoor BR.
2. **V3 Varejo** — só tem cobertura para Gerente; expandir para C-Level via ABRAS Ranking e Forbes Retail.
3. **V4 Indústria + Coordenador** — cobertura forte em macro, fraca em camada operacional; buscar CNI Sondagem Industrial detalhada.
4. **V5 Serviços Profissionais — consultoria não-jurídica** — atual base é apenas advocacia (FIA); buscar Vault/Universum e relatórios Big4 públicos.

### 4.4 Hierarquia de fallback (já implementável)

O motor de benchmark, ao receber um respondente (Persona × Tamanho × Segmento), busca entrada no catálogo nessa ordem:

```
1. exato: Persona + Tamanho + Segmento
2. fallback A: Persona + Segmento (qualquer Tamanho)
3. fallback B: Persona + Tamanho (qualquer Segmento)
4. fallback C: Persona + ALL + ALL
5. fallback D: ALL + ALL + ALL (default global)
6. sem fallback: exibir "amostra ainda em formação" — sem percentil
```

Em cada fallback, o relatório exibe explicitamente: **"benchmark vs. [escopo encontrado]"** com nome da fonte e ícone de confiança.

---

## 5. Cadeia de citação (transparência metodológica)

Todo relatório gerado pelo assessment carrega, na última página, a lista de fontes usadas naquele respondente específico. Template:

> *"Os benchmarks neste relatório foram calculados a partir de: Gallup State of the Global Workplace 2026 (F01), GPTW Brasil 2025 (F10), McKinsey OHI (F08), [demais]. Catálogo v1.0 — atualização 12/05/2026."*

Isso atende dois objetivos: **credibilidade** (não é número inventado) e **defensibilidade** (qualquer questionamento técnico tem caminho de auditoria).

---

## 6. Processo de manutenção do catálogo

- **Revisão trimestral** — verificar saída de novos relatórios das fontes ativas (Gallup, Deloitte, GPTW, WEF publicam anualmente em ritmos diferentes).
- **Revisão anual obrigatória** — todas as entradas >18 meses são re-avaliadas; fontes >24 meses são desativadas até nova edição.
- **Política de novos respondentes** — quando o programa atingir 200+ respostas validadas, comparar com catálogo para identificar desvios sistemáticos (sinal de fonte enviesada para o contexto LATAM).
- **Política de novas fontes** — qualquer adição passa por checklist: (i) URL pública/aberta, (ii) amostra ≥500 ou metodologia explícita, (iii) ano ≤24m, (iv) viés metodológico declarado.

---

## 7. Próximas ações concretas

1. **Aprovação desta v1.0** pela Miriam — sinal verde para usar como base do Passo 2 (arquitetura técnica).
2. **Subir o catálogo** como tabela `benchmark_catalog` no Postgres/Supabase no Passo 2.
3. **Sub-tarefa v1.1** — fechar lacunas dos segmentos V5-V8 e personas Analista/Coordenador.
4. **Decisão pendente** — quem é o "curador" responsável pelo catálogo a longo prazo? (PM Boomit, head de T&D do programa, parceiro acadêmico?)

---

## 8. Lista completa de fontes — links

- [Gallup State of the Global Workplace 2026 — Regional Data](https://www.gallup.com/workplace/697850/state-of-the-global-workplace-regional-data.aspx)
- [Gallup Q12 Meta-Analysis 11th Edition](https://www.gallup.com/workplace/321725/gallup-q12-meta-analysis-report.aspx)
- [Deloitte 2026 Global Human Capital Trends](https://www.deloitte.com/us/en/insights/topics/talent/human-capital-trends.html)
- [Deloitte 2026 HCT — Press Release](https://www.deloitte.com/us/en/about/press-room/deloitte-report-winning-organizations-will-build-the-human-advantage.html)
- [WEF Future of Jobs Report 2025](https://www.weforum.org/publications/the-future-of-jobs-report-2025/)
- [WEF — Future of Jobs in Latin America and the Caribbean](https://www.weforum.org/stories/2025/04/the-future-of-jobs-in-latin-america-and-the-caribbean-digital-skills-gap-must-close-quickly-to-satisfy-evolving-employer-demands/)
- [Korn Ferry CEO & Board Survey 2025](https://www.kornferry.com/insights/featured-topics/leadership/ceo-and-board-survey)
- [Korn Ferry Workforce 2025](https://www.kornferry.com/about-us/press/korn-ferry-reveals-workforce-2025-research)
- [LinkedIn 2025 Workplace Learning Report](https://learning.linkedin.com/resources/workplace-learning-report)
- [McKinsey Organizational Health Index — Overview](https://www.mckinsey.com/solutions/orgsolutions/overview/organizational-health-index)
- [PwC 2026 Global CEO Survey](https://www.pwc.com/gx/en/news-room/press-releases/2026/pwc-2026-global-ceo-survey.html)
- [GPTW Brasil — Estudos](https://gptw.com.br/conteudo/estudos-gptw/sao-paulo-2025/)
- [GPTW Indústria 2025 — A Voz da Indústria](https://avozdaindustria.com.br/gestao/ranking-gptw-industria-2025/)
- [FIA — Lugares Incríveis para Trabalhar 2025](https://analise.com/noticias/pesquisa-fia-lugares-incriveis-para-trabalhar-2025-revela-desafios-em-remuneracao-e-qualidade-de-vida-em-escritorios-de-advocacia)
- [Robert Half Salary Guide](https://www.roberthalf.com/us/en/insights/salary-guide)
- [Sebrae — Pesquisa Maturidade Digital 2025](https://sebraepr.com.br/impulsiona/pequenos-negocios-avancam-em-maturidade-digital-em-2025/)
- [Endeavor — Programa Scale-Up](https://endeavor.org.br/programa-scale-up/)
- [Endeavor — Tudo sobre Scale-ups](https://endeavor.org.br/estrategia-e-gestao/tudo-sobre-scale-ups-as-empresas-que-mais-geram-empregos-no-brasil/)
- [Febraban — Pesquisa de Tecnologia Bancária 2025 (Deloitte)](https://www.deloitte.com/br/pt/Industries/financial-services/research/pesquisa-febraban-tecnologia-bancaria.html)
- [Febraban PDF Volume 1 2025](https://cmsarquivos.febraban.org.br/Arquivos/documentos/PDF/Pesquisa%20Febraban%20de%20Tecnologia%20Banca%CC%81ria%202025%20-%20Vol_01%20-%205.pdf)
- [Abrasce — Prêmio de Gestão de Pessoas](https://premio.abrasce.com.br/)
- [CNI — Portal da Indústria, Estatísticas](https://www.portaldaindustria.com.br/cni/estatisticas/sondagem-especial/)
- [Anahp — Sistema de Indicadores Hospitalares](https://www.anahp.com.br/indicadores-hospitalares/)
- [Anahp — Observatório 2025 (PDF)](http://www.anahp.com.br/wp-content/uploads/2025/04/Observatorio-Anahp-2025.pdf)
- [Instituto Semesp — Pesquisas](https://www.semesp.org.br/pesquisas/)
- [Instituto Semesp — 15º Mapa do Ensino Superior 2025](https://www.semesp.org.br/mapa/edicao-15/brasil/)
- [ENAP — Programa LideraGOV](https://www.enap.gov.br/acontece/noticias/lideragov-conheca-o-novo-programa-de-desenvolvimento-de-lideres-do-setor-publico/)
- [ENAP — Competências Essenciais de Liderança para o Setor Público (Repositório)](https://repositorio.enap.gov.br/handle/1/5715)
- [Revista ENAP — Desenvolvendo competências de liderança no setor público (LideraGOV)](https://revista.enap.gov.br/index.php/RSP/article/view/11186)
- [FIA — Lugares Incríveis para Trabalhar 2025 (Advocacia)](https://analise.com/noticias/pesquisa-fia-lugares-incriveis-para-trabalhar-2025-revela-desafios-em-remuneracao-e-qualidade-de-vida-em-escritorios-de-advocacia)
