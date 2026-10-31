# Devis dans Staffing — Lots 1 et 2 (plan, rien appliqué)

Six étapes livrables séparément, chacune soumise à votre accord écrit avant application. Aucune suppression de table, colonne ou donnée existante.

## État vérifié en base (lecture seule, 31/10)

- `devis` : 0 ligne. `affaire_id` et `numero` NOT NULL, `statut` = enum `devis_statut` (brouillon, signe, facture, en_cours, termine, cloture) utilisé par les imports ProGBat.
- `devis_postes` : 0 ligne, colonnes `devis_id, metier_id, heures_prevues, montant_ht, libelle_source, notes` (format import par métier).
- `metiers` : construction=1, metallerie=2, peinture=3, numerique=4, tapisserie=5, machiniste=6, logistique=7, suivi_projet=8, impression_uv=9.
- `clients` : a déjà `adresse` (texte unique), `siret` ; manque code postal, ville, n° TVA.
- `fabrication_objets_photos` : `storage_path, thumb_path, width, height, size_bytes, deleted_at, deleted_by`.
- Extensions : `pg_trgm` présent, `unaccent` absent.
- Capabilities existantes utiles : `section.devis`, `devis.view`, `action.create_devis`, `data.margins`. Pas encore `devis.parametres` ni `devis.couts`.
- Rôles existants : il n'y a pas de rôle « chargé d'affaires » ; le plus proche est `commercial`. Le chargé d'affaires d'une affaire est porté par `affaire_roles` (rôle projet `charge_affaires`).

## Points où je propose une autre approche

1. **Heures : nouvelle table `devis_heures`**, pas `devis_postes` étendu. `devis_postes` sert au format import (une ligne par métier et par devis, lue par `v_devis_consommation`). Y mélanger des lignes par objet × poste × niveau fausserait la consommation. `devis_postes` reste intact ; à la signature, on y écrit aussi le récapitulatif par métier pour que les écrans existants continuent de fonctionner.
2. **Statut du devis : nouvelle colonne `statut_redaction`** (nouvel enum brouillon / a_valider / valide / transfere / signe / refuse) au lieu de modifier `devis_statut`. Les imports et la cascade de suppression gardent leur enum. `statut` reste à `brouillon` jusqu'à la signature, où il passe à `signe` comme aujourd'hui.
3. **Modèles sans affaire** : il faut lever l'obligation `devis.affaire_id NOT NULL`, ce qui compte comme modification sensible (accord explicite requis). Je la remplace par une règle : affaire obligatoire sauf pour un modèle. Alternative si vous refusez : table séparée `devis_modeles` (plus de duplication de code). Je recommande la première.
4. **Prix d'achat confidentiels** : la sécurité par ligne de la base ne sait pas masquer une colonne. Je propose : pas de lecture directe des tables catalogue et lignes de devis ; tout passe par des fonctions qui renvoient les prix d'achat, coûts et marge à `NULL` sans `devis.couts`. Les écritures passent aussi par fonctions (comme demandé).
5. **Accents** : `unaccent` n'est pas installé. Je l'active et j'enveloppe la normalisation dans une fonction `devis_normalize()` immuable, utilisée pour `search_text` (colonne calculée) et pour la requête.
6. **« Chargés d'affaires »** pour `devis.couts` / édition : capability donnée au rôle `commercial` et `admin` ; `bureau_etude` reçoit l'édition sans les coûts. Validation : admin, ou la personne tenant le rôle projet `charge_affaires` sur l'affaire.
7. **Adresse client** : on garde `clients.adresse` comme ligne d'adresse de facturation et on ajoute `code_postal`, `ville`, `tva_intracom` (ajouts, rien renommé).
8. **Dates clés** : le devis ne stocke pas les quatre dates de l'affaire pendant le brouillon ; il les lit et écrit directement sur `affaires` (source unique, synchronisation automatique). Copie seulement à la validation (`dates_snapshot`).
9. **Calculs** : une fonction SQL unique `devis_calculer(devis_id)` renvoie le détail par objet / zone / métier ; les totaux d'un devis validé sont stockés figés (`totaux_snapshot`). L'interface affiche un recalcul local immédiat, puis le chiffre serveur fait foi après enregistrement.
10. **Plans communs non multipliés** : une ligne d'heures porte une case `par_unite` (cochée par défaut) ; décochée = heures pour le lot, non multipliées par la quantité. Les chapitres « suivi et plans » ont quantité 1.

---

## Étape 1 — Grille des taux et forfaits

**Écran** : Paramètres › Devis › Taux (admin, `devis.parametres`) : liste des postes (ajouter, renommer, désactiver), par poste les niveaux avec taux en vigueur, bouton « Nouveau taux à partir du… », historique. Onglet Forfaits et paramètres dans le même écran.

**SQL — migration `devis_01_taux`**

