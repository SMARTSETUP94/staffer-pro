# Planning atelier — protections d’écriture à valider

Les capacités approuvées sont enregistrées et relues : Nadège/Guillaume 100 %, Kevin/Laurent 50 %, UV 1 personne/jour, Machiniste sans limite. Les trois autres concepteurs restent hors planning BE. Aucun devis ni planning existant n’a été modifié, rien publié.

## Modification suivante proposée, non appliquée
- Écriture atelier réservée à admin, logistique et chefs atelier.
- Lecture existante préservée ; les commerciaux perdent uniquement la modification des périodes atelier par métier.
- Aucune suppression de période autorisée dans ce lot.
- Période globale protégée même en écriture directe ; dates et heures vérifiées.
- Fonction d’enregistrement limitée aux champs dates/heures, sans contrat, rémunération, personnes ou objets.
- BE : réutilisation de la fonction d’affectation projet existante et de ses droits ; aucun changement de son corps ou de ses utilisateurs actuels. Capacités BE réglables par admin via les protections existantes des référents.

## SQL complet proposé
```sql
-- PROPOSITION NON APPLIQUÉE : protections du planning atelier.
CREATE FUNCTION public.planning_atelier_ecriture_autorisee()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND auth.jwt()->>'client_id' IS NULL
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')
      OR public.has_role(auth.uid(),'atelier_chef'));
$$;
REVOKE ALL ON FUNCTION public.planning_atelier_ecriture_autorisee() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planning_atelier_ecriture_autorisee() TO authenticated;

-- Les anciens droits de lecture sont préservés. La restriction couvre aussi
-- les écritures directes sur les périodes métiers, pas seulement les boutons.
CREATE POLICY planning_atelier_restriction_insert ON public.affaire_planning_metier
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.planning_atelier_ecriture_autorisee());
CREATE POLICY planning_atelier_restriction_update ON public.affaire_planning_metier
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.planning_atelier_ecriture_autorisee())
WITH CHECK (public.planning_atelier_ecriture_autorisee());
CREATE POLICY planning_atelier_pas_de_suppression ON public.affaire_planning_metier
AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE FUNCTION public.planning_atelier_guard_global()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(NEW.atelier_date_debut,NEW.atelier_date_fin,NEW.atelier_heures_prevues)
      IS DISTINCT FROM ROW(OLD.atelier_date_debut,OLD.atelier_date_fin,OLD.atelier_heures_prevues) THEN
    IF NOT public.planning_atelier_ecriture_autorisee() THEN
      RAISE EXCEPTION 'Planning atelier réservé aux administrateurs, logistique et chefs atelier';
    END IF;
    IF (NEW.atelier_date_debut IS NULL) <> (NEW.atelier_date_fin IS NULL)
      OR NEW.atelier_date_fin < NEW.atelier_date_debut THEN
      RAISE EXCEPTION 'Période atelier invalide';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER planning_atelier_guard_global BEFORE UPDATE ON public.affaires
FOR EACH ROW EXECUTE FUNCTION public.planning_atelier_guard_global();

CREATE FUNCTION public.planning_atelier_enregistrer(
  _affaire uuid, _metier integer, _debut date, _fin date, _heures numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.planning_atelier_ecriture_autorisee() THEN RAISE EXCEPTION 'Écriture atelier refusée'; END IF;
  PERFORM 1 FROM public.affaires WHERE id=_affaire AND archived_at IS NULL
    AND statut NOT IN ('termine','annule') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chantier indisponible'; END IF;
  IF _debut IS NULL OR _fin IS NULL OR _fin < _debut OR _heures < 0 THEN
    RAISE EXCEPTION 'Dates ou heures invalides';
  END IF;
  IF _metier IS NULL THEN
    UPDATE public.affaires SET atelier_date_debut=_debut,atelier_date_fin=_fin,
      atelier_heures_prevues=_heures WHERE id=_affaire;
    RETURN jsonb_build_object('affaire_id',_affaire);
  END IF;
  IF _metier NOT IN (1,2,3,4,5,6,8,9) THEN RAISE EXCEPTION 'Métier atelier invalide'; END IF;
  INSERT INTO public.affaire_planning_metier(affaire_id,metier_id,date_debut,date_fin,heures_prevues)
    VALUES(_affaire,_metier,_debut,_fin,_heures)
  ON CONFLICT(affaire_id,metier_id) DO UPDATE SET
    date_debut=EXCLUDED.date_debut,date_fin=EXCLUDED.date_fin,
    heures_prevues=EXCLUDED.heures_prevues,updated_at=now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'affaire_id',_affaire);
END;
$$;
REVOKE ALL ON FUNCTION public.planning_atelier_enregistrer(uuid,integer,date,date,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.planning_atelier_enregistrer(uuid,integer,date,date,numeric) TO authenticated;```

## Après accord
Appliquer uniquement ce SQL, vérifier droits et refus d’écriture, puis livrer les deux vues liées et leurs tests/captures. Aucun changement d’URL ni remplacement du planning BE avant la livraison complète. Aucune publication.
