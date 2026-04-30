-- v0.31.0 — Suppression de devis (cascade) avec préservation des heures validées

-- 1. Ajout du flag archive sur devis
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS archive boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_devis_archive ON public.devis(archive) WHERE archive = false;

-- 2. Table d'audit suppression devis
CREATE TABLE IF NOT EXISTS public.devis_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL,
  devis_numero text,
  affaire_id uuid,
  affaire_numero text,
  fichier_nom text,
  fichier_hash text,
  action text NOT NULL, -- 'deleted' | 'archived'
  postes_supprimes int NOT NULL DEFAULT 0,
  objets_supprimes int NOT NULL DEFAULT 0,
  objets_archives int NOT NULL DEFAULT 0,
  heures_supprimees int NOT NULL DEFAULT 0,
  heures_preservees int NOT NULL DEFAULT 0,
  deleted_by uuid NOT NULL,
  deleted_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devis_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ddl_select_chef_admin ON public.devis_deletion_log
  FOR SELECT TO authenticated USING (is_chef_or_admin());

-- 3. Preflight : décompte des entités impactées
CREATE OR REPLACE FUNCTION public.preflight_delete_devis(p_devis_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_devis record;
  v_postes_count int;
  v_objets_count int;
  v_objets_avec_heures int;
  v_heures_validees int;
  v_heures_non_validees int;
  v_fichier_nom text;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id, numero, affaire_id, archive INTO v_devis
  FROM devis WHERE id = p_devis_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devis introuvable';
  END IF;

  SELECT COUNT(*) INTO v_postes_count FROM devis_postes WHERE devis_id = p_devis_id;
  SELECT COUNT(*) INTO v_objets_count FROM fabrication_objets WHERE devis_id = p_devis_id;

  SELECT COUNT(*) INTO v_heures_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut = 'valide';

  SELECT COUNT(*) INTO v_heures_non_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut <> 'valide';

  -- Objets ayant des heures validées (à archiver, pas supprimer)
  SELECT COUNT(DISTINCT fo.id) INTO v_objets_avec_heures
  FROM fabrication_objets fo
  JOIN heures_saisies hs ON hs.fabrication_objet_id = fo.id
  WHERE fo.devis_id = p_devis_id AND hs.statut = 'valide';

  SELECT fichier_nom INTO v_fichier_nom
  FROM devis_imports WHERE devis_id = p_devis_id ORDER BY created_at DESC LIMIT 1;

  RETURN json_build_object(
    'devis_id', v_devis.id,
    'devis_numero', v_devis.numero,
    'fichier_nom', v_fichier_nom,
    'postes_count', v_postes_count,
    'objets_count', v_objets_count,
    'objets_avec_heures_validees', v_objets_avec_heures,
    'heures_validees', v_heures_validees,
    'heures_non_validees', v_heures_non_validees,
    'action_recommandee', CASE WHEN v_heures_validees > 0 THEN 'archive' ELSE 'delete' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preflight_delete_devis(uuid) TO authenticated;

-- 4. RPC suppression atomique
CREATE OR REPLACE FUNCTION public.delete_devis_atomique(p_devis_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_devis record;
  v_import record;
  v_email text;
  v_heures_validees int;
  v_heures_non_validees int;
  v_postes_supprimes int := 0;
  v_objets_supprimes int := 0;
  v_objets_archives int := 0;
  v_action text;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id, numero, affaire_id INTO v_devis
  FROM devis WHERE id = p_devis_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devis introuvable';
  END IF;

  SELECT * INTO v_import FROM devis_imports
  WHERE devis_id = p_devis_id ORDER BY created_at DESC LIMIT 1;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();

  SELECT COUNT(*) INTO v_heures_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut = 'valide';

  SELECT COUNT(*) INTO v_heures_non_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut <> 'valide';

  -- Suppression heures non validées (toujours)
  DELETE FROM heures_saisies WHERE devis_id = p_devis_id AND statut <> 'valide';

  -- Suppression postes (toujours, pas de FK sortante critique)
  DELETE FROM devis_postes WHERE devis_id = p_devis_id;
  GET DIAGNOSTICS v_postes_supprimes = ROW_COUNT;

  IF v_heures_validees > 0 THEN
    -- Mode ARCHIVE : on garde devis + objets ayant des heures, on archive le reste
    v_action := 'archived';

    -- Archive les objets ayant des heures validées
    UPDATE fabrication_objets SET archive = true
    WHERE devis_id = p_devis_id
      AND id IN (SELECT DISTINCT fabrication_objet_id FROM heures_saisies
                 WHERE devis_id = p_devis_id AND statut = 'valide' AND fabrication_objet_id IS NOT NULL);
    GET DIAGNOSTICS v_objets_archives = ROW_COUNT;

    -- Supprime les objets sans heures validées
    DELETE FROM fabrication_objets
    WHERE devis_id = p_devis_id
      AND id NOT IN (SELECT DISTINCT fabrication_objet_id FROM heures_saisies
                     WHERE devis_id = p_devis_id AND statut = 'valide' AND fabrication_objet_id IS NOT NULL);
    GET DIAGNOSTICS v_objets_supprimes = ROW_COUNT;

    -- Archive le devis
    UPDATE devis SET archive = true, updated_at = now() WHERE id = p_devis_id;
  ELSE
    -- Mode DELETE complet
    v_action := 'deleted';

    DELETE FROM fabrication_objets WHERE devis_id = p_devis_id;
    GET DIAGNOSTICS v_objets_supprimes = ROW_COUNT;

    -- Détacher assignations restantes (si jamais)
    UPDATE assignations SET devis_id = NULL WHERE devis_id = p_devis_id;

    DELETE FROM devis WHERE id = p_devis_id;
  END IF;

  -- Supprime la ligne devis_imports
  DELETE FROM devis_imports WHERE devis_id = p_devis_id;

  -- Audit log
  INSERT INTO devis_deletion_log (
    devis_id, devis_numero, affaire_id, affaire_numero,
    fichier_nom, fichier_hash, action,
    postes_supprimes, objets_supprimes, objets_archives,
    heures_supprimees, heures_preservees,
    deleted_by, deleted_by_email
  ) VALUES (
    p_devis_id, v_devis.numero, v_devis.affaire_id,
    COALESCE(v_import.affaire_numero, NULL),
    COALESCE(v_import.fichier_nom, NULL),
    COALESCE(v_import.fichier_hash, NULL),
    v_action,
    v_postes_supprimes, v_objets_supprimes, v_objets_archives,
    v_heures_non_validees, v_heures_validees,
    auth.uid(), v_email
  );

  RETURN json_build_object(
    'action', v_action,
    'devis_numero', v_devis.numero,
    'postes_supprimes', v_postes_supprimes,
    'objets_supprimes', v_objets_supprimes,
    'objets_archives', v_objets_archives,
    'heures_supprimees', v_heures_non_validees,
    'heures_preservees', v_heures_validees
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_devis_atomique(uuid) TO authenticated;