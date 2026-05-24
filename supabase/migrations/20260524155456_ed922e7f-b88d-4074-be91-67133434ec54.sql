-- =========================================================
-- Sprint A — Fondations modèle staffing 3 niveaux
-- =========================================================

-- ---------- 1. Tables ----------

CREATE TABLE IF NOT EXISTS public.affaire_equipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('commercial_etude','fabrication','montage','demontage')),
  role_terrain text,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affaire_equipe_unique UNIQUE (affaire_id, employe_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_affaire_equipe_affaire ON public.affaire_equipe(affaire_id);
CREATE INDEX IF NOT EXISTS idx_affaire_equipe_employe ON public.affaire_equipe(employe_id);
CREATE INDEX IF NOT EXISTS idx_affaire_equipe_phase ON public.affaire_equipe(affaire_id, phase) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fabrication_objet_equipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet_id uuid NOT NULL REFERENCES public.fabrication_objets(id) ON DELETE CASCADE,
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fabrication_objet_equipe_unique UNIQUE (objet_id, employe_id)
);

CREATE INDEX IF NOT EXISTS idx_foe_objet ON public.fabrication_objet_equipe(objet_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_foe_employe ON public.fabrication_objet_equipe(employe_id) WHERE removed_at IS NULL;

-- ---------- 2. Colonnes ajoutées ----------

ALTER TABLE public.assignations
  ADD COLUMN IF NOT EXISTS phase text
    CHECK (phase IS NULL OR phase IN ('commercial_etude','fabrication','montage','demontage'));

CREATE INDEX IF NOT EXISTS idx_assignations_phase ON public.assignations(phase) WHERE phase IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_role text;

-- ---------- 3. Triggers updated_at ----------

CREATE TRIGGER trg_affaire_equipe_updated_at
  BEFORE UPDATE ON public.affaire_equipe
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_foe_updated_at
  BEFORE UPDATE ON public.fabrication_objet_equipe
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. Trigger strict (avec bypass flag temporaire) ----------
-- Garantit qu'un INSERT dans fabrication_objet_equipe a une ligne
-- correspondante dans affaire_equipe (phase='fabrication').
-- Bypass via : SET LOCAL app.bypass_objet_equipe_strict = 'true'
-- À retirer fin Sprint C (voir mem://debts/bypass-objet-equipe-strict-temp)

CREATE OR REPLACE FUNCTION public.enforce_objet_equipe_strict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bypass text;
  v_affaire_id uuid;
  v_exists boolean;
BEGIN
  -- Flag de bypass session (Sprint A→C)
  BEGIN
    v_bypass := current_setting('app.bypass_objet_equipe_strict', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT affaire_id INTO v_affaire_id
  FROM public.fabrication_objets
  WHERE id = NEW.objet_id;

  IF v_affaire_id IS NULL THEN
    RAISE EXCEPTION 'enforce_objet_equipe_strict: objet % introuvable', NEW.objet_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.affaire_equipe
    WHERE affaire_id = v_affaire_id
      AND employe_id = NEW.employe_id
      AND phase = 'fabrication'
      AND removed_at IS NULL
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'enforce_objet_equipe_strict: employe % non présent dans affaire_equipe (affaire=%, phase=fabrication). Ajoutez via affaire_equipe d''abord.',
      NEW.employe_id, v_affaire_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_objet_equipe_strict
  BEFORE INSERT ON public.fabrication_objet_equipe
  FOR EACH ROW EXECUTE FUNCTION public.enforce_objet_equipe_strict();

-- ---------- 5. RLS ----------

ALTER TABLE public.affaire_equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrication_objet_equipe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affaire_equipe_select"
  ON public.affaire_equipe FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR user_has_affaire_access(affaire_id)
    OR (employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid()))
  );

CREATE POLICY "affaire_equipe_modify_chef_admin"
  ON public.affaire_equipe FOR ALL TO authenticated
  USING (
    is_admin() OR is_chef_global()
    OR (is_chef_metier_scoped() AND current_user_is_chef_on_affaire(affaire_id))
  )
  WITH CHECK (
    is_admin() OR is_chef_global()
    OR (is_chef_metier_scoped() AND current_user_is_chef_on_affaire(affaire_id))
  );

CREATE POLICY "foe_select"
  ON public.fabrication_objet_equipe FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR EXISTS (
      SELECT 1 FROM fabrication_objets fo
      WHERE fo.id = fabrication_objet_equipe.objet_id
        AND user_has_affaire_access(fo.affaire_id)
    )
    OR (employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid()))
  );

