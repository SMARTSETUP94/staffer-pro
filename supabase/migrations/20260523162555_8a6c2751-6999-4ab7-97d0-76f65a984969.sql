INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('mon-poste.aujourdhui.view', 'Voir "Aujourd''hui"', 'Voir sa page personnelle du jour', 'mon-poste', 10),
  ('mon-poste.semaine.view', 'Voir "Ma semaine"', 'Voir son planning hebdo personnel', 'mon-poste', 20),
  ('mon-poste.mission.view', 'Voir cartes mission', 'Voir les cartes de mission à venir (Bloc 9)', 'mon-poste', 30),
  ('admin.email_preview.view', 'Email preview', 'Voir la prévisualisation des templates email admin', 'admin', 90),
  ('admin.feedback.view', 'Feedbacks', 'Voir les feedbacks utilisateurs (admin)', 'admin', 91)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('poseur', 'mon-poste.aujourdhui.view', true),
  ('poseur', 'mon-poste.semaine.view', true),
  ('poseur', 'mon-poste.mission.view', true),
  ('employe', 'mon-poste.aujourdhui.view', true),
  ('employe', 'mon-poste.semaine.view', true),
  ('admin', 'admin.email_preview.view', true),
  ('admin', 'admin.feedback.view', true),
  ('admin', 'mon-poste.aujourdhui.view', true),
  ('admin', 'mon-poste.semaine.view', true),
  ('admin', 'mon-poste.mission.view', true)
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted;

UPDATE public.role_capabilities
SET granted = false
WHERE role = 'bureau_etude' AND capability = 'affaire.kpi.view';

INSERT INTO public.feature_flags (flag_key, description, enabled_globally, enabled_for_user_ids, enabled_for_roles)
VALUES (
  'sidebar_capability_v1',
  'Lot 7.2 — Sidebar gating par capabilities (vs ancien show:role). Flag off = fallback ancien comportement (tout visible). Activer pour testeurs avant globalement.',
  false,
  ARRAY[]::uuid[],
  ARRAY[]::text[]
)
ON CONFLICT (flag_key) DO NOTHING;