```sql
-- Capabilities
INSERT INTO public.capabilities(key,label,description,category,sort_order) VALUES
 ('devis.parametres','Paramétrer les devis','Taux, forfaits, catalogue matériaux, modèles','devis',900),
 ('devis.couts','Voir coûts et marges des devis','Prix d''achat, coûts de revient, marge','devis',901),
 ('devis.rediger','Rédiger des devis','Créer et modifier les devis en brouillon','devis',902)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_capabilities(role,capability,granted,scope) VALUES
 ('admin','devis.parametres',true,'global'),
 ('admin','devis.couts',true,'global'),('commercial','devis.couts',true,'global'),
 ('admin','devis.rediger',true,'global'),('commercial','devis.rediger',true,'global'),
 ('bureau_etude','devis.rediger',true,'global')
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
  taux_vente numeric(10,2),             -- NULL = à saisir
  cout_revient numeric(10,2),
  par_defaut boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poste_id, niveau, date_effet)
);

CREATE TABLE public.devis_parametres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle text NOT NULL,               -- repas, frais_horaire, coursier_22m3, semi_remorque, coef_materiaux, seuil_alerte_taux_pct, validite_jours, tva_pct
  valeur numeric(12,4),
  unite text,
  date_effet date NOT NULL DEFAULT current_date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cle, date_effet)
);

CREATE TABLE public.devis_taux_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet text NOT NULL,             -- 'taux' | 'parametre' | 'poste'
  ref_id uuid NOT NULL,
  ancien jsonb, nouveau jsonb,
  auteur uuid DEFAULT auth.uid(),
  cree_le timestamptz NOT NULL DEFAULT now()
);

-- Vue des valeurs en vigueur
CREATE VIEW public.v_devis_taux_courants WITH (security_invoker=on) AS
SELECT DISTINCT ON (poste_id, niveau) * FROM public.devis_taux
WHERE date_effet <= current_date ORDER BY poste_id, niveau, date_effet DESC;
CREATE VIEW public.v_devis_parametres_courants WITH (security_invoker=on) AS
SELECT DISTINCT ON (cle) * FROM public.devis_parametres
WHERE date_effet <= current_date ORDER BY cle, date_effet DESC;

GRANT SELECT ON public.devis_postes_ref, public.devis_parametres, public.v_devis_parametres_courants TO authenticated;
GRANT SELECT ON public.devis_taux_historique TO authenticated;
GRANT ALL ON public.devis_postes_ref, public.devis_taux, public.devis_parametres, public.devis_taux_historique TO service_role;
-- devis_taux : pas de SELECT direct (coût de revient) ; lecture par devis_taux_lister()

ALTER TABLE public.devis_postes_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_taux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_taux_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY postes_ref_read ON public.devis_postes_ref FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.view') OR public.current_user_has_capability('devis.rediger'));
CREATE POLICY parametres_read ON public.devis_parametres FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.rediger'));
CREATE POLICY taux_hist_read ON public.devis_taux_historique FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.parametres'));

-- Pas de suppression : aucune policy DELETE, aucun GRANT DELETE.

CREATE FUNCTION public.devis_taux_lister()
RETURNS TABLE(poste_id uuid, code text, libelle text, metier_id int, niveau text,
              date_effet date, taux_vente numeric, cout_revient numeric, par_defaut boolean, actif boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id,p.code,p.libelle,p.metier_id,t.niveau,t.date_effet,t.taux_vente,
         CASE WHEN current_user_has_capability('devis.couts') THEN t.cout_revient END,
         t.par_defaut,p.actif
  FROM devis_postes_ref p LEFT JOIN v_devis_taux_courants t ON t.poste_id=p.id
  WHERE current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')
  ORDER BY p.ordre,t.niveau $$;

CREATE FUNCTION public.devis_poste_enregistrer(_id uuid,_code text,_libelle text,_metier_id int,_ordre int,_actif boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old jsonb; v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF _id IS NULL THEN
    INSERT INTO devis_postes_ref(code,libelle,metier_id,ordre,actif) VALUES(_code,_libelle,_metier_id,coalesce(_ordre,0),coalesce(_actif,true)) RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(p) INTO v_old FROM devis_postes_ref p WHERE id=_id;
    UPDATE devis_postes_ref SET libelle=_libelle,metier_id=_metier_id,ordre=coalesce(_ordre,ordre),actif=coalesce(_actif,actif),updated_at=now() WHERE id=_id RETURNING id INTO v_id;
  END IF;
  INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau) SELECT 'poste',v_id,v_old,to_jsonb(p) FROM devis_postes_ref p WHERE id=v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_taux_ajouter(_poste_id uuid,_niveau text,_date_effet date,_taux_vente numeric,_cout_revient numeric,_par_defaut boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old jsonb; v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(t) INTO v_old FROM v_devis_taux_courants t WHERE poste_id=_poste_id AND niveau=_niveau;
  INSERT INTO devis_taux(poste_id,niveau,date_effet,taux_vente,cout_revient,par_defaut)
  VALUES(_poste_id,trim(_niveau),coalesce(_date_effet,current_date),round(_taux_vente,2),round(_cout_revient,2),coalesce(_par_defaut,false))
  ON CONFLICT (poste_id,niveau,date_effet) DO UPDATE SET taux_vente=EXCLUDED.taux_vente,cout_revient=EXCLUDED.cout_revient,par_defaut=EXCLUDED.par_defaut
  RETURNING id INTO v_id;
  IF coalesce(_par_defaut,false) THEN
    UPDATE devis_taux SET par_defaut=false WHERE poste_id=_poste_id AND niveau<>_niveau AND par_defaut;
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
```

**Données de départ** (insérées après la migration, par requête de données, pas dans la migration) : postes suivi_projet 72,50 (métier 8) ; plans_bem 75 (8) ; construction 50 (1) ; metallerie 46 (2) ; peinture 46 (3) ; cnc 66 (4) ; laser 55 (4) ; impression_uv 70 (9) ; impressions_souples 70 (9) ; tapisserie à saisir (5) ; logistique 48 (7) ; montage niveau « chef » 75 et « monteur » 50 (métier 6 machiniste — à confirmer). Tous au niveau « standard » par défaut sauf montage (défaut = monteur). Paramètres : repas 30, frais_horaire 6, coursier_22m3 75, semi_remorque vide, coef_materiaux 1,45, seuil_alerte_taux_pct 10, validite_jours 30, tva_pct 20.

