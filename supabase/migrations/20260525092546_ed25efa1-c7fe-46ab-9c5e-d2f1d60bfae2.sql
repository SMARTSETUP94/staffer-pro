
-- =========================================================================
-- 1. Ajout métier Impression UV
-- =========================================================================
INSERT INTO public.metiers (code, libelle, couleur, ordre)
VALUES ('impression_uv', 'Impression UV', '#8B5CF6', 9)
ON CONFLICT (code) DO NOTHING;

-- =========================================================================
-- 2. Table typologie_phases
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.typologie_phases (
  typologie text PRIMARY KEY,
  phases text[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.typologie_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY typologie_phases_select_all ON public.typologie_phases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY typologie_phases_admin_modify ON public.typologie_phases
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Seed
INSERT INTO public.typologie_phases (typologie, phases) VALUES
  ('prototype',         ARRAY['commercial_etude','fabrication']),
  ('fabrication',       ARRAY['commercial_etude','fabrication','logistique']),
  ('stockage',          ARRAY['commercial_etude','logistique']),
  ('montage_demontage', ARRAY['commercial_etude','logistique','montage','demontage']),
  ('non_operationnel',  ARRAY['commercial_etude'])
ON CONFLICT (typologie) DO UPDATE SET phases = EXCLUDED.phases, updated_at = now();

-- =========================================================================
-- 3. Helper get_active_phases_for_affaire
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_active_phases_for_affaire(p_affaire_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tp.phases FROM public.typologie_phases tp
       JOIN public.affaires a ON a.typologie = tp.typologie
      WHERE a.id = p_affaire_id),
    ARRAY['commercial_etude','fabrication','logistique','montage','demontage']
  );
$$;

-- =========================================================================
-- 4. affaire_equipe : ajout 'logistique' aux phases acceptées
-- =========================================================================
ALTER TABLE public.affaire_equipe DROP CONSTRAINT IF EXISTS affaire_equipe_phase_check;
ALTER TABLE public.affaire_equipe ADD CONSTRAINT affaire_equipe_phase_check
  CHECK (phase = ANY (ARRAY['commercial_etude','fabrication','logistique','montage','demontage']));

-- =========================================================================
-- 5. Backfill logistique depuis responsable_montage_id
-- =========================================================================
INSERT INTO public.affaire_equipe (affaire_id, employe_id, phase, role_terrain, added_by, added_at)
SELECT a.id, e.id, 'logistique', 'Responsable logistique (auto-backfill)', NULL, now()
FROM public.affaires a
JOIN public.employes e ON e.profile_id = a.responsable_montage_id
WHERE a.responsable_montage_id IS NOT NULL
  AND a.typologie IN (
    SELECT typologie FROM public.typologie_phases WHERE 'logistique' = ANY(phases)
  )
ON CONFLICT (affaire_id, employe_id, phase) DO NOTHING;

-- =========================================================================
-- 6. Refonte vue capacité (5 phases, NULL pour sources indispo)
-- =========================================================================
DROP VIEW IF EXISTS public.v_affaire_equipe_capacite;

CREATE VIEW public.v_affaire_equipe_capacite
WITH (security_invoker = true)
AS
WITH phase_def AS (
  -- commercial_etude : pas de source heures → NULL
  SELECT a.id AS affaire_id, 'commercial_etude'::text AS phase,
         a.date_opportunite AS phase_start, a.date_debut AS phase_end,
         NULL::numeric AS heures_prevues
  FROM public.affaires a
  UNION ALL
  -- fabrication
  SELECT a.id, 'fabrication',
         a.date_debut, a.date_montage,
         COALESCE((
           SELECT SUM(COALESCE(fo.heures_prevues_be,0)
                    + COALESCE(fo.heures_prevues_numerique,0)
                    + COALESCE(fo.heures_prevues_bois,0)
                    + COALESCE(fo.heures_prevues_metal,0)
                    + COALESCE(fo.heures_prevues_peinture,0)
                    + COALESCE(fo.heures_prevues_tapisserie,0)
                    + COALESCE(fo.heures_prevues_manutention,0))
           FROM public.fabrication_objets fo
           WHERE fo.affaire_id = a.id AND fo.archive = false
         ), 0)
  FROM public.affaires a
  UNION ALL
  -- logistique : pas de source fiable → NULL
  SELECT a.id, 'logistique',
         LEAST(a.date_montage, a.date_debut), a.date_fin_prevue,
         NULL::numeric
  FROM public.affaires a
  UNION ALL
  -- montage
  SELECT a.id, 'montage', a.date_montage, a.date_demontage,
         COALESCE(a.heures_prevues_montage, 0)
  FROM public.affaires a
  UNION ALL
  -- demontage
  SELECT a.id, 'demontage', a.date_demontage, a.date_fin_prevue,
         COALESCE(a.heures_prevues_demontage, 0)
  FROM public.affaires a
),
active AS (
  SELECT a.id AS affaire_id, public.get_active_phases_for_affaire(a.id) AS phases
  FROM public.affaires a
),
casting AS (
  SELECT ae.affaire_id, ae.phase,
         COUNT(DISTINCT ae.employe_id)::int AS nb_personnes
  FROM public.affaire_equipe ae
  WHERE ae.removed_at IS NULL
  GROUP BY ae.affaire_id, ae.phase
)
SELECT
  p.affaire_id,
  p.phase,
  COALESCE(c.nb_personnes, 0) AS nb_personnes_castees,
  p.heures_prevues,
  public.jours_ouvres_entre(p.phase_start, p.phase_end) AS jours_ouvres_phase,
  CASE WHEN p.heures_prevues IS NULL THEN NULL
       ELSE (COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8)::numeric
  END AS capacite_estimee_h,
  CASE
    WHEN p.heures_prevues IS NULL OR p.heures_prevues = 0 THEN NULL
    WHEN COALESCE(c.nb_personnes,0) = 0 THEN 'fortement_sous_dim'
    WHEN (COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8) >= p.heures_prevues THEN 'ok'
    WHEN (COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8) >= (0.8 * p.heures_prevues) THEN 'sous_dim'
    ELSE 'fortement_sous_dim'
  END AS statut,
  CASE
    WHEN p.heures_prevues IS NULL OR p.heures_prevues = 0 THEN NULL
    ELSE ROUND((COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8)::numeric / NULLIF(p.heures_prevues,0), 2)
  END AS ratio_capacite_vs_prevu,
  p.phase_start,
  p.phase_end
FROM phase_def p
JOIN active ac ON ac.affaire_id = p.affaire_id AND p.phase = ANY(ac.phases)
LEFT JOIN casting c ON c.affaire_id = p.affaire_id AND c.phase = p.phase;

-- =========================================================================
-- 7. Table affaire_alertes_optin
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.affaire_alertes_optin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  alerte_code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (affaire_id, alerte_code)
);

