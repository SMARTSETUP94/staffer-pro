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
  ADD COLUMN valide_par uuid, ADD COLUMN valide_le timestamptz,
  ADD COLUMN signe_vers_fabrication_le timestamptz;

ALTER TABLE public.devis ALTER COLUMN affaire_id DROP NOT NULL;
ALTER TABLE public.devis ADD CONSTRAINT devis_affaire_ou_modele CHECK (affaire_id IS NOT NULL OR est_modele);
CREATE UNIQUE INDEX devis_staffing_version_uq ON public.devis(affaire_id, version)
  WHERE redige_dans_staffing AND NOT est_modele;

-- Les devis rédigés dans Staffing ne s'écrivent que par les fonctions devis_* (drapeau de transaction).
CREATE FUNCTION public.guard_devis_staffing_direct_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (TG_OP='DELETE' AND OLD.redige_dans_staffing) OR (TG_OP<>'DELETE' AND (NEW.redige_dans_staffing OR (TG_OP='UPDATE' AND OLD.redige_dans_staffing))) THEN
    IF coalesce(current_setting('app.devis_rpc', true),'') <> 'on' THEN
      RAISE EXCEPTION 'Devis Staffing : écriture directe interdite, passez par l''éditeur' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_guard_devis_staffing_direct BEFORE INSERT OR UPDATE OR DELETE ON public.devis
  FOR EACH ROW EXECUTE FUNCTION public.guard_devis_staffing_direct_write();

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
  source_ligne_id uuid,
  supprime_le timestamptz, supprime_par uuid, suppression_groupe uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devis_lignes_devis ON public.devis_lignes(devis_id, parent_id, ordre);

CREATE TABLE public.devis_heures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_id uuid NOT NULL REFERENCES public.devis_lignes(id) ON DELETE CASCADE,
  poste_id uuid NOT NULL REFERENCES public.devis_postes_ref(id),
  niveau text NOT NULL,
  heures numeric(10,2) NOT NULL DEFAULT 0,
  par_unite boolean NOT NULL DEFAULT true,
  taux_vente numeric(10,2) NOT NULL DEFAULT 0,
  taux_grille numeric(10,2),
  cout_revient numeric(10,2),
  ordre numeric NOT NULL DEFAULT 0,
  supprime_le timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devis_heures_ligne ON public.devis_heures(ligne_id);

CREATE TABLE public.devis_materiaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_id uuid NOT NULL REFERENCES public.devis_lignes(id) ON DELETE CASCADE,
  materiau_id uuid REFERENCES public.materiaux_catalogue(id),
  designation text NOT NULL, fournisseur text, ref text, unite text,
  quantite numeric(12,3) NOT NULL DEFAULT 1,
  aide_conversion jsonb,
  prix_achat numeric(12,4) NOT NULL DEFAULT 0,
  date_tarif date,
  coefficient numeric(6,3) NOT NULL DEFAULT 1.45,
  propose_catalogue boolean NOT NULL DEFAULT false,
  ordre numeric NOT NULL DEFAULT 0,
  supprime_le timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devis_materiaux_ligne ON public.devis_materiaux(ligne_id);

CREATE TABLE public.devis_lignes_libres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_id uuid NOT NULL REFERENCES public.devis_lignes(id) ON DELETE CASCADE,
  categorie text NOT NULL DEFAULT 'achat' CHECK (categorie IN ('achat','sous_traitance','location','forfait')),
  forfait_cle text,
  designation text NOT NULL,
  unite text,
  quantite numeric(12,3) NOT NULL DEFAULT 1,
  prix_achat numeric(12,4),
  prix_forfait numeric(12,4),
  coefficient numeric(6,3) NOT NULL DEFAULT 1,
  par_unite boolean NOT NULL DEFAULT true,
  ordre numeric NOT NULL DEFAULT 0,
  supprime_le timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devis_libres_ligne ON public.devis_lignes_libres(ligne_id);

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

GRANT ALL ON public.devis_lignes, public.devis_heures, public.devis_materiaux, public.devis_lignes_libres, public.devis_photos TO service_role;
GRANT SELECT ON public.devis_photos TO authenticated;
ALTER TABLE public.devis_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_heures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_materiaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_lignes_libres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY devis_photos_read ON public.devis_photos FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.rediger'));

CREATE FUNCTION public.devis_assert_brouillon(_devis_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM devis WHERE id=_devis_id AND redige_dans_staffing AND coalesce(statut_redaction,'brouillon')='brouillon') THEN
    RAISE EXCEPTION 'Devis verrouillé : créez une nouvelle version' USING ERRCODE='P0001';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.devis_assert_brouillon(uuid) FROM PUBLIC, anon, authenticated;

