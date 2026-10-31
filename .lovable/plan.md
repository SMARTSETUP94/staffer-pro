# Devis — lot complémentaire : validité, lien pipeline, charge bureau d'étude

Rien n'est appliqué ni publié tant que vous n'avez pas donné votre accord écrit. Le travail se fait en une seule migration, suivie des changements d'interface.

## Ce que vous verrez

1. **Valable jusqu'au** dans l'en-tête du devis. Par défaut, la date du devis plus 30 jours. Elle suit la date du devis tant que vous ne l'avez pas changée à la main. Un petit lien « revenir au calcul auto » annule la saisie manuelle. Elle est figée à la validation et affichée en vue client.
2. **Lien avec le pipeline**
   - Premier devis créé sur une opportunité « À faire » : elle passe en « À l'étude ».
   - Nouveau bouton **« Marquer envoyé au client »** sur un devis validé, avec la date d'envoi (aujourd'hui par défaut). L'opportunité passe en « Envoyé » si elle n'est pas déjà plus avancée. Le bouton ajoute aussi une action « Devis envoyé » avec le numéro, la version et le total HT, renseigne la date du jalon « Devis envoyé » et met à jour le CA estimé. Une version R2 envoyée refait la même chose.
   - **Passage en « Gagné »** : une fenêtre demande quelle version est signée, en proposant la dernière envoyée. Cette version passe en « Signé » et les autres versions ouvertes en « Refusé ». Si on passe en « Gagné » sans répondre (depuis le Kanban ou le tableur), un bandeau « Choisir la version signée » reste affiché sur la fiche et sur l'onglet Devis.
   - **Passage en « Perdu »**, par n'importe quel chemin : les devis ouverts passent en « Refusé ».
   - Chaque effet est noté dans l'historique de l'opportunité. Un statut n'est jamais rétrogradé, selon l'ordre À faire < À l'étude < Envoyé < Presque gagné. « Gagné » et « Perdu » ne sont jamais posés par un devis ni par Claude.
3. **Charge bureau d'étude**
   - Grille des taux : une case « Compte en bureau d'étude » par poste. Seuls les plans BEM sont cochés au départ ; le suivi de projet ne l'est pas. Un nouveau paramètre fixe 8 h par jour.
   - Le planning de pilotage affiche « X j BE (devis Rn) » sur la ligne concepteur de l'affaire. Le chiffre est hachuré en « Presque gagné », plein en « Gagné », et n'apparaît pas dans les autres statuts.
   - Une alerte s'affiche s'il n'y a aucune période concepteur, ou si la période est plus courte que la charge.
   - Le bouton **« Planifier »** propose une période de N jours ouvrés qui se termine la veille du début de fabrication, ou à défaut la veille du montage. Vous choisissez le dessinateur et validez. L'enregistrement passe par l'affectation de rôle projet existante, et rien n'est enregistré sans votre validation.
   - Claude lit cette charge dans l'outil « planning de pilotage », sans pouvoir la modifier.

## Points d'approche à valider

- **Devis de référence pour la charge BE** : le devis signé s'il existe, sinon le dernier envoyé, sinon le dernier validé. Un devis validé n'est plus modifiable, donc la charge ne change que si le devis de référence change. Elle est figée sur le devis signé au moment où il est désigné comme signé.
- **Début de fabrication** : c'est la date de début la plus ancienne des métiers de fabrication (construction, métallerie, peinture, numérique, tapisserie, impression) dans le planning métier du chantier. Si elle est vide, on prend la veille du montage. Si les deux sont vides, la période proposée démarre aujourd'hui.
- **« Envoyé » réutilise le statut « Transféré »**, qui existe déjà, et y ajoute une date d'envoi. Le futur bouton « Vers ProGBat » (lot 3) ne changera pas ce statut.
- **Qui peut marquer envoyé** : les mêmes personnes que pour la validation, soit le chargé d'affaires de l'affaire ou un admin, et uniquement depuis l'application. Le bureau d'étude rédige mais n'envoie pas.
- **Effets sur l'opportunité** : ils sont écrits par une fonction interne, que personne ne peut appeler directement. Ainsi, un rédacteur du bureau d'étude qui crée le premier brouillon fait bien passer l'opportunité en « À l'étude », sans recevoir pour autant le droit de modifier les opportunités.
- **Parcours de signature existant** : un seul changement. Le bouton « Devis signé → créer la fabrication » accepte désormais aussi un devis déjà en « Signé ». Le reste de la fonction est recopié tel quel depuis sa définition actuelle, relue au moment de l'application.
- **Une opportunité perdue qui revient en arrière** ne réactive pas ses devis refusés : il faut faire une nouvelle version.