**Tests** : un employé atelier ne lit pas `devis_taux` ; un commercial lit les taux mais le coût de revient seulement avec `devis.couts` ; nouvelle hausse datée laisse l'ancienne ligne intacte ; historique rempli à chaque écriture ; aucune suppression possible.

---

## Étape 2 — Catalogue matériaux et import

**Écrans** : Paramètres › Devis › Matériaux : liste des 13 fournisseurs (date tarif, état), bouton Importer (JSON/CSV) → bilan (ajoutées, retirées, médiane des variations, 10 plus fortes hausses/baisses) → Valider. Recherche de contrôle.

**SQL — migration `devis_02_materiaux`**

```sql
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE FUNCTION public.devis_normalize(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public, extensions AS $$
  SELECT lower(regexp_replace(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t,'')), '\s+', ' ', 'g')) $$;

CREATE TABLE public.fournisseurs_tarifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nom text NOT NULL,
  date_tarif date,
  validite_jusqu_au date,
  etat text NOT NULL DEFAULT 'ok' CHECK (etat IN ('ok','a_surveiller','ancien')),
  prix_public boolean NOT NULL DEFAULT false,   -- SM Bois
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
  search_text text GENERATED ALWAYS AS (public.devis_normalize(
     concat_ws(' ',famille,produit,ref,format_texte,caracteristiques,
       CASE WHEN epaisseur_mm IS NOT NULL THEN trim_scale(epaisseur_mm)::text END,
       CASE WHEN longueur_mm IS NOT NULL THEN trim_scale(longueur_mm)::text||'x'||coalesce(trim_scale(largeur_mm)::text,'') END))) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materiaux_search_trgm ON public.materiaux_catalogue USING gin (search_text extensions.gin_trgm_ops) WHERE actif;
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
CREATE TABLE public.materiaux_imports_lignes (   -- zone de préparation
  import_id uuid NOT NULL REFERENCES public.materiaux_imports(id) ON DELETE CASCADE,
  data jsonb NOT NULL
);

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
-- materiaux_catalogue / imports : aucun accès direct ; uniquement par fonctions

ALTER TABLE public.fournisseurs_tarifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_imports_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiaux_favoris ENABLE ROW LEVEL SECURITY;
CREATE POLICY fourn_read ON public.fournisseurs_tarifs FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.rediger'));
CREATE POLICY fav_own ON public.materiaux_favoris FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Recherche : 50 résultats, prix d'achat masqués sans devis.couts
CREATE FUNCTION public.materiaux_rechercher(_q text, _familles text[] DEFAULT NULL, _fournisseurs uuid[] DEFAULT NULL,
   _epaisseur numeric DEFAULT NULL, _recent_seulement boolean DEFAULT false, _tri text DEFAULT 'pertinence', _limit int DEFAULT 50)
RETURNS TABLE(id uuid, fournisseur text, fournisseur_etat text, famille text, produit text, ref text, format_texte text,
  longueur_mm numeric, largeur_mm numeric, epaisseur_mm numeric, unite text,
  prix_achat_net numeric, prix_m2 numeric, prix_ml numeric, date_tarif date, remarque text,
  cle_comparaison text, moins_cher_du_groupe boolean, score real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public, extensions AS $$
DECLARE v_q text := devis_normalize(_q); v_tokens text[]; v_nums numeric[]; v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT current_user_has_capability('devis.rediger') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_tokens := array_remove(regexp_split_to_array(regexp_replace(v_q,'(\d)x(\d)','\1 x \2','g'),'\s+'),'');
  SELECT array_agg(t::numeric) INTO v_nums FROM unnest(v_tokens) t WHERE t ~ '^\d+([.,]\d+)?$';
  PERFORM set_limit(0.2);
  RETURN QUERY
  WITH c AS (
    SELECT m.*, f.nom AS fnom, f.etat AS fetat,
      ( similarity(m.search_text, v_q)
        + coalesce((SELECT count(*) FROM unnest(v_tokens) t WHERE length(t)>1 AND m.search_text LIKE '%'||t||'%'),0)::real
        + CASE WHEN v_nums IS NOT NULL AND m.epaisseur_mm = ANY(v_nums) THEN 2 ELSE 0 END
        + CASE WHEN v_nums IS NOT NULL AND (m.longueur_mm = ANY(v_nums) OR m.largeur_mm = ANY(v_nums)) THEN 1 ELSE 0 END )::real AS sc
    FROM materiaux_catalogue m JOIN fournisseurs_tarifs f ON f.id=m.fournisseur_id
    WHERE m.actif AND (v_q = '' OR m.search_text % v_q OR NOT EXISTS (
            SELECT 1 FROM unnest(v_tokens) t WHERE length(t)>1 AND t !~ '^\d' AND m.search_text NOT LIKE '%'||t||'%'))
      AND (_familles IS NULL OR m.famille = ANY(_familles))
      AND (_fournisseurs IS NULL OR m.fournisseur_id = ANY(_fournisseurs))
      AND (_epaisseur IS NULL OR m.epaisseur_mm = _epaisseur)
      AND (NOT _recent_seulement OR f.etat = 'ok')
  )
  SELECT c.id,c.fnom,c.fetat,c.famille,c.produit,c.ref,c.format_texte,c.longueur_mm,c.largeur_mm,c.epaisseur_mm,c.unite,
    CASE WHEN v_couts THEN c.prix_achat_net END, CASE WHEN v_couts THEN c.prix_m2 END, CASE WHEN v_couts THEN c.prix_ml END,
    c.date_tarif,c.remarque,c.cle_comparaison,
    (c.cle_comparaison IS NOT NULL AND c.prix_m2 = min(c.prix_m2) OVER (PARTITION BY c.cle_comparaison)),
    c.sc
  FROM c
  ORDER BY CASE WHEN _tri='prix' THEN c.prix_achat_net END NULLS LAST,
           CASE WHEN _tri='m2' THEN coalesce(c.prix_m2,c.prix_ml) END NULLS LAST,
           c.sc DESC, c.prix_m2 NULLS LAST
  LIMIT least(coalesce(_limit,50),100);
END $$;

-- Import en 3 temps : préparer (charge les lignes), bilan, valider
CREATE FUNCTION public.materiaux_import_preparer(_fournisseur_slug text, _fichier_nom text, _hash text, _lignes jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f uuid; v_id uuid;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_f FROM fournisseurs_tarifs WHERE slug=_fournisseur_slug;
  IF v_f IS NULL THEN RAISE EXCEPTION 'Fournisseur inconnu : %', _fournisseur_slug; END IF;
  INSERT INTO materiaux_imports(fournisseur_id,fichier_nom,fichier_hash) VALUES(v_f,_fichier_nom,_hash) RETURNING id INTO v_id;
  INSERT INTO materiaux_imports_lignes(import_id,data) SELECT v_id, x FROM jsonb_array_elements(_lignes) x;
  RETURN v_id;
END $$;
-- (Le client envoie par paquets de 2 000 lignes via materiaux_import_ajouter(_import_id, _lignes) de même forme.)
CREATE FUNCTION public.materiaux_import_ajouter(_import_id uuid, _lignes jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO materiaux_imports_lignes(import_id,data) SELECT _import_id, x FROM jsonb_array_elements(_lignes) x
  WHERE EXISTS (SELECT 1 FROM materiaux_imports WHERE id=_import_id AND statut='prepare');
END $$;

CREATE FUNCTION public.materiaux_import_bilan(_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f uuid; v jsonb;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT fournisseur_id INTO v_f FROM materiaux_imports WHERE id=_import_id;
  WITH n AS (SELECT data->>'ref' ref, coalesce(data->>'produit','') produit, (data->>'prix_achat_net')::numeric px FROM materiaux_imports_lignes WHERE import_id=_import_id),
       o AS (SELECT ref, produit, prix_achat_net px FROM materiaux_catalogue WHERE fournisseur_id=v_f AND actif),
       j AS (SELECT n.ref, n.produit, o.px old_px, n.px new_px, (n.px/NULLIF(o.px,0)-1)*100 var FROM n JOIN o ON o.ref IS NOT DISTINCT FROM n.ref AND (n.ref IS NOT NULL OR o.produit=n.produit))
  SELECT jsonb_build_object(
    'lignes_fichier',(SELECT count(*) FROM n),
    'ajoutees',(SELECT count(*) FROM n WHERE NOT EXISTS (SELECT 1 FROM j WHERE j.ref IS NOT DISTINCT FROM n.ref AND j.produit=n.produit)),
    'retirees',(SELECT count(*) FROM o WHERE NOT EXISTS (SELECT 1 FROM j WHERE j.ref IS NOT DISTINCT FROM o.ref)),
    'variation_mediane_pct',(SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY var)::numeric,2) FROM j),
    'hausses',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT * FROM j WHERE var>0 ORDER BY var DESC LIMIT 10) x),
    'baisses',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT * FROM j WHERE var<0 ORDER BY var LIMIT 10) x)) INTO v;
  UPDATE materiaux_imports SET bilan=v WHERE id=_import_id;
  RETURN v;
END $$;

CREATE FUNCTION public.materiaux_import_valider(_import_id uuid, _date_tarif date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f uuid; v_n int;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT fournisseur_id INTO v_f FROM materiaux_imports WHERE id=_import_id AND statut='prepare' FOR UPDATE;
  IF v_f IS NULL THEN RAISE EXCEPTION 'Import introuvable ou déjà traité'; END IF;
  UPDATE materiaux_catalogue SET actif=false, desactive_le=now() WHERE fournisseur_id=v_f AND actif;
  INSERT INTO materiaux_catalogue(fournisseur_id,import_id,famille,produit,ref,format_texte,longueur_mm,largeur_mm,epaisseur_mm,unite,
     prix_achat_net,prix_m2,prix_ml,prix_catalogue,conditionnement,caracteristiques,remarque,cle_comparaison,source,date_tarif)
  SELECT v_f,_import_id,d->>'famille',d->>'produit',d->>'ref',d->>'format',(d->>'longueur_mm')::numeric,(d->>'largeur_mm')::numeric,
     (d->>'epaisseur_mm')::numeric,coalesce(d->>'unite','pièce'),(d->>'prix_achat_net')::numeric,(d->>'prix_m2')::numeric,(d->>'prix_ml')::numeric,
     (d->>'prix_catalogue')::numeric,d->>'conditionnement',d->>'caracteristiques',d->>'remarque',d->>'cle_comparaison',d->>'source',
     coalesce((d->>'date_tarif')::date,_date_tarif)
  FROM (SELECT data d FROM materiaux_imports_lignes WHERE import_id=_import_id) s
  WHERE coalesce(d->>'produit','')<>'';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE fournisseurs_tarifs SET date_tarif=coalesce(_date_tarif,date_tarif), updated_at=now() WHERE id=v_f;
  UPDATE materiaux_imports SET statut='valide', valide_le=now() WHERE id=_import_id;
  DELETE FROM materiaux_imports_lignes WHERE import_id=_import_id;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.materiaux_rechercher(text,text[],uuid[],numeric,boolean,text,int),
  public.materiaux_import_preparer(text,text,text,jsonb), public.materiaux_import_ajouter(uuid,jsonb),
  public.materiaux_import_bilan(uuid), public.materiaux_import_valider(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiaux_rechercher(text,text[],uuid[],numeric,boolean,text,int),
  public.materiaux_import_preparer(text,text,text,jsonb), public.materiaux_import_ajouter(uuid,jsonb),
  public.materiaux_import_bilan(uuid), public.materiaux_import_valider(uuid,date) TO authenticated;
```

