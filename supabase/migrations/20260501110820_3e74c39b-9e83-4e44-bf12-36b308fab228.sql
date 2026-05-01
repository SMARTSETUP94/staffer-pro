-- v0.33 — Vue Tableur Feuille de Route : table d'overrides par jour×affaire.
-- Stocke les valeurs "planificateur" qui n'ont pas leur place dans assignations/affaires.

CREATE TABLE IF NOT EXISTS public.feuille_route_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  affaire_id uuid NOT NULL,
  type_operation text,
  horaire_rdv time,
  adresse_override text,
  commentaires text,
  vehicules_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Une seule ligne par (date, affaire) : sert de clé d'upsert.
CREATE UNIQUE INDEX IF NOT EXISTS feuille_route_lignes_date_affaire_key
  ON public.feuille_route_lignes (date, affaire_id);

-- Index secondaires pour la fenêtre 14j et la jointure affaires.
CREATE INDEX IF NOT EXISTS feuille_route_lignes_date_idx
  ON public.feuille_route_lignes (date);
CREATE INDEX IF NOT EXISTS feuille_route_lignes_affaire_id_idx
  ON public.feuille_route_lignes (affaire_id);

-- Trigger updated_at standard (réutilise update_updated_at_column déjà présent).
DROP TRIGGER IF EXISTS feuille_route_lignes_set_updated_at ON public.feuille_route_lignes;
CREATE TRIGGER feuille_route_lignes_set_updated_at
  BEFORE UPDATE ON public.feuille_route_lignes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.feuille_route_lignes ENABLE ROW LEVEL SECURITY;

-- SELECT : chef/admin partout, employés sur les affaires auxquelles ils ont accès
-- (réutilise user_has_affaire_access — couvre staffing + mention).
CREATE POLICY frl_select_chef_admin_or_assigned
  ON public.feuille_route_lignes
  FOR SELECT
  TO authenticated
  USING (
    is_chef_or_admin()
    OR user_has_affaire_access(affaire_id)
  );

-- INSERT : chef/admin uniquement, et created_by doit valoir auth.uid() s'il est fourni.
CREATE POLICY frl_insert_chef_admin
  ON public.feuille_route_lignes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_chef_or_admin()
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- UPDATE : chef/admin uniquement.
CREATE POLICY frl_update_chef_admin
  ON public.feuille_route_lignes
  FOR UPDATE
  TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

-- DELETE : chef/admin uniquement.
CREATE POLICY frl_delete_chef_admin
  ON public.feuille_route_lignes
  FOR DELETE
  TO authenticated
  USING (is_chef_or_admin());

-- RPC d'upsert atomique sur (date, affaire_id) — prend tous les champs override en JSON
-- pour distinguer "non fourni" vs "mis à NULL". Renvoie la ligne complète.
CREATE OR REPLACE FUNCTION public.upsert_feuille_route_ligne(
  _date date,
  _affaire_id uuid,
  _patch jsonb
)
RETURNS public.feuille_route_lignes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.feuille_route_lignes;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'forbidden: chef ou admin requis' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.feuille_route_lignes AS frl (
    date, affaire_id, type_operation, horaire_rdv, adresse_override,
    commentaires, vehicules_ids, created_by
  )
  VALUES (
    _date,
    _affaire_id,
    NULLIF(_patch->>'type_operation', ''),
    CASE WHEN _patch ? 'horaire_rdv' AND _patch->>'horaire_rdv' <> ''
         THEN (_patch->>'horaire_rdv')::time ELSE NULL END,
    NULLIF(_patch->>'adresse_override', ''),
    NULLIF(_patch->>'commentaires', ''),
    COALESCE(
      (SELECT array_agg((value)::uuid)
         FROM jsonb_array_elements_text(COALESCE(_patch->'vehicules_ids', '[]'::jsonb))),
      '{}'::uuid[]
    ),
    v_uid
  )
  ON CONFLICT (date, affaire_id) DO UPDATE SET
    type_operation = CASE WHEN _patch ? 'type_operation'
                          THEN NULLIF(_patch->>'type_operation', '')
                          ELSE frl.type_operation END,
    horaire_rdv = CASE WHEN _patch ? 'horaire_rdv'
                       THEN CASE WHEN _patch->>'horaire_rdv' = '' OR _patch->>'horaire_rdv' IS NULL
                                 THEN NULL
                                 ELSE (_patch->>'horaire_rdv')::time END
                       ELSE frl.horaire_rdv END,
    adresse_override = CASE WHEN _patch ? 'adresse_override'
                            THEN NULLIF(_patch->>'adresse_override', '')
                            ELSE frl.adresse_override END,
    commentaires = CASE WHEN _patch ? 'commentaires'
                        THEN NULLIF(_patch->>'commentaires', '')
                        ELSE frl.commentaires END,
    vehicules_ids = CASE WHEN _patch ? 'vehicules_ids'
                         THEN COALESCE(
                           (SELECT array_agg((value)::uuid)
                              FROM jsonb_array_elements_text(_patch->'vehicules_ids')),
                           '{}'::uuid[])
                         ELSE frl.vehicules_ids END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_feuille_route_ligne(date, uuid, jsonb) IS
  'v0.33 — Upsert atomique pour Vue Tableur Feuille de Route. Patch partiel JSON (clés absentes = pas de changement, "" = NULL).';
