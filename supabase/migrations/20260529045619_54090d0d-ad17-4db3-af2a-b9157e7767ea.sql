-- Garde-fou anti-doublon : employe_metiers ne doit JAMAIS contenir le metier_principal_id de l'employé
-- (le principal est déjà stocké dans employes.metier_principal_id, source unique)

CREATE OR REPLACE FUNCTION public.reject_employe_metier_principal_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metier_principal_id integer;
BEGIN
  SELECT metier_principal_id INTO v_metier_principal_id
  FROM public.employes
  WHERE id = NEW.employe_id;

  IF v_metier_principal_id IS NOT NULL AND NEW.metier_id = v_metier_principal_id THEN
    RAISE EXCEPTION 'Le métier % est déjà le métier principal de cet employé (stocké dans employes.metier_principal_id). Pas besoin de l''ajouter en compétence secondaire/dépannage/bloquée.', NEW.metier_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_employe_metier_principal_dup ON public.employe_metiers;
CREATE TRIGGER trg_reject_employe_metier_principal_dup
  BEFORE INSERT OR UPDATE ON public.employe_metiers
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_employe_metier_principal_duplicate();

-- Côté inverse : si on change le metier_principal_id d'un employé, supprimer toute compétence
-- secondaire/dépannage/bloquée sur ce nouveau métier (sinon ça créerait un conflit)
CREATE OR REPLACE FUNCTION public.cleanup_employe_metier_on_principal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.metier_principal_id IS NOT NULL
     AND NEW.metier_principal_id IS DISTINCT FROM OLD.metier_principal_id THEN
    DELETE FROM public.employe_metiers
    WHERE employe_id = NEW.id
      AND metier_id = NEW.metier_principal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_employe_metier_on_principal_change ON public.employes;
CREATE TRIGGER trg_cleanup_employe_metier_on_principal_change
  AFTER UPDATE OF metier_principal_id ON public.employes
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_employe_metier_on_principal_change();