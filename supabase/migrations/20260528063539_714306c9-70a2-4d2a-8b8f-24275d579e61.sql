-- L5-B : créer les 8 caps manquantes pour purger le bridge auth-context

-- 1. Insérer les nouvelles capabilities
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('admin.roadmap.manage', 'Gérer la roadmap', 'Voir et éditer la roadmap interne (/roadmap)', 'admin', 100),
  ('dashboard.team.view', 'Widgets équipe (dashboard)', 'Voir les widgets agrégés équipe (KPI, Mon équipe type)', 'dashboard', 10),
  ('dashboard.commerce.view', 'Widget commerce (dashboard)', 'Voir le pipeline commercial sur le dashboard', 'dashboard', 20),
  ('flotte.trajet.delete', 'Supprimer un trajet flotte', 'Supprimer un trajet véhicule dans la flotte', 'flotte', 50),
  ('affaire.documents.delete', 'Supprimer documents affaire', 'Supprimer des photos/documents attachés à une affaire', 'affaires', 60),
  ('feedback.create', 'Soumettre un feedback', 'Utiliser le bouton flottant de feedback', 'feedback', 10),
  ('fabrication.etape.admin_override', 'Forcer édition étape fab', 'Éditer une étape de fabrication même verrouillée', 'fabrication', 80),
  ('staffer.mobile.admin_override', 'Override admin staffer mobile', 'Accès admin au formulaire Staffer mobile', 'staffing', 90),
  ('opportunites.read.all', 'Lire toutes opportunités', 'Lire tout le pipeline opportunités sans filtre rattachement', 'opportunites', 10)
ON CONFLICT (key) DO NOTHING;

-- 2. Accorder à admin TOUTES les nouvelles caps
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
  ('admin', 'admin.roadmap.manage', true, 'all'),
  ('admin', 'dashboard.team.view', true, 'all'),
  ('admin', 'dashboard.commerce.view', true, 'all'),
  ('admin', 'flotte.trajet.delete', true, 'all'),
  ('admin', 'affaire.documents.delete', true, 'all'),
  ('admin', 'feedback.create', true, 'all'),
  ('admin', 'fabrication.etape.admin_override', true, 'all'),
  ('admin', 'staffer.mobile.admin_override', true, 'all'),
  ('admin', 'opportunites.read.all', true, 'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = true;

-- 3. Accorder à chef_chantier les caps qui correspondaient à isAdminOrChef
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
  ('chef_chantier', 'dashboard.team.view', true, 'team'),
  ('chef_chantier', 'feedback.create', true, 'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = true;