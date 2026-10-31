CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE FUNCTION public.devis_normalize(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public, extensions AS $$
  SELECT lower(regexp_replace(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t,'')), '\s+', ' ', 'g')) $$;

CREATE TABLE public.fournisseurs_tarifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nom text NOT NULL,
  date_tarif date,
  validite text,
  etat text NOT NULL DEFAULT 'ok' CHECK (etat IN ('ok','a_surveiller','ancien')),
  prix_public boolean NOT NULL DEFAULT false,
  conditions text,
  mode_lecture_prix text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.materiaux_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs_tarifs(id),
  import_id uuid,
  famille text, produit text NOT NULL, ref text,
  format_texte text, longueur_mm numeric, largeur_mm numeric, epaisseur_mm numeric,
  unite text NOT NULL,
  prix_achat_net numeric(12,4), prix_m2 numeric(12,4), prix_ml numeric(12,4), prix_catalogue numeric(12,4),
  conditionnement text, caracteristiques text, remarque text, cle_comparaison text,
  source text, date_tarif date,
  actif boolean NOT NULL DEFAULT true,
  desactive_le timestamptz,
  search_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.materiaux_set_search_text() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.search_text := devis_normalize(concat_ws(' ',NEW.famille,NEW.produit,NEW.ref,NEW.format_texte,NEW.caracteristiques,
       CASE WHEN NEW.epaisseur_mm IS NOT NULL THEN trim_scale(NEW.epaisseur_mm)::text END,
       CASE WHEN NEW.longueur_mm IS NOT NULL THEN trim_scale(NEW.longueur_mm)::text||'x'||coalesce(trim_scale(NEW.largeur_mm)::text,'') END));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_materiaux_search_text BEFORE INSERT OR UPDATE OF famille,produit,ref,format_texte,caracteristiques,epaisseur_mm,longueur_mm,largeur_mm
  ON public.materiaux_catalogue FOR EACH ROW EXECUTE FUNCTION public.materiaux_set_search_text();

CREATE INDEX materiaux_search_trgm ON public.materiaux_catalogue USING gin (search_text public.gin_trgm_ops) WHERE actif;
CREATE INDEX materiaux_fourn_ref ON public.materiaux_catalogue(fournisseur_id, ref) WHERE actif;
CREATE INDEX materiaux_epaisseur ON public.materiaux_catalogue(epaisseur_mm) WHERE actif;
CREATE INDEX materiaux_cle ON public.materiaux_catalogue(cle_comparaison) WHERE actif;

CREATE TABLE public.materiaux_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs_tarifs(id),
  fichier_nom text, fichier_hash text,
  statut text NOT NULL DEFAULT 'prepare' CHECK (statut IN ('prepare','valide','abandonne')),
  bilan jsonb,
  cree_par uuid DEFAULT auth.uid(), cree_le timestamptz NOT NULL DEFAULT now(), valide_le timestamptz
);
CREATE TABLE public.materiaux_imports_lignes (
  import_id uuid NOT NULL REFERENCES public.materiaux_imports(id) ON DELETE CASCADE,
  data jsonb NOT NULL
);
CREATE INDEX materiaux_imports_lignes_imp ON public.materiaux_imports_lignes(import_id);

CREATE TABLE public.materiaux_favoris (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  materiau_id uuid NOT NULL REFERENCES public.materiaux_catalogue(id),
  cree_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, materiau_id)
);

GRANT SELECT ON public.fournisseurs_tarifs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.materiaux_favoris TO authenticated;
GRANT ALL ON public.fournisseurs_tarifs, public.materiaux_catalogue, public.materiaux_imports,
  public.materiaux_imports_lignes, public.materiaux_favoris TO service_role;

