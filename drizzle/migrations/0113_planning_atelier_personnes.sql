ALTER TABLE public.assignations
  ADD COLUMN pole_planning text
    CHECK (pole_planning IS NULL OR pole_planning = 'atelier'),
  ADD COLUMN badge_atelier text
    CHECK (badge_atelier IS NULL OR badge_atelier IN ('interim','renfort')),
  ADD CONSTRAINT assignations_atelier_coherent CHECK (
    pole_planning IS NULL OR (
      metier_id IS NOT NULL AND etape_logistique_id IS NULL
      AND heures = 0 AND terrain AND NOT historique_terrain));
CREATE UNIQUE INDEX assignations_atelier_unique ON public.assignations
  (affaire_id, metier_id, date, (coalesce(employe_id, dispos_intervenant_id)))
  WHERE pole_planning = 'atelier';

CREATE FUNCTION public.planning_atelier_personne_ajouter(
  _affaire uuid, _metier int, _jours date[],
  _personne uuid, _origine text, _badge text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; st affaire_statut;
BEGIN
  IF NOT public.planning_atelier_ecriture_autorisee() THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM metiers WHERE id=_metier) THEN
    RAISE EXCEPTION 'Métier inexistant'; END IF;
  SELECT statut INTO st FROM affaires WHERE id=_affaire;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chantier introuvable'; END IF;
  IF st IN ('termine','annule') THEN RAISE EXCEPTION 'Chantier terminé ou annulé'; END IF;
  IF coalesce(array_length(_jours,1),0) = 0 OR array_length(_jours,1) > 130 THEN
    RAISE EXCEPTION 'Entre 1 et 130 jours'; END IF;
  IF _origine = 'employe' THEN
    IF NOT EXISTS (SELECT 1 FROM employes WHERE id=_personne AND actif) THEN
      RAISE EXCEPTION 'Personne inexistante ou inactive'; END IF;
    _badge := NULL;
  ELSIF _origine = 'dispos' THEN
    IF NOT EXISTS (SELECT 1 FROM dispos_intervenants
                   WHERE id=_personne AND actif AND employe_id IS NULL) THEN
      RAISE EXCEPTION 'Intervenant invalide'; END IF;
    IF _badge IS NOT NULL AND _badge NOT IN ('interim','renfort') THEN
      RAISE EXCEPTION 'Badge invalide'; END IF;
  ELSE RAISE EXCEPTION 'Origine invalide'; END IF;
  INSERT INTO assignations (affaire_id, metier_id, employe_id, dispos_intervenant_id,
    date, demi_journee, heures, terrain, source_terrain, role_terrain,
    pole_planning, badge_atelier, phase, created_by)
  SELECT _affaire, _metier,
    CASE WHEN _origine='employe' THEN _personne END,
    CASE WHEN _origine='dispos' THEN _personne END,
    j, 'JOURNEE', 0, true, 'manuelle', 'equipier',
    'atelier', _badge, 'fabrication', auth.uid()
  FROM unnest(_jours) j
  WHERE extract(isodow FROM j) < 6
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

CREATE FUNCTION public.planning_atelier_personne_retirer(
  _affaire uuid, _metier int, _personne uuid, _debut date, _fin date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.planning_atelier_ecriture_autorisee() THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _debut IS NULL OR _fin IS NULL OR _debut > _fin OR _fin - _debut > 130 THEN
    RAISE EXCEPTION 'Période invalide (début ≤ fin, 130 jours max)'; END IF;
  DELETE FROM assignations
   WHERE pole_planning = 'atelier' AND affaire_id = _affaire AND metier_id = _metier
     AND (employe_id = _personne OR dispos_intervenant_id = _personne)
     AND date BETWEEN _debut AND _fin;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.planning_atelier_personne_ajouter(uuid,int,date[],uuid,text,text),
  public.planning_atelier_personne_retirer(uuid,int,uuid,date,date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.planning_atelier_personne_ajouter(uuid,int,date[],uuid,text,text),
  public.planning_atelier_personne_retirer(uuid,int,uuid,date,date) TO authenticated;