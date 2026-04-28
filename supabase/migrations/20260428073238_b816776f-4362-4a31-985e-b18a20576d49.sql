
-- Trigger : notifier l'employé quand un chef saisit pour lui
CREATE OR REPLACE FUNCTION public.notify_saisie_par_chef()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id uuid;
  _affaire RECORD;
  _date_fr text;
  _heures text;
BEGIN
  -- Notifier seulement quand saisi_par_chef passe à TRUE (insert ou update)
  IF NEW.saisi_par_chef IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.saisi_par_chef IS TRUE
     AND OLD.heures_reelles IS NOT DISTINCT FROM NEW.heures_reelles
     AND OLD.heure_debut IS NOT DISTINCT FROM NEW.heure_debut
     AND OLD.heure_fin IS NOT DISTINCT FROM NEW.heure_fin
     AND OLD.statut IS NOT DISTINCT FROM NEW.statut THEN
    -- pas de changement matériel, on évite le spam
    RETURN NEW;
  END IF;

  SELECT profile_id INTO _profile_id FROM public.employes WHERE id = NEW.employe_id;
  IF _profile_id IS NULL OR _profile_id = NEW.saisi_par THEN
    RETURN NEW;
  END IF;

  SELECT numero, nom INTO _affaire FROM public.affaires WHERE id = NEW.affaire_id;
  _date_fr := to_char(NEW.date, 'DD/MM/YYYY');
  _heures := COALESCE(NEW.heures_reelles::text, '?') || 'h';

  PERFORM public.create_notification(
    _profile_id,
    'heures_validees'::public.notification_type,
    'Heures saisies par votre chef',
    format('Votre chef a saisi %s pour vous le %s sur %s — %s.',
      _heures, _date_fr, COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
    '/mes-heures',
    jsonb_build_object('heures_id', NEW.id, 'date', NEW.date, 'saisi_par_chef', true)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_saisie_par_chef ON public.heures_saisies;
CREATE TRIGGER trg_notify_saisie_par_chef
AFTER INSERT OR UPDATE ON public.heures_saisies
FOR EACH ROW
EXECUTE FUNCTION public.notify_saisie_par_chef();
