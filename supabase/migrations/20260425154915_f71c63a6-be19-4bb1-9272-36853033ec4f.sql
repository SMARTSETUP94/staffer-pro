-- ============================================
-- BLOC 1.1 — Flags rôles fabrication sur profiles
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS est_chef_projet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS est_respo_fab boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS est_finition boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS est_manutention boolean NOT NULL DEFAULT false;

-- ============================================
-- BLOC 1.2 — Chef de projet sur affaires
-- ============================================
ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS chef_projet_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_affaires_chef_projet ON public.affaires(chef_projet_id);

-- ============================================
-- BLOC 1.3 — Enums fabrication
-- ============================================
DO $$ BEGIN
  CREATE TYPE public.fabrication_etape_type AS ENUM ('be', 'respo_fab', 'finition', 'manutention');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fabrication_etape_statut AS ENUM ('a_faire', 'en_cours', 'termine', 'non_applicable');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fabrication_finition_type AS ENUM ('peinture', 'tapisserie', 'autre', 'aucune');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- BLOC 1.4 — Séquence pour références FAB-YYYY-NNNNN
-- ============================================
CREATE SEQUENCE IF NOT EXISTS public.fabrication_reference_seq START 1;

-- ============================================
-- BLOC 1.5 — Table fabrication_objets
-- ============================================
CREATE TABLE IF NOT EXISTS public.fabrication_objets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  devis_id uuid REFERENCES public.devis(id) ON DELETE SET NULL,
  reference text UNIQUE NOT NULL,
  nom text NOT NULL,
  quantite integer NOT NULL DEFAULT 1 CHECK (quantite > 0),
  respo_fab_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type_finition public.fabrication_finition_type NOT NULL DEFAULT 'aucune',
  commentaire text,
  ordre integer NOT NULL DEFAULT 0,
  archive boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fabrication_objets_affaire ON public.fabrication_objets(affaire_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_objets_devis ON public.fabrication_objets(devis_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_objets_respo_fab ON public.fabrication_objets(respo_fab_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_objets_archive ON public.fabrication_objets(archive);

-- ============================================
-- BLOC 1.6 — RPC next_fabrication_reference()
-- ============================================
CREATE OR REPLACE FUNCTION public.set_fabrication_objet_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference IS NULL OR length(trim(NEW.reference)) = 0 THEN
    NEW.reference := 'FAB-' || to_char(now(), 'YYYY') || '-' ||
                     lpad(nextval('public.fabrication_reference_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fabrication_objet_reference ON public.fabrication_objets;
CREATE TRIGGER trg_fabrication_objet_reference
  BEFORE INSERT ON public.fabrication_objets
  FOR EACH ROW EXECUTE FUNCTION public.set_fabrication_objet_reference();

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_fabrication_objets_updated_at ON public.fabrication_objets;
CREATE TRIGGER trg_fabrication_objets_updated_at
  BEFORE UPDATE ON public.fabrication_objets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- BLOC 1.7 — Table fabrication_etapes
-- ============================================
CREATE TABLE IF NOT EXISTS public.fabrication_etapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet_id uuid NOT NULL REFERENCES public.fabrication_objets(id) ON DELETE CASCADE,
  type_etape public.fabrication_etape_type NOT NULL,
  statut public.fabrication_etape_statut NOT NULL DEFAULT 'a_faire',
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  validateur_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  date_debut timestamptz,
  date_fin timestamptz,
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(objet_id, type_etape)
);

CREATE INDEX IF NOT EXISTS idx_fabrication_etapes_objet ON public.fabrication_etapes(objet_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_etapes_assignee ON public.fabrication_etapes(assignee_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_etapes_statut ON public.fabrication_etapes(statut);
CREATE INDEX IF NOT EXISTS idx_fabrication_etapes_type ON public.fabrication_etapes(type_etape);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_fabrication_etapes_updated_at ON public.fabrication_etapes;
CREATE TRIGGER trg_fabrication_etapes_updated_at
  BEFORE UPDATE ON public.fabrication_etapes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- BLOC 1.8 — Trigger: création auto des 4 étapes à l'insert d'un objet
-- ============================================
CREATE OR REPLACE FUNCTION public.create_fabrication_etapes_for_objet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.fabrication_etapes (objet_id, type_etape, statut)
  VALUES
    (NEW.id, 'be', 'a_faire'),
    (NEW.id, 'respo_fab', 'a_faire'),
    (NEW.id, 'finition', CASE WHEN NEW.type_finition = 'aucune' THEN 'non_applicable'::public.fabrication_etape_statut ELSE 'a_faire'::public.fabrication_etape_statut END),
    (NEW.id, 'manutention', 'a_faire');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_fabrication_etapes ON public.fabrication_objets;
CREATE TRIGGER trg_create_fabrication_etapes
  AFTER INSERT ON public.fabrication_objets
  FOR EACH ROW EXECUTE FUNCTION public.create_fabrication_etapes_for_objet();

-- ============================================
-- BLOC 1.9 — Table fabrication_etapes_historique
-- ============================================
CREATE TABLE IF NOT EXISTS public.fabrication_etapes_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etape_id uuid NOT NULL REFERENCES public.fabrication_etapes(id) ON DELETE CASCADE,
  action text NOT NULL,
  ancien_statut public.fabrication_etape_statut,
  nouveau_statut public.fabrication_etape_statut,
  ancien_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nouveau_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fait_par_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fabrication_historique_etape ON public.fabrication_etapes_historique(etape_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_historique_fait_par ON public.fabrication_etapes_historique(fait_par_id);

-- ============================================
-- BLOC 1.10 — Trigger: log automatique des changements d'étapes
-- ============================================
CREATE OR REPLACE FUNCTION public.log_fabrication_etape_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fabrication_etapes_historique (
      etape_id, action, ancien_statut, nouveau_statut,
      ancien_assignee_id, nouveau_assignee_id, fait_par_id, commentaire
    ) VALUES (
      NEW.id, 'creation', NULL, NEW.statut,
      NULL, NEW.assignee_id, auth.uid(), NULL
    );
    RETURN NEW;
  END IF;

  -- UPDATE : log uniquement si statut OU assignee change
  IF (NEW.statut IS DISTINCT FROM OLD.statut)
     OR (NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN

    IF NEW.statut IS DISTINCT FROM OLD.statut AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      _action := 'changement_statut_et_assignation';
    ELSIF NEW.statut IS DISTINCT FROM OLD.statut THEN
      _action := CASE
        WHEN OLD.statut = 'termine' AND NEW.statut <> 'termine' THEN 'devalidation'
        ELSE 'changement_statut'
      END;
    ELSE
      _action := 'assignation';
    END IF;

    INSERT INTO public.fabrication_etapes_historique (
      etape_id, action, ancien_statut, nouveau_statut,
      ancien_assignee_id, nouveau_assignee_id, fait_par_id, commentaire
    ) VALUES (
      NEW.id, _action, OLD.statut, NEW.statut,
      OLD.assignee_id, NEW.assignee_id, auth.uid(), NEW.commentaire
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_fabrication_etape_insert ON public.fabrication_etapes;
CREATE TRIGGER trg_log_fabrication_etape_insert
  AFTER INSERT ON public.fabrication_etapes
  FOR EACH ROW EXECUTE FUNCTION public.log_fabrication_etape_change();

DROP TRIGGER IF EXISTS trg_log_fabrication_etape_update ON public.fabrication_etapes;
CREATE TRIGGER trg_log_fabrication_etape_update
  AFTER UPDATE ON public.fabrication_etapes
  FOR EACH ROW EXECUTE FUNCTION public.log_fabrication_etape_change();

-- ============================================
-- BLOC 1.11 — Trigger: auto-fill date_fin et validateur_id
-- ============================================
CREATE OR REPLACE FUNCTION public.guard_fabrication_etape_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Passage à 'termine' : auto-fill date_fin et validateur_id
  IF NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine') THEN
    NEW.date_fin := COALESCE(NEW.date_fin, now());
    NEW.validateur_id := COALESCE(NEW.validateur_id, auth.uid());
  END IF;

  -- Passage à 'en_cours' : auto-fill date_debut si pas déjà rempli
  IF NEW.statut = 'en_cours' AND (OLD.statut IS DISTINCT FROM 'en_cours') THEN
    NEW.date_debut := COALESCE(NEW.date_debut, now());
  END IF;

  -- Dévalidation (passage de 'termine' à autre chose) : reset date_fin et validateur
  IF OLD.statut = 'termine' AND NEW.statut <> 'termine' THEN
    NEW.date_fin := NULL;
    NEW.validateur_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_fabrication_etape ON public.fabrication_etapes;
CREATE TRIGGER trg_guard_fabrication_etape
  BEFORE UPDATE ON public.fabrication_etapes
  FOR EACH ROW EXECUTE FUNCTION public.guard_fabrication_etape_transition();

-- ============================================
-- BLOC 1.12 — Extension heures_saisies (lien optionnel)
-- ============================================
ALTER TABLE public.heures_saisies
  ADD COLUMN IF NOT EXISTS fabrication_objet_id uuid REFERENCES public.fabrication_objets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fabrication_etape_type public.fabrication_etape_type;

CREATE INDEX IF NOT EXISTS idx_heures_saisies_fabrication_objet ON public.heures_saisies(fabrication_objet_id);

-- ============================================
-- BLOC 1.13 — RLS
-- ============================================
ALTER TABLE public.fabrication_objets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabrication_objets_select_all_auth ON public.fabrication_objets;
CREATE POLICY fabrication_objets_select_all_auth
  ON public.fabrication_objets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fabrication_objets_modify_chef_admin ON public.fabrication_objets;
CREATE POLICY fabrication_objets_modify_chef_admin
  ON public.fabrication_objets FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

ALTER TABLE public.fabrication_etapes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabrication_etapes_select_all_auth ON public.fabrication_etapes;
CREATE POLICY fabrication_etapes_select_all_auth
  ON public.fabrication_etapes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fabrication_etapes_modify_chef_admin ON public.fabrication_etapes;
CREATE POLICY fabrication_etapes_modify_chef_admin
  ON public.fabrication_etapes FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

ALTER TABLE public.fabrication_etapes_historique ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabrication_historique_select_all_auth ON public.fabrication_etapes_historique;
CREATE POLICY fabrication_historique_select_all_auth
  ON public.fabrication_etapes_historique FOR SELECT TO authenticated USING (true);

-- Pas de policy INSERT/UPDATE/DELETE explicite : seuls les triggers SECURITY DEFINER écrivent dedans