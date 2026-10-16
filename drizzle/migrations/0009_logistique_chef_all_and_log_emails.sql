UPDATE public.role_capabilities SET scope='all', updated_at=now()
 WHERE role IN ('chef_chantier','commercial') AND capability IN ('logistique.etape.edit','logistique.proposition.view','logistique.proposition.validate');

CREATE POLICY emails_entrants_select_logistique ON public.emails_entrants FOR SELECT TO authenticated
 USING (source_boite = 'logistique' AND public.user_has_cap('logistique.planning.view'));
CREATE POLICY emails_entrants_update_logistique ON public.emails_entrants FOR UPDATE TO authenticated
 USING (source_boite = 'logistique' AND public.user_has_cap('logistique.etape.edit'))
 WITH CHECK (source_boite = 'logistique' AND public.user_has_cap('logistique.etape.edit'));