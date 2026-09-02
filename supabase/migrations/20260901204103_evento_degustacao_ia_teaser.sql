alter table public.respondentes
  add column if not exists ia_resultado jsonb;

comment on column public.respondentes.ia_resultado is
  'Resultado do teaser de Maturidade de IA (nivel Centauro 1-5 + 6 eixos), calculado na tela e gravado junto do lead. Null para respondentes de lideranca. Ver frontend/ia.html.';

insert into public.eventos (slug, nome, cliente, ativo, catalogo_versao, questionario_versao)
values (
  'boomit-degustacao-ia',
  'Diagnostico de Maturidade de IA · Degustacao',
  'Boomit',
  true,
  'v1.1',
  'ia-teaser-v1'
)
on conflict (slug) do nothing;

insert into public.admin_eventos (email, evento_id)
select 'miriam@boomit.com.br', id from public.eventos where slug = 'boomit-degustacao-ia'
on conflict (email, evento_id) do nothing;