Données : 13 fournisseurs créés par requête de données ; Vidal Bois `etat='ancien'` (11/2024), SM Bois `prix_public=true`, `etat='a_surveiller'`. Les 32 000 lignes viennent de vos fichiers via l'écran.

**Tests** : les 8 recherches de l'énoncé renvoient des résultats pertinents en tête, temps < 1 s mesuré (EXPLAIN ANALYZE sur 32 000 lignes) ; profil atelier : refus ; commercial sans `devis.couts` (bureau d'étude) : prix NULL ; ré-import : anciennes lignes `actif=false`, rien supprimé ; bilan chiffré correct sur un petit fichier de test. Les fonctions de découpage des nombres (« 40x40x2 », « 22x48 ») sont testées en Vitest côté helper partagé.

---

## Étape 3 — Modèle de données du devis

**SQL — migration `devis_03_modele`** (contient la levée de `affaire_id NOT NULL` → accord explicite requis)

```sql
CREATE TYPE public.devis_redaction_statut AS ENUM ('brouillon','a_valider','valide','transfere','signe','refuse');
CREATE TYPE public.devis_ligne_type AS ENUM ('zone','objet','commentaire','chapitre_suivi','chapitre_pose','chapitre_depose','option');

ALTER TABLE public.clients ADD COLUMN code_postal text, ADD COLUMN ville text, ADD COLUMN tva_intracom text;

ALTER TABLE public.devis
  ADD COLUMN redige_dans_staffing boolean NOT NULL DEFAULT false,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN version_precedente_id uuid REFERENCES public.devis(id),
  ADD COLUMN statut_redaction public.devis_redaction_statut,
  ADD COLUMN numero_progbat text,
  ADD COLUMN client_id uuid REFERENCES public.clients(id),
  ADD COLUMN contact_id uuid REFERENCES public.client_contacts(id),
  ADD COLUMN client_final_id uuid REFERENCES public.clients(id),
  ADD COLUMN date_devis date DEFAULT current_date,
  ADD COLUMN validite_jours integer,
  ADD COLUMN tva_pct numeric(5,2),
  ADD COLUMN coef_materiaux_defaut numeric(6,3),
  ADD COLUMN est_modele boolean NOT NULL DEFAULT false,
  ADD COLUMN modele_nom text, ADD COLUMN modele_categorie text, ADD COLUMN modele_description text,
  ADD COLUMN modele_actif boolean NOT NULL DEFAULT true,
  ADD COLUMN modele_origine_id uuid REFERENCES public.devis(id),
  ADD COLUMN dates_snapshot jsonb, ADD COLUMN totaux_snapshot jsonb,
  ADD COLUMN auteur_id uuid DEFAULT auth.uid(),
  ADD COLUMN valide_par uuid, ADD COLUMN valide_le timestamptz;

ALTER TABLE public.devis ALTER COLUMN affaire_id DROP NOT NULL;            -- sensible
ALTER TABLE public.devis ADD CONSTRAINT devis_affaire_ou_modele
  CHECK (affaire_id IS NOT NULL OR est_modele);
CREATE UNIQUE INDEX devis_staffing_version_uq ON public.devis(affaire_id, version)
  WHERE redige_dans_staffing AND NOT est_modele;

CREATE TABLE public.devis_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.devis_lignes(id),
  type public.devis_ligne_type NOT NULL,
  ordre numeric NOT NULL DEFAULT 0,
  libelle text,
  quantite numeric(10,2) NOT NULL DEFAULT 1,
  descriptif_client text,
  longueur_mm numeric, largeur_mm numeric, hauteur_mm numeric,
  finition text,
  texte text, interne boolean NOT NULL DEFAULT false,
  source_ligne_id uuid,                 -- bibliothèque / copie
  supprime_le timestamptz, supprime_par uuid, suppression_groupe uuid,   -- annuler/corbeille
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devis_lignes_devis ON public.devis_lignes(devis_id, parent_id, ordre) WHERE supprime_le IS NULL;

CREATE TABLE public.devis_heures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_id uuid NOT NULL REFERENCES public.devis_lignes(id) ON DELETE CASCADE,
  poste_id uuid NOT NULL REFERENCES public.devis_postes_ref(id),
  niveau text NOT NULL,
  heures numeric(10,2) NOT NULL DEFAULT 0,
  par_unite boolean NOT NULL DEFAULT true,
  taux_vente numeric(10,2) NOT NULL,
  taux_grille numeric(10,2),             -- pour l'alerte seuil
  cout_revient numeric(10,2),
  ordre numeric NOT NULL DEFAULT 0,
  supprime_le timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.devis_materiaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_id uuid NOT NULL REFERENCES public.devis_lignes(id) ON DELETE CASCADE,
  materiau_id uuid REFERENCES public.materiaux_catalogue(id),
  designation text NOT NULL, fournisseur text, ref text, unite text,
  quantite numeric(12,3) NOT NULL DEFAULT 1,
  aide_conversion jsonb,                 -- {mode:'m2'|'pieces'|'ml', saisie, perte_pct}
  prix_achat numeric(12,4) NOT NULL DEFAULT 0,
  date_tarif date,
  coefficient numeric(6,3) NOT NULL DEFAULT 1.45,
  propose_catalogue boolean NOT NULL DEFAULT false,
  ordre numeric NOT NULL DEFAULT 0,
  supprime_le timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.devis_lignes_libres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_id uuid NOT NULL REFERENCES public.devis_lignes(id) ON DELETE CASCADE,
  categorie text NOT NULL DEFAULT 'achat' CHECK (categorie IN ('achat','sous_traitance','location','forfait')),
  forfait_cle text,                      -- repas, coursier_22m3, semi_remorque, frais_horaire
  designation text NOT NULL,
  quantite numeric(12,3) NOT NULL DEFAULT 1,
  prix_achat numeric(12,4),              -- achat
  prix_forfait numeric(12,4),            -- forfait : prix de vente direct
  coefficient numeric(6,3) NOT NULL DEFAULT 1,
  par_unite boolean NOT NULL DEFAULT true,
  ordre numeric NOT NULL DEFAULT 0,
  supprime_le timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.devis_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  ligne_id uuid NOT NULL REFERENCES public.devis_lignes(id),
  storage_path text NOT NULL, thumb_path text,
  mime text, width integer, height integer, size_bytes integer,
  legende text, visible_client boolean NOT NULL DEFAULT true, ordre numeric NOT NULL DEFAULT 0,
  uploaded_by uuid DEFAULT auth.uid(), uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, deleted_by uuid
);

-- Accès direct : lecture structure seulement (sans montants d'achat) via fonctions ; tables fermées
GRANT ALL ON public.devis_lignes, public.devis_heures, public.devis_materiaux, public.devis_lignes_libres, public.devis_photos TO service_role;
GRANT SELECT ON public.devis_photos TO authenticated;
ALTER TABLE public.devis_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_heures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_materiaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_lignes_libres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY devis_photos_read ON public.devis_photos FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.rediger')
     OR EXISTS (SELECT 1 FROM public.devis d WHERE d.id=devis_id AND d.affaire_id IS NOT NULL
                AND public.user_has_affaire_access(d.affaire_id)));

-- Verrou : aucune écriture sur un devis non brouillon (filet de sécurité derrière les RPC)
CREATE FUNCTION public.devis_assert_brouillon(_devis_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM devis WHERE id=_devis_id AND coalesce(statut_redaction,'brouillon')='brouillon') THEN
    RAISE EXCEPTION 'Devis verrouillé : créez une nouvelle version' USING ERRCODE='P0001';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.devis_assert_brouillon(uuid) FROM PUBLIC, anon;

-- Fonction de calcul unique
CREATE FUNCTION public.devis_calculer(_devis_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH RECURSIVE l AS (SELECT * FROM devis_lignes WHERE devis_id=_devis_id AND supprime_le IS NULL),
obj AS (
  SELECT o.id, o.parent_id, o.type, o.quantite,
    coalesce((SELECT sum(h.heures*h.taux_vente*CASE WHEN h.par_unite THEN o.quantite ELSE 1 END) FROM devis_heures h WHERE h.ligne_id=o.id AND h.supprime_le IS NULL),0)
   +coalesce((SELECT sum(m.quantite*m.prix_achat*m.coefficient)*o.quantite FROM devis_materiaux m WHERE m.ligne_id=o.id AND m.supprime_le IS NULL),0)
   +coalesce((SELECT sum(f.quantite*coalesce(f.prix_forfait,f.prix_achat*f.coefficient)*CASE WHEN f.par_unite THEN o.quantite ELSE 1 END) FROM devis_lignes_libres f WHERE f.ligne_id=o.id AND f.supprime_le IS NULL),0) AS vente,
    coalesce((SELECT sum(h.heures*h.cout_revient*CASE WHEN h.par_unite THEN o.quantite ELSE 1 END) FROM devis_heures h WHERE h.ligne_id=o.id AND h.supprime_le IS NULL),0)
   +coalesce((SELECT sum(m.quantite*m.prix_achat)*o.quantite FROM devis_materiaux m WHERE m.ligne_id=o.id AND m.supprime_le IS NULL),0)
   +coalesce((SELECT sum(f.quantite*coalesce(f.prix_achat,0)*CASE WHEN f.par_unite THEN o.quantite ELSE 1 END) FROM devis_lignes_libres f WHERE f.ligne_id=o.id AND f.supprime_le IS NULL),0) AS cout,
    EXISTS (SELECT 1 FROM devis_heures h WHERE h.ligne_id=o.id AND h.supprime_le IS NULL AND h.cout_revient IS NULL AND h.heures>0) AS cout_manquant
  FROM l o WHERE o.type IN ('objet','chapitre_suivi','chapitre_pose','chapitre_depose','option')),
anc AS (  -- racine de chaque objet (zone, chapitre ou option)
  SELECT o.id obj_id, o.id cur, o.parent_id FROM obj o
  UNION ALL SELECT a.obj_id, p.id, p.parent_id FROM anc a JOIN l p ON p.id=a.parent_id),
racine AS (SELECT DISTINCT ON (a.obj_id) a.obj_id, a.cur racine_id FROM anc a WHERE a.parent_id IS NULL ORDER BY a.obj_id),
base AS (SELECT o.*, r.racine_id, (SELECT type FROM l WHERE id=r.racine_id) racine_type,
         EXISTS (SELECT 1 FROM anc a JOIN l x ON x.id=a.cur WHERE a.obj_id=o.id AND x.type='option') est_option
         FROM obj o JOIN racine r ON r.obj_id=o.id),
tot AS (SELECT round(sum(vente) FILTER (WHERE NOT est_option),2) ht, round(sum(cout) FILTER (WHERE NOT est_option),2) cout,
               bool_or(cout_manquant) FILTER (WHERE NOT est_option) manq FROM base),
tva AS (SELECT coalesce((SELECT tva_pct FROM devis WHERE id=_devis_id),(SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),20) p)
SELECT jsonb_build_object(
  'total_ht', coalesce(t.ht,0),
  'tva', round(coalesce(t.ht,0)*tva.p/100,2),
  'ttc', round(coalesce(t.ht,0)*(1+tva.p/100),2),
  'options_ht', (SELECT round(coalesce(sum(vente),0),2) FROM base WHERE est_option),
  'objets', (SELECT coalesce(jsonb_object_agg(id, round(vente,2)),'{}') FROM base),
  'racines', (SELECT coalesce(jsonb_object_agg(racine_id, s),'{}') FROM (SELECT racine_id, round(sum(vente),2) s FROM base GROUP BY racine_id) z),
  'heures_metier', (SELECT coalesce(jsonb_object_agg(metier_id, h),'{}') FROM (
      SELECT p.metier_id, round(sum(h.heures*CASE WHEN h.par_unite THEN b.quantite ELSE 1 END),2) h
      FROM base b JOIN devis_heures h ON h.ligne_id=b.id AND h.supprime_le IS NULL JOIN devis_postes_ref p ON p.id=h.poste_id
      WHERE NOT b.est_option GROUP BY p.metier_id) z),
  'marge', CASE WHEN NOT current_user_has_capability('devis.couts') THEN NULL
                WHEN t.manq THEN 'non_calculable'::text::jsonb #>> '{}' IS NULL  -- remplacé ci-dessous
           END)
  || CASE WHEN current_user_has_capability('devis.couts') THEN
       jsonb_build_object('marge', CASE WHEN t.manq THEN to_jsonb('non_calculable'::text) ELSE to_jsonb(round(coalesce(t.ht,0)-coalesce(t.cout,0),2)) END,
                          'cout_total', CASE WHEN t.manq THEN NULL ELSE t.cout END)
     ELSE jsonb_build_object('marge', NULL) END
FROM tot t, tva;
$$;
REVOKE ALL ON FUNCTION public.devis_calculer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_calculer(uuid) TO authenticated;
```