CREATE POLICY "foe_modify_chef_admin"
  ON public.fabrication_objet_equipe FOR ALL TO authenticated
  USING (
    is_admin() OR is_chef_global()
    OR (is_chef_metier_scoped() AND EXISTS (
      SELECT 1 FROM fabrication_objets fo
      WHERE fo.id = fabrication_objet_equipe.objet_id
        AND current_user_is_chef_on_affaire(fo.affaire_id)
    ))
  )
  WITH CHECK (
    is_admin() OR is_chef_global()
    OR (is_chef_metier_scoped() AND EXISTS (
      SELECT 1 FROM fabrication_objets fo
      WHERE fo.id = fabrication_objet_equipe.objet_id
        AND current_user_is_chef_on_affaire(fo.affaire_id)
    ))
  );

-- =========================================================
-- BACKFILLS
-- =========================================================

-- ---------- Backfill 1 : commercial_etude (charge_affaires + chef_projet) ----------
DO $$
DECLARE
  v_inserted_ca int := 0;
  v_inserted_cp int := 0;
  v_skipped_ca int := 0;
  v_skipped_cp int := 0;
  r record;
  v_emp_id uuid;
BEGIN
  -- Charge d'affaires
  FOR r IN SELECT id AS affaire_id, charge_affaires_id FROM affaires WHERE charge_affaires_id IS NOT NULL LOOP
    SELECT id INTO v_emp_id FROM employes WHERE profile_id = r.charge_affaires_id LIMIT 1;
    IF v_emp_id IS NULL THEN
      v_skipped_ca := v_skipped_ca + 1;
    ELSE
      INSERT INTO affaire_equipe(affaire_id, employe_id, phase, role_terrain)
      VALUES (r.affaire_id, v_emp_id, 'commercial_etude', 'Chargé d''affaires')
      ON CONFLICT (affaire_id, employe_id, phase) DO NOTHING;
      IF FOUND THEN v_inserted_ca := v_inserted_ca + 1; END IF;
    END IF;
  END LOOP;

  -- Chef de projet
  FOR r IN SELECT id AS affaire_id, chef_projet_id FROM affaires WHERE chef_projet_id IS NOT NULL LOOP
    SELECT id INTO v_emp_id FROM employes WHERE profile_id = r.chef_projet_id LIMIT 1;
    IF v_emp_id IS NULL THEN
      v_skipped_cp := v_skipped_cp + 1;
    ELSE
      INSERT INTO affaire_equipe(affaire_id, employe_id, phase, role_terrain)
      VALUES (r.affaire_id, v_emp_id, 'commercial_etude', 'Chef de projet')
      ON CONFLICT (affaire_id, employe_id, phase) DO NOTHING;
      IF FOUND THEN v_inserted_cp := v_inserted_cp + 1; END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill commercial_etude : % charge_affaires + % chef_projet inserts, % skipped CA + % skipped CP',
    v_inserted_ca, v_inserted_cp, v_skipped_ca, v_skipped_cp;
END $$;

-- ---------- Backfill 2 : fabrication (chef_chantier) ----------
DO $$
DECLARE
  v_inserted int := 0;
  v_skipped int := 0;
  r record;
  v_emp_id uuid;
BEGIN
  FOR r IN SELECT id AS affaire_id, chef_chantier_id FROM affaires WHERE chef_chantier_id IS NOT NULL LOOP
    SELECT id INTO v_emp_id FROM employes WHERE profile_id = r.chef_chantier_id LIMIT 1;
    IF v_emp_id IS NULL THEN
      v_skipped := v_skipped + 1;
    ELSE
      INSERT INTO affaire_equipe(affaire_id, employe_id, phase, role_terrain)
      VALUES (r.affaire_id, v_emp_id, 'fabrication', 'Chef de chantier')
      ON CONFLICT (affaire_id, employe_id, phase) DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'Backfill fabrication : % chef_chantier inserts, % skipped', v_inserted, v_skipped;
END $$;

-- ---------- Backfill 3 : montage + demontage ----------
DO $$
DECLARE
  v_inserted_m int := 0;
  v_inserted_d int := 0;
  v_skipped_m int := 0;
  v_skipped_d int := 0;
  r record;
  v_emp_id uuid;
