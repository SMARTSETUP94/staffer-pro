CREATE FUNCTION public.planning_atelier_personnes_lire(_debut date, _fin date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE editeur boolean;
BEGIN
  editeur := public.planning_atelier_ecriture_autorisee();
  IF auth.uid() IS NULL OR NOT (editeur OR public.user_has_cap('section.affaires') OR public.user_has_cap('planning.pilotage'))
     OR _debut IS NULL OR _fin IS NULL OR _fin < _debut OR _fin - _debut > 130 THEN
    RAISE EXCEPTION 'Accès ou période invalide' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'presences', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',a.id,'affaire_id',a.affaire_id,'metier_id',a.metier_id,'date',a.date,
      'employe_id',a.employe_id,'dispos_intervenant_id',a.dispos_intervenant_id,'badge_atelier',a.badge_atelier) ORDER BY a.date,a.id)
      FROM public.assignations a WHERE a.pole_planning='atelier' AND a.date BETWEEN _debut AND _fin
        AND (editeur OR public.user_has_affaire_access(a.affaire_id))), '[]'::jsonb),
    'personnes', coalesce((SELECT jsonb_agg(p ORDER BY p.id) FROM (
      SELECT e.id,e.prenom,e.nom,e.actif,'employe'::text origine FROM public.employes e
      WHERE (editeur AND e.actif) OR EXISTS (
        SELECT 1 FROM public.assignations a WHERE a.employe_id=e.id AND a.pole_planning='atelier'
          AND a.date BETWEEN _debut AND _fin AND (editeur OR public.user_has_affaire_access(a.affaire_id)))
      UNION ALL
      SELECT i.id,i.prenom,i.nom,i.actif,'dispos'::text FROM public.dispos_intervenants i
      WHERE (editeur AND i.actif AND i.employe_id IS NULL) OR EXISTS (
        SELECT 1 FROM public.assignations a WHERE a.dispos_intervenant_id=i.id AND a.pole_planning='atelier'
          AND a.date BETWEEN _debut AND _fin AND (editeur OR public.user_has_affaire_access(a.affaire_id)))
    ) p), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.planning_atelier_personnes_lire(date,date) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.planning_atelier_personnes_lire(date,date) TO authenticated;