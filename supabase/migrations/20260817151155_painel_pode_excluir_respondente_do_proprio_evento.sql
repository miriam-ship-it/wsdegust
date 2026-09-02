-- =============================================================
-- O PAINEL PASSA A PODER EXCLUIR — só no evento que é dele
--
-- Quando a RLS foi apertada (14/08), authenticated perdeu o ALL e ficou com
-- SELECT: o painel só lia. Agora precisa apagar respondente de teste, e pedido
-- de LGPD ("apague meus dados") também cai aqui.
--
-- 🔒 O DELETE é do respondente, e só dele. As respostas e o relatório vão
--    junto por cascade (definido no schema inicial), então não abro DELETE nas
--    outras tabelas — menos superfície, mesmo resultado. O PDF no Storage não
--    é alcançado por RLS de tabela; o painel remove em separado, e falha nisso
--    não impede a exclusão do dado.
--
-- 🔒 O filtro é o mesmo das outras policies: eventos_do_usuario(). Quem cuida
--    da degustação da Boomit não apaga respondente do IBMEC — e isso vale no
--    banco, não na tela.
-- =============================================================

drop policy if exists "respondentes_admin_delete_dos_seus" on public.respondentes;
create policy "respondentes_admin_delete_dos_seus"
  on public.respondentes for delete
  to authenticated
  using (evento_id in (select public.eventos_do_usuario()));