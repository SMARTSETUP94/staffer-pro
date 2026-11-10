# Planning atelier avec des noms (Gantt Personnes)

## Ce que Gabin verra
- **Sur chaque barre chantier × métier** du planning atelier : les noms des personnes affectées (prénom + initiale, « +N » au-delà de 3). Clic sur la barre → fenêtre avec la liste des personnes, bouton « + Personne » et « Retirer ».
- **Ajouter une personne** : recherche par nom parmi les salariés actifs et les intervenants Dispos actifs (comme en logistique), puis « toute la barre » ou « du … au … » (jours ouvrés seulement, fériés exclus) ou des jours précis. Badge facultatif **Intérim / Renfort** pour les intervenants Dispos.
- **Retirer** : toute la présence sur la barre, ou une période / un jour.
- **Nouvel onglet « Personnes »** dans le planning atelier : une ligne par personne, ses barres chantier/métier dans le temps, comme la vue Personnes logistique. Mêmes semaines et même navigation que le Gantt atelier.
- **Téléphone (390 px)** : lecture seule, liste par personne et par semaine.
- **Inchangé** : capacité, heures, jours-hommes, alertes de charge.

## Règles
- Droits d'écriture : ceux du planning atelier (admin, logistique, chef d'atelier, chef d'équipe), refusé à Claude. Lecture : ceux qui voient déjà le planning atelier.
- Affiché : prénom, nom/initiale, métier, chantier, dates, badge. Jamais téléphone, salaire, taux ou contrat.
- Heures = 0, aucune écriture dans les heures saisies, aucune notification, salariés inactifs refusés, aucune donnée existante modifiée.

## Ordre d'exécution
1. **Migration A (additive)** ci-dessous, appliquée directement : colonnes, contrainte, index, deux fonctions, droits.
2. **Migration B (filtres sur fonctions existantes)** : NON appliquée. Pour chaque fonction, le diff exact (lignes ajoutées) par rapport au texte actuel est présenté, avec confirmation que signature, SECURITY, search_path et droits sont inchangés. Arrêt en attente d'accord.
3. Interface construite seulement après l'accord sur B.

Corrections intégrées dans A :
- Ajouter : métier vérifié dans la table des métiers (pas de liste en dur) ; chantier vérifié existant et non terminé/annulé (message « Chantier introuvable » / « Chantier terminé ou annulé ») ; 130 jours max.
- Retirer : début ≤ fin et période de 130 jours max.

## Migration A
Ajouts seulement, sur la table des affectations existante :

```sql
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

-- Ajout : une ligne par jour ouvré (week-ends et fériés FR exclus), sans doublon
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

-- Retrait : uniquement des lignes atelier
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
```
Les fériés FR sont retirés côté app (même helper que le Gantt) avant l'appel ; la base exclut en plus les week-ends.

### Migration B — filtres sur les fonctions existantes (diff présenté, non appliqué avant accord)
Constat : ces fonctions lisent toutes les affectations et verraient les lignes atelier.
- `planning_terrain_semaine` (Étapes/Équipes/Personnes logistique) lit toutes les affectations de la semaine → ajout `AND pole_planning IS NULL`.
- `notify_assignation_change` (notification à la personne) → sortie immédiate si `pole_planning = 'atelier'`.
- `audit_staffing_divergence` (anomalies « affectation orpheline ») → exclusion des lignes atelier.
- `staffing_par_pole_jours` / `staffing_par_pole_consolide` (ancien planning par pôle) → exclusion.
- `resolve_saisie_heures` (suggestion lors de la saisie d'heures, lecture seule) → exclusion, pour ne rien proposer à partir de ces lignes.
- Sans effet bloquant, conservés tels quels : `planning_terrain_ecran` (filtre déjà par étape), historique équipe (recalcul du chantier, léger, compte la personne dans l'équipe du chantier), refus si chantier terminé/annulé (voulu), bornes d'heures (0 OK), garde historique terrain (non concerné).

## Technique
- Lecture : la fonction serveur du planning atelier renvoie les affectations atelier (id, chantier, métier, date, prénom, nom, badge), via le client de l'utilisateur.
- Helper pur `regrouperPersonnesAtelier` (jours consécutifs → barres, prénom + initiale, « +N ») avec tests ; aucun changement à `chargeHebdomadaire`.
- Mobile en lecture seule ; test à 390 et 1366 px, essais effacés, rien publié.
- Règle ajoutée dans `src/components/planning-simple/AGENTS.md`.
