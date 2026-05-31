
-- 0. Capabilities catalog (préalable au FK role_capabilities → capabilities)
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('inbox_smart.view',     'Inbox Smart : voir',     'Accès à la boîte de tri des emails entrants smart@setup.paris', 'inbox_smart', 800),
  ('candidatures.view',    'Candidatures : voir',    'Lecture des candidatures',                                       'candidatures', 810),
  ('candidatures.manage',  'Candidatures : gérer',   'Créer / modifier les candidatures, CV, statut',                  'candidatures', 811)
ON CONFLICT (key) DO NOTHING;

-- 1. ENUMS
CREATE TYPE public.email_categorie AS ENUM ('candidature','opportunite','pub','autre');
CREATE TYPE public.email_statut AS ENUM ('pending_review','validated','dismissed');
CREATE TYPE public.candidature_statut AS ENUM ('nouvelle','a_rencontrer','entretien','embauche','rejetee');

-- 2. TABLE emails_entrants
CREATE TABLE public.emails_entrants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id_outlook TEXT NOT NULL UNIQUE,
  conversation_id    TEXT,
  from_email         TEXT NOT NULL,
  from_name          TEXT,
  subject            TEXT,
  received_at        TIMESTAMPTZ NOT NULL,
  body_preview       TEXT,
  body_html          TEXT,
  attachments_count  INT NOT NULL DEFAULT 0,
  has_attachments    BOOLEAN NOT NULL DEFAULT false,
  categorie_ia       public.email_categorie,
  confiance_ia       NUMERIC(3,2),
  metadata_ia        JSONB NOT NULL DEFAULT '{}'::jsonb,
  statut             public.email_statut NOT NULL DEFAULT 'pending_review',
  validated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at       TIMESTAMPTZ,
  candidature_id     UUID,
  opportunite_id     UUID,
  dismiss_reason     TEXT,
  archived_outlook   BOOLEAN NOT NULL DEFAULT false,
  raw_payload        JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_emails_entrants_statut ON public.emails_entrants(statut, received_at DESC);
CREATE INDEX idx_emails_entrants_categorie ON public.emails_entrants(categorie_ia, statut);
CREATE INDEX idx_emails_entrants_received ON public.emails_entrants(received_at DESC);
CREATE INDEX idx_emails_entrants_from ON public.emails_entrants(from_email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emails_entrants TO authenticated;
GRANT ALL ON public.emails_entrants TO service_role;

ALTER TABLE public.emails_entrants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emails_entrants_select_via_cap"
  ON public.emails_entrants FOR SELECT TO authenticated
  USING (public.user_has_capability(auth.uid(), 'inbox_smart.view'));

CREATE POLICY "emails_entrants_update_via_cap"
  ON public.emails_entrants FOR UPDATE TO authenticated
  USING (public.user_has_capability(auth.uid(), 'inbox_smart.view'))
  WITH CHECK (public.user_has_capability(auth.uid(), 'inbox_smart.view'));

CREATE POLICY "emails_entrants_admin_insert"
  ON public.emails_entrants FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "emails_entrants_admin_delete"
  ON public.emails_entrants FOR DELETE TO authenticated
  USING (public.is_admin());

-- 3. TABLE candidatures
CREATE TABLE public.candidatures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  prenom          TEXT,
  email           TEXT,
  telephone       TEXT,
  poste_vise      TEXT,
  metier          TEXT,
  cv_path         TEXT,
  lettre_path     TEXT,
  source_email_id UUID REFERENCES public.emails_entrants(id) ON DELETE SET NULL,
  statut          public.candidature_statut NOT NULL DEFAULT 'nouvelle',
  notes           TEXT,
  assignee_rh     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_candidatures_poste ON public.candidatures(poste_vise);
CREATE INDEX idx_candidatures_metier ON public.candidatures(metier);
CREATE INDEX idx_candidatures_statut ON public.candidatures(statut, created_at DESC);
CREATE INDEX idx_candidatures_email ON public.candidatures(email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidatures TO authenticated;
GRANT ALL ON public.candidatures TO service_role;

ALTER TABLE public.candidatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidatures_select_via_cap"
  ON public.candidatures FOR SELECT TO authenticated
  USING (public.user_has_capability(auth.uid(), 'candidatures.view'));

CREATE POLICY "candidatures_insert_via_cap"
  ON public.candidatures FOR INSERT TO authenticated
  WITH CHECK (public.user_has_capability(auth.uid(), 'candidatures.manage'));

CREATE POLICY "candidatures_update_via_cap"
  ON public.candidatures FOR UPDATE TO authenticated
  USING (public.user_has_capability(auth.uid(), 'candidatures.manage'))
  WITH CHECK (public.user_has_capability(auth.uid(), 'candidatures.manage'));

CREATE POLICY "candidatures_delete_admin"
  ON public.candidatures FOR DELETE TO authenticated
  USING (public.is_admin());

ALTER TABLE public.emails_entrants
  ADD CONSTRAINT emails_entrants_candidature_fk
  FOREIGN KEY (candidature_id) REFERENCES public.candidatures(id) ON DELETE SET NULL;

-- 4. Triggers updated_at
CREATE TRIGGER trg_emails_entrants_updated_at
  BEFORE UPDATE ON public.emails_entrants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_candidatures_updated_at
  BEFORE UPDATE ON public.candidatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. STORAGE bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidatures-pj', 'candidatures-pj', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "candidatures_pj_select_via_cap"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'candidatures-pj' AND public.user_has_capability(auth.uid(), 'candidatures.view'));

CREATE POLICY "candidatures_pj_insert_via_cap"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'candidatures-pj' AND public.user_has_capability(auth.uid(), 'candidatures.manage'));

CREATE POLICY "candidatures_pj_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'candidatures-pj' AND public.is_admin());

-- 6. Capabilities → rôles
INSERT INTO public.role_capabilities (role, capability) VALUES
  ('admin', 'inbox_smart.view'),
  ('admin', 'candidatures.view'),
  ('admin', 'candidatures.manage'),
  ('rh', 'inbox_smart.view'),
  ('rh', 'candidatures.view'),
  ('rh', 'candidatures.manage'),
  ('chef_chantier', 'inbox_smart.view')
ON CONFLICT DO NOTHING;

-- 7. Setting global
CREATE TABLE IF NOT EXISTS public.inbox_smart_settings (
  id                    INT PRIMARY KEY DEFAULT 1,
  auto_validate_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_validate_min_confiance NUMERIC(3,2) NOT NULL DEFAULT 0.85,
  last_poll_at          TIMESTAMPTZ,
  last_poll_count       INT,
  last_poll_error       TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inbox_smart_settings_singleton CHECK (id = 1)
);

INSERT INTO public.inbox_smart_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT, UPDATE ON public.inbox_smart_settings TO authenticated;
GRANT ALL ON public.inbox_smart_settings TO service_role;

ALTER TABLE public.inbox_smart_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_smart_settings_select_via_cap"
  ON public.inbox_smart_settings FOR SELECT TO authenticated
  USING (public.user_has_capability(auth.uid(), 'inbox_smart.view'));

CREATE POLICY "inbox_smart_settings_update_admin"
  ON public.inbox_smart_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
