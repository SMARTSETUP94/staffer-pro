DO $$ BEGIN CREATE TYPE public.etape_logistique_type AS ENUM ('appro','emballage','chargement','livraison','montage','finitions','permanence','demontage','dechargement'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.etape_logistique_statut AS ENUM ('propose','valide','fait','annule'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.etape_logistique_origine AS ENUM ('jalonnement','retroplanning','manuel'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.besoin_statut AS ENUM ('a_commander','commande','recu','annule'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS responsable_production_id uuid,
  ADD COLUMN IF NOT EXISTS date_debut_production date,
  ADD COLUMN IF NOT EXISTS date_j1_installation date,
  ADD COLUMN IF NOT EXISTS date_entree_stock date,
  ADD COLUMN IF NOT EXISTS logistique_observations text,
  ADD COLUMN IF NOT EXISTS logistique_prochaine_action text,
  ADD COLUMN IF NOT EXISTS logistique_prochaine_action_echeance date,
  ADD COLUMN IF NOT EXISTS logistique_statut text NOT NULL DEFAULT 'a_planifier';

CREATE TABLE IF NOT EXISTS public.contacts_logistiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL, fonction text, telephone text, email text, societe text,
  lieu_id uuid REFERENCES public.lieux(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  notes text, actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts_logistiques TO authenticated;
GRANT ALL ON public.contacts_logistiques TO service_role;
ALTER TABLE public.contacts_logistiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_log_select ON public.contacts_logistiques FOR SELECT TO authenticated USING (public.user_has_cap('logistique.planning.view'));
CREATE POLICY contacts_log_write ON public.contacts_logistiques FOR ALL TO authenticated USING (public.user_has_cap('logistique.etape.edit')) WITH CHECK (public.user_has_cap('logistique.etape.edit'));

CREATE TABLE IF NOT EXISTS public.affaire_etapes_logistiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  type public.etape_logistique_type NOT NULL,
  sens text CHECK (sens IN ('aller','retour')),
  contenu text CHECK (contenu IN ('decor','complementaire')),
  date_debut date NOT NULL, date_fin date,
  heure_debut time, heure_fin time, horaire_libre text,
  lieu_id uuid REFERENCES public.lieux(id) ON DELETE SET NULL, lieu_libre text,
  contact_id uuid REFERENCES public.contacts_logistiques(id) ON DELETE SET NULL,
  equipe text, nb_personnes smallint, nb_vehicules smallint,
  vehicule_id uuid REFERENCES public.vehicules(id) ON DELETE SET NULL,
  immatriculation_libre text,
  trajet_id uuid REFERENCES public.trajets(id) ON DELETE SET NULL,
  acces text, note text, photos_optionnelles boolean NOT NULL DEFAULT false,
  statut public.etape_logistique_statut NOT NULL DEFAULT 'valide',
  origine public.etape_logistique_origine NOT NULL DEFAULT 'manuel',
  calcul_regle text, proposition_id uuid, outlook_event_id text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_etapes_log_dates ON public.affaire_etapes_logistiques(date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_etapes_log_affaire ON public.affaire_etapes_logistiques(affaire_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affaire_etapes_logistiques TO authenticated;
GRANT ALL ON public.affaire_etapes_logistiques TO service_role;
ALTER TABLE public.affaire_etapes_logistiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY etapes_log_select ON public.affaire_etapes_logistiques FOR SELECT TO authenticated
  USING (public.user_has_cap('logistique.planning.view'));
CREATE POLICY etapes_log_insert ON public.affaire_etapes_logistiques FOR INSERT TO authenticated
  WITH CHECK (public.user_has_cap('logistique.etape.edit') AND (public.user_cap_scope('logistique.etape.edit') = 'all' OR public.user_has_affaire_access(affaire_id)));
CREATE POLICY etapes_log_update ON public.affaire_etapes_logistiques FOR UPDATE TO authenticated
  USING (public.user_has_cap('logistique.etape.edit') AND (public.user_cap_scope('logistique.etape.edit') = 'all' OR public.user_has_affaire_access(affaire_id)))
  WITH CHECK (public.user_has_cap('logistique.etape.edit') AND (public.user_cap_scope('logistique.etape.edit') = 'all' OR public.user_has_affaire_access(affaire_id)));
CREATE POLICY etapes_log_delete ON public.affaire_etapes_logistiques FOR DELETE TO authenticated
  USING (public.user_has_cap('logistique.etape.edit') AND (public.user_cap_scope('logistique.etape.edit') = 'all' OR public.user_has_affaire_access(affaire_id)));
DROP TRIGGER IF EXISTS trg_etapes_log_updated ON public.affaire_etapes_logistiques;
CREATE TRIGGER trg_etapes_log_updated BEFORE UPDATE ON public.affaire_etapes_logistiques FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.affaire_besoins_logistiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  article text NOT NULL, quantite text, fournisseur text, date_limite_atelier date,
  statut public.besoin_statut NOT NULL DEFAULT 'a_commander', commande_le date, note text,
  origine text NOT NULL DEFAULT 'manuel', proposition_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affaire_besoins_logistiques TO authenticated;
GRANT ALL ON public.affaire_besoins_logistiques TO service_role;
ALTER TABLE public.affaire_besoins_logistiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY besoins_log_select ON public.affaire_besoins_logistiques FOR SELECT TO authenticated USING (public.user_has_cap('logistique.planning.view'));
CREATE POLICY besoins_log_write ON public.affaire_besoins_logistiques FOR ALL TO authenticated
  USING (public.user_has_cap('logistique.etape.edit') AND (public.user_cap_scope('logistique.etape.edit') = 'all' OR public.user_has_affaire_access(affaire_id)))
  WITH CHECK (public.user_has_cap('logistique.etape.edit') AND (public.user_cap_scope('logistique.etape.edit') = 'all' OR public.user_has_affaire_access(affaire_id)));

CREATE TABLE IF NOT EXISTS public.logistique_parametres (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  alias_noms text[] NOT NULL DEFAULT ARRAY['SMART','SMART RESTRUCTURING','SMART GROUP','SMART - SET UP','SMART SET-UP','SET UP','SET UP PARIS'],
  modele_ia text,
  delai_appro smallint NOT NULL DEFAULT 3, delai_emballage smallint NOT NULL DEFAULT 2,
  delai_chargement smallint NOT NULL DEFAULT 1, duree_montage smallint NOT NULL DEFAULT 2,
  delai_chargement_retour smallint NOT NULL DEFAULT 0, delai_dechargement smallint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.logistique_parametres(id) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.logistique_parametres TO authenticated;
GRANT ALL ON public.logistique_parametres TO service_role;
ALTER TABLE public.logistique_parametres ENABLE ROW LEVEL SECURITY;
CREATE POLICY log_param_select ON public.logistique_parametres FOR SELECT TO authenticated USING (public.user_has_cap('logistique.planning.view'));
CREATE POLICY log_param_update ON public.logistique_parametres FOR UPDATE TO authenticated USING (public.user_has_cap('logistique.parametres.edit')) WITH CHECK (public.user_has_cap('logistique.parametres.edit'));

INSERT INTO public.capabilities(key,label,description,category,sort_order) VALUES
 ('logistique.planning.view','Voir le planning logistique','Planning logistique général et écran atelier','logistique',900),
 ('logistique.etape.edit','Modifier les étapes logistiques','Créer, déplacer, supprimer des étapes','logistique',901),
 ('logistique.proposition.view','Voir les propositions IA','Propositions issues des jalonnements','logistique',902),
 ('logistique.proposition.validate','Valider les propositions IA','Valider ou rejeter un planning proposé','logistique',903),
 ('logistique.parametres.edit','Paramétrer la logistique','Délais, alias, véhicules','logistique',904)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities(role,capability,granted,scope)
SELECT r::public.app_role, c, true, s FROM (VALUES
 ('admin','logistique.planning.view','all'),('admin','logistique.etape.edit','all'),('admin','logistique.proposition.view','all'),('admin','logistique.proposition.validate','all'),('admin','logistique.parametres.edit','all'),
 ('logistique','logistique.planning.view','all'),('logistique','logistique.etape.edit','all'),('logistique','logistique.proposition.view','all'),('logistique','logistique.proposition.validate','all'),('logistique','logistique.parametres.edit','all'),
 ('chef_chantier','logistique.planning.view','all'),('chef_chantier','logistique.etape.edit','team'),('chef_chantier','logistique.proposition.view','team'),('chef_chantier','logistique.proposition.validate','team'),
 ('chef_pose','logistique.planning.view','all'),
 ('commercial','logistique.planning.view','all')
) v(r,c,s)
ON CONFLICT DO NOTHING;