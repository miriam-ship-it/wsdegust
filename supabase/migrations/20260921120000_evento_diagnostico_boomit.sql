-- =============================================================
-- EVENTO DEDICADO · Diagnóstico Boomit (slug `diagnosticoboomit`)
--
-- Este banco é COMPARTILHADO por vários eventos. O Diagnóstico Boomit entra
-- como uma LINHA PRÓPRIA em public.eventos — não como tabela paralela, não
-- reaproveitando respondente de outro evento. O isolamento é o evento_id, e
-- ele já é sustentado pelas migrations de segurança de 14/08 e 17/08, que
-- esta migration NÃO desfaz.
--
-- O que muda aqui, e por quê:
--
--   1. public.respostas ganha `opcao_codigo` e passa a aceitar DUAS formas.
--      A tabela nasceu para o instrumento IBMEC: Likert 1–5, cinco dimensões
--      D1–D5, duas lentes ('pessoa'/'empresa'). O Diagnóstico Boomit grava
--      outra coisa — item 'EST01' com opção 'E2', item 'GOV01' com condição
--      'G2', lentes 'Pessoa', 'Organização', 'Atuação' e 'Contexto'. Não cabe.
--
--      A alternativa seria uma tabela `respostas_diagnostico` paralela, e ela
--      quebraria a cadeia respostas.respondente_id → respondentes.id que o
--      painel, o export e o cascade de LGPD já usam. Então a tabela é
--      ALARGADA, de forma aditiva:
--        · dimensao, lente e valor deixam de ser NOT NULL;
--        · entra `opcao_codigo`;
--        · um CHECK exige que a linha esteja COMPLETA em uma das duas formas.
--
--      🔒 Nada disso afrouxa o que já existe: toda linha antiga tem dimensao,
--         lente e valor preenchidos e continua válida pelo mesmo caminho. Os
--         checks de domínio (D1–D5, pessoa/empresa, 1–5) seguem intactos —
--         com NULL eles simplesmente não se aplicam.
--
--   2. Uma view de export SÓ deste evento. A v_leads_export existente deduz
--      temperatura do lead de `maturidade_score`, que neste evento é NULL de
--      propósito (a escala E1–E4 ainda não foi confirmada). Deduzir 'frio' de
--      um NULL seria inventar informação comercial — a view nova não faz isso.
--
-- COMO DESATIVAR O EVENTO SEM APAGAR DADO:
--     update public.eventos set ativo = false where slug = 'diagnosticoboomit';
--   O link para de resolver o evento (o front filtra por ativo = true) e a
--   policy de insert de anon deixa de aceitar respondente novo. Respondentes,
--   respostas e relatórios já gravados permanecem, e o painel continua lendo.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · respostas passa a comportar os dois instrumentos
-- -------------------------------------------------------------
alter table public.respostas
  add column if not exists opcao_codigo text;

comment on column public.respostas.opcao_codigo is
  'Código da alternativa escolhida em instrumentos categóricos (E1–E4, NA, G1–G3, P1–P6, N1–N5). NULL no instrumento Likert do IBMEC, que usa `valor`.';

alter table public.respostas alter column dimensao drop not null;
alter table public.respostas alter column lente     drop not null;
alter table public.respostas alter column valor     drop not null;

-- A linha tem que estar completa em UMA das duas formas. Sem isto, tirar o
-- NOT NULL abriria espaço para linha pela metade nos dois instrumentos.
alter table public.respostas drop constraint if exists respostas_forma_completa;
alter table public.respostas add constraint respostas_forma_completa check (
  (valor is not null and dimensao is not null and lente is not null)
  or
  (opcao_codigo is not null)
);

create index if not exists idx_respostas_opcao on public.respostas(opcao_codigo)
  where opcao_codigo is not null;

-- -------------------------------------------------------------
-- 2 · o evento dedicado
-- -------------------------------------------------------------
-- on conflict do nothing é seguro aqui: o slug não existe hoje (verificado em
-- 21/09/2026) e, se existisse, sobrescrevê-lo é exatamente o que NÃO se quer.
insert into public.eventos
  (slug, nome, cliente, inicio_em, fim_em, catalogo_versao, questionario_versao, ativo)
values (
  'diagnosticoboomit',
  'Diagnóstico Boomit',
  'Boomit',
  null,                        -- link permanente: sem janela de datas
  null,
  'blueprint-40-final',
  'screener-publico-v1',
  true
)
on conflict (slug) do nothing;

-- quem enxerga este evento no painel
insert into public.admin_eventos (email, evento_id)
select 'miriam@boomit.com.br', id from public.eventos where slug = 'diagnosticoboomit'
on conflict (email, evento_id) do nothing;

-- -------------------------------------------------------------
-- 3 · export do evento — e só dele
-- -------------------------------------------------------------
-- 🔒 Filtro por slug DENTRO da view, não no chamador: assim nenhum SELECT
--    distraído traz respondente de outro evento. security_invoker garante que
--    a RLS de quem pergunta continue valendo dentro da view — foi exatamente
--    o buraco corrigido em 14/08 nas views antigas.
drop view if exists public.v_diagnosticoboomit_export;
create view public.v_diagnosticoboomit_export as
select
  r.id::text            as respondente_id,
  e.slug                as evento_slug,
  e.nome                as evento_nome,
  r.nome,
  r.empresa,
  r.cargo,
  r.email,
  r.email_capturado_em,
  r.consentimento_lgpd,
  r.consentimento_marketing,
  r.iniciado_em,
  r.submetido_em,
  r.tempo_segundos,
  r.versao_questionario,
  rel.catalogo_versao,
  rel.motor_versao,
  -- perfil (CTX01–CTX03) — contexto, não pontuação
  rel.scores_json -> 'perfil' -> 'CTX01' ->> 'texto' as papel,
  rel.scores_json -> 'perfil' -> 'CTX02' ->> 'texto' as alcance,
  rel.scores_json -> 'perfil' -> 'CTX03' ->> 'texto' as participacao_em_decisao,
  -- gate de governança: regra aprovada, não depende da escala E1–E4
  rel.scores_json -> 'governanca' ->> 'gate'            as governanca_gate,
  rel.scores_json -> 'governanca' ->> 'item_determinante' as governanca_item,
  -- cobertura declarada
  (rel.scores_json -> 'cobertura_geral' ->> 'considerados')::int as itens_respondidos,
  (rel.scores_json -> 'cobertura_geral' ->> 'na')::int           as itens_sem_exposicao,
  -- 🔒 NÃO existe coluna de temperatura de lead aqui. Ela dependeria da nota de
  --    maturidade, e a escala E1–E4 ainda não foi confirmada. Deduzir 'frio'
  --    de um NULL entregaria ao comercial uma informação que ninguém apurou.
  rel.pdf_url,
  rel.pdf_gerado_em,
  rel.pdf_enviado_em,
  rel.erro_geracao
from public.respondentes r
join public.eventos e            on e.id = r.evento_id
left join public.relatorios rel  on rel.respondente_id = r.id
where e.slug = 'diagnosticoboomit';

comment on view public.v_diagnosticoboomit_export is
  'Export do evento diagnosticoboomit e de mais nenhum. Sem temperatura de lead: ela dependeria da nota de maturidade, que segue em validação.';

alter view public.v_diagnosticoboomit_export set (security_invoker = on);

revoke all on public.v_diagnosticoboomit_export from anon;
grant select on public.v_diagnosticoboomit_export to authenticated;
