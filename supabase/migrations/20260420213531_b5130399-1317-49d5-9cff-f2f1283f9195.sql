-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.vehicule_type AS ENUM ('VL', 'M3_20', 'poids_lourd');
CREATE TYPE public.permis_type AS ENUM ('B', 'C', 'CE');
CREATE TYPE public.vehicule_proprietaire AS ENUM ('interne', 'location', 'sous_traitance');
CREATE TYPE public.trajet_categorie AS ENUM ('pose', 'depose', 'livraison_fourniture', 'recuperation_materiel', 'autre');
CREATE TYPE public.trajet_statut_soustraitance AS ENUM ('non', 'a_sous_traiter', 'devis_envoye', 'confirme');
CREATE TYPE public.adresse_favorite_type AS ENUM ('entrepot', 'client', 'fournisseur', 'autre');

-- ============================================
-- COLONNE est_livreur sur employes
-- ============================================
ALTER TABLE public.employes
  ADD COLUMN est_livreur BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- TABLE vehicules
-- ============================================
CREATE TABLE public.vehicules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  immatriculation TEXT,
  marque TEXT,
  modele TEXT,
  type public.vehicule_type NOT NULL,
  volume_m3 NUMERIC,
  poids_max_kg NUMERIC,
  capacite_passagers INTEGER,
  permis_requis public.permis_type NOT NULL DEFAULT 'B',
  date_controle_technique DATE,
  date_prochaine_revision DATE,
  date_expiration_assurance DATE,
  proprietaire public.vehicule_proprietaire NOT NULL DEFAULT 'interne',
  fournisseur_location TEXT,
  cout_journalier_eur NUMERIC,
  actif BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicules_actif ON public.vehicules(actif);
CREATE INDEX idx_vehicules_type ON public.vehicules(type);
CREATE INDEX idx_vehicules_proprietaire ON public.vehicules(proprietaire);

ALTER TABLE public.vehicules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicules_select_all_authenticated" ON public.vehicules
  FOR SELECT TO authenticated
  USING (is_chef_or_admin() OR (actif = true AND EXISTS (
    SELECT 1 FROM public.employes WHERE profile_id = auth.uid() AND est_livreur = true
  )));

CREATE POLICY "vehicules_admin_chef_modify" ON public.vehicules
  FOR ALL TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

CREATE TRIGGER set_vehicules_updated_at
  BEFORE UPDATE ON public.vehicules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TABLE adresses_favorites
-- ============================================
CREATE TABLE public.adresses_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  adresse_complete TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  type public.adresse_favorite_type NOT NULL DEFAULT 'autre',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_adresses_favorites_type ON public.adresses_favorites(type);

ALTER TABLE public.adresses_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adresses_favorites_select_authenticated" ON public.adresses_favorites
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "adresses_favorites_admin_chef_modify" ON public.adresses_favorites
  FOR ALL TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

CREATE TRIGGER set_adresses_favorites_updated_at
  BEFORE UPDATE ON public.adresses_favorites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TABLE vehicule_chauffeurs_autorises (PL only)