BEGIN
  FOR r IN SELECT id AS affaire_id, responsable_montage_id FROM affaires WHERE responsable_montage_id IS NOT NULL LOOP
    SELECT id INTO v_emp_id FROM employes WHERE profile_id = r.responsable_montage_id LIMIT 1;
    IF v_emp_id IS NULL THEN
      v_skipped_m := v_skipped_m + 1;
    ELSE
      INSERT INTO affaire_equipe(affaire_id, employe_id, phase, role_terrain)
      VALUES (r.affaire_id, v_emp_id, 'montage', 'Responsable montage')
      ON CONFLICT (affaire_id, employe_id, phase) DO NOTHING;
      IF FOUND THEN v_inserted_m := v_inserted_m + 1; END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT id AS affaire_id, responsable_demontage_id FROM affaires WHERE responsable_demontage_id IS NOT NULL LOOP
    SELECT id INTO v_emp_id FROM employes WHERE profile_id = r.responsable_demontage_id LIMIT 1;
    IF v_emp_id IS NULL THEN
      v_skipped_d := v_skipped_d + 1;
    ELSE
      INSERT INTO affaire_equipe(affaire_id, employe_id, phase, role_terrain)
      VALUES (r.affaire_id, v_emp_id, 'demontage', 'Responsable démontage')
      ON CONFLICT (affaire_id, employe_id, phase) DO NOTHING;
      IF FOUND THEN v_inserted_d := v_inserted_d + 1; END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill montage : % inserts, % skipped | demontage : % inserts, % skipped',
    v_inserted_m, v_skipped_m, v_inserted_d, v_skipped_d;
END $$;

-- ---------- Backfill 4 : fabrication (assignations historiques) ----------
-- Pour toutes les assignations existantes liées à des objets, on enrichit
-- affaire_equipe phase='fabrication' (couvre cas où chef_chantier vide
-- mais des personnes ont bossé sur l'affaire en fab).
DO $$
DECLARE
  v_inserted int := 0;
BEGIN
  WITH src AS (
    SELECT DISTINCT a.affaire_id, a.employe_id
    FROM assignations a
    WHERE a.affaire_id IS NOT NULL
      AND a.employe_id IS NOT NULL
      AND (a.type_operation IS NULL OR a.type_operation NOT IN ('montage','demontage'))
  ),
  ins AS (
    INSERT INTO affaire_equipe(affaire_id, employe_id, phase, role_terrain)
    SELECT s.affaire_id, s.employe_id, 'fabrication', 'Membre fabrication (backfill)'
    FROM src s
    ON CONFLICT (affaire_id, employe_id, phase) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;
  RAISE NOTICE 'Backfill fabrication (assignations historiques) : % nouvelles lignes affaire_equipe', v_inserted;
END $$;

-- ---------- Backfill 5 : objet_equipe niveau 3 (plans PUBLISHED uniquement) ----------
-- Bypass trigger strict (les inserts affaire_equipe pré-existent via backfill 2+4)
DO $$
DECLARE
  v_inserted int := 0;
  v_plans int := 0;
BEGIN
  PERFORM set_config('app.bypass_objet_equipe_strict', 'true', true);

  SELECT count(*) INTO v_plans FROM staffing_plan WHERE status = 'published';

  WITH src AS (
    SELECT DISTINCT sps.objet_id, spa.employe_id
    FROM staffing_plan sp
    JOIN staffing_plan_step sps ON sps.plan_id = sp.id
    JOIN staffing_plan_assignment spa ON spa.step_id = sps.id
    WHERE sp.status = 'published'
      AND sps.objet_id IS NOT NULL
  ),
  ins AS (
    INSERT INTO fabrication_objet_equipe(objet_id, employe_id, notes)
    SELECT s.objet_id, s.employe_id, 'Backfill plan published'
    FROM src s
    ON CONFLICT (objet_id, employe_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  PERFORM set_config('app.bypass_objet_equipe_strict', 'false', true);

  RAISE NOTICE 'Backfill objet_equipe : % rows depuis % plans published', v_inserted, v_plans;
END $$;

-- ---------- Backfill 6 : phase sur assignations ----------
-- Règle : >= date_demontage → demontage ; >= date_montage → montage ;
-- phase='opportunite' → commercial_etude ; sinon fabrication.
DO $$
DECLARE
  v_updated int := 0;
BEGIN
  WITH upd AS (
    UPDATE assignations a
    SET phase = CASE
      WHEN af.date_demontage IS NOT NULL AND a.date >= af.date_demontage THEN 'demontage'
      WHEN af.date_montage IS NOT NULL AND a.date >= af.date_montage THEN 'montage'
      WHEN af.phase = 'opportunite' THEN 'commercial_etude'
      ELSE 'fabrication'
    END
    FROM affaires af
    WHERE a.affaire_id = af.id
      AND a.phase IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RAISE NOTICE 'Backfill phase assignations : % rows updated', v_updated;
END $$;