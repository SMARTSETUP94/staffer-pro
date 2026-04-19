-- Trigger : empêcher INSERT / changement de date sur assignation si affaire close
CREATE OR REPLACE FUNCTION public.check_affaire_open_for_assignation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _statut affaire_statut;
BEGIN
  -- Sur UPDATE, on autorise les modifs cosmétiques (notes, heure_debut/fin)
  -- mais on bloque tout changement de date / affaire / employé si affaire close.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.affaire_id = NEW.affaire_id
       AND OLD.date = NEW.date
       AND OLD.employe_id = NEW.employe_id
       AND OLD.demi_journee = NEW.demi_journee THEN
      RETURN NEW; -- modif cosmétique autorisée
    END IF;
  END IF;

  SELECT statut INTO _statut FROM public.affaires WHERE id = NEW.affaire_id;
  IF _statut IN ('termine', 'annule') THEN
    RAISE EXCEPTION 'Impossible de modifier le planning : l''affaire est clôturée (statut: %). Réouvrez-la d''abord.', _statut
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_affaire_open_assignation ON public.assignations;
CREATE TRIGGER trg_check_affaire_open_assignation
  BEFORE INSERT OR UPDATE ON public.assignations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_affaire_open_for_assignation();