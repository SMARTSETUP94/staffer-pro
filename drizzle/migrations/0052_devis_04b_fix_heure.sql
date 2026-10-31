CREATE OR REPLACE FUNCTION public.devis_heure_enregistrer(_ligne_id uuid, _h jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_h->>'id','')::uuid; v_old devis_heures%ROWTYPE;
        v_poste uuid; v_niveau text; g record; v_regrille boolean;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NOT NULL THEN SELECT * INTO v_old FROM devis_heures WHERE id=v_id AND ligne_id=_ligne_id; IF NOT FOUND THEN RAISE EXCEPTION 'Ligne d''heures introuvable'; END IF; END IF;
  v_poste := coalesce(NULLIF(_h->>'poste_id','')::uuid, v_old.poste_id);
  IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste obligatoire'; END IF;
  v_niveau := coalesce(NULLIF(_h->>'niveau',''), CASE WHEN NULLIF(_h->>'poste_id','')::uuid IS DISTINCT FROM v_old.poste_id AND v_id IS NOT NULL THEN NULL ELSE v_old.niveau END,
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste AND par_defaut LIMIT 1),
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste ORDER BY niveau LIMIT 1), 'standard');
  SELECT taux_vente, cout_revient INTO g FROM v_devis_taux_courants WHERE poste_id=v_poste AND niveau=v_niveau;
  v_regrille := v_id IS NULL OR v_poste<>v_old.poste_id OR v_niveau<>v_old.niveau;
  IF v_id IS NULL THEN
    INSERT INTO devis_heures(ligne_id,poste_id,niveau,heures,par_unite,taux_vente,taux_grille,cout_revient,ordre)
    VALUES(_ligne_id,v_poste,v_niveau,coalesce((_h->>'heures')::numeric,0),coalesce((_h->>'par_unite')::boolean,true),
      coalesce((_h->>'taux_vente')::numeric,g.taux_vente,0),g.taux_vente,g.cout_revient,
      coalesce((_h->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_heures WHERE ligne_id=_ligne_id)))
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis_heures SET poste_id=v_poste, niveau=v_niveau,
      heures = CASE WHEN _h ? 'heures' THEN coalesce((_h->>'heures')::numeric,0) ELSE heures END,
      par_unite = CASE WHEN _h ? 'par_unite' THEN coalesce((_h->>'par_unite')::boolean,true) ELSE par_unite END,
      taux_grille = CASE WHEN v_regrille THEN g.taux_vente ELSE taux_grille END,
      cout_revient = CASE WHEN v_regrille THEN g.cout_revient ELSE cout_revient END,
      taux_vente = CASE WHEN _h ? 'taux_vente' THEN coalesce((_h->>'taux_vente')::numeric,0)
                        WHEN v_regrille THEN coalesce(g.taux_vente,0) ELSE taux_vente END,
      ordre = CASE WHEN _h ? 'ordre' THEN (_h->>'ordre')::numeric ELSE ordre END
    WHERE id=v_id;
  END IF;
  RETURN v_id;
END $$;