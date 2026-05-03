-- v0.36 — Pré-paramétrage métier amont + lissage auto + pipeline objet
-- Adapté au schéma existant : table `affaires`, `metiers.id` integer, helpers RLS is_admin / is_chef_or_admin / user_has_affaire_access

CREATE TABLE IF NOT EXISTS public.chantier_metier_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id      uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  metier_id       integer NOT NULL REFERENCES public.metiers(id),
  total_h_calc    numeric(10,2) NOT NULL DEFAULT 0,
  nb_pers_cible   smallint NOT NULL DEFAULT 1,
  duree_cible_j   numeric(5,2) NOT NULL DEFAULT 1,
  capa_max_jour   smallint NOT NULL DEFAULT 1,
  fenetre_start   date,
  fenetre_end     date,
  lissage_active  boolean NOT NULL DEFAULT true,
  be_override     boolean NOT NULL DEFAULT false,
  override_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  CONSTRAINT uniq_affaire_metier UNIQUE (affaire_id, metier_id),
  CONSTRAINT chk_be_override_reason CHECK (
    (be_override = false) OR (override_reason IS NOT NULL AND length(override_reason) >= 10)
  ),
  CONSTRAINT chk_nb_pers_pos CHECK (nb_pers_cible >= 1),
  CONSTRAINT chk_capa_pos CHECK (capa_max_jour >= 1),
  CONSTRAINT chk_duree_pos CHECK (duree_cible_j > 0)
);

CREATE INDEX IF NOT EXISTS idx_cmc_affaire ON public.chantier_metier_config(affaire_id);
CREATE INDEX IF NOT EXISTS idx_cmc_metier ON public.chantier_metier_config(metier_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_chantier_metier_config()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmc_touch ON public.chantier_metier_config;
CREATE TRIGGER trg_cmc_touch
  BEFORE UPDATE ON public.chantier_metier_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_chantier_metier_config();

-- RLS
ALTER TABLE public.chantier_metier_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY cmc_select_chef_admin_or_assigned
  ON public.chantier_metier_config FOR SELECT
  TO authenticated
  USING (is_chef_or_admin() OR user_has_affaire_access(affaire_id));

CREATE POLICY cmc_modify_chef_admin
  ON public.chantier_metier_config FOR ALL
  TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

-- Migration v0.35 → v0.36 :
-- 1 ligne par (affaire, metier) issue des steps de plans existants, lissage désactivé pour préserver l'existant
INSERT INTO public.chantier_metier_config
  (affaire_id, metier_id, total_h_calc, nb_pers_cible, duree_cible_j, capa_max_jour, lissage_active)
SELECT
  p.affaire_id,
  s.metier_id,
  COALESCE(SUM(s.pers * s.span_days * s.h_par_jour), 0)::numeric(10,2) AS total_h_calc,
  GREATEST(1, MAX(s.pers))::smallint AS nb_pers_cible,
  GREATEST(1, SUM(s.span_days))::numeric(5,2) AS duree_cible_j,
  GREATEST(1, MAX(s.pers))::smallint AS capa_max_jour,
  false AS lissage_active
FROM public.staffing_plan_step s
JOIN public.staffing_plan p ON p.id = s.plan_id
WHERE s.metier_id IS NOT NULL
GROUP BY p.affaire_id, s.metier_id
ON CONFLICT (affaire_id, metier_id) DO NOTHING;