INSERT INTO public.capabilities(key,label,description,category,sort_order) VALUES
 ('devis.parametres','Paramétrer les devis','Taux, forfaits, catalogue matériaux, modèles','devis',900),
 ('devis.couts','Voir coûts et marges des devis','Prix d''achat, coûts de revient, marge','devis',901),
 ('devis.rediger','Rédiger des devis','Créer et modifier les devis en brouillon','devis',902)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_capabilities(role,capability,granted,scope) VALUES
 ('admin','devis.parametres',true,'all'),
 ('admin','devis.couts',true,'all'),('commercial','devis.couts',true,'all'),
 ('admin','devis.rediger',true,'all'),('commercial','devis.rediger',true,'all'),
 ('bureau_etude','devis.rediger',true,'all')
ON CONFLICT DO NOTHING;

CREATE TABLE public.devis_postes_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  libelle text NOT NULL,
  metier_id integer REFERENCES public.metiers(id),
  ordre integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.devis_taux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poste_id uuid NOT NULL REFERENCES public.devis_postes_ref(id),
  niveau text NOT NULL,
  date_effet date NOT NULL DEFAULT current_date,
  taux_vente numeric(10,2),
  cout_revient numeric(10,2),
  par_defaut boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poste_id, niveau, date_effet)
);
CREATE TABLE public.devis_parametres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle text NOT NULL,
  valeur numeric(12,4),
  unite text,
  date_effet date NOT NULL DEFAULT current_date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cle, date_effet)
);
CREATE TABLE public.devis_taux_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet text NOT NULL,
  ref_id uuid NOT NULL,
  ancien jsonb, nouveau jsonb,
  auteur uuid DEFAULT auth.uid(),
  cree_le timestamptz NOT NULL DEFAULT now()
);

CREATE VIEW public.v_devis_taux_courants WITH (security_invoker=on) AS
SELECT DISTINCT ON (poste_id, niveau) * FROM public.devis_taux
WHERE date_effet <= current_date ORDER BY poste_id, niveau, date_effet DESC;
CREATE VIEW public.v_devis_parametres_courants WITH (security_invoker=on) AS
SELECT DISTINCT ON (cle) * FROM public.devis_parametres
WHERE date_effet <= current_date ORDER BY cle, date_effet DESC;

GRANT SELECT ON public.devis_postes_ref, public.devis_parametres, public.v_devis_parametres_courants, public.devis_taux_historique TO authenticated;
GRANT ALL ON public.devis_postes_ref, public.devis_taux, public.devis_parametres, public.devis_taux_historique TO service_role;

ALTER TABLE public.devis_postes_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_taux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_taux_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY postes_ref_read ON public.devis_postes_ref FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.view') OR public.current_user_has_capability('devis.rediger') OR public.current_user_has_capability('devis.parametres'));
CREATE POLICY parametres_read ON public.devis_parametres FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.rediger') OR public.current_user_has_capability('devis.parametres'));
CREATE POLICY taux_hist_read ON public.devis_taux_historique FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.parametres'));

CREATE FUNCTION public.devis_taux_lister()
RETURNS TABLE(poste_id uuid, code text, libelle text, metier_id int, ordre int, niveau text,
              date_effet date, taux_vente numeric, cout_revient numeric, par_defaut boolean, actif boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id,p.code,p.libelle,p.metier_id,p.ordre,t.niveau,t.date_effet,t.taux_vente,
         CASE WHEN current_user_has_capability('devis.couts') THEN t.cout_revient END,
         t.par_defaut,p.actif
  FROM devis_postes_ref p LEFT JOIN v_devis_taux_courants t ON t.poste_id=p.id
  WHERE current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')
  ORDER BY p.ordre,p.libelle,t.niveau $$;

CREATE FUNCTION public.devis_poste_enregistrer(_id uuid,_code text,_libelle text,_metier_id int,_ordre int,_actif boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old jsonb; v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF _id IS NULL THEN
    INSERT INTO devis_postes_ref(code,libelle,metier_id,ordre,actif) VALUES(_code,_libelle,_metier_id,coalesce(_ordre,0),coalesce(_actif,true)) RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(p) INTO v_old FROM devis_postes_ref p WHERE id=_id;
    UPDATE devis_postes_ref SET libelle=coalesce(_libelle,libelle),metier_id=_metier_id,ordre=coalesce(_ordre,ordre),actif=coalesce(_actif,actif),updated_at=now() WHERE id=_id RETURNING id INTO v_id;
  END IF;
  INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau) SELECT 'poste',v_id,v_old,to_jsonb(p) FROM devis_postes_ref p WHERE id=v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_taux_ajouter(_poste_id uuid,_niveau text,_date_effet date,_taux_vente numeric,_cout_revient numeric,_par_defaut boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old jsonb; v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(t) INTO v_old FROM v_devis_taux_courants t WHERE poste_id=_poste_id AND niveau=trim(_niveau);
  INSERT INTO devis_taux(poste_id,niveau,date_effet,taux_vente,cout_revient,par_defaut)
  VALUES(_poste_id,trim(_niveau),coalesce(_date_effet,current_date),round(_taux_vente,2),round(_cout_revient,2),coalesce(_par_defaut,false))
  ON CONFLICT (poste_id,niveau,date_effet) DO UPDATE SET taux_vente=EXCLUDED.taux_vente,cout_revient=EXCLUDED.cout_revient,par_defaut=EXCLUDED.par_defaut
  RETURNING id INTO v_id;
  IF coalesce(_par_defaut,false) THEN
    UPDATE devis_taux SET par_defaut=false WHERE poste_id=_poste_id AND niveau<>trim(_niveau) AND par_defaut;
  END IF;
  INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau) SELECT 'taux',v_id,v_old,to_jsonb(t) FROM devis_taux t WHERE id=v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_parametre_ajouter(_cle text,_valeur numeric,_unite text,_date_effet date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old jsonb; v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM v_devis_parametres_courants p WHERE cle=_cle;
  INSERT INTO devis_parametres(cle,valeur,unite,date_effet) VALUES(_cle,_valeur,_unite,coalesce(_date_effet,current_date))
  ON CONFLICT (cle,date_effet) DO UPDATE SET valeur=EXCLUDED.valeur,unite=EXCLUDED.unite RETURNING id INTO v_id;
  INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau) SELECT 'parametre',v_id,v_old,to_jsonb(p) FROM devis_parametres p WHERE id=v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.devis_taux_lister(), public.devis_poste_enregistrer(uuid,text,text,int,int,boolean),
  public.devis_taux_ajouter(uuid,text,date,numeric,numeric,boolean), public.devis_parametre_ajouter(text,numeric,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_taux_lister(), public.devis_poste_enregistrer(uuid,text,text,int,int,boolean),
  public.devis_taux_ajouter(uuid,text,date,numeric,numeric,boolean), public.devis_parametre_ajouter(text,numeric,text,date) TO authenticated;