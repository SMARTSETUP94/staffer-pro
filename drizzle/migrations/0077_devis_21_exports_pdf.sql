-- Historique des PDF client exportés (stockage privé devis-exports/<devis_id>/...)
CREATE TABLE public.devis_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  version integer NOT NULL,
  statut_redaction text NOT NULL,
  niveau text NOT NULL CHECK (niveau IN ('detaille','synthetique')),
  filigrane boolean NOT NULL DEFAULT false,
  storage_path text NOT NULL UNIQUE,
  taille_octets integer,
  cree_par uuid NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devis_exports_devis_idx ON public.devis_exports(devis_id, cree_le DESC);
GRANT SELECT ON public.devis_exports TO authenticated;
GRANT ALL ON public.devis_exports TO service_role;
ALTER TABLE public.devis_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY devis_exports_lecture ON public.devis_exports FOR SELECT TO authenticated USING (public.devis_peut_lire(devis_id));

CREATE OR REPLACE FUNCTION public.devis_export_enregistrer(_devis_id uuid, _niveau text, _storage_path text, _taille integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF _niveau NOT IN ('detaille','synthetique') THEN RAISE EXCEPTION 'Niveau inconnu'; END IF;
  IF _storage_path IS NULL OR split_part(_storage_path,'/',1) <> _devis_id::text THEN RAISE EXCEPTION 'Chemin d''export invalide'; END IF;
  SELECT version, statut_redaction::text AS st INTO d FROM devis WHERE id=_devis_id AND supprime_le IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  INSERT INTO devis_exports(devis_id, version, statut_redaction, niveau, filigrane, storage_path, taille_octets, cree_par)
  VALUES (_devis_id, d.version, d.st, _niveau, d.st IN ('brouillon','a_valider'), _storage_path, _taille, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'version', d.version, 'filigrane', d.st IN ('brouillon','a_valider'));
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_export_enregistrer(uuid,text,text,integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_export_enregistrer(uuid,text,text,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.devis_exports_lister(_devis_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT devis_peut_lire(_devis_id) THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',e.id,'version',e.version,'statut_redaction',e.statut_redaction,'niveau',e.niveau,'filigrane',e.filigrane,
      'storage_path',e.storage_path,'cree_le',e.cree_le,'auteur',coalesce(nullif(trim(p.full_name),''),p.email)) ORDER BY e.cree_le DESC)
    FROM devis_exports e LEFT JOIN profiles p ON p.id=e.cree_par WHERE e.devis_id=_devis_id),'[]'::jsonb) END
$$;
REVOKE EXECUTE ON FUNCTION public.devis_exports_lister(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_exports_lister(uuid) TO authenticated, service_role;

CREATE POLICY devis_exports_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'devis-exports' AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.devis_peut_lire(((storage.foldername(name))[1])::uuid) ELSE false END);
CREATE POLICY devis_exports_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'devis-exports' AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.devis_peut_lire(((storage.foldername(name))[1])::uuid) ELSE false END);

-- Vue client : ajoute id, version, statut, inclusion des options et coordonnées société (aucun coût).
CREATE OR REPLACE FUNCTION public.devis_lire_client(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_calc jsonb; v_dates jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id;
  v_calc := coalesce(d.totaux_snapshot, devis_calculer_interne(_devis_id));
  v_dates := coalesce(d.dates_snapshot, (SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
      'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
      'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id));
  RETURN jsonb_build_object(
    'id',d.id,'version',d.version,'statut_redaction',d.statut_redaction,
    'numero',d.numero,'libelle',d.libelle,'date_devis',d.date_devis,'validite_jours',d.validite_jours,
    'date_validite',coalesce(v_dates->>'date_validite',d.date_validite::text),
    'societe',(SELECT jsonb_build_object('raison_sociale',raison_sociale,'marque',marque_commerciale,'adresse',adresse_ligne1,'code_postal',code_postal,'ville',ville,'siret',siret,'email',employeur_email_contact) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'client',(SELECT jsonb_build_object('nom',nom,'adresse',adresse,'code_postal',code_postal,'ville',ville,'siret',siret,'tva_intracom',tva_intracom) FROM clients WHERE id=d.client_id),
    'client_final',(SELECT nom FROM clients WHERE id=d.client_final_id),
    'contact',(SELECT jsonb_build_object('nom',coalesce(c.prenom||' ','')||coalesce(c.nom,''),'email',c.email) FROM client_contacts c WHERE c.id=d.contact_id),
    'dates', v_dates,
    'lignes',(WITH RECURSIVE anc AS (
        SELECT l.id, l.id AS a FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL
        UNION ALL
        SELECT anc.id, p.parent_id FROM anc JOIN devis_lignes p ON p.id=anc.a WHERE p.parent_id IS NOT NULL),
      vis AS (SELECT DISTINCT anc.a FROM anc WHERE v_calc->'lignes' ? anc.id::text)
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'parent_id',l.parent_id,'type',l.type,'ordre',l.ordre,'libelle',l.libelle,
        'quantite',l.quantite,'descriptif_client',l.descriptif_client,'longueur_mm',l.longueur_mm,'largeur_mm',l.largeur_mm,'hauteur_mm',l.hauteur_mm,
        'finition',l.finition,'texte',l.texte,'option_incluse',l.option_incluse,'montant',(v_calc->'lignes'->>l.id::text)::numeric,'sous_total',(v_calc->'racines'->>l.id::text)::numeric) ORDER BY l.ordre),'[]')
      FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND NOT (l.type='commentaire' AND l.interne)
        AND (l.type='commentaire' OR l.id IN (SELECT vis.a FROM vis))),
    'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('ligne_id',p.ligne_id,'storage_path',p.storage_path,'thumb_path',p.thumb_path,'legende',p.legende,'mime',p.mime) ORDER BY p.ordre),'[]')
      FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL AND p.visible_client),
    'total_ht',v_calc->'total_ht','remise',coalesce(v_calc->'remise','0'::jsonb),'net_ht',coalesce(v_calc->'net_ht',v_calc->'total_ht'),'tva',v_calc->'tva','tva_pct',v_calc->'tva_pct','ttc',v_calc->'ttc','options_ht',v_calc->'options_ht');
END $function$;