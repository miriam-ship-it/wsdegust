-- =============================================================
-- respostas.texto_livre — o "Outro" do CTX01 precisa de onde morar
--
-- O documento aprovado prevê, no item CTX01, a alternativa "Outro — abrir
-- campo de texto". Sem uma coluna, esse texto só existiria no localStorage do
-- navegador: sumiria ao trocar de máquina, ao limpar o navegador e ao gerar o
-- relatório no servidor — que é justamente quem precisa dele para escrever
-- "Outro: consultor independente" em vez de só "Outro" na página de contexto.
--
-- Aditiva e nula por padrão: nenhuma linha existente muda, e a forma Likert do
-- IBMEC segue sem tocar nesta coluna.
--
-- 🔒 É texto livre digitado por quem responde. Ele NUNCA é interpretado como
--    instrução, nem entra em cálculo: aparece escapado na devolutiva, como
--    dado, e só no relatório da própria pessoa.
-- =============================================================

alter table public.respostas
  add column if not exists texto_livre text;

comment on column public.respostas.texto_livre is
  'Texto digitado quando a alternativa escolhida declara campo aberto (texto_livre na definição do instrumento). NULL em todas as demais respostas.';

-- Um teto simples: o campo na tela já limita em 120 caracteres, e a trava no
-- banco impede que uma requisição fora da tela grave um texto enorme.
alter table public.respostas drop constraint if exists respostas_texto_livre_tamanho;
alter table public.respostas add constraint respostas_texto_livre_tamanho
  check (texto_livre is null or char_length(texto_livre) <= 200);