-- ============================================
CREATE TABLE public.vehicule_chauffeurs_autorises (
  id BIGSERIAL PRIMARY KEY,
  vehicule_id UUID NOT NULL REFERENCES public.vehicules(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (vehicule_id, employe_id)
);

CREATE INDEX idx_vca_vehicule ON public.vehicule_chauffeurs_autorises(vehicule_id);
CREATE INDEX idx_vca_employe ON public.vehicule_chauffeurs_autorises(employe_id);

ALTER TABLE public.vehicule_chauffeurs_autorises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vca_select_authenticated" ON public.vehicule_chauffeurs_autorises
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "vca_admin_chef_modify" ON public.vehicule_chauffeurs_autorises
  FOR ALL TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

-- ============================================
-- TABLE trajets
-- ============================================
CREATE TABLE public.trajets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicule_id UUID REFERENCES public.vehicules(id) ON DELETE SET NULL,
  chauffeur_id UUID REFERENCES public.employes(id) ON DELETE SET NULL,
  affaire_id UUID REFERENCES public.affaires(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  heure_depart TIME,
  heure_arrivee TIME,
  adresse_depart TEXT NOT NULL,
  adresse_arrivee TEXT NOT NULL,
  adresse_depart_favorite_id UUID REFERENCES public.adresses_favorites(id) ON DELETE SET NULL,
  adresse_arrivee_favorite_id UUID REFERENCES public.adresses_favorites(id) ON DELETE SET NULL,
  categorie public.trajet_categorie NOT NULL DEFAULT 'autre',
  parent_trajet_id UUID REFERENCES public.trajets(id) ON DELETE CASCADE,
  kilometrage NUMERIC,
  statut_soustraitance public.trajet_statut_soustraitance NOT NULL DEFAULT 'non',
  soustraitance_envoye_le TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_trajets_date ON public.trajets(date);
CREATE INDEX idx_trajets_vehicule ON public.trajets(vehicule_id);
CREATE INDEX idx_trajets_chauffeur ON public.trajets(chauffeur_id);
CREATE INDEX idx_trajets_affaire ON public.trajets(affaire_id);
CREATE INDEX idx_trajets_parent ON public.trajets(parent_trajet_id);
CREATE INDEX idx_trajets_soustraitance ON public.trajets(statut_soustraitance) WHERE statut_soustraitance <> 'non';

ALTER TABLE public.trajets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trajets_select_self_or_chef" ON public.trajets
  FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR chauffeur_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
  );

CREATE POLICY "trajets_admin_chef_modify" ON public.trajets
  FOR ALL TO authenticated
  USING (is_chef_or_admin())
  WITH CHECK (is_chef_or_admin());

CREATE TRIGGER set_trajets_updated_at
  BEFORE UPDATE ON public.trajets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TRIGGER : notif chauffeur à l'assignation
-- ============================================
CREATE OR REPLACE FUNCTION public.notify_trajet_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id UUID;
  _veh RECORD;
  _aff RECORD;
  _date_fr TEXT;
  _heure TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.chauffeur_id IS NULL THEN RETURN OLD; END IF;
    SELECT profile_id INTO _profile_id FROM employes WHERE id = OLD.chauffeur_id;
    SELECT nom, immatriculation INTO _veh FROM vehicules WHERE id = OLD.vehicule_id;
    _date_fr := to_char(OLD.date, 'DD/MM/YYYY');
    PERFORM public.create_notification(
      _profile_id,
      'assignation_supprimee'::notification_type,
      'Trajet annulé',
      format('Ton trajet du %s (%s) a été annulé.', _date_fr, COALESCE(_veh.nom, 'véhicule')),
      '/mobile/profil',
      jsonb_build_object('trajet_id', OLD.id)
    );
    RETURN OLD;
  END IF;

  IF NEW.chauffeur_id IS NULL THEN RETURN NEW; END IF;
  SELECT profile_id INTO _profile_id FROM employes WHERE id = NEW.chauffeur_id;
  SELECT nom, immatriculation INTO _veh FROM vehicules WHERE id = NEW.vehicule_id;
  SELECT numero, nom INTO _aff FROM affaires WHERE id = NEW.affaire_id;
  _date_fr := to_char(NEW.date, 'DD/MM/YYYY');
  _heure := COALESCE(to_char(NEW.heure_depart, 'HH24:MI'), '');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_notification(
      _profile_id,
      'assignation_creee'::notification_type,
      'Nouveau trajet assigné',
      format('Trajet le %s%s%s : %s → %s%s.',
        _date_fr,
        CASE WHEN _heure <> '' THEN ' à ' || _heure ELSE '' END,
        CASE WHEN _veh.nom IS NOT NULL THEN ' avec ' || _veh.nom ELSE '' END,
        NEW.adresse_depart, NEW.adresse_arrivee,
        CASE WHEN _aff.numero IS NOT NULL THEN ' (' || _aff.numero || ')' ELSE '' END),
      '/mobile/profil',
      jsonb_build_object('trajet_id', NEW.id)
    );
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.chauffeur_id IS DISTINCT FROM NEW.chauffeur_id
    OR OLD.date IS DISTINCT FROM NEW.date
    OR OLD.heure_depart IS DISTINCT FROM NEW.heure_depart
    OR OLD.adresse_depart IS DISTINCT FROM NEW.adresse_depart
    OR OLD.adresse_arrivee IS DISTINCT FROM NEW.adresse_arrivee
    OR OLD.vehicule_id IS DISTINCT FROM NEW.vehicule_id
  ) THEN
    PERFORM public.create_notification(
      _profile_id,
      'assignation_modifiee'::notification_type,
      'Trajet modifié',
      format('Ton trajet du %s a été modifié : %s → %s.', _date_fr, NEW.adresse_depart, NEW.adresse_arrivee),
      '/mobile/profil',
      jsonb_build_object('trajet_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_trajet_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trajets
  FOR EACH ROW EXECUTE FUNCTION public.notify_trajet_change();

-- ============================================
-- TRIGGER : guard chauffeur autorisé pour PL
-- ============================================
CREATE OR REPLACE FUNCTION public.guard_trajet_chauffeur_pl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _veh_type vehicule_type;
  _autorise BOOLEAN;
BEGIN
  IF NEW.vehicule_id IS NULL OR NEW.chauffeur_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO _veh_type FROM vehicules WHERE id = NEW.vehicule_id;

  -- Pour les PL : vérifier que le chauffeur est dans la liste autorisée
  IF _veh_type = 'poids_lourd' THEN
    SELECT EXISTS (
      SELECT 1 FROM vehicule_chauffeurs_autorises
      WHERE vehicule_id = NEW.vehicule_id AND employe_id = NEW.chauffeur_id
    ) INTO _autorise;
    IF NOT _autorise THEN
      RAISE EXCEPTION 'Ce chauffeur n''est pas autorisé à conduire ce poids lourd.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_trajet_chauffeur_pl
  BEFORE INSERT OR UPDATE ON public.trajets
  FOR EACH ROW EXECUTE FUNCTION public.guard_trajet_chauffeur_pl();