-- Calcul brut (sans contrôle d'accès, interne)
CREATE FUNCTION public.devis_calculer_interne(_devis_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH RECURSIVE l AS (SELECT * FROM devis_lignes WHERE devis_id=_devis_id AND supprime_le IS NULL),
t AS (
  SELECT id, id AS racine, (type='option') AS est_option, quantite AS q FROM l WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.racine, t.est_option OR c.type='option', c.quantite FROM l c JOIN t ON c.parent_id=t.id
),
h AS (SELECT ligne_id, sum(heures*taux_vente*CASE WHEN par_unite THEN 1 ELSE NULL END) vu, sum(heures*taux_vente) FILTER (WHERE NOT par_unite) vl,
             sum(heures*cout_revient) FILTER (WHERE par_unite) cu, sum(heures*cout_revient) FILTER (WHERE NOT par_unite) cl,
             bool_or(cout_revient IS NULL AND heures>0) manq
      FROM devis_heures WHERE supprime_le IS NULL GROUP BY ligne_id),
m AS (SELECT ligne_id, sum(quantite*prix_achat*coefficient) v, sum(quantite*prix_achat) c FROM devis_materiaux WHERE supprime_le IS NULL GROUP BY ligne_id),
f AS (SELECT ligne_id,
        sum(quantite*coalesce(prix_forfait,coalesce(prix_achat,0)*coefficient)) FILTER (WHERE par_unite) vu,
        sum(quantite*coalesce(prix_forfait,coalesce(prix_achat,0)*coefficient)) FILTER (WHERE NOT par_unite) vl,
        sum(quantite*coalesce(prix_achat,0)) FILTER (WHERE par_unite) cu,
        sum(quantite*coalesce(prix_achat,0)) FILTER (WHERE NOT par_unite) cl
      FROM devis_lignes_libres WHERE supprime_le IS NULL GROUP BY ligne_id),
o AS (
  SELECT t.id, t.racine, t.est_option, t.q,
    round((coalesce(h.vu,0)+coalesce(m.v,0)+coalesce(f.vu,0))*t.q + coalesce(h.vl,0)+coalesce(f.vl,0), 2) AS vente,
    (coalesce(h.cu,0)+coalesce(m.c,0)+coalesce(f.cu,0))*t.q + coalesce(h.cl,0)+coalesce(f.cl,0) AS cout,
    coalesce(h.manq,false) AS manq
  FROM t LEFT JOIN h ON h.ligne_id=t.id LEFT JOIN m ON m.ligne_id=t.id LEFT JOIN f ON f.ligne_id=t.id
),
hm AS (SELECT p.metier_id, round(sum(x.heures*CASE WHEN x.par_unite THEN t.q ELSE 1 END),2) h
       FROM devis_heures x JOIN t ON t.id=x.ligne_id JOIN devis_postes_ref p ON p.id=x.poste_id
       WHERE x.supprime_le IS NULL AND NOT t.est_option GROUP BY p.metier_id),
tot AS (SELECT coalesce(sum(vente) FILTER (WHERE NOT est_option),0) ht, coalesce(sum(cout) FILTER (WHERE NOT est_option),0) cout,
               coalesce(bool_or(manq) FILTER (WHERE NOT est_option),false) manq,
               coalesce(sum(vente) FILTER (WHERE est_option),0) opt FROM o),
tva AS (SELECT coalesce((SELECT tva_pct FROM devis WHERE id=_devis_id),(SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),20) p)
SELECT jsonb_build_object(
  'total_ht', round(tot.ht,2),
  'tva_pct', tva.p,
  'tva', round(tot.ht*tva.p/100,2),
  'ttc', round(tot.ht,2)+round(tot.ht*tva.p/100,2),
  'options_ht', round(tot.opt,2),
  'lignes', (SELECT coalesce(jsonb_object_agg(id, vente),'{}'::jsonb) FROM o WHERE vente<>0),
  'racines', (SELECT coalesce(jsonb_object_agg(racine, s),'{}'::jsonb) FROM (SELECT racine, round(sum(vente),2) s FROM o GROUP BY racine) z),
  'heures_metier', (SELECT coalesce(jsonb_object_agg(coalesce(metier_id::text,'aucun'), h),'{}'::jsonb) FROM hm),
  'cout_total', CASE WHEN tot.manq THEN NULL ELSE round(tot.cout,2) END,
  'marge', CASE WHEN tot.manq THEN to_jsonb('non_calculable'::text) ELSE to_jsonb(round(tot.ht-tot.cout,2)) END)
FROM tot, tva;
$$;
REVOKE ALL ON FUNCTION public.devis_calculer_interne(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.devis_peut_lire(_devis_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM devis d WHERE d.id=_devis_id AND d.redige_dans_staffing AND (
     current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')
     OR (d.affaire_id IS NOT NULL AND current_user_has_capability('devis.view') AND (is_chef_or_admin() OR user_has_affaire_access(d.affaire_id))))) $$;
REVOKE ALL ON FUNCTION public.devis_peut_lire(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_peut_lire(uuid) TO authenticated;

CREATE FUNCTION public.devis_calculer(_devis_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v := devis_calculer_interne(_devis_id);
  IF NOT current_user_has_capability('devis.couts') THEN v := v - 'cout_total' || jsonb_build_object('marge', NULL); END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.devis_calculer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_calculer(uuid) TO authenticated;