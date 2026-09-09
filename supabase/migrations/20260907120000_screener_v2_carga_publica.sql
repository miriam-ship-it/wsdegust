-- =============================================================
-- SCREENER_IA_V2 — carga do instrumento SCREENER_IA_V2 2.0.0 + vínculo público
--
-- ⚠️ GERADO por screener/loader/gerar-carga-v2.mjs a partir de
--    screener/v2/instrumento-ia-v2.mjs — NÃO editar à mão. Para mudar o
--    conteúdo, edite a fonte e regenere (o checksum muda junto).
--
-- ⚠️ NÃO APLICADA À PRODUÇÃO. Rode DEPOIS da migration de schema+rpc V2
--    (20260906120000). Transacional (bloco DO atômico) e idempotente:
--   INSTRUMENTO: insere se ausente; no-op só se checksum E definição batem;
--     falha se checksum diverge, ou se checksum bate mas definição diverge.
--   VÍNCULO: idempotência explícita (sem cláusula silenciosa de conflito).
--     Nasce PÚBLICO (public_pilot) SEM credencial — o link é público (isca de lead),
--     captura obrigatória (required_before_result). Aplicar isto = deixar o evento pronto
--     para ir ao ar assim que a edge e o frontend estiverem publicados.
--
-- checksum = sha256(canonicalize(definição)) = 0c2368ad3ce16cc6ab0c3f0d21fde4acbf539aa61ba2a1fac4a577e2112d679b
-- =============================================================
do $$
declare
  v_code        text  := 'SCREENER_IA_V2';
  v_version     text  := '2.0.0';
  v_checksum    text  := '0c2368ad3ce16cc6ab0c3f0d21fde4acbf539aa61ba2a1fac4a577e2112d679b';
  v_definition  jsonb := $def${"code":"SCREENER_IA_V2","eixos":{"lideranca":{"code":"lideranca","name":"Maturidade da liderança","papel":"direciona, mede, redesenha e sustenta o valor"},"tecnico":{"code":"tecnico","name":"Uso técnico da IA","papel":"o quê/como a IA é usada"}},"name":"Diagnóstico de nível de maturidade em IA","niveis":[{"code":"OPERACIONAL_AGIL","n":1,"name":"Operacional Ágil","resumo":"IA em tarefas individuais; ganho de produtividade pessoal; o processo não muda."},{"code":"GESTOR_TATICO","n":2,"name":"Gestor Tático","resumo":"IA embutida em processos da área; processos visíveis; decisão por dados; margem."},{"code":"ESTRATEGISTA_ESCALA","n":3,"name":"Estrategista de Escala","resumo":"IA sustenta decisões estratégicas e novas receitas; escala."},{"code":"ARQUITETO_IA","n":4,"name":"Arquiteto de IA","resumo":"IA no núcleo do negócio, solução proprietária; força híbrida pessoas + agentes."}],"questoes":[{"axis":"tecnico","code":"Q1","dimension":"Alcance do uso","options":[{"level":1,"text":"Quase não é usada; quando ocorre, é para tarefas individuais (redigir, resumir, pesquisar), sem mudar o processo."},{"level":2,"text":"Está embutida em processos da área, com fluxo e responsáveis definidos."},{"level":3,"text":"Sustenta decisões estratégicas e novas fontes de receita ou escala."},{"level":4,"text":"Está no núcleo do produto/serviço, como solução proprietária que diferencia a empresa."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Como a IA é usada hoje na sua área?"},{"axis":"tecnico","code":"Q2","dimension":"Dados e integração","options":[{"level":1,"text":"Não há dados organizados nem integração; o uso é pontual, com dados soltos ou manuais."},{"level":2,"text":"Há dados com qualidade e acesso definidos, integrados aos casos prioritários."},{"level":3,"text":"Dados e arquitetura sustentam vários casos, com monitoramento e ciclo de vida."},{"level":4,"text":"Existe uma plataforma de dados/IA própria, base de vantagem competitiva."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Sobre os dados e sistemas que a IA usa:"},{"axis":"tecnico","code":"Q3","dimension":"Governança dos usos","options":[{"level":1,"text":"Não há regra nem registro; cada um usa como quer."},{"level":2,"text":"Há política, papéis e limites de autonomia definidos para os usos."},{"level":3,"text":"Há auditoria, métricas de qualidade e processo de incidentes ativos."},{"level":4,"text":"Governança madura integra ética, compliance e ciclo de vida dos agentes ao negócio."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Sobre regra, autonomia e responsabilidade da IA:"},{"axis":"lideranca","code":"Q4","dimension":"Direção estratégica","options":[{"level":1,"text":"Não decide; o uso surge por iniciativa individual, sem conexão com a estratégia."},{"level":2,"text":"Conecta os usos de IA às prioridades da área ou da empresa."},{"level":3,"text":"Usa IA para destravar metas estratégicas e abrir novas frentes de valor."},{"level":4,"text":"Antecipa movimentos de mercado e cria barreiras competitivas com IA."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Como a liderança decide onde usar IA?"},{"axis":"lideranca","code":"Q5","dimension":"Medição de valor (ROI)","options":[{"level":1,"text":"Não se mede; fala-se por percepção geral."},{"level":2,"text":"Há linha de base, indicadores e um responsável pelo acompanhamento."},{"level":3,"text":"Benefícios, custos e riscos são revistos e orientam decisões de continuar ou ampliar."},{"level":4,"text":"O valor da IA é gerido como carteira, ligado a receita/margem no plano de negócio."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Como se mede o resultado dos usos de IA?"},{"axis":"lideranca","code":"Q6","dimension":"Estrutura e cargos","options":[{"level":1,"text":"Nada muda; a estrutura segue igual, mesmo com IA em uso."},{"level":2,"text":"Cargos e competências começam a ser reclassificados (o que é feito com IA vs. sem IA)."},{"level":3,"text":"Há redesenho de área com requalificação e recolocação conduzidos."},{"level":4,"text":"A estrutura é desenhada para uma força híbrida (pessoas + agentes), com papéis de orquestração."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Diante da IA, o que acontece com cargos e competências?"},{"axis":"lideranca","code":"Q7","dimension":"Prontidão do líder","options":[{"level":1,"text":"Decide por intuição, ignora dados e tende a repetir os mesmos erros."},{"level":2,"text":"Usa dados, cria processos documentados e busca a causa raiz dos problemas."},{"level":3,"text":"Além disso, experimenta ferramentas novas e desenvolve o time para a mudança."},{"level":4,"text":"Orquestra pessoas e agentes, antecipa cenários e forma outros líderes."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Como o líder da área costuma conduzir decisões e problemas?"},{"axis":"lideranca","code":"Q8","dimension":"Pessoas e mudança","options":[{"level":1,"text":"Não se fala sobre isso; o tema gera medo ou resistência."},{"level":2,"text":"Há comunicação e treinamento nas ferramentas."},{"level":3,"text":"Há trilhas de requalificação e transição conduzidas com transparência."},{"level":4,"text":"A colaboração humano-agente faz parte da cultura, com papéis e desenvolvimento contínuos."},{"na":true,"text":"Não sei / não se aplica."}],"prompt":"Como a área lida com o efeito da IA nas pessoas?"}],"scoring":{"cobertura_min":{"lideranca":3,"tecnico":2},"folga_lideranca":1,"gap_fragil":2,"niveis_max":4,"niveis_min":1,"pesos":{"lideranca":0.6,"tecnico":0.4}},"senioridade":[{"code":"analista","esperado":1,"label":"Analista / operacional — executo tarefas"},{"code":"especialista","esperado":2,"label":"Especialista / sênior — referência técnica, sem gestão"},{"code":"gerencia","esperado":2,"label":"Coordenação / gerência — lidero pessoas e/ou processos"},{"code":"diretoria","esperado":3,"label":"Diretoria / C-level — defino estratégia"}],"version":"2.0.0"}$def$::jsonb;
  -- configuração PRETENDIDA do vínculo público V2 (isca de lead)
  v_slug        text    := 'boomit-degustacao-ia-v2';
  v_status      text    := 'public_pilot';
  v_is_current  boolean := true;
  v_result_mode text    := 'immediate';
  v_lead_mode   text    := 'required_before_result';
  v_session_ret integer := 180;
  v_lead_ret    integer := 365;
  v_branding    jsonb   := '{}'::jsonb;
  -- estado existente
  v_ex_sum   text;
  v_ex_def   jsonb;
  v_b        public.screener_event_bindings%rowtype;
begin
  -- ---------- INSTRUMENTO ----------
  select checksum, definition into v_ex_sum, v_ex_def
    from public.screener_instrument_versions
    where instrument_code = v_code and instrument_version = v_version;

  if not found then
    insert into public.screener_instrument_versions
      (instrument_code, instrument_version, definition, checksum, status)
      values (v_code, v_version, v_definition, v_checksum, 'inactive');
    raise notice 'carga v2: instrumento % % inserido (inativo)', v_code, v_version;
  elsif v_ex_sum is distinct from v_checksum then
    raise exception 'carga v2 recusada: checksum divergente para % % (banco=%, repo=%). Publique uma nova versão.',
      v_code, v_version, v_ex_sum, v_checksum;
  elsif v_ex_def is distinct from v_definition then
    raise exception 'carga v2 recusada: checksum igual mas definição divergente para % % — possível checksum cadastrado incorretamente.',
      v_code, v_version;
  else
    raise notice 'carga v2: instrumento % % já presente e coincidente — no-op', v_code, v_version;
  end if;

  -- ---------- VÍNCULO (idempotência explícita) ----------
  select * into v_b
    from public.screener_event_bindings
    where event_slug = v_slug and instrument_code = v_code and instrument_version = v_version;

  if not found then
    if exists (select 1 from public.screener_event_bindings where event_slug = v_slug and is_current) then
      raise exception 'carga v2 recusada: já existe outro vínculo corrente para o evento % — recuso criar duplicado.', v_slug;
    end if;
    insert into public.screener_event_bindings
      (event_slug, instrument_code, instrument_version, is_current, status, result_mode, lead_capture_mode,
       session_retention_days, lead_retention_days, branding)
      values (v_slug, v_code, v_version, v_is_current, v_status, v_result_mode, v_lead_mode,
              v_session_ret, v_lead_ret, v_branding);
    raise notice 'carga v2: vínculo % criado (status %)', v_slug, v_status;
  elsif v_b.status = v_status
        and v_b.is_current = v_is_current
        and v_b.result_mode = v_result_mode
        and v_b.lead_capture_mode = v_lead_mode
        and v_b.branding = v_branding
        and v_b.session_retention_days is not distinct from v_session_ret
        and v_b.lead_retention_days is not distinct from v_lead_ret then
    raise notice 'carga v2: vínculo % já presente e coincidente — no-op', v_slug;
  else
    raise exception 'carga v2 recusada: vínculo % existe com configuração divergente — recuso sobrescrever.', v_slug;
  end if;
end
$$;
