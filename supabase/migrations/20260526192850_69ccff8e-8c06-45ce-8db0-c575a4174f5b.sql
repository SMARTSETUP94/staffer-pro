
-- ============================================================================
-- L2.2 — Scope column + helpers + backfill + seed catalogue + seed matrice
-- ============================================================================

-- 1. Ajout colonne scope
ALTER TABLE public.role_capabilities
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'role_capabilities_scope_check'
  ) THEN
    ALTER TABLE public.role_capabilities
      ADD CONSTRAINT role_capabilities_scope_check
      CHECK (scope IN ('all','team','metier','own','none'));
  END IF;
END$$;

-- 2. Helpers SQL
CREATE OR REPLACE FUNCTION public.user_has_cap(_cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_capabilities rc ON rc.role = ur.role
    WHERE ur.user_id = auth.uid()
      AND rc.capability = _cap
      AND rc.granted = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.user_has_cap(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_cap_scope(_cap text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN BOOL_OR(rc.scope = 'all') THEN 'all'
        WHEN BOOL_OR(rc.scope = 'team') THEN 'team'
        WHEN BOOL_OR(rc.scope = 'metier') THEN 'metier'
        WHEN BOOL_OR(rc.scope = 'own') THEN 'own'
        ELSE 'none'
      END
      FROM public.user_roles ur
      JOIN public.role_capabilities rc ON rc.role = ur.role
      WHERE ur.user_id = auth.uid()
        AND rc.capability = _cap
        AND rc.granted = true
    ),
    'none'
  );
$$;
GRANT EXECUTE ON FUNCTION public.user_cap_scope(text) TO authenticated;

-- 3. Backfill atelier_chef pour les chef_metier_scoped existants
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT user_id, 'atelier_chef'::app_role
FROM public.user_roles
WHERE role = 'chef_metier_scoped'
ON CONFLICT DO NOTHING;

-- 4. Seed catalogue des 59 nouvelles capabilities (additif, ON CONFLICT UPDATE labels)
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
-- sections
('section.inbox','Aujourd''hui (inbox)',NULL,'sections',1),
('section.ma_semaine','Ma semaine',NULL,'sections',2),
('section.tableau_de_bord','Tableau de bord',NULL,'sections',3),
('section.pipeline_opportunites','Pipeline opportunités',NULL,'sections',4),
('section.affaires','Affaires',NULL,'sections',5),
('section.devis','Devis',NULL,'sections',6),
('section.fabrication','Fabrication',NULL,'sections',7),
('section.planning_fab','Planning fab',NULL,'sections',8),
('section.planning_chantier_macro','Planning chantier macro',NULL,'sections',9),
('section.logistique','Logistique',NULL,'sections',10),
('section.equipes','Équipes',NULL,'sections',11),
('section.contrats_rh','Contrats / RH',NULL,'sections',12),
('section.admin','Admin plateforme',NULL,'sections',13),
-- data
('data.margins','Marges & budget',NULL,'data',1),
('data.salaries','Salaires & taux',NULL,'data',2),
('data.client_contacts','Contacts client',NULL,'data',3),
('data.employee_rh','Fiches RH employés',NULL,'data',4),
('data.journal_client','Journal client',NULL,'data',5),
('data.audit_logs','Journaux d''audit',NULL,'data',6),
-- actions
('action.create_devis','Créer un devis',NULL,'actions',1),
('action.sign_opportunite','Signer une opportunité',NULL,'actions',2),
('action.publish_plan_fab','Publier un plan fab',NULL,'actions',3),
('action.delete_plan_fab','Supprimer un plan fab',NULL,'actions',4),
('action.validate_hours','Valider des heures',NULL,'actions',5),
('action.create_contract','Créer un contrat',NULL,'actions',6),
('action.sign_contract','Signer un contrat',NULL,'actions',7),
('action.create_mission_pose','Créer une mission de pose',NULL,'actions',8),
('action.cancel_mission_pose','Annuler une mission de pose',NULL,'actions',9),
('action.export_data','Exporter des données',NULL,'actions',10),
('action.casting.manage','Gérer le casting',NULL,'actions',11),
('action.objet_equipe.manage','Gérer l''équipe d''un objet',NULL,'actions',12),
('action.upload_photo','Uploader une photo',NULL,'actions',13),
('action.delete_photo','Supprimer une photo',NULL,'actions',14),
('action.archive_affaire','Archiver une affaire',NULL,'actions',15),
-- inbox
('inbox.mission_pose','Missions de pose',NULL,'inbox',1),
('inbox.validation_heures','Validation des heures',NULL,'inbox',2),
('inbox.be_attente','BE en attente',NULL,'inbox',3),
('inbox.devis_brouillon','Devis brouillons',NULL,'inbox',4),
('inbox.opp_action','Opportunités à actionner',NULL,'inbox',5),
('inbox.echantillons','Échantillons à traiter',NULL,'inbox',6),
('inbox.plan_lacune','Lacunes de planning',NULL,'inbox',7),
('inbox.heures_saisir','Heures à saisir',NULL,'inbox',8),
('inbox.rh_contrats','Contrats RH à traiter',NULL,'inbox',9),
('inbox.alertes_equipe','Alertes équipe',NULL,'inbox',10),
-- mobile
('mobile.mes_missions','Mobile — Mes missions',NULL,'mobile',1),
('mobile.equipe_chantiers','Mobile — Équipe & chantiers',NULL,'mobile',2),
('mobile.fabrication_atelier','Mobile — Atelier',NULL,'mobile',3),
('mobile.staffer_rapide','Mobile — Staffer rapide',NULL,'mobile',4),
('mobile.signaler_probleme','Mobile — Signaler un problème',NULL,'mobile',5),
-- casting (vue)
('casting.view_phase_commercial','Voir casting — phase commercial',NULL,'casting',1),
('casting.view_phase_fabrication','Voir casting — phase fabrication',NULL,'casting',2),
('casting.view_phase_logistique','Voir casting — phase logistique',NULL,'casting',3),
('casting.view_phase_montage','Voir casting — phase montage',NULL,'casting',4),
('casting.view_phase_demontage','Voir casting — phase démontage',NULL,'casting',5),
-- casting (édition)
('casting.edit_phase_commercial','Éditer casting — phase commercial',NULL,'casting',6),
('casting.edit_phase_fabrication','Éditer casting — phase fabrication',NULL,'casting',7),
('casting.edit_phase_logistique','Éditer casting — phase logistique',NULL,'casting',8),
('casting.edit_phase_montage','Éditer casting — phase montage',NULL,'casting',9),
('casting.edit_phase_demontage','Éditer casting — phase démontage',NULL,'casting',10)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- 5. Seed matrice rôle × capability (additif, ON CONFLICT met à jour granted+scope)

-- Admin = tout granted=true, scope=all
INSERT INTO public.role_capabilities (role, capability, granted, scope)
SELECT 'admin'::app_role, key, true, 'all'
FROM public.capabilities
WHERE key LIKE 'section.%' OR key LIKE 'data.%' OR key LIKE 'action.%'
   OR key LIKE 'inbox.%' OR key LIKE 'mobile.%' OR key LIKE 'casting.%'
ON CONFLICT (role, capability) DO UPDATE SET granted = true, scope = 'all';

-- RH
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('rh','section.inbox',true,'all'),('rh','section.ma_semaine',true,'all'),
('rh','section.tableau_de_bord',true,'all'),('rh','section.affaires',true,'all'),
('rh','section.planning_chantier_macro',true,'all'),('rh','section.equipes',true,'all'),
('rh','section.contrats_rh',true,'all'),
('rh','data.margins',true,'all'),('rh','data.salaries',true,'all'),
('rh','data.client_contacts',true,'all'),('rh','data.employee_rh',true,'all'),
('rh','action.validate_hours',true,'all'),('rh','action.create_contract',true,'all'),
('rh','action.sign_contract',true,'all'),('rh','action.export_data',true,'all'),
('rh','inbox.validation_heures',true,'all'),('rh','inbox.rh_contrats',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Commercial
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('commercial','section.inbox',true,'all'),('commercial','section.ma_semaine',true,'all'),
('commercial','section.tableau_de_bord',true,'all'),('commercial','section.pipeline_opportunites',true,'all'),
('commercial','section.affaires',true,'all'),('commercial','section.devis',true,'all'),
('commercial','section.planning_chantier_macro',true,'all'),
('commercial','data.margins',true,'all'),('commercial','data.client_contacts',true,'all'),
('commercial','data.journal_client',true,'all'),
('commercial','action.create_devis',true,'all'),('commercial','action.sign_opportunite',true,'all'),
('commercial','action.export_data',true,'all'),('commercial','action.casting.manage',true,'own'),
('commercial','action.archive_affaire',true,'all'),
('commercial','inbox.devis_brouillon',true,'all'),('commercial','inbox.opp_action',true,'all'),
('commercial','inbox.echantillons',true,'all'),('commercial','inbox.heures_saisir',true,'own'),
('commercial','casting.view_phase_commercial',true,'all'),
('commercial','casting.edit_phase_commercial',true,'own')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Bureau d'étude
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('bureau_etude','section.inbox',true,'all'),('bureau_etude','section.ma_semaine',true,'all'),
('bureau_etude','section.affaires',true,'all'),('bureau_etude','section.devis',true,'all'),
('bureau_etude','section.fabrication',true,'all'),('bureau_etude','section.planning_fab',true,'all'),
('bureau_etude','section.planning_chantier_macro',true,'all'),
('bureau_etude','data.client_contacts',true,'all'),('bureau_etude','data.journal_client',true,'all'),
('bureau_etude','action.publish_plan_fab',true,'all'),('bureau_etude','action.upload_photo',true,'all'),
('bureau_etude','inbox.be_attente',true,'all'),('bureau_etude','inbox.echantillons',true,'all'),
('bureau_etude','inbox.heures_saisir',true,'own'),
('bureau_etude','casting.view_phase_commercial',true,'all'),
('bureau_etude','casting.view_phase_fabrication',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Chef de chantier
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('chef_chantier','section.inbox',true,'all'),('chef_chantier','section.ma_semaine',true,'all'),
('chef_chantier','section.tableau_de_bord',true,'all'),('chef_chantier','section.affaires',true,'all'),
('chef_chantier','section.devis',true,'all'),('chef_chantier','section.fabrication',true,'all'),
('chef_chantier','section.planning_fab',true,'all'),('chef_chantier','section.planning_chantier_macro',true,'all'),
('chef_chantier','section.logistique',true,'all'),('chef_chantier','section.equipes',true,'all'),
('chef_chantier','data.margins',true,'all'),('chef_chantier','data.client_contacts',true,'all'),
('chef_chantier','data.journal_client',true,'all'),
('chef_chantier','action.publish_plan_fab',true,'all'),('chef_chantier','action.delete_plan_fab',true,'all'),
('chef_chantier','action.validate_hours',true,'team'),('chef_chantier','action.create_mission_pose',true,'all'),
('chef_chantier','action.cancel_mission_pose',true,'all'),('chef_chantier','action.export_data',true,'all'),
('chef_chantier','action.casting.manage',true,'team'),('chef_chantier','action.objet_equipe.manage',true,'team'),
('chef_chantier','action.upload_photo',true,'all'),('chef_chantier','action.archive_affaire',true,'all'),
('chef_chantier','inbox.mission_pose',true,'team'),('chef_chantier','inbox.validation_heures',true,'team'),
('chef_chantier','inbox.be_attente',true,'all'),('chef_chantier','inbox.plan_lacune',true,'all'),
('chef_chantier','inbox.heures_saisir',true,'own'),('chef_chantier','inbox.alertes_equipe',true,'team'),
('chef_chantier','mobile.mes_missions',true,'all'),('chef_chantier','mobile.equipe_chantiers',true,'all'),
('chef_chantier','mobile.staffer_rapide',true,'all'),('chef_chantier','mobile.signaler_probleme',true,'all'),
('chef_chantier','casting.view_phase_commercial',true,'all'),('chef_chantier','casting.view_phase_fabrication',true,'all'),
('chef_chantier','casting.view_phase_logistique',true,'all'),('chef_chantier','casting.view_phase_montage',true,'all'),
('chef_chantier','casting.view_phase_demontage',true,'all'),
('chef_chantier','casting.edit_phase_commercial',true,'all'),('chef_chantier','casting.edit_phase_fabrication',true,'all'),
('chef_chantier','casting.edit_phase_logistique',true,'all'),('chef_chantier','casting.edit_phase_montage',true,'all'),
('chef_chantier','casting.edit_phase_demontage',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Atelier chef
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('atelier_chef','section.inbox',true,'all'),('atelier_chef','section.ma_semaine',true,'all'),
('atelier_chef','section.tableau_de_bord',true,'all'),('atelier_chef','section.affaires',true,'all'),
('atelier_chef','section.fabrication',true,'metier'),('atelier_chef','section.planning_fab',true,'metier'),
('atelier_chef','section.planning_chantier_macro',true,'all'),('atelier_chef','section.equipes',true,'metier'),
('atelier_chef','action.publish_plan_fab',true,'metier'),('atelier_chef','action.validate_hours',true,'team'),
('atelier_chef','action.export_data',true,'team'),('atelier_chef','action.casting.manage',true,'metier'),
('atelier_chef','action.objet_equipe.manage',true,'metier'),('atelier_chef','action.upload_photo',true,'all'),
('atelier_chef','inbox.validation_heures',true,'team'),('atelier_chef','inbox.plan_lacune',true,'all'),
('atelier_chef','inbox.heures_saisir',true,'own'),('atelier_chef','inbox.alertes_equipe',true,'team'),
('atelier_chef','mobile.equipe_chantiers',true,'all'),('atelier_chef','mobile.fabrication_atelier',true,'all'),
('atelier_chef','mobile.staffer_rapide',true,'metier'),('atelier_chef','mobile.signaler_probleme',true,'all'),
('atelier_chef','casting.view_phase_fabrication',true,'all'),('atelier_chef','casting.edit_phase_fabrication',true,'metier')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Atelier métier
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('atelier_metier','section.inbox',true,'all'),('atelier_metier','section.ma_semaine',true,'all'),
('atelier_metier','section.affaires',true,'all'),('atelier_metier','section.fabrication',true,'metier'),
('atelier_metier','section.planning_fab',true,'metier'),('atelier_metier','action.upload_photo',true,'all'),
('atelier_metier','inbox.heures_saisir',true,'own'),('atelier_metier','mobile.equipe_chantiers',true,'all'),
('atelier_metier','mobile.fabrication_atelier',true,'all'),('atelier_metier','mobile.signaler_probleme',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Chef pose
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('chef_pose','section.inbox',true,'all'),('chef_pose','section.ma_semaine',true,'all'),
('chef_pose','section.tableau_de_bord',true,'all'),('chef_pose','section.affaires',true,'all'),
('chef_pose','section.planning_chantier_macro',true,'all'),('chef_pose','section.logistique',true,'all'),
('chef_pose','section.equipes',true,'team'),('chef_pose','data.client_contacts',true,'all'),
('chef_pose','action.validate_hours',true,'team'),('chef_pose','action.create_mission_pose',true,'all'),
('chef_pose','action.cancel_mission_pose',true,'all'),('chef_pose','action.export_data',true,'team'),
('chef_pose','action.casting.manage',true,'team'),('chef_pose','action.upload_photo',true,'all'),
('chef_pose','inbox.mission_pose',true,'team'),('chef_pose','inbox.validation_heures',true,'team'),
('chef_pose','inbox.heures_saisir',true,'own'),('chef_pose','inbox.alertes_equipe',true,'team'),
('chef_pose','mobile.mes_missions',true,'all'),('chef_pose','mobile.equipe_chantiers',true,'all'),
('chef_pose','mobile.staffer_rapide',true,'all'),('chef_pose','mobile.signaler_probleme',true,'all'),
('chef_pose','casting.view_phase_logistique',true,'all'),('chef_pose','casting.view_phase_montage',true,'all'),
('chef_pose','casting.view_phase_demontage',true,'all'),('chef_pose','casting.edit_phase_logistique',true,'all'),
('chef_pose','casting.edit_phase_montage',true,'all'),('chef_pose','casting.edit_phase_demontage',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Poseur
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('poseur','section.inbox',true,'all'),('poseur','section.ma_semaine',true,'all'),
('poseur','section.affaires',true,'all'),('poseur','section.contrats_rh',true,'own'),
('poseur','action.upload_photo',true,'all'),('poseur','inbox.mission_pose',true,'own'),
('poseur','inbox.heures_saisir',true,'own'),('poseur','mobile.mes_missions',true,'all'),
('poseur','mobile.equipe_chantiers',true,'all'),('poseur','mobile.signaler_probleme',true,'all'),
('poseur','casting.view_phase_montage',true,'all'),('poseur','casting.view_phase_demontage',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Logistique
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('logistique','section.inbox',true,'all'),('logistique','section.ma_semaine',true,'all'),
('logistique','section.tableau_de_bord',true,'all'),('logistique','section.affaires',true,'all'),
('logistique','section.planning_chantier_macro',true,'all'),('logistique','section.logistique',true,'all'),
('logistique','data.client_contacts',true,'all'),('logistique','action.export_data',true,'all'),
('logistique','action.upload_photo',true,'all'),('logistique','inbox.heures_saisir',true,'own'),
('logistique','mobile.equipe_chantiers',true,'all'),('logistique','mobile.signaler_probleme',true,'all'),
('logistique','casting.view_phase_logistique',true,'all'),('logistique','casting.view_phase_montage',true,'all'),
('logistique','casting.view_phase_demontage',true,'all'),('logistique','casting.edit_phase_logistique',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Employé (rôle par défaut minimal)
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
('employe','section.inbox',true,'all'),('employe','section.ma_semaine',true,'all'),
('employe','section.contrats_rh',true,'own'),('employe','inbox.heures_saisir',true,'own'),
('employe','mobile.mes_missions',true,'all'),('employe','mobile.equipe_chantiers',true,'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;
