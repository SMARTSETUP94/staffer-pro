-- Lot 7.3 — Vue consolidée affaires + plan_status
-- Statut consolidé (priorité décroissante) :
--   published > outdated > draft > no_plan
-- SECURITY INVOKER : hérite des RLS de `affaires` et `staffing_plan`.

CREATE OR REPLACE VIEW public.v_affaires_avec_plan_status
WITH (security_invoker = true)
AS
SELECT
  a.*,
  COALESCE(
    (SELECT 'published'::text
     FROM public.staffing_plan p
     WHERE p.affaire_id = a.id AND p.status = 'published'
     LIMIT 1),
    (SELECT 'outdated'::text
     FROM public.staffing_plan p
     WHERE p.affaire_id = a.id AND p.status = 'outdated'
     LIMIT 1),
    (SELECT 'draft'::text
     FROM public.staffing_plan p
     WHERE p.affaire_id = a.id AND p.status = 'draft'
     LIMIT 1),
    'no_plan'::text
  ) AS plan_status,
  (SELECT MAX(p.published_at)
   FROM public.staffing_plan p
   WHERE p.affaire_id = a.id AND p.status = 'published') AS plan_published_at,
  (SELECT COUNT(*)::int
   FROM public.staffing_plan p
   WHERE p.affaire_id = a.id) AS plan_count
FROM public.affaires a;

GRANT SELECT ON public.v_affaires_avec_plan_status TO authenticated;

COMMENT ON VIEW public.v_affaires_avec_plan_status IS
'Lot 7.3 — Vue consolidée affaires + statut de plan de staffing dérivé (published>outdated>draft>no_plan). SECURITY INVOKER : respecte RLS affaires + staffing_plan.';