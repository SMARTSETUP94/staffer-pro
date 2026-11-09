CREATE OR REPLACE FUNCTION public.planning_atelier_retirer(_affaire uuid, _metier integer DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
  IF NOT public.planning_atelier_ecriture_autorisee() THEN RAISE EXCEPTION 'Écriture atelier refusée'; END IF;
  PERFORM 1 FROM public.affaires WHERE id=_affaire FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chantier indisponible'; END IF;
  IF _metier IS NULL THEN
    UPDATE public.affaires SET atelier_date_debut=NULL, atelier_date_fin=NULL, atelier_heures_prevues=NULL WHERE id=_affaire;
    DELETE FROM public.affaire_planning_metier WHERE affaire_id=_affaire;
  ELSE
    DELETE FROM public.affaire_planning_metier WHERE affaire_id=_affaire AND metier_id=_metier;
  END IF;
  RETURN jsonb_build_object('affaire_id',_affaire,'metier_id',_metier);
END; $function$;
REVOKE ALL ON FUNCTION public.planning_atelier_retirer(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planning_atelier_retirer(uuid,integer) TO authenticated;