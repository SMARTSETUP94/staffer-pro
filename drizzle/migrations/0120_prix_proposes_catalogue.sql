-- Prix proposés au catalogue fournisseurs (v2 approuvée par Gabin le 12/11/2026), sans le bloc d'essai.
ALTER TABLE public.materiaux_catalogue
  ADD COLUMN proposition_statut text,
  ADD COLUMN fournisseur_libre text,
  ADD COLUMN propose_par uuid,
  ADD COLUMN propose_le timestamptz,
  ADD COLUMN devis_origine_id uuid,
  ADD COLUMN devis_materiau_origine_id uuid,
  ADD COLUMN decision_par uuid,
  ADD COLUMN decision_le timestamptz,
  ADD COLUMN motif_refus text,
  ADD COLUMN remplace_materiau_id uuid REFERENCES public.materiaux_catalogue(id);

ALTER TABLE public.materiaux_catalogue
  ADD CONSTRAINT materiaux_proposition_statut_chk
    CHECK (proposition_statut IS NULL OR proposition_statut IN ('propose','valide','refuse')),
  ADD CONSTRAINT materiaux_fournisseur_requis_chk
    CHECK (coalesce(proposition_statut,'') IN ('propose','refuse') OR fournisseur_id IS NOT NULL),
  ADD CONSTRAINT materiaux_proposition_inactive_chk
    CHECK (coalesce(proposition_statut,'') NOT IN ('propose','refuse') OR NOT actif),
  ADD CONSTRAINT materiaux_refus_motif_chk
    CHECK (proposition_statut IS DISTINCT FROM 'refuse' OR coalesce(trim(motif_refus),'') <> ''),
  ADD CONSTRAINT materiaux_valide_prix_chk
    CHECK (proposition_statut IS DISTINCT FROM 'valide' OR coalesce(prix_achat_net,0) > 0);

ALTER TABLE public.materiaux_catalogue ALTER COLUMN fournisseur_id DROP NOT NULL;

CREATE UNIQUE INDEX materiaux_catalogue_origine_uniq
  ON public.materiaux_catalogue(devis_materiau_origine_id) WHERE devis_materiau_origine_id IS NOT NULL;
CREATE INDEX materiaux_catalogue_proposition_idx
  ON public.materiaux_catalogue(proposition_statut) WHERE proposition_statut IS NOT NULL;

