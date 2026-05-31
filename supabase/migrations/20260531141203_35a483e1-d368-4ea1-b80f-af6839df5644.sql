-- 1. Créer la capability clients.update
INSERT INTO public.capabilities (key, label, description, category, sort_order)
VALUES (
  'clients.update',
  'Modifier les fiches client',
  'Permet de modifier les informations d''une fiche client existante.',
  'clients',
  20
)
ON CONFLICT (key) DO NOTHING;

-- 2. Accorder clients.update aux rôles admin et chef_chantier
INSERT INTO public.role_capabilities (role, capability, granted)
VALUES
  ('admin', 'clients.update', true),
  ('chef_chantier', 'clients.update', true)
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted;

-- 3. Remplacer la policy UPDATE sur clients pour qu'elle s'appuie sur la capability
DROP POLICY IF EXISTS clients_modify_chef_admin ON public.clients;

-- Recrée INSERT + DELETE à l'identique (is_chef_or_admin) pour ne pas régresser
CREATE POLICY clients_insert_chef_admin
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (is_chef_or_admin());

CREATE POLICY clients_delete_chef_admin
ON public.clients
FOR DELETE
TO authenticated
USING (is_chef_or_admin());

-- UPDATE devient cap-driven
CREATE POLICY clients_update_via_cap
ON public.clients
FOR UPDATE
TO authenticated
USING (user_has_capability(auth.uid(), 'clients.update'))
WITH CHECK (user_has_capability(auth.uid(), 'clients.update'));

-- Idem pour client_contacts (la fiche client édite ses contacts)
DROP POLICY IF EXISTS client_contacts_modify_chef_admin ON public.client_contacts;

CREATE POLICY client_contacts_insert_chef_admin
ON public.client_contacts
FOR INSERT
TO authenticated
WITH CHECK (is_chef_or_admin());

CREATE POLICY client_contacts_delete_chef_admin
ON public.client_contacts
FOR DELETE
TO authenticated
USING (is_chef_or_admin());

CREATE POLICY client_contacts_update_via_cap
ON public.client_contacts
FOR UPDATE
TO authenticated
USING (user_has_capability(auth.uid(), 'clients.update'))
WITH CHECK (user_has_capability(auth.uid(), 'clients.update'));