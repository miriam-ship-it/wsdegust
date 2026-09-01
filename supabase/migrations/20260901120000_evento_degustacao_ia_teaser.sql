-- =============================================================
-- EVENTO PRÓPRIO PARA O TEASER DE MATURIDADE DE IA (degustação)
--
-- Decisão da Miriam (01/09): o link do WS Degust ganha uma SEGUNDA página
-- (frontend/ia.html), que roda o diagnóstico de Maturidade de IA no formato
-- teaser. Ela COEXISTE com o diagnóstico de Liderança que já está no ar —
-- nada do que existe muda de comportamento.
--
-- A separação é a mesma dos outros: uma linha em `eventos`. O front de IA
-- enxerga o mundo pelo slug 'boomit-degustacao-ia'. Os leads de IA nascem
-- separados dos 30 da degustação de liderança e dos 71 do IBMEC.
--
-- Duas mudanças, ambas ADITIVAS (não tocam o fluxo de liderança):
--   1. Coluna nullable `respondentes.ia_resultado` (jsonb) — guarda o nível
--      Centauro e os 6 eixos calculados na tela, junto do lead. O INSERT de
--      liderança nunca preenche essa coluna; fica null e é ignorada.
--   2. A linha do evento + o acesso do painel (admin_eventos) para a Miriam.
--
-- O modelo de `respostas` (dimensao D1..D5, lente pessoa/empresa) NÃO cabe os
-- 6 eixos da IA — por isso o resultado do teaser mora em `ia_resultado`, e o
-- teaser não grava em `respostas`. O lead (nome, empresa, e-mail, consent)
-- mora em `respondentes`, como todo mundo.
-- =============================================================

-- 1. Coluna aditiva para o resultado do teaser de IA (nullable).
alter table public.respondentes
  add column if not exists ia_resultado jsonb;

comment on column public.respondentes.ia_resultado is
  'Resultado do teaser de Maturidade de IA (nível Centauro 1-5 + 6 eixos), '
  'calculado na tela e gravado junto do lead. Null para respondentes de '
  'liderança. Ver frontend/ia.html.';

-- 2. Evento próprio do teaser de IA.
insert into public.eventos (slug, nome, cliente, ativo, catalogo_versao, questionario_versao)
values (
  'boomit-degustacao-ia',
  'Diagnóstico de Maturidade de IA · Degustação',
  'Boomit',
  true,
  'v1.1',
  'ia-teaser-v1'
)
on conflict (slug) do nothing;

-- 3. A Miriam enxerga os leads de IA no mesmo painel (admin.html).
insert into public.admin_eventos (email, evento_id)
select 'miriam@boomit.com.br', id from public.eventos where slug = 'boomit-degustacao-ia'
on conflict (email, evento_id) do nothing;
