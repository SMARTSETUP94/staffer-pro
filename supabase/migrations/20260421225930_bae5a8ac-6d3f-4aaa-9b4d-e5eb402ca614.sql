-- ============================================================
-- v0.18 — Bloc 1 : Migration DB
-- ============================================================

-- 1) profiles.matricule_silae
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS matricule_silae text;

COMMENT ON COLUMN public.profiles.matricule_silae IS
  'Matricule SILAE/PROGBAT — clé de jointure pour export paie. Saisi manuellement par admin.';

-- RLS : SELECT déjà couvert par profiles_self_select (auth + admin/chef)
-- On ajoute une policy d'UPDATE admin-only spécifique au matricule
-- (la policy profiles_self_update permet déjà à l'utilisateur d'updater son propre profil,
--  mais on veut que SEUL l'admin puisse écrire matricule_silae : on ajoute donc un trigger guard).
CREATE OR REPLACE FUNCTION public.guard_matricule_silae_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.matricule_silae IS DISTINCT FROM OLD.matricule_silae
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut modifier le matricule SILAE.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_matricule_silae ON public.profiles;
CREATE TRIGGER guard_matricule_silae
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_matricule_silae_admin_only();

-- ============================================================
-- 2) heures_saisies.heures_nuit
-- ============================================================
ALTER TABLE public.heures_saisies
  ADD COLUMN IF NOT EXISTS heures_nuit numeric(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.heures_saisies.heures_nuit IS
  'Heures effectuées entre 00h-06h (convention spectacle vivant). Saisie déclarative employé. Phase 1 : pas d''auto-calcul.';

-- Trigger validation : 0 <= heures_nuit <= heures_reelles (si heures_reelles non null)
CREATE OR REPLACE FUNCTION public.validate_heures_nuit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.heures_nuit < 0 THEN
    RAISE EXCEPTION 'heures_nuit ne peut pas être négatif.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.heures_reelles IS NOT NULL AND NEW.heures_nuit > NEW.heures_reelles THEN
    RAISE EXCEPTION 'heures_nuit (%) ne peut pas dépasser heures_reelles (%).', NEW.heures_nuit, NEW.heures_reelles
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_heures_nuit_trg ON public.heures_saisies;
CREATE TRIGGER validate_heures_nuit_trg
  BEFORE INSERT OR UPDATE ON public.heures_saisies
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_heures_nuit();

-- ============================================================
-- 3) assignations.metier_id : passer en nullable (déjà FK, déjà rempli)
-- ============================================================
ALTER TABLE public.assignations
  ALTER COLUMN metier_id DROP NOT NULL;

COMMENT ON COLUMN public.assignations.metier_id IS
  'Métier mobilisé sur cette assignation (peut différer du métier principal de l''employé = renfort). Nullable : si NULL => métier principal employé.';
