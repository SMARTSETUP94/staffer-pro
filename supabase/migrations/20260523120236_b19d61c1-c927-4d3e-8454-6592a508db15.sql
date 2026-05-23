
CREATE TABLE IF NOT EXISTS public.inbox_dismissed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_inbox_dismissed_user ON public.inbox_dismissed (user_id);

ALTER TABLE public.inbox_dismissed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_dismissed_select_own ON public.inbox_dismissed;
DROP POLICY IF EXISTS inbox_dismissed_insert_own ON public.inbox_dismissed;
DROP POLICY IF EXISTS inbox_dismissed_delete_own ON public.inbox_dismissed;

CREATE POLICY inbox_dismissed_select_own ON public.inbox_dismissed
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY inbox_dismissed_insert_own ON public.inbox_dismissed
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY inbox_dismissed_delete_own ON public.inbox_dismissed
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_inbox_items(p_limit int DEFAULT 100)
RETURNS TABLE (
  item_key text,
  source text,
  source_id uuid,
  severity text,
  title text,
  subtitle text,
  affaire_id uuid,
  affaire_numero text,
  action_route text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := is_admin();
  v_is_chef_or_admin boolean := is_chef_or_admin();
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
      a.id,
      'high'::text,
      ('Refus de ' || e.prenom || ' ' || e.nom),
      ('Chantier ' || COALESCE(af.numero, '?') ||
        ' le ' || to_char(a.date, 'DD/MM') ||
        COALESCE(' — ' || a.motif_refus, '')),
      a.affaire_id,
      af.numero,
      ('/affaires/' || a.affaire_id::text || '/staffing'),
      COALESCE(a.refusee_le, a.updated_at)
    FROM public.assignations a
    JOIN public.employes e ON e.id = a.employe_id
    LEFT JOIN public.affaires af ON af.id = a.affaire_id
    WHERE v_is_chef_or_admin
      AND a.statut_confirmation = 'refusee'
      AND a.date >= CURRENT_DATE - INTERVAL '30 days'
  ),
  diverg AS (
    SELECT
      'divergence:' || d.id::text,
      'divergence'::text,
      d.id,
      d.severity::text,
      ('Divergence : ' || d.code),
      d.description,
      d.affaire_id,
      af.numero,
      CASE WHEN d.affaire_id IS NOT NULL
        THEN '/affaires/' || d.affaire_id::text || '/staffing'
        ELSE '/admin/audit'
      END,
      d.detected_at
    FROM public.staffing_divergence_log d
    LEFT JOIN public.affaires af ON af.id = d.affaire_id
    WHERE v_is_chef_or_admin AND d.resolved_at IS NULL
  ),
  abs_pending AS (
    SELECT
      'absence:' || ab.id::text,
      'absence_pending'::text,
      ab.id,
      'medium'::text,
      ('Absence à valider : ' || e.prenom || ' ' || e.nom),
      (ab.type::text || ' du ' || to_char(ab.date_debut, 'DD/MM') ||
        ' au ' || to_char(ab.date_fin, 'DD/MM') ||
        COALESCE(' — ' || ab.motif, '')),
      NULL::uuid,
      NULL::text,
      '/absences'::text,
      ab.created_at
    FROM public.absences ab
    JOIN public.employes e ON e.id = ab.employe_id
    WHERE v_is_chef_or_admin
      AND ab.valide = false
      AND ab.date_fin >= CURRENT_DATE - INTERVAL '7 days'
  ),
  fb AS (
    SELECT
      'feedback:' || f.id::text,
      'feedback'::text,
      f.id,
      CASE f.priorite::text
        WHEN 'haute' THEN 'high'
        WHEN 'basse' THEN 'low'
        ELSE 'medium'
      END,
      ('Feedback : ' || f.titre),
      f.description,
      NULL::uuid,
      NULL::text,
      '/admin/feedback'::text,
      f.created_at
    FROM public.feedbacks f
    WHERE v_is_admin AND f.statut = 'nouveau'
  ),
  all_items AS (
    SELECT * FROM refus
    UNION ALL SELECT * FROM diverg
    UNION ALL SELECT * FROM abs_pending
    UNION ALL SELECT * FROM fb
  )
  SELECT ai.*
  FROM all_items ai (
    item_key, source, source_id, severity, title, subtitle,
    affaire_id, affaire_numero, action_route, created_at
  )
  WHERE ai.item_key NOT IN (SELECT d.item_key FROM dismissed d)
  ORDER BY
    CASE ai.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    ai.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inbox_items(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inbox_count()
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COUNT(*)::int FROM public.get_inbox_items(500); $$;

GRANT EXECUTE ON FUNCTION public.get_inbox_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_inbox_item(p_item_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.inbox_dismissed (user_id, item_key)
  VALUES (auth.uid(), p_item_key)
  ON CONFLICT (user_id, item_key) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dismiss_inbox_item(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_inbox_item(p_item_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.inbox_dismissed
   WHERE user_id = auth.uid() AND item_key = p_item_key;
END;
$$;
GRANT EXECUTE ON FUNCTION public.restore_inbox_item(text) TO authenticated;

INSERT INTO public.capabilities (key, label, category, description, sort_order)
VALUES
  ('inbox.view',    'Voir l''inbox',         'inbox', 'Accès à la page /inbox et au widget dashboard', 100),
  ('inbox.dismiss', 'Masquer un item inbox', 'inbox', 'Permet de marquer un item comme traité',         101)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability, granted)
SELECT r.role, c.key, true
FROM (VALUES ('admin'::app_role), ('chef_chantier'::app_role), ('rh'::app_role)) r(role)
CROSS JOIN (VALUES ('inbox.view'), ('inbox.dismiss')) c(key)
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted;
