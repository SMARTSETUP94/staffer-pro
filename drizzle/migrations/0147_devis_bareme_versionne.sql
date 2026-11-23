CREATE OR REPLACE FUNCTION public.devis_bareme_enregistrer(_changements jsonb, _date_effet date, _confirmer_passe boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c jsonb; n int := 0; v_old jsonb; v_id uuid; v_cle text;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF _date_effet IS NULL THEN RAISE EXCEPTION 'Date d''effet obligatoire'; END IF;
  IF _date_effet < current_date AND NOT (is_admin() AND _confirmer_passe) THEN
    RAISE EXCEPTION 'Date d''effet dans le passé : réservé aux admins avec confirmation';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(_changements) LOOP
    IF c->>'type' = 'taux' THEN
      IF EXISTS (SELECT 1 FROM devis_taux WHERE poste_id=(c->>'poste_id')::uuid AND niveau=c->>'niveau' AND date_effet=_date_effet) THEN
        RAISE EXCEPTION 'Une version datée du % existe déjà pour ce poste/niveau : choisissez une autre date', _date_effet;
      END IF;
      SELECT to_jsonb(t) INTO v_old FROM v_devis_taux_courants t WHERE poste_id=(c->>'poste_id')::uuid AND niveau=c->>'niveau';
      INSERT INTO devis_taux(poste_id,niveau,date_effet,taux_vente,cout_revient,par_defaut,created_by)
      VALUES((c->>'poste_id')::uuid, c->>'niveau', _date_effet,
             round(coalesce((c->>'taux_vente')::numeric,(v_old->>'taux_vente')::numeric),2),
             round(coalesce((c->>'cout_revient')::numeric,(v_old->>'cout_revient')::numeric),2),
             coalesce((c->>'par_defaut')::boolean,(v_old->>'par_defaut')::boolean,false), auth.uid())
      RETURNING id INTO v_id;
      INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau,auteur) SELECT 'taux',v_id,v_old,to_jsonb(t),auth.uid() FROM devis_taux t WHERE id=v_id;
    ELSIF c->>'type' = 'parametre' THEN
      v_cle := c->>'cle';
      IF v_cle LIKE 'opp\_plan\_%' OR v_cle LIKE 'proba\_%' THEN RAISE EXCEPTION 'Paramètre géré dans un autre écran'; END IF;
      IF EXISTS (SELECT 1 FROM devis_parametres WHERE cle=v_cle AND date_effet=_date_effet) THEN
        RAISE EXCEPTION 'Une version datée du % existe déjà pour % : choisissez une autre date', _date_effet, v_cle;
      END IF;
      SELECT to_jsonb(p) INTO v_old FROM v_devis_parametres_courants p WHERE cle=v_cle;
      INSERT INTO devis_parametres(cle,valeur,unite,date_effet,created_by)
      VALUES(v_cle,(c->>'valeur')::numeric, coalesce(v_old->>'unite', c->>'unite'), _date_effet, auth.uid()) RETURNING id INTO v_id;
      INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau,auteur) SELECT 'parametre',v_id,v_old,to_jsonb(p),auth.uid() FROM devis_parametres p WHERE id=v_id;
    ELSE RAISE EXCEPTION 'Type de changement inconnu';
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_bareme_enregistrer(jsonb,date,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_bareme_enregistrer(jsonb,date,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_bareme_historique(_poste_id uuid DEFAULT NULL, _niveau text DEFAULT NULL, _cle text DEFAULT NULL)
RETURNS TABLE(date_effet date, cout numeric, vente numeric, unite text, auteur text, cree_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.date_effet, t.cout_revient, t.taux_vente, '€/h'::text, pr.full_name, t.created_at
  FROM devis_taux t LEFT JOIN profiles pr ON pr.id=t.created_by
  WHERE current_user_has_capability('devis.parametres') AND _poste_id IS NOT NULL AND t.poste_id=_poste_id AND t.niveau=_niveau
  UNION ALL
  SELECT p.date_effet, CASE WHEN p.cle LIKE 'cout\_%' THEN p.valeur END, CASE WHEN p.cle NOT LIKE 'cout\_%' THEN p.valeur END, p.unite, pr.full_name, p.created_at
  FROM devis_parametres p LEFT JOIN profiles pr ON pr.id=p.created_by
  WHERE current_user_has_capability('devis.parametres') AND _cle IS NOT NULL AND p.cle IN (_cle, 'cout_'||_cle)
  ORDER BY 1 DESC, 6 DESC
$$;
REVOKE EXECUTE ON FUNCTION public.devis_bareme_historique(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_bareme_historique(uuid,text,text) TO authenticated;