ALTER TABLE public.fournisseurs_tarifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_imports_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_favoris ENABLE ROW LEVEL SECURITY;
CREATE POLICY fourn_read ON public.fournisseurs_tarifs FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.rediger') OR public.current_user_has_capability('devis.parametres'));
CREATE POLICY fav_own ON public.materiaux_favoris FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE FUNCTION public.materiaux_rechercher(_q text, _familles text[] DEFAULT NULL, _fournisseurs uuid[] DEFAULT NULL,
   _epaisseur numeric DEFAULT NULL, _recent_seulement boolean DEFAULT false, _tri text DEFAULT 'pertinence', _limit int DEFAULT 50)
RETURNS TABLE(id uuid, fournisseur text, fournisseur_etat text, prix_public boolean, famille text, produit text, ref text, format_texte text,
  longueur_mm numeric, largeur_mm numeric, epaisseur_mm numeric, unite text,
  prix_achat_net numeric, prix_m2 numeric, prix_ml numeric, date_tarif date, remarque text,
  cle_comparaison text, moins_cher_du_groupe boolean, score real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public, extensions AS $$
DECLARE v_q text := devis_normalize(_q); v_tokens text[]; v_words text[]; v_nums numeric[];
        v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_tokens := array_remove(regexp_split_to_array(trim(regexp_replace(replace(v_q,',','.'),'(\d)\s*x\s*(?=\d)','\1 ','g')),'\s+'),'');
  SELECT array_agg(t::numeric) INTO v_nums FROM unnest(v_tokens) t WHERE t ~ '^\d+(\.\d+)?$';
  SELECT array_agg(t) INTO v_words FROM unnest(v_tokens) t WHERE t !~ '^\d+(\.\d+)?$' AND length(t)>1;
  RETURN QUERY
  WITH c AS (
    SELECT m.*, f.nom AS fnom, f.etat AS fetat, f.prix_public AS fpub,
      ( word_similarity(v_q, m.search_text)
        + coalesce((SELECT count(*) FROM unnest(v_words) t WHERE m.search_text LIKE '%'||t||'%'),0)::real
        + coalesce((SELECT count(*) FROM unnest(v_nums) n WHERE m.epaisseur_mm = n),0)::real * 2
        + coalesce((SELECT count(*) FROM unnest(v_nums) n WHERE n IN (m.longueur_mm, m.largeur_mm)),0)::real
      )::real AS sc
    FROM materiaux_catalogue m JOIN fournisseurs_tarifs f ON f.id=m.fournisseur_id
    WHERE m.actif
      AND (v_words IS NULL OR (SELECT count(*) FROM unnest(v_words) t WHERE m.search_text LIKE '%'||t||'%') >= greatest(1, cardinality(v_words)-1)
           OR m.search_text %> v_q)
      AND (v_nums IS NULL OR EXISTS (SELECT 1 FROM unnest(v_nums) n WHERE n IN (m.epaisseur_mm,m.longueur_mm,m.largeur_mm) OR m.search_text ~ ('(^|[^0-9.])'||trim_scale(n)::text||'([^0-9.]|$)')))
      AND (_familles IS NULL OR m.famille = ANY(_familles))
      AND (_fournisseurs IS NULL OR m.fournisseur_id = ANY(_fournisseurs))
      AND (_epaisseur IS NULL OR m.epaisseur_mm = _epaisseur)
      AND (NOT coalesce(_recent_seulement,false) OR f.etat = 'ok')
  )
  SELECT c.id,c.fnom,c.fetat,c.fpub,c.famille,c.produit,c.ref,c.format_texte,c.longueur_mm,c.largeur_mm,c.epaisseur_mm,c.unite,
    CASE WHEN v_couts THEN c.prix_achat_net END, CASE WHEN v_couts THEN c.prix_m2 END, CASE WHEN v_couts THEN c.prix_ml END,
    c.date_tarif,c.remarque,c.cle_comparaison,
    (c.cle_comparaison IS NOT NULL AND c.prix_m2 IS NOT NULL AND c.prix_m2 = min(c.prix_m2) OVER (PARTITION BY c.cle_comparaison)
       AND count(*) OVER (PARTITION BY c.cle_comparaison) > 1),
    c.sc
  FROM c
  ORDER BY CASE WHEN _tri='prix' THEN c.prix_achat_net END ASC NULLS LAST,
           CASE WHEN _tri='m2' THEN coalesce(c.prix_m2,c.prix_ml) END ASC NULLS LAST,
           c.sc DESC, c.prix_m2 ASC NULLS LAST
  LIMIT least(coalesce(_limit,50),100);
END $$;

CREATE FUNCTION public.fournisseur_tarif_enregistrer(_f jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO fournisseurs_tarifs(slug,nom,date_tarif,validite,etat,prix_public,conditions,mode_lecture_prix)
  VALUES(_f->>'slug',coalesce(_f->>'nom',_f->>'slug'),NULLIF(_f->>'date_tarif','')::date,_f->>'validite',coalesce(NULLIF(_f->>'etat',''),'ok'),
         coalesce((_f->>'prix_public')::boolean,false),_f->>'conditions',_f->>'mode_lecture_prix')
  ON CONFLICT (slug) DO UPDATE SET nom=EXCLUDED.nom,date_tarif=EXCLUDED.date_tarif,validite=EXCLUDED.validite,etat=EXCLUDED.etat,
     prix_public=EXCLUDED.prix_public,conditions=EXCLUDED.conditions,mode_lecture_prix=EXCLUDED.mode_lecture_prix,updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.materiaux_import_preparer(_fournisseur_slug text, _fichier_nom text, _hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f uuid; v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_f FROM fournisseurs_tarifs WHERE slug=_fournisseur_slug;
  IF v_f IS NULL THEN RAISE EXCEPTION 'Fournisseur inconnu : % (importez d''abord fournisseurs_tarifs.json)', _fournisseur_slug; END IF;
  UPDATE materiaux_imports SET statut='abandonne' WHERE fournisseur_id=v_f AND statut='prepare';
  INSERT INTO materiaux_imports(fournisseur_id,fichier_nom,fichier_hash) VALUES(v_f,_fichier_nom,_hash) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.materiaux_import_ajouter(_import_id uuid, _lignes jsonb) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_n int;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM materiaux_imports WHERE id=_import_id AND statut='prepare') THEN RAISE EXCEPTION 'Import clos'; END IF;
  INSERT INTO materiaux_imports_lignes(import_id,data) SELECT _import_id, x FROM jsonb_array_elements(_lignes) x;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE FUNCTION public.materiaux_import_bilan(_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f uuid; v jsonb;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT fournisseur_id INTO v_f FROM materiaux_imports WHERE id=_import_id;
  WITH n AS (SELECT coalesce(NULLIF(data->>'ref',''), devis_normalize(data->>'produit')||'|'||coalesce(data->>'format','')) k,
                    data->>'produit' produit, NULLIF(data->>'prix_achat_net','')::numeric px
             FROM materiaux_imports_lignes WHERE import_id=_import_id),
       o AS (SELECT coalesce(NULLIF(ref,''), devis_normalize(produit)||'|'||coalesce(format_texte,'')) k, produit, prix_achat_net px
             FROM materiaux_catalogue WHERE fournisseur_id=v_f AND actif),
       j AS (SELECT DISTINCT ON (n.k) n.k, n.produit, o.px ancien, n.px nouveau,
                    round(((n.px/NULLIF(o.px,0))-1)*100,2) var
             FROM n JOIN o ON o.k=n.k)
  SELECT jsonb_build_object(
    'lignes_fichier',(SELECT count(*) FROM n),
    'sans_prix',(SELECT count(*) FROM n WHERE px IS NULL),
    'actives_avant',(SELECT count(*) FROM o),
    'ajoutees',(SELECT count(*) FROM n WHERE NOT EXISTS (SELECT 1 FROM o WHERE o.k=n.k)),
    'retirees',(SELECT count(*) FROM o WHERE NOT EXISTS (SELECT 1 FROM n WHERE n.k=o.k)),
    'variation_mediane_pct',(SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY var)::numeric,2) FROM j WHERE var IS NOT NULL),
    'hausses',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT * FROM j WHERE var>0 ORDER BY var DESC LIMIT 10) x),
    'baisses',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT * FROM j WHERE var<0 ORDER BY var LIMIT 10) x)) INTO v;
  UPDATE materiaux_imports SET bilan=v WHERE id=_import_id;
  RETURN v;