CREATE OR REPLACE FUNCTION public.materiau_proposer(_devis_materiau_id uuid, _p jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE dm record; v_d uuid; v_id uuid; v_f uuid; v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT current_user_has_capability('devis.rediger') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO dm FROM devis_materiaux WHERE id=_devis_materiau_id AND supprime_le IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ligne matériau introuvable'; END IF;
  IF dm.materiau_id IS NOT NULL THEN RAISE EXCEPTION 'Ce matériau vient déjà du catalogue'; END IF;
  v_d := devis_de_ligne(dm.ligne_id);
  IF NOT devis_peut_lire(v_d) THEN RAISE EXCEPTION 'Droits insuffisants sur ce devis' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM materiaux_catalogue WHERE devis_materiau_origine_id=_devis_materiau_id) THEN
    RAISE EXCEPTION 'Cette ligne a déjà été proposée au catalogue';
  END IF;
  v_f := NULLIF(_p->>'fournisseur_id','')::uuid;
  IF v_f IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fournisseurs_tarifs WHERE id=v_f) THEN RAISE EXCEPTION 'Fournisseur inconnu'; END IF;
  INSERT INTO materiaux_catalogue(fournisseur_id,fournisseur_libre,produit,ref,unite,format_texte,longueur_mm,largeur_mm,epaisseur_mm,
      prix_achat_net,date_tarif,source,actif,proposition_statut,propose_par,propose_le,devis_origine_id,devis_materiau_origine_id)
  VALUES (v_f,
      CASE WHEN v_f IS NULL THEN NULLIF(trim(coalesce(_p->>'fournisseur', dm.fournisseur)),'') END,
      coalesce(NULLIF(trim(_p->>'produit'),''), dm.designation),
      coalesce(NULLIF(trim(_p->>'ref'),''), dm.ref),
      coalesce(NULLIF(trim(_p->>'unite'),''), NULLIF(dm.unite,''), 'unité'),
      NULLIF(trim(_p->>'format_texte'),''),
      NULLIF(_p->>'longueur_mm','')::numeric, NULLIF(_p->>'largeur_mm','')::numeric, NULLIF(_p->>'epaisseur_mm','')::numeric,
      CASE WHEN v_couts THEN coalesce(NULLIF(_p->>'prix_achat','')::numeric, dm.prix_achat) ELSE dm.prix_achat END,
      coalesce(NULLIF(_p->>'date_tarif','')::date, current_date),
      'saisie_manuelle', false, 'propose', auth.uid(), now(), v_d, _devis_materiau_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.devis_materiaux_propositions_etat(_devis_id uuid)
RETURNS TABLE(devis_materiau_id uuid, statut text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.devis_materiau_origine_id, c.proposition_statut FROM materiaux_catalogue c
  WHERE c.devis_origine_id=_devis_id AND c.devis_materiau_origine_id IS NOT NULL AND devis_peut_lire(_devis_id)
$$;

CREATE OR REPLACE FUNCTION public.materiaux_propositions_lister(_statut text DEFAULT 'propose', _limit int DEFAULT 100, _offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'total',(SELECT count(*) FROM materiaux_catalogue WHERE proposition_statut=_statut),
    'lignes',coalesce((SELECT jsonb_agg(x ORDER BY x->>'propose_le' DESC) FROM (
      SELECT jsonb_build_object(
        'id',c.id,'statut',c.proposition_statut,'fournisseur_id',c.fournisseur_id,'fournisseur',coalesce(f.nom,c.fournisseur_libre),
        'fournisseur_libre',c.fournisseur_libre,'produit',c.produit,'ref',c.ref,'unite',c.unite,'format_texte',c.format_texte,
        'longueur_mm',c.longueur_mm,'largeur_mm',c.largeur_mm,'epaisseur_mm',c.epaisseur_mm,'famille',c.famille,
        'prix_achat',CASE WHEN v_couts THEN c.prix_achat_net END,'date_tarif',c.date_tarif,
        'propose_par',p.full_name,'propose_le',c.propose_le,'devis_id',c.devis_origine_id,'devis_numero',d.numero,'affaire_id',d.affaire_id,
        'decision_par',pd.full_name,'decision_le',c.decision_le,'motif_refus',c.motif_refus,'remplace_materiau_id',c.remplace_materiau_id,
        'meme_ref',(SELECT o.id FROM materiaux_catalogue o WHERE o.actif AND o.fournisseur_id=c.fournisseur_id
                    AND coalesce(c.ref,'')<>'' AND o.ref=c.ref AND o.id<>c.id LIMIT 1),
        'nb_proches_calcules_a_l_ouverture',true) x
      FROM materiaux_catalogue c
      LEFT JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id
      LEFT JOIN profiles p ON p.id=c.propose_par
      LEFT JOIN profiles pd ON pd.id=c.decision_par
      LEFT JOIN devis d ON d.id=c.devis_origine_id
      WHERE c.proposition_statut=_statut
      ORDER BY c.propose_le DESC, c.id LIMIT greatest(1,least(_limit,200)) OFFSET greatest(_offset,0)) s(x)),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.materiau_proposition_proches(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; v_q text; v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM materiaux_catalogue WHERE id=_id AND proposition_statut IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  v_q := materiaux_norm(c.produit);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'fournisseur',f.nom,'produit',o.produit,'ref',o.ref,'unite',o.unite,
            'prix_achat',CASE WHEN v_couts THEN o.prix_achat_net END,'date_tarif',o.date_tarif,'source',o.source,'meme_ref',o.meme_ref)
            ORDER BY o.meme_ref DESC, o.sim DESC)
    FROM (SELECT * FROM (
            SELECT m.*, true meme_ref, 1::real sim FROM materiaux_catalogue m
             WHERE m.actif AND m.fournisseur_id=c.fournisseur_id AND coalesce(c.ref,'')<>'' AND m.ref=c.ref AND m.id<>c.id
            UNION ALL
            SELECT m.*, false, similarity(m.search_norm, v_q) FROM materiaux_catalogue m
             WHERE m.actif AND m.search_norm % v_q AND m.id<>c.id) u
          ORDER BY meme_ref DESC, sim DESC LIMIT 3) o
    LEFT JOIN fournisseurs_tarifs f ON f.id=o.fournisseur_id),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.materiau_proposition_valider(_id uuid, _p jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; v_f uuid; v_nom text; v_slug text; v_old uuid; v_mode text := _p->>'mode';
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM materiaux_catalogue WHERE id=_id AND proposition_statut='propose' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable ou déjà traitée'; END IF;
  v_f := coalesce(NULLIF(_p->>'fournisseur_id','')::uuid, c.fournisseur_id);
  v_nom := NULLIF(trim(_p->>'nouveau_fournisseur'),'');
  IF v_nom IS NOT NULL THEN
    v_slug := trim(both '-' from regexp_replace(devis_normalize(v_nom),'[^a-z0-9]+','-','g'));
    IF v_slug = '' THEN RAISE EXCEPTION 'Nom de fournisseur invalide'; END IF;
    IF EXISTS (SELECT 1 FROM fournisseurs_tarifs WHERE slug=v_slug OR devis_normalize(nom)=devis_normalize(v_nom)) THEN
      RAISE EXCEPTION 'Ce fournisseur existe déjà : choisissez-le dans la liste';
    END IF;
    v_f := fournisseur_tarif_enregistrer(jsonb_build_object('slug',v_slug,'nom',v_nom));
  END IF;
  IF v_f IS NULL OR NOT EXISTS (SELECT 1 FROM fournisseurs_tarifs WHERE id=v_f) THEN
    RAISE EXCEPTION 'Choisissez un fournisseur avant de valider';
  END IF;
  UPDATE materiaux_catalogue SET
    fournisseur_id=v_f,
    produit=coalesce(NULLIF(trim(_p->>'produit'),''),produit),
    ref=CASE WHEN _p ? 'ref' THEN NULLIF(trim(_p->>'ref'),'') ELSE ref END,
    unite=coalesce(NULLIF(trim(_p->>'unite'),''),unite),
    famille=CASE WHEN _p ? 'famille' THEN NULLIF(trim(_p->>'famille'),'') ELSE famille END,
    format_texte=CASE WHEN _p ? 'format_texte' THEN NULLIF(trim(_p->>'format_texte'),'') ELSE format_texte END,
    longueur_mm=CASE WHEN _p ? 'longueur_mm' THEN NULLIF(_p->>'longueur_mm','')::numeric ELSE longueur_mm END,
    largeur_mm=CASE WHEN _p ? 'largeur_mm' THEN NULLIF(_p->>'largeur_mm','')::numeric ELSE largeur_mm END,
    epaisseur_mm=CASE WHEN _p ? 'epaisseur_mm' THEN NULLIF(_p->>'epaisseur_mm','')::numeric ELSE epaisseur_mm END,
    prix_achat_net=CASE WHEN _p ? 'prix_achat' THEN NULLIF(_p->>'prix_achat','')::numeric ELSE prix_achat_net END,
    date_tarif=coalesce(NULLIF(_p->>'date_tarif','')::date,date_tarif)
  WHERE id=_id RETURNING * INTO c;
  SELECT o.id INTO v_old FROM materiaux_catalogue o
   WHERE o.actif AND o.fournisseur_id=v_f AND coalesce(c.ref,'')<>'' AND o.ref=c.ref AND o.id<>_id LIMIT 1;
  IF v_old IS NOT NULL THEN
    IF v_mode IS NULL OR v_mode NOT IN ('remplacer','ajouter') THEN
      RAISE EXCEPTION 'CHOIX_REQUIS: une ligne active a déjà ce fournisseur et cette référence' USING ERRCODE='P0001';
    END IF;
    IF v_mode='remplacer' THEN
      UPDATE materiaux_catalogue SET actif=false, desactive_le=now() WHERE id=v_old;
      UPDATE materiaux_catalogue SET remplace_materiau_id=v_old WHERE id=_id;
    END IF;
  END IF;
  IF coalesce(c.prix_achat_net,0) <= 0 THEN
    RAISE EXCEPTION 'Prix d''achat manquant ou nul : saisissez un prix supérieur à 0 avant de valider';
  END IF;
  UPDATE materiaux_catalogue SET proposition_statut='valide', actif=true, decision_par=auth.uid(), decision_le=now(),
    fournisseur_libre=NULL WHERE id=_id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.materiau_proposition_refuser(_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_motif),'')='' THEN RAISE EXCEPTION 'Motif de refus obligatoire'; END IF;
  UPDATE materiaux_catalogue SET proposition_statut='refuse', motif_refus=trim(_motif), decision_par=auth.uid(), decision_le=now()
   WHERE id=_id AND proposition_statut='propose';
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable ou déjà traitée'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.materiau_saisie_desactiver(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  UPDATE materiaux_catalogue SET actif=false, desactive_le=now() WHERE id=_id AND proposition_statut='valide' AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saisie manuelle active introuvable'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.materiaux_reprendre_hors_catalogue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n int;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  WITH src AS (
    SELECT m.*, devis_de_ligne(m.ligne_id) dv,
           devis_normalize(coalesce(m.fournisseur,'')) kf, devis_normalize(m.designation) kd
    FROM devis_materiaux m
    WHERE m.materiau_id IS NULL AND m.supprime_le IS NULL AND coalesce(trim(m.designation),'')<>''),
  vivants AS (SELECT s.* FROM src s JOIN devis d ON d.id=s.dv WHERE d.supprime_le IS NULL),
  deja AS (SELECT devis_normalize(coalesce(f.nom,c.fournisseur_libre,'')) kf, devis_normalize(c.produit) kd
           FROM materiaux_catalogue c LEFT JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id
           WHERE c.proposition_statut IS NOT NULL),
  choisis AS (SELECT DISTINCT ON (kf,kd) * FROM vivants v
              WHERE NOT EXISTS (SELECT 1 FROM deja WHERE deja.kf=v.kf AND deja.kd=v.kd)
                AND NOT EXISTS (SELECT 1 FROM materiaux_catalogue c WHERE c.devis_materiau_origine_id=v.id)
              ORDER BY kf,kd,created_at DESC)
  INSERT INTO materiaux_catalogue(fournisseur_id,fournisseur_libre,produit,ref,unite,prix_achat_net,date_tarif,source,actif,
      proposition_statut,propose_par,propose_le,devis_origine_id,devis_materiau_origine_id)
  SELECT f.id, CASE WHEN f.id IS NULL THEN NULLIF(trim(ch.fournisseur),'') END, ch.designation, NULLIF(ch.ref,''),
         coalesce(NULLIF(ch.unite,''),'unité'), ch.prix_achat, coalesce(ch.date_tarif, ch.created_at::date),
         'saisie_manuelle', false, 'propose', ch.created_by, now(), ch.dv, ch.id
  FROM choisis ch LEFT JOIN fournisseurs_tarifs f ON ch.kf<>'' AND devis_normalize(f.nom)=ch.kf;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('propositions_creees', v_n);
END $$;

REVOKE EXECUTE ON FUNCTION public.materiau_proposer(uuid,jsonb), public.devis_materiaux_propositions_etat(uuid),
  public.materiaux_propositions_lister(text,int,int), public.materiau_proposition_proches(uuid), public.materiau_proposition_valider(uuid,jsonb),
  public.materiau_proposition_refuser(uuid,text), public.materiau_saisie_desactiver(uuid),
  public.materiaux_reprendre_hors_catalogue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiau_proposer(uuid,jsonb), public.devis_materiaux_propositions_etat(uuid),
  public.materiaux_propositions_lister(text,int,int), public.materiau_proposition_proches(uuid), public.materiau_proposition_valider(uuid,jsonb),
  public.materiau_proposition_refuser(uuid,text), public.materiau_saisie_desactiver(uuid),
  public.materiaux_reprendre_hors_catalogue() TO authenticated, service_role;

-- materiaux_import_valider : redéfini depuis le texte relu en base le 12/11/2026 ; seule la ligne de désactivation change
CREATE OR REPLACE FUNCTION public.materiaux_import_valider(_import_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_f uuid; v_n int;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT fournisseur_id INTO v_f FROM materiaux_imports WHERE id=_import_id AND statut='prepare' FOR UPDATE;
  IF v_f IS NULL THEN RAISE EXCEPTION 'Import introuvable ou déjà traité'; END IF;
  UPDATE materiaux_catalogue SET actif=false, desactive_le=now() WHERE fournisseur_id=v_f AND actif AND proposition_statut IS NULL;
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
END $function$;

-- materiaux_import_bilan : redéfini depuis le texte relu en base le 12/11/2026 ; "o" limité aux lignes importées, bloc "ms" ajouté
CREATE OR REPLACE FUNCTION public.materiaux_import_bilan(_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_f uuid; v jsonb;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT fournisseur_id INTO v_f FROM materiaux_imports WHERE id=_import_id;
  WITH n AS (SELECT coalesce(NULLIF(data->>'ref',''), devis_normalize(data->>'produit')||'|'||coalesce(data->>'format','')) k,
                    data->>'produit' produit, NULLIF(data->>'prix_achat_net','')::numeric px
             FROM materiaux_imports_lignes WHERE import_id=_import_id),
       o AS (SELECT coalesce(NULLIF(ref,''), devis_normalize(produit)||'|'||coalesce(format_texte,'')) k, produit, prix_achat_net px
             FROM materiaux_catalogue WHERE fournisseur_id=v_f AND actif AND proposition_statut IS NULL),
       ms AS (SELECT coalesce(NULLIF(ref,''), devis_normalize(produit)||'|'||coalesce(format_texte,'')) k, NULLIF(ref,'') ref
             FROM materiaux_catalogue WHERE fournisseur_id=v_f AND actif AND proposition_statut='valide'),
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
    'saisies_manuelles_conservees',(SELECT count(*) FROM ms),
    'saisies_manuelles_meme_ref',(SELECT count(*) FROM ms WHERE ms.ref IS NOT NULL AND EXISTS (SELECT 1 FROM n WHERE n.k=ms.k)),
    'baisses',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT * FROM j WHERE var<0 ORDER BY var LIMIT 10) x)) INTO v;
  UPDATE materiaux_imports SET bilan=v WHERE id=_import_id;
  RETURN v;
END $function$;