-- La fusion « même poste + niveau » ne s'applique qu'aux lignes existantes (ligne_id) : une ligne nouvelle garde toutes ses heures.
CREATE OR REPLACE FUNCTION public.devis_remplir_lot(_devis_id uuid, _lignes jsonb, _ops jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e jsonb; ch jsonb; i int := 0; lid uuid; v_id uuid; v_parent uuid; refs jsonb := '{}'::jsonb; h jsonb; m jsonb; f jsonb; v_poste uuid; v_niv text; k text;
        v_mods jsonb := coalesce(_ops->'modifications','[]'::jsonb); v_sups jsonb := coalesce(_ops->'suppressions','[]'::jsonb);
        o record; groupes jsonb := '[]'::jsonb;
        nb_l int := 0; nb_h int := 0; nb_m int := 0; nb_f int := 0;
        mj_l int := 0; mj_h int := 0; mj_m int := 0; mj_f int := 0;
        sp_l int := 0; sp_h int := 0; sp_m int := 0; sp_f int := 0; total int := 0;
        c_ligne CONSTANT text[] := ARRAY['libelle','quantite','descriptif_client','longueur_mm','largeur_mm','hauteur_mm','finition','texte','interne'];
        c_heure CONSTANT text[] := ARRAY['heures','niveau','taux_vente','montant_force','par_unite'];
        c_mat CONSTANT text[] := ARRAY['quantite','coefficient','materiau_id'];
        c_libre CONSTANT text[] := ARRAY['quantite','prix_forfait','prix_achat','designation','coefficient','unite','heures_info'];
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  _lignes := coalesce(_lignes,'[]'::jsonb);
  IF jsonb_typeof(_lignes) <> 'array' OR jsonb_typeof(v_mods) <> 'array' OR jsonb_typeof(v_sups) <> 'array' THEN RAISE EXCEPTION 'Lot mal formé'; END IF;
  IF jsonb_array_length(_lignes)+jsonb_array_length(v_mods)+jsonb_array_length(v_sups)=0 THEN RAISE EXCEPTION 'Lot vide'; END IF;
  SELECT count(*) + coalesce(sum(jsonb_array_length(coalesce(x->'heures','[]'))+jsonb_array_length(coalesce(x->'materiaux','[]'))+jsonb_array_length(coalesce(x->'libres','[]'))),0)
    INTO total FROM jsonb_array_elements(_lignes) x;
  total := total + jsonb_array_length(v_mods) + jsonb_array_length(v_sups);
  IF total > 300 THEN RAISE EXCEPTION 'Lot limité à 300 lignes (reçu %) : découper en plusieurs appels', total; END IF;

  -- 1. Modifications d'éléments existants
  FOR e IN SELECT value FROM jsonb_array_elements(v_mods) LOOP
    i := i + 1;
    BEGIN
      v_id := NULLIF(e->>'id','')::uuid; ch := coalesce(e->'champs','{}'::jsonb);
      IF v_id IS NULL THEN RAISE EXCEPTION 'id obligatoire'; END IF;
      IF jsonb_typeof(ch) <> 'object' OR ch = '{}'::jsonb THEN RAISE EXCEPTION 'Modification vide'; END IF;
      IF e->>'cible' = 'ligne' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT (k = ANY(c_ligne) OR k='incluse') THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        IF NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=v_id AND devis_id=_devis_id AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne introuvable dans ce devis'; END IF;
        IF ch - 'incluse' <> '{}'::jsonb THEN PERFORM devis_ligne_enregistrer(_devis_id, (ch - 'incluse') || jsonb_build_object('id', v_id)); END IF;
        IF ch ? 'incluse' THEN PERFORM devis_option_inclure(v_id, (ch->>'incluse')::boolean); END IF;
        mj_l := mj_l + 1;
      ELSIF e->>'cible' = 'heure' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_heure) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        SELECT h2.ligne_id INTO lid FROM devis_heures h2 JOIN devis_lignes l ON l.id=h2.ligne_id WHERE h2.id=v_id AND l.devis_id=_devis_id AND h2.supprime_le IS NULL AND l.supprime_le IS NULL;
        IF lid IS NULL THEN RAISE EXCEPTION 'Ligne d''heures introuvable dans ce devis'; END IF;
        PERFORM devis_heure_enregistrer(lid, ch || jsonb_build_object('id', v_id));
        mj_h := mj_h + 1;
      ELSIF e->>'cible' = 'materiau' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_mat) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        SELECT m2.ligne_id, m2.materiau_id, m2.quantite, m2.coefficient, m2.ordre INTO o
          FROM devis_materiaux m2 JOIN devis_lignes l ON l.id=m2.ligne_id WHERE m2.id=v_id AND l.devis_id=_devis_id AND m2.supprime_le IS NULL AND l.supprime_le IS NULL;
        IF o.ligne_id IS NULL THEN RAISE EXCEPTION 'Matériau introuvable dans ce devis'; END IF;
        IF ch ? 'materiau_id' AND NULLIF(ch->>'materiau_id','')::uuid IS DISTINCT FROM o.materiau_id THEN
          -- changement de référence catalogue : l'ancienne ligne part à la corbeille, la nouvelle reprend quantité, coefficient et place
          IF NULLIF(ch->>'materiau_id','') IS NULL THEN RAISE EXCEPTION 'materiau_id vide'; END IF;
          PERFORM devis_element_supprimer('materiau', v_id);
          PERFORM devis_materiau_enregistrer(o.ligne_id, jsonb_build_object('materiau_id', ch->>'materiau_id',
            'quantite', coalesce((ch->>'quantite')::numeric, o.quantite), 'coefficient', coalesce((ch->>'coefficient')::numeric, o.coefficient), 'ordre', o.ordre));
        ELSE
          PERFORM devis_materiau_enregistrer(o.ligne_id, (ch - 'materiau_id') || jsonb_build_object('id', v_id));
        END IF;
        mj_m := mj_m + 1;
      ELSIF e->>'cible' = 'libre' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_libre) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        SELECT f2.ligne_id INTO lid FROM devis_lignes_libres f2 JOIN devis_lignes l ON l.id=f2.ligne_id WHERE f2.id=v_id AND l.devis_id=_devis_id AND f2.supprime_le IS NULL AND l.supprime_le IS NULL;
        IF lid IS NULL THEN RAISE EXCEPTION 'Ligne libre introuvable dans ce devis'; END IF;
        PERFORM devis_libre_enregistrer(lid, ch || jsonb_build_object('id', v_id));
        mj_f := mj_f + 1;
      ELSE RAISE EXCEPTION 'cible inconnue « % » (ligne, heure, materiau ou libre)', coalesce(e->>'cible','?');
      END IF;
      lid := NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Modification % : % — rien n''a été écrit', i, SQLERRM;
    END;
  END LOOP;

  -- 2. Suppressions logiques (restaurables dans la corbeille de l'éditeur)
  i := 0;
  FOR e IN SELECT value FROM jsonb_array_elements(v_sups) LOOP
    i := i + 1;
    BEGIN
      v_id := NULLIF(e->>'id','')::uuid;
      IF v_id IS NULL THEN RAISE EXCEPTION 'id obligatoire'; END IF;
      IF e->>'cible' = 'ligne' THEN
        IF NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=v_id AND devis_id=_devis_id AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne introuvable dans ce devis (ou déjà supprimée)'; END IF;
        groupes := groupes || to_jsonb(devis_ligne_supprimer(v_id, 'avec_contenu', NULL));
        sp_l := sp_l + 1;
      ELSIF e->>'cible' IN ('heure','materiau','libre') THEN
        IF NOT EXISTS (
          SELECT 1 FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND l.id = CASE e->>'cible'
            WHEN 'heure' THEN (SELECT ligne_id FROM devis_heures WHERE id=v_id AND supprime_le IS NULL)
            WHEN 'materiau' THEN (SELECT ligne_id FROM devis_materiaux WHERE id=v_id AND supprime_le IS NULL)
            ELSE (SELECT ligne_id FROM devis_lignes_libres WHERE id=v_id AND supprime_le IS NULL) END)
        THEN RAISE EXCEPTION 'Élément introuvable dans ce devis (ou déjà supprimé)'; END IF;
        PERFORM devis_element_supprimer(e->>'cible', v_id);
        IF e->>'cible'='heure' THEN sp_h := sp_h + 1; ELSIF e->>'cible'='materiau' THEN sp_m := sp_m + 1; ELSE sp_f := sp_f + 1; END IF;
      ELSE RAISE EXCEPTION 'cible inconnue « % » (ligne, heure, materiau ou libre)', coalesce(e->>'cible','?');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Suppression % : % — rien n''a été écrit', i, SQLERRM;
    END;
  END LOOP;

  -- 3. Ajouts (et compléments d'une ligne existante via ligne_id)
  i := 0;
  FOR e IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
    i := i + 1;
    BEGIN
      v_parent := NULLIF(e->>'parent_id','')::uuid;
      IF e ? 'parent_ref' THEN
        v_parent := NULLIF(refs->>(e->>'parent_ref'),'')::uuid;
        IF v_parent IS NULL THEN RAISE EXCEPTION 'parent_ref inconnu « % »', e->>'parent_ref'; END IF;
      END IF;
      IF NULLIF(e->>'ligne_id','') IS NOT NULL THEN
        lid := (e->>'ligne_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=lid AND devis_id=_devis_id AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne existante introuvable'; END IF;
        ch := e - 'id' - 'ref' - 'parent_ref' - 'parent_id' - 'ligne_id' - 'type' - 'heures' - 'materiaux' - 'libres' - 'incluse';
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_ligne) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        IF ch <> '{}'::jsonb THEN PERFORM devis_ligne_enregistrer(_devis_id, ch || jsonb_build_object('id', lid)); mj_l := mj_l + 1; END IF;
      ELSE
        IF NULLIF(e->>'type','') IS NULL THEN RAISE EXCEPTION 'type ou ligne_id obligatoire'; END IF;
        lid := devis_ligne_enregistrer(_devis_id, (e - 'id' - 'ref' - 'parent_ref' - 'ligne_id' - 'heures' - 'materiaux' - 'libres' - 'incluse')
                 || jsonb_build_object('parent_id', v_parent));
        nb_l := nb_l + 1;
      END IF;
      IF e ? 'ref' THEN refs := refs || jsonb_build_object(e->>'ref', lid); END IF;
      IF e ? 'incluse' THEN PERFORM devis_option_inclure(lid, (e->>'incluse')::boolean); END IF;
      FOR h IN SELECT value FROM jsonb_array_elements(coalesce(e->'heures','[]'::jsonb)) LOOP
        v_id := NULLIF(h->>'id','')::uuid;
        IF v_id IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM devis_heures WHERE id=v_id AND ligne_id=lid AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne d''heures introuvable sur cette ligne'; END IF;
          PERFORM devis_heure_enregistrer(lid, (h - 'id' - 'poste' - 'poste_id') || jsonb_build_object('id', v_id));
          mj_h := mj_h + 1; CONTINUE;
        END IF;
        v_poste := NULLIF(h->>'poste_id','')::uuid;
        IF v_poste IS NULL THEN SELECT id INTO v_poste FROM devis_postes_ref WHERE code=h->>'poste' AND actif; END IF;
        IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste inconnu « % »', coalesce(h->>'poste','?'); END IF;
        -- ligne existante (ligne_id) : même poste + niveau déjà présent = mise à jour au lieu d'un doublon ; une ligne nouvelle garde ses heures telles qu'envoyées
        v_niv := coalesce(NULLIF(h->>'niveau',''),
          (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste AND par_defaut LIMIT 1),
          (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste ORDER BY niveau LIMIT 1), 'standard');
        IF NULLIF(e->>'ligne_id','') IS NOT NULL THEN
          SELECT id INTO v_id FROM devis_heures WHERE ligne_id=lid AND poste_id=v_poste AND niveau=v_niv AND supprime_le IS NULL ORDER BY ordre, created_at LIMIT 1;
        END IF;
        IF v_id IS NOT NULL THEN
          PERFORM devis_heure_enregistrer(lid, (h - 'id' - 'poste' - 'poste_id' - 'niveau') || jsonb_build_object('id', v_id));
          mj_h := mj_h + 1;
        ELSE
          PERFORM devis_heure_enregistrer(lid, (h - 'id' - 'poste') || jsonb_build_object('poste_id', v_poste, 'niveau', v_niv));
          nb_h := nb_h + 1;
        END IF;
      END LOOP;
      FOR m IN SELECT value FROM jsonb_array_elements(coalesce(e->'materiaux','[]'::jsonb)) LOOP
        PERFORM devis_materiau_enregistrer(lid, m - 'id'); nb_m := nb_m + 1;
      END LOOP;
      FOR f IN SELECT value FROM jsonb_array_elements(coalesce(e->'libres','[]'::jsonb)) LOOP
        IF f ? 'poste_info' THEN
          SELECT id INTO v_poste FROM devis_postes_ref WHERE code=f->>'poste_info' AND actif;
          IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste inconnu « % »', f->>'poste_info'; END IF;
          f := (f - 'poste_info') || jsonb_build_object('poste_info_id', v_poste);
        END IF;
        PERFORM devis_libre_enregistrer(lid, f - 'id'); nb_f := nb_f + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Élément % du lot : % — rien n''a été écrit', i, SQLERRM;
    END;
  END LOOP;
  RETURN jsonb_build_object('refs', refs,
    'ajouts', jsonb_build_object('lignes',nb_l,'heures',nb_h,'materiaux',nb_m,'libres',nb_f),
    'mises_a_jour', jsonb_build_object('lignes',mj_l,'heures',mj_h,'materiaux',mj_m,'libres',mj_f),
    'suppressions', jsonb_build_object('lignes',sp_l,'heures',sp_h,'materiaux',sp_m,'libres',sp_f,'groupes_corbeille',groupes),
    'calcul', devis_calculer(_devis_id));
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_remplir_lot(uuid,jsonb,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_remplir_lot(uuid,jsonb,jsonb) TO authenticated, service_role;