END $$;

CREATE FUNCTION public.materiaux_import_valider(_import_id uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f uuid; v_n int;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT fournisseur_id INTO v_f FROM materiaux_imports WHERE id=_import_id AND statut='prepare' FOR UPDATE;
  IF v_f IS NULL THEN RAISE EXCEPTION 'Import introuvable ou déjà traité'; END IF;
  UPDATE materiaux_catalogue SET actif=false, desactive_le=now() WHERE fournisseur_id=v_f AND actif;
  INSERT INTO materiaux_catalogue(fournisseur_id,import_id,famille,produit,ref,format_texte,longueur_mm,largeur_mm,epaisseur_mm,unite,
     prix_achat_net,prix_m2,prix_ml,prix_catalogue,conditionnement,caracteristiques,remarque,cle_comparaison,source,date_tarif)
  SELECT v_f,_import_id,NULLIF(d->>'famille',''),d->>'produit',NULLIF(d->>'ref',''),NULLIF(d->>'format',''),
     NULLIF(d->>'longueur_mm','')::numeric,NULLIF(d->>'largeur_mm','')::numeric,NULLIF(d->>'epaisseur_mm','')::numeric,
     coalesce(NULLIF(d->>'unite',''),'unité'),NULLIF(d->>'prix_achat_net','')::numeric,NULLIF(d->>'prix_m2','')::numeric,
     NULLIF(d->>'prix_ml','')::numeric,NULLIF(d->>'prix_catalogue','')::numeric,d->>'conditionnement',d->>'caracteristiques',
     NULLIF(d->>'remarque',''),NULLIF(d->>'cle_comparaison',''),d->>'source',NULLIF(d->>'date_tarif','')::date
  FROM (SELECT data d FROM materiaux_imports_lignes WHERE import_id=_import_id) s
  WHERE coalesce(trim(d->>'produit'),'')<>'';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE materiaux_imports SET statut='valide', valide_le=now() WHERE id=_import_id;
  DELETE FROM materiaux_imports_lignes WHERE import_id=_import_id;
  RETURN v_n;
END $$;

CREATE FUNCTION public.materiaux_fournisseurs_stats() RETURNS TABLE(id uuid, slug text, nom text, date_tarif date, etat text, prix_public boolean, lignes_actives bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.id,f.slug,f.nom,f.date_tarif,f.etat,f.prix_public,(SELECT count(*) FROM materiaux_catalogue m WHERE m.fournisseur_id=f.id AND m.actif)
  FROM fournisseurs_tarifs f WHERE current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres') ORDER BY f.nom $$;

REVOKE ALL ON FUNCTION public.materiaux_rechercher(text,text[],uuid[],numeric,boolean,text,int), public.fournisseur_tarif_enregistrer(jsonb),
  public.materiaux_import_preparer(text,text,text), public.materiaux_import_ajouter(uuid,jsonb),
  public.materiaux_import_bilan(uuid), public.materiaux_import_valider(uuid), public.materiaux_fournisseurs_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiaux_rechercher(text,text[],uuid[],numeric,boolean,text,int), public.fournisseur_tarif_enregistrer(jsonb),
  public.materiaux_import_preparer(text,text,text), public.materiaux_import_ajouter(uuid,jsonb),
  public.materiaux_import_bilan(uuid), public.materiaux_import_valider(uuid), public.materiaux_fournisseurs_stats() TO authenticated;