## Technical details

### Migration `devis_07_validite_pipeline_be` (SQL complet)

```sql
-- 1. Colonnes
ALTER TABLE public.devis
  ADD COLUMN date_validite date,
  ADD COLUMN date_validite_manuelle boolean NOT NULL DEFAULT false,
  ADD COLUMN date_envoi date,
  ADD COLUMN heures_be_fige numeric;
ALTER TABLE public.devis_postes_ref ADD COLUMN compte_be boolean NOT NULL DEFAULT false;
UPDATE public.devis_postes_ref SET compte_be = true WHERE code = 'plans_bem';
UPDATE public.devis SET date_validite = date_devis + coalesce(validite_jours,30)
  WHERE redige_dans_staffing AND NOT est_modele AND date_devis IS NOT NULL;
INSERT INTO public.devis_parametres(cle, valeur, unite, date_effet)
  VALUES ('heures_par_jour_be', 8, 'h/j', current_date);

-- 2. Date de validité automatique tant qu'elle n'est pas manuelle
CREATE OR REPLACE FUNCTION public.devis_set_date_validite() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.redige_dans_staffing AND NOT NEW.est_modele AND NOT NEW.date_validite_manuelle
     AND NEW.statut_redaction IN ('brouillon','a_valider') THEN
    NEW.date_validite := NEW.date_devis + coalesce(NEW.validite_jours,30);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_devis_date_validite BEFORE INSERT OR UPDATE OF date_devis, validite_jours, date_validite_manuelle
  ON public.devis FOR EACH ROW EXECUTE FUNCTION public.devis_set_date_validite();

-- 3. En-tête : accepte date_validite (vide = retour au calcul auto)
CREATE OR REPLACE FUNCTION public.devis_entete_modifier(_devis_id uuid, _patch jsonb, _maj_affaire_client boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  IF _patch ? 'contact_id' AND NULLIF(_patch->>'contact_id','') IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM client_contacts WHERE id=(_patch->>'contact_id')::uuid AND client_id=coalesce(NULLIF(_patch->>'client_id','')::uuid,(SELECT client_id FROM devis WHERE id=_devis_id))) THEN
    RAISE EXCEPTION 'Ce contact n''appartient pas au client facturé'; END IF;
  UPDATE devis SET
    client_id = CASE WHEN _patch ? 'client_id' THEN NULLIF(_patch->>'client_id','')::uuid ELSE client_id END,
    contact_id = CASE WHEN _patch ? 'contact_id' THEN NULLIF(_patch->>'contact_id','')::uuid
                      WHEN _patch ? 'client_id' AND NULLIF(_patch->>'client_id','')::uuid IS DISTINCT FROM client_id THEN NULL ELSE contact_id END,
    client_final_id = CASE WHEN _patch ? 'client_final_id' THEN NULLIF(_patch->>'client_final_id','')::uuid ELSE client_final_id END,
    date_devis = CASE WHEN _patch ? 'date_devis' THEN coalesce(NULLIF(_patch->>'date_devis','')::date,current_date) ELSE date_devis END,
    date_validite = CASE WHEN _patch ? 'date_validite' THEN NULLIF(_patch->>'date_validite','')::date ELSE date_validite END,
    date_validite_manuelle = CASE WHEN _patch ? 'date_validite' THEN NULLIF(_patch->>'date_validite','') IS NOT NULL ELSE date_validite_manuelle END,
    numero_progbat = CASE WHEN _patch ? 'numero_progbat' THEN NULLIF(_patch->>'numero_progbat','') ELSE numero_progbat END,
    libelle = CASE WHEN _patch ? 'libelle' THEN _patch->>'libelle' ELSE libelle END,
    coef_materiaux_defaut = CASE WHEN _patch ? 'coef_materiaux_defaut' THEN (_patch->>'coef_materiaux_defaut')::numeric ELSE coef_materiaux_defaut END,
    validite_jours = CASE WHEN _patch ? 'validite_jours' THEN (_patch->>'validite_jours')::int ELSE validite_jours END,
    modele_nom = CASE WHEN est_modele AND _patch ? 'modele_nom' THEN _patch->>'modele_nom' ELSE modele_nom END,
    modele_categorie = CASE WHEN est_modele AND _patch ? 'modele_categorie' THEN _patch->>'modele_categorie' ELSE modele_categorie END,
    modele_description = CASE WHEN est_modele AND _patch ? 'modele_description' THEN _patch->>'modele_description' ELSE modele_description END,
    updated_at = now()
  WHERE id=_devis_id RETURNING * INTO d;
  IF _maj_affaire_client AND d.affaire_id IS NOT NULL THEN
    UPDATE affaires SET client_id=d.client_id, client_contact_id=d.contact_id, updated_at=now() WHERE id=d.affaire_id;
  END IF;
END $function$;

-- 4. Helper interne : avance l'opportunité sans jamais rétrograder, et trace
CREATE OR REPLACE FUNCTION public.devis_opp_avancer(_affaire_id uuid, _cible opportunite_statut, _texte text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rang int[] := ARRAY[0,1,2,3]; cur opportunite_statut; ok boolean := false;
BEGIN
  IF _cible NOT IN ('a_l_etude','envoye') THEN RAISE EXCEPTION 'Statut cible interdit'; END IF;
  SELECT statut_opportunite INTO cur FROM affaires WHERE id=_affaire_id AND phase='opportunite' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF coalesce(cur,'a_faire') IN ('a_faire','a_l_etude','envoye','presque_gagne')
     AND array_position(ARRAY['a_faire','a_l_etude','envoye','presque_gagne']::text[], coalesce(cur,'a_faire')::text)
       < array_position(ARRAY['a_faire','a_l_etude','envoye','presque_gagne']::text[], _cible::text) THEN
    UPDATE affaires SET statut_opportunite=_cible, updated_at=now() WHERE id=_affaire_id;
    ok := true;
  END IF;
  IF _texte IS NOT NULL THEN
    INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
    VALUES(_affaire_id, CASE WHEN _cible='envoye' THEN 'devis_envoye'::opp_action_type ELSE 'note_interne' END,
           _texte || CASE WHEN ok THEN ' — statut → '||_cible ELSE '' END, auth.uid());
  END IF;
  RETURN ok;
END $$;
REVOKE ALL ON FUNCTION public.devis_opp_avancer(uuid, opportunite_statut, text) FROM PUBLIC, anon, authenticated;

-- 5. Création : premier brouillon → à l'étude (fin de devis_creer, reste identique)
CREATE OR REPLACE FUNCTION public.devis_creer(_affaire_id uuid, _modele_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a record; v_version int; v_id uuid;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_creer');
  IF NOT user_can_write_affaire(_affaire_id,'devis.rediger') THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  IF _modele_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devis WHERE id=_modele_id AND est_modele AND modele_actif) THEN
    RAISE EXCEPTION 'Modèle introuvable ou inactif'; END IF;
  SELECT * INTO a FROM affaires WHERE id=_affaire_id;
  PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||_affaire_id::text));
  SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=_affaire_id AND redige_dans_staffing AND NOT est_modele;
  PERFORM set_config('app.devis_rpc','on',true);
  INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,statut_redaction,client_id,contact_id,date_devis,
                    validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id)
  VALUES(_affaire_id, coalesce(a.numero,a.code_opportunite,'?')||'-R'||v_version, a.nom, 'brouillon', true, v_version, 'brouillon',
         a.client_id, a.client_contact_id, current_date,
         (SELECT valeur FROM v_devis_parametres_courants WHERE cle='validite_jours')::int,
         (SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),
         coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle='coef_materiaux'),1.45),
         _modele_id, auth.uid())
  RETURNING id INTO v_id;
  IF _modele_id IS NOT NULL THEN PERFORM devis_copier_sous_arbre(_modele_id, v_id, NULL, NULL, true); END IF;
  IF v_version = 1 AND a.phase='opportunite' AND coalesce(a.statut_opportunite,'a_faire')='a_faire' THEN
    PERFORM devis_opp_avancer(_affaire_id,'a_l_etude','Premier devis créé ('||coalesce(a.numero,a.code_opportunite,'?')||'-R1)');
  END IF;
  RETURN v_id;
END $function$;

-- 6. Validation : date_validite ajoutée au snapshot (reste identique)
CREATE OR REPLACE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record; v_calc jsonb;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF d.est_modele THEN RAISE EXCEPTION 'Un modèle n''a pas de statut'; END IF;
  IF _statut='a_valider' AND d.statut_redaction='brouillon' THEN
    UPDATE devis SET statut_redaction='a_valider', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='brouillon' AND d.statut_redaction='a_valider' THEN
    UPDATE devis SET statut_redaction='brouillon', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='valide' AND d.statut_redaction IN ('brouillon','a_valider') THEN
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Validation réservée au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
    v_calc := devis_calculer_interne(_devis_id);
    INSERT INTO devis_snapshot_couts(devis_id, cout_total, marge, fige_le)
      VALUES (_devis_id, (v_calc->>'cout_total')::numeric, v_calc->'marge', now())
      ON CONFLICT (devis_id) DO UPDATE SET cout_total=EXCLUDED.cout_total, marge=EXCLUDED.marge, fige_le=EXCLUDED.fige_le;
    UPDATE devis SET statut_redaction='valide', valide_par=auth.uid(), valide_le=now(), totaux_snapshot=v_calc - 'cout_total' - 'marge',
      montant_ht=(v_calc->>'total_ht')::numeric,
      dates_snapshot=(SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
         'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
         'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id),
      updated_at=now()
    WHERE id=_devis_id;
  ELSIF _statut='refuse' AND d.statut_redaction IN ('a_valider','valide','transfere') THEN
    IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Refus réservé à l''application' USING ERRCODE='42501'; END IF;
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
    UPDATE devis SET statut_redaction='refuse', updated_at=now() WHERE id=_devis_id;
  ELSE
    RAISE EXCEPTION 'Transition non autorisée : % → %', d.statut_redaction, _statut;
  END IF;
END $function$;

-- 7. Vue client : date de validité (seule différence : clé 'date_validite' dans dates et en tête)
-- devis_lire_client redéfinie à l'identique avec :
--   v_dates := coalesce(d.dates_snapshot, (... jsonb_build_object(..., 'date_validite', d.date_validite, ...)));
--   RETURN jsonb_build_object('numero',d.numero,'libelle',d.libelle,'date_devis',d.date_devis,
--          'date_validite',coalesce(v_dates->>'date_validite',d.date_validite::text),'validite_jours',d.validite_jours, ...);
-- (corps intégral recopié depuis la définition lue juste avant application)

-- 8. Marquer envoyé au client
CREATE OR REPLACE FUNCTION public.devis_marquer_envoye(_devis_id uuid, _date date DEFAULT current_date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_ht numeric; v_avance boolean := false;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Envoi réservé à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Envoi réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.statut_redaction <> 'valide' THEN RAISE EXCEPTION 'Seul un devis validé peut être envoyé'; END IF;
  IF _date IS NULL OR _date > current_date + 1 THEN RAISE EXCEPTION 'Date d''envoi invalide'; END IF;
  v_ht := coalesce((d.totaux_snapshot->>'total_ht')::numeric, d.montant_ht);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', date_envoi=_date, updated_at=now() WHERE id=_devis_id;
  IF EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND phase='opportunite') THEN
    v_avance := devis_opp_avancer(d.affaire_id,'envoye',
      format('Devis %s (R%s) envoyé le %s — %s € HT', d.numero, d.version, to_char(_date,'DD/MM/YYYY'), to_char(v_ht,'FM999G999G990D00')));
    UPDATE affaires SET ca_estime_ht=v_ht, updated_at=now() WHERE id=d.affaire_id;
    INSERT INTO opportunite_jalons(affaire_id,etape,date_atteinte,ordre) VALUES(d.affaire_id,'devis_envoye',_date,2)
      ON CONFLICT (affaire_id,etape) DO UPDATE SET date_atteinte=EXCLUDED.date_atteinte, updated_at=now();
  END IF;
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_avance',v_avance,'ca_estime_ht',v_ht);
END $$;

-- 9. Gagné : désigner la version signée
CREATE OR REPLACE FUNCTION public.devis_marquer_signe(_devis_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; n int;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Signature réservée à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND (statut_opportunite='gagne' OR phase='signe')) THEN
    RAISE EXCEPTION 'L''opportunité doit être gagnée'; END IF;
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Seul un devis validé ou envoyé peut être signé'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='signe', heures_be_fige=(devis_heures_be(_devis_id)), updated_at=now() WHERE id=_devis_id;
  UPDATE devis SET statut_redaction='refuse', updated_at=now()
   WHERE affaire_id=d.affaire_id AND id<>_devis_id AND redige_dans_staffing AND NOT est_modele
     AND statut_redaction IN ('brouillon','a_valider','valide','transfere');
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
  VALUES(d.affaire_id,'note_interne',format('Devis %s désigné comme signé ; %s autre(s) version(s) refusée(s)', d.numero, n), auth.uid());
  RETURN jsonb_build_object('devis_id',_devis_id,'refuses',n);
END $$;

-- 10. Perdu : refuse les devis ouverts (trigger, quel que soit l'écran)
CREATE OR REPLACE FUNCTION public.devis_on_opportunite_perdue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='refuse', updated_at=now()
   WHERE affaire_id=NEW.id AND redige_dans_staffing AND NOT est_modele
     AND statut_redaction IN ('brouillon','a_valider','valide','transfere');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
    VALUES(NEW.id,'note_interne',format('Opportunité perdue : %s devis refusé(s)', n), auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_devis_opportunite_perdue AFTER UPDATE OF statut_opportunite ON public.affaires
  FOR EACH ROW WHEN (NEW.statut_opportunite='perdu' AND OLD.statut_opportunite IS DISTINCT FROM 'perdu')
  EXECUTE FUNCTION public.devis_on_opportunite_perdue();

-- 11. Heures BE d'un devis (hors options, × quantité si par_unite)
CREATE OR REPLACE FUNCTION public.devis_heures_be(_devis_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT l.id, l.quantite, (l.type='option') opt FROM devis_lignes l
     WHERE l.devis_id=_devis_id AND l.parent_id IS NULL AND l.supprime_le IS NULL
    UNION ALL
    SELECT l.id, l.quantite, t.opt OR l.type='option' FROM devis_lignes l JOIN t ON l.parent_id=t.id WHERE l.supprime_le IS NULL)
  SELECT round(coalesce(sum(h.heures * CASE WHEN h.par_unite THEN t.quantite ELSE 1 END),0),2)
  FROM t JOIN devis_heures h ON h.ligne_id=t.id AND h.supprime_le IS NULL
         JOIN devis_postes_ref p ON p.id=h.poste_id AND p.compte_be
  WHERE NOT t.opt $$;
REVOKE ALL ON FUNCTION public.devis_heures_be(uuid) FROM PUBLIC, anon, authenticated;

-- 12. Charge BE par affaire (aucun montant renvoyé)
CREATE OR REPLACE FUNCTION public.devis_charge_be(_affaire_ids uuid[])
 RETURNS TABLE(affaire_id uuid, devis_id uuid, numero text, version int, heures_be numeric, jours_be numeric, etat text, figee boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, r.id, r.numero, r.version, r.h,
         ceil(r.h / nullif((SELECT valeur FROM v_devis_parametres_courants WHERE cle='heures_par_jour_be'),0) * 2) / 2,
         CASE WHEN a.statut_opportunite='gagne' OR a.phase='signe' THEN 'confirme' ELSE 'previsionnel' END,
         r.figee
  FROM affaires a
  CROSS JOIN LATERAL (
    SELECT d.id, d.numero, d.version, coalesce(d.heures_be_fige, devis_heures_be(d.id)) h, d.heures_be_fige IS NOT NULL figee
    FROM devis d WHERE d.affaire_id=a.id AND d.redige_dans_staffing AND NOT d.est_modele
      AND d.statut_redaction IN ('signe','transfere','valide')
    ORDER BY CASE d.statut_redaction WHEN 'signe' THEN 0 WHEN 'transfere' THEN 1 ELSE 2 END, d.version DESC LIMIT 1) r
  WHERE a.id = ANY(_affaire_ids) AND array_length(_affaire_ids,1) <= 1000
    AND (a.statut_opportunite IN ('presque_gagne','gagne') OR a.phase='signe')
    AND (current_user_has_capability('planning.pilotage') OR user_has_affaire_access(a.id)) $$;
REVOKE ALL ON FUNCTION public.devis_charge_be(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_charge_be(uuid[]) TO authenticated;

-- 13. Case « compte en BE » dans la grille (admin, historisé)
CREATE OR REPLACE FUNCTION public.devis_poste_compte_be(_id uuid, _compte boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM devis_postes_ref p WHERE id=_id;
  UPDATE devis_postes_ref SET compte_be=coalesce(_compte,false), updated_at=now() WHERE id=_id;
  INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau) SELECT 'poste',_id,v_old,to_jsonb(p) FROM devis_postes_ref p WHERE id=_id;
END $$;

-- 14. Signature vers fabrication : accepte aussi 'signe' (seule ligne modifiée)
--   - IF d.statut_redaction NOT IN ('valide','transfere') THEN ...
--   + IF d.statut_redaction NOT IN ('valide','transfere','signe') THEN ...
-- Fonction redéfinie intégralement depuis sa définition courante relue avant application ; heures_be_fige
-- est aussi posée dans l'UPDATE final : heures_be_fige = coalesce(heures_be_fige, devis_heures_be(_devis_id)).

REVOKE ALL ON FUNCTION public.devis_marquer_envoye(uuid,date), public.devis_marquer_signe(uuid),
  public.devis_poste_compte_be(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_marquer_envoye(uuid,date), public.devis_marquer_signe(uuid),
  public.devis_poste_compte_be(uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
```