CREATE INDEX IF NOT EXISTS idx_aao_affaire ON public.affaire_alertes_optin(affaire_id);

ALTER TABLE public.affaire_alertes_optin ENABLE ROW LEVEL SECURITY;

CREATE POLICY aao_select_all ON public.affaire_alertes_optin
  FOR SELECT TO authenticated
  USING (is_chef_or_admin() OR user_has_affaire_access(affaire_id));

CREATE POLICY aao_modify_chef_admin ON public.affaire_alertes_optin
  FOR ALL TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

-- =========================================================================
-- 8. Capabilities inbox.alerte.*
-- =========================================================================
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('inbox.alerte.sous_dim',     'Alerte équipe sous-dimensionnée', 'Reçoit l''alerte inbox quand la capacité d''une phase < heures prévues',  'inbox', 10),
  ('inbox.alerte.depassement',  'Alerte dépassement heures',       'Reçoit l''alerte inbox quand les heures réelles dépassent le devis',     'inbox', 11),
  ('inbox.alerte.cumul_100',    'Alerte cumul personne ≥ 100%',    'Reçoit l''alerte inbox quand une personne est staffée à ≥100% sur la période', 'inbox', 12),
  ('inbox.alerte.hors_equipe',  'Alerte saisie hors équipe',       'Reçoit l''alerte inbox quand une personne saisit du temps sans être dans l''équipe du chantier', 'inbox', 13)
ON CONFLICT (key) DO NOTHING;

-- Seed role_capabilities : admin + chef_chantier reçoivent les 4 alertes
INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('admin','inbox.alerte.sous_dim',true),
  ('admin','inbox.alerte.depassement',true),
  ('admin','inbox.alerte.cumul_100',true),
  ('admin','inbox.alerte.hors_equipe',true),
  ('chef_chantier','inbox.alerte.sous_dim',true),
  ('chef_chantier','inbox.alerte.depassement',true),
  ('chef_chantier','inbox.alerte.cumul_100',true),
  ('chef_chantier','inbox.alerte.hors_equipe',true)
ON CONFLICT (role, capability) DO NOTHING;