(Lors de l'écriture finale je simplifierai la construction de `marge` en un seul `CASE` ; logique : `NULL` sans `devis.couts`, `"non_calculable"` si un coût manque, sinon HT − coûts.)

**Bucket** : nouveau bucket privé `devis-photos` (créé par outil, pas par SQL), policies `storage.objects` lecture/écriture pour `devis.rediger`, chemin `<devis_id>/<ligne_id>/<fichier>`, vignettes comme pour les photos de fabrication.

**Tests SQL (transaction annulée)** : objet ×4 multiplie heures et matières, ligne « plans » décochée non multipliée ; option hors total ; déplacement d'objet : sous-totaux changent, total identique ; profil sans `devis.couts` : marge NULL ; coût manquant : « non_calculable ».

---

## Étape 4 — Éditeur

**Fonctions SQL** (migration `devis_04_editeur`, toutes SECURITY DEFINER, `devis.rediger` + accès à l'affaire + `devis_assert_brouillon`) :

- `devis_creer(_affaire_id, _modele_id uuid DEFAULT NULL)` → numéro `<numero affaire>-R<n>`, client/contact repris de l'affaire, paramètres en vigueur copiés (TVA, coef, validité).
- `devis_lire(_devis_id)` → jsonb complet (en-tête, arbre, heures, matériaux, libres, photos, dates de l'affaire, calcul) avec `prix_achat`, `cout_revient`, marge mis à NULL sans `devis.couts`.
- `devis_lire_client(_devis_id)` → vue client : sans commentaires internes, sans photos non cochées, sans heures/achats/marge ; dates vides = « À déterminer ».
- `devis_entete_modifier(_devis_id, _patch jsonb)` → liste blanche : client_id, contact_id, client_final_id, date_devis, numero_progbat, libelle ; option `_maj_affaire_client boolean`.
- `devis_dates_affaire_modifier(_devis_id, _patch jsonb)` → écrit date_visite_technique, date_montage, date_evenement_debut/fin, date_demontage **sur l'affaire** via `app_modifier_affaire` (même liste blanche, même contrôle). Aucune étape logistique touchée.
- `devis_ligne_enregistrer(_devis_id, _ligne jsonb)` / `devis_ligne_deplacer(_ligne_id, _parent_id, _ordre)` / `devis_ligne_dupliquer(_ligne_id)` (copie récursive avec heures, matériaux, libres, photos) / `devis_ligne_supprimer(_ligne_id, _mode 'avec_contenu'|'deplacer_vers', _cible uuid)` → retourne `suppression_groupe` / `devis_corbeille_restaurer(_groupe uuid)`.
- `devis_heure_enregistrer`, `devis_materiau_enregistrer`, `devis_libre_enregistrer` (+ suppression logique) : à la création d'une heure, taux et coût copiés de la grille en vigueur ; à l'ajout d'un matériau, prix/ref/fournisseur/date copiés du catalogue (le prix n'est jamais envoyé par le client sans `devis.couts`).
- `devis_materiaux_ecarts(_devis_id)` → lignes dont le prix catalogue actif diffère ; `devis_materiau_maj_prix(_id)`.
- `materiaux_acces_rapides(_devis_id)` → récents (mes 20 derniers), favoris, déjà dans ce devis, top 12 mois.
- `devis_soumettre`, `devis_valider(_devis_id)` (admin ou titulaire `charge_affaires` sur l'affaire) : fige `dates_snapshot` et `totaux_snapshot`, statut `valide`. `devis_refuser` / signature : application seulement (refusé côté connecteur Claude par `mcp_assert_legacy_oauth_write`, comme les autres RPC).
- `devis_nouvelle_version(_devis_id)` → copie intégrale en R+1 (taux et prix copiés tels quels, pas réévalués), statut brouillon ; l'ancienne reste consultable.
- Policy RLS `devis` complétée : lecture des devis Staffing par `devis.view`/`devis.rediger` + accès affaire ; aucune écriture directe sur les nouvelles colonnes (trigger refusant l'écriture des colonnes de rédaction hors fonctions).

**Écrans** :
- Onglet « Devis » dans la fiche affaire partagée (opportunité et chantier) : liste (numéro, version, statut, total HT, date, auteur, modèle d'origine), « Nouveau devis » (vierge / depuis un modèle). Respecte la règle des onglets non déployés existante : visible seulement si vous le décidez (je propose un drapeau `devis_staffing_v1`).
- Route éditeur `/affaires/$affaireId/devis/$devisId` : en-tête (sélecteurs cherchables client / contact / client final, alerte orange champs manquants, « Créer le client » → fiche client puis retour), encart Dates clés 6 cases, 3 colonnes (arbre avec glisser-déposer `@dnd-kit` + menu ⋯ ; fiche objet ; synthèse et boutons, « Vers ProGBat (lot 3) » grisé).
- Tableaux clavier (Tab, Entrée = nouvelle ligne), recalcul local immédiat via un helper TS qui reproduit `devis_calculer`, enregistrement automatique par champ (même principe de file par ligne et champ que le tableur opportunités), puis le résultat serveur fait foi.
- Panneau matériaux : barre unique (attente 200 ms, ↑↓ Entrée), puces filtres, tri, groupes d'équivalents avec badge « moins cher », alerte tarif ancien / prix public, accès rapides, aide à la conversion (m², pièces, ml, perte %), ligne libre + « proposer au catalogue ».
- Toast « Annuler » après suppression + tiroir Corbeille.
- Vue client (lecture seule à l'écran).

**Tests** : Vitest sur le helper de calcul (mêmes cas que le SQL, vérifie l'égalité avec `devis_calculer` sur un jeu fixe) et sur la conversion (m² → panneaux arrondi supérieur, ml → barres, perte) ; tests SQL : validé refuse toute écriture, nouvelle version copie tout et reste insensible à une hausse de taux ultérieure, synchro dates devis ↔ affaire, vue client filtrée ; parcours navigateur connecté : créer un devis, ajouter zone/objet/heures/matériau « mdf 19 », déplacer, supprimer/annuler, valider. Les 3 devis ProGBat de référence quand vous me les transmettez.

---

## Étape 5 — Modèles et bibliothèque

**Fonctions** (migration `devis_05_modeles`) : `devis_modele_enregistrer(_devis_id, _nom, _categorie, _description)` (copie sans affaire, client, contact, dates), `devis_modele_modifier` (admin, `devis.parametres`), `devis_creer(_affaire_id, _modele_id)` déjà prévu : copie structure, heures (taux **réévalués** depuis la grille en vigueur), niveaux, matériaux (prix **réévalués** depuis le catalogue actif si la référence existe, sinon conservés avec indicateur), commentaires, photos (fichiers copiés). `devis_bibliotheque_rechercher(_q)` sur objets des devis accessibles et modèles ; `devis_objet_inserer(_devis_id, _parent_id, _source_ligne_id)`.

**Écran** : Paramètres › Devis › Modèles (admin) : liste, catégorie, actif, aperçu ; bouton « Enregistrer comme modèle » dans l'éditeur ; « + Bibliothèque » dans l'arbre.

**Tests** : devis créé depuis un modèle reprend toute la structure avec les taux du jour ; modification du devis ne change pas le modèle ; un non-admin ne peut pas modifier un modèle.

---

## Étape 6 — Signature vers fabrication

**Fonction** (migration `devis_06_signature`) : `devis_signer_vers_fabrication(_devis_id)` appelée depuis le parcours de signature existant de l'opportunité (application uniquement, humain) :
- exige `statut_redaction` = valide ou transfere ; passe à `signe`, `devis.statut='signe'`, `date_signature`, `montant_ht` = total figé ;
- pour chaque objet (hors options) : `fabrication_objets` (référence `<n° zone>.<n° objet>`, nom, quantité, dimensions, `materiaux` = liste texte, `finition_detail`, `budget_materiaux` = Σ achats × quantité, `devis_id`) + `objet_heures_metier` (Σ heures par métier × quantité, `origine='devis_staffing'`) + champs `heures_prevues_*` existants remplis pour compatibilité ;
- photos cochées « visible client » copiées vers `fabrication_objets_photos` ;
- récapitulatif par métier écrit dans `devis_postes` (lu par `v_devis_consommation`) ;
- idempotente : ne recrée rien si déjà fait pour ce devis.

**Tests** : signature crée N objets et leurs heures par métier exactes, relance sans doublon, références uniques par affaire respectées, `v_devis_consommation` affiche les bonnes heures.

---

## Ordre de validation proposé

Étape 1 → vos remarques → application. Puis étape 2 (avec un premier fichier fournisseur pour mesurer la recherche), etc. Pour l'étape 3, merci de me dire explicitement si vous acceptez de rendre `devis.affaire_id` facultatif (point 3).

## Questions ouvertes

1. Métier Staffing du poste « montage » : machiniste (6) ? Et laser : numérique (4) ?
2. Qui reçoit `devis.couts` en plus d'admin et commercial ?
3. Onglet Devis : caché derrière un drapeau tant que les tests d'acceptation ne sont pas passés ?
