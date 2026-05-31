
-- ---------- Table clients ----------
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom text NOT NULL,
  nom_normalise text NOT NULL,
  domaines_email text[] NOT NULL DEFAULT '{}',
  siret text,
  secteur text,
  notes text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX clients_nom_normalise_uidx ON public.clients (nom_normalise);
CREATE INDEX clients_domaines_email_gin ON public.clients USING GIN (domaines_email);
CREATE INDEX clients_nom_trgm ON public.clients USING GIN (nom gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR has_role(auth.uid(), 'commercial'::app_role)
    OR user_has_capability(auth.uid(), 'clients.view'::text)
  );

CREATE POLICY clients_modify_chef_admin ON public.clients
  FOR ALL TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

-- ---------- Table client_contacts ----------
CREATE TABLE public.client_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nom text,
  prenom text,
  email text,
  telephone text,
  fonction text,
  notes text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX client_contacts_client_email_uidx
  ON public.client_contacts (client_id, lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX client_contacts_email_idx ON public.client_contacts (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contacts_select ON public.client_contacts
  FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR has_role(auth.uid(), 'commercial'::app_role)
    OR user_has_capability(auth.uid(), 'clients.view'::text)
  );

CREATE POLICY client_contacts_modify_chef_admin ON public.client_contacts
  FOR ALL TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

-- ---------- FK ----------
ALTER TABLE public.affaires
  ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX affaires_client_id_idx ON public.affaires (client_id);

ALTER TABLE public.emails_entrants
  ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL;
CREATE INDEX emails_entrants_client_id_idx ON public.emails_entrants (client_id, received_at DESC);

-- ---------- Helpers normalisation ----------
CREATE OR REPLACE FUNCTION public.normalize_client_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.email_domain(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR position('@' in p) = 0 THEN NULL
    ELSE lower(split_part(p, '@', 2))
  END
$$;

-- ---------- Trigger normalize ----------
CREATE OR REPLACE FUNCTION public.tg_clients_normalize()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.nom_normalise := public.normalize_client_name(NEW.nom);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clients_normalize
BEFORE INSERT OR UPDATE OF nom ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.tg_clients_normalize();

-- ---------- Trigger auto-match email ----------
CREATE OR REPLACE FUNCTION public.tg_emails_match_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_domain text;
  v_client_id uuid;
  v_contact_id uuid;
BEGIN
  IF NEW.client_id IS NOT NULL THEN RETURN NEW; END IF;
  v_domain := public.email_domain(NEW.from_email);
  IF v_domain IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE actif = true AND v_domain = ANY(domaines_email)
  ORDER BY created_at ASC LIMIT 1;

  IF v_client_id IS NULL THEN RETURN NEW; END IF;

  NEW.client_id := v_client_id;

  SELECT id INTO v_contact_id
  FROM public.client_contacts
  WHERE client_id = v_client_id AND lower(email) = lower(NEW.from_email)
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.client_contacts (client_id, nom, email)
    VALUES (v_client_id, coalesce(NEW.from_name, NEW.from_email), NEW.from_email)
    RETURNING id INTO v_contact_id;
  END IF;

  NEW.contact_id := v_contact_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_emails_entrants_match_client
BEFORE INSERT ON public.emails_entrants
FOR EACH ROW EXECUTE FUNCTION public.tg_emails_match_client();

-- ---------- Backfill ----------
INSERT INTO public.clients (nom, nom_normalise)
SELECT DISTINCT trim(client), public.normalize_client_name(trim(client))
FROM public.affaires
WHERE client IS NOT NULL AND trim(client) <> ''
ON CONFLICT (nom_normalise) DO NOTHING;

UPDATE public.affaires a
SET client_id = c.id
FROM public.clients c
WHERE a.client_id IS NULL
  AND a.client IS NOT NULL
  AND c.nom_normalise = public.normalize_client_name(trim(a.client));

WITH matched AS (
  SELECT e.id AS email_id, c.id AS client_id
  FROM public.emails_entrants e
  JOIN public.clients c
    ON c.actif = true
   AND public.email_domain(e.from_email) = ANY(c.domaines_email)
  WHERE e.client_id IS NULL
)
UPDATE public.emails_entrants e
SET client_id = m.client_id
FROM matched m
WHERE e.id = m.email_id;

-- ---------- Capabilities + role mapping ----------
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('clients.view',   'Voir les clients',     'Accès au hub clients et aux fiches', 'clients', 10),
  ('clients.manage', 'Gérer les clients',    'Créer, modifier, archiver clients et contacts', 'clients', 20),
  ('clients.merge',  'Fusionner des clients', 'Outil admin de fusion de doublons', 'clients', 30)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('admin', 'clients.view', true),
  ('admin', 'clients.manage', true),
  ('admin', 'clients.merge', true),
  ('chef_chantier', 'clients.view', true),
  ('chef_chantier', 'clients.manage', true),
  ('commercial', 'clients.view', true)
ON CONFLICT DO NOTHING;