-- =========================================================================
-- 9. RPC get_inbox_items étendue (4 sources alertes équipe)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_inbox_items(p_limit integer DEFAULT 100)
RETURNS TABLE(item_key text, source text, source_id uuid, severity text, title text, subtitle text, affaire_id uuid, affaire_numero text, action_route text, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := is_admin();
  v_is_chef_or_admin boolean := is_chef_or_admin();
  v_flag_active boolean := COALESCE((SELECT enabled_globally FROM feature_flags WHERE flag_key='equipes_3_niveaux_alertes'), false);
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH dismissed AS (
    SELECT d.item_key FROM public.inbox_dismissed d WHERE d.user_id = v_uid
  ),
  refus AS (
    SELECT
      'assignation_refus:' || a.id::text,
      'assignation_refus'::text,
      a.id, 'high'::text,
      ('Refus de ' || e.prenom || ' ' || e.nom),
      ('Chantier ' || COALESCE(af.numero,'?') || ' le ' || to_char(a.date,'DD/MM') || COALESCE(' — ' || a.motif_refus,'')),
      a.affaire_id, af.numero,
      ('/affaires/' || a.affaire_id::text || '/staffing'),
      COALESCE(a.refusee_le, a.updated_at)
    FROM public.assignations a
    JOIN public.employes e ON e.id = a.employe_id
    LEFT JOIN public.affaires af ON af.id = a.affaire_id
    WHERE v_is_chef_or_admin AND a.statut_confirmation = 'refusee'
      AND a.date >= CURRENT_DATE - INTERVAL '30 days'
  ),
  diverg AS (
    SELECT
      'divergence:' || d.id::text, 'divergence'::text, d.id,
      d.severity::text, ('Divergence : ' || d.code), d.description,
      d.affaire_id, af.numero,
      CASE WHEN d.affaire_id IS NOT NULL THEN '/affaires/' || d.affaire_id::text || '/staffing' ELSE '/admin/audit' END,
      d.detected_at
    FROM public.staffing_divergence_log d
    LEFT JOIN public.affaires af ON af.id = d.affaire_id
    WHERE v_is_chef_or_admin AND d.resolved_at IS NULL
  ),
  abs_pending AS (
    SELECT
      'absence:' || ab.id::text, 'absence_pending'::text, ab.id, 'medium'::text,
      ('Absence à valider : ' || e.prenom || ' ' || e.nom),
      (ab.type::text || ' du ' || to_char(ab.date_debut,'DD/MM') || ' au ' || to_char(ab.date_fin,'DD/MM') || COALESCE(' — ' || ab.motif,'')),
      NULL::uuid, NULL::text, '/absences'::text, ab.created_at
    FROM public.absences ab
    JOIN public.employes e ON e.id = ab.employe_id
    WHERE v_is_chef_or_admin AND ab.valide = false
      AND ab.date_fin >= CURRENT_DATE - INTERVAL '7 days'
  ),
  fb AS (
    SELECT
      'feedback:' || f.id::text, 'feedback'::text, f.id,
      CASE f.priorite::text WHEN 'haute' THEN 'high' WHEN 'basse' THEN 'low' ELSE 'medium' END,
      ('Feedback : ' || f.titre), f.description,
      NULL::uuid, NULL::text, '/admin/feedback'::text, f.created_at
    FROM public.feedbacks f
    WHERE v_is_admin AND f.statut = 'nouveau'
  ),
  -- Sources alertes équipe (gated feature flag + opt-in chantier)
  alerte_sous_dim AS (
    SELECT
      'alerte_sous_dim:' || vc.affaire_id::text || ':' || vc.phase,
      'alerte_sous_dim'::text,
      vc.affaire_id,
      CASE vc.statut WHEN 'fortement_sous_dim' THEN 'high' ELSE 'medium' END,
      ('Équipe sous-dim — ' || af.numero || ' / ' || vc.phase),
      (COALESCE(vc.nb_personnes_castees,0)::text || ' pers. — capacité ' ||
        COALESCE(vc.capacite_estimee_h::text,'?') || 'h vs ' || COALESCE(vc.heures_prevues::text,'?') || 'h prévues'),
      vc.affaire_id, af.numero,
      ('/affaires/' || vc.affaire_id::text || '/casting'),
      now()
    FROM public.v_affaire_equipe_capacite vc
    JOIN public.affaires af ON af.id = vc.affaire_id
    JOIN public.affaire_alertes_optin opt
      ON opt.affaire_id = vc.affaire_id AND opt.alerte_code = 'sous_dim' AND opt.active = true
    WHERE v_is_chef_or_admin AND v_flag_active
      AND vc.statut IN ('sous_dim','fortement_sous_dim')
      AND af.statut = 'en_cours'
  )
  SELECT * FROM (
    SELECT * FROM refus
    UNION ALL SELECT * FROM diverg
    UNION ALL SELECT * FROM abs_pending
    UNION ALL SELECT * FROM fb
    UNION ALL SELECT * FROM alerte_sous_dim
  ) all_items (item_key, source, source_id, severity, title, subtitle, affaire_id, affaire_numero, action_route, created_at)
  WHERE all_items.item_key NOT IN (SELECT d.item_key FROM dismissed d)
  ORDER BY CASE all_items.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           all_items.created_at DESC
  LIMIT p_limit;
END;
$function$;