### Interface
- `DevisEditeur` : champ « Valable jusqu'au » avec un indicateur auto ou manuel, et bouton « Marquer envoyé au client » (fenêtre avec la date).
- Liste Devis et fiche opportunité : bandeau « Choisir la version signée » ; fenêtre de choix au passage en « Gagné » depuis la fiche, le Kanban ou le tableur.
- `_app.parametres.devis-taux` : colonne « Compte en BE » et paramètre heures/jour.
- `_app.planning-pilotage` : badge « X j BE (Rn) » hachuré ou plein, alerte, bouton « Planifier ». La période est calculée par un module pur (jours ouvrés français) et l'écriture passe par `app_affecter_role_projet`.
- MCP `planning_pilotage` : nouveau champ `charge_be { jours, heures, devis, etat }`, en lecture seule, avec la liste des champs mise à jour.
- `AGENTS.md` : la règle sur les effets devis → pipeline (helper interne, aucune rétrogradation, Gagné et Perdu réservés à l'humain).

### Tests (transaction annulée, plus Vitest)
- Validité : défaut = date + 30 j ; une saisie manuelle est conservée quand la date du devis change ; la date est figée et présente dans le snapshot après validation.
- Envoi : « À l'étude » passe en « Envoyé », avec l'action, le jalon et le CA ; « Presque gagné » reste « Presque gagné » ; R2 envoyée met à jour le CA et ajoute une action.
- Gagné : la version choisie passe en « Signé », les autres en « Refusé », et la création de la fabrication fonctionne depuis « Signé ». Perdu : les devis ouverts passent en « Refusé ».
- Charge BE : 16 h de plans BEM plus 10 h de suivi de projet donnent 2 j ; un objet ×3 triple les heures par unité ; l'état est « prévisionnel » en Presque gagné et « confirmé » en Gagné ; l'alerte apparaît avec une période de 1 j ; « Planifier » n'écrit rien sans validation.
- Droits : un chef d'équipe voit la charge BE, sans aucun montant ; un appel Claude est refusé sur l'envoi et la signature.
