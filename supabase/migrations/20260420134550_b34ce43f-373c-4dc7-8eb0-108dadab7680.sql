-- ============================================================
-- FEATURE 1 : SWAP REQUESTS (échange de créneau entre collègues)
-- ============================================================

-- Enum statut swap
DO $$ BEGIN
  CREATE TYPE public.swap_status AS ENUM (
    'proposee',
    'acceptee_collegue',
    'refusee_collegue',
    'validee_chef',
    'rejetee_chef',
    'appliquee',
    'annulee'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum type de swap
DO $$ BEGIN
  CREATE TYPE public.swap_type AS ENUM ('delegation', 'echange');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table swap_requests
CREATE TABLE IF NOT EXISTS public.swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type swap_type NOT NULL DEFAULT 'echange',
  -- Demandeur (employé A)
  from_employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  from_assignation_id UUID NOT NULL REFERENCES public.assignations(id) ON DELETE CASCADE,
  -- Cible (employé B)
  to_employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  -- Créneau de B (NULL si délégation simple)
  to_assignation_id UUID REFERENCES public.assignations(id) ON DELETE CASCADE,
  -- Workflow
  statut swap_status NOT NULL DEFAULT 'proposee',
  motif_demande TEXT,
  -- Décision collègue
  collegue_decide_le TIMESTAMPTZ,
  collegue_motif TEXT,
  -- Décision chef
  chef_decide_par UUID REFERENCES public.profiles(id),
  chef_decide_le TIMESTAMPTZ,
  chef_motif TEXT,
  -- Application
  appliquee_le TIMESTAMPTZ,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT swap_different_employes CHECK (from_employe_id <> to_employe_id),
  CONSTRAINT swap_echange_needs_target CHECK (
    type = 'delegation' OR to_assignation_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_swap_from_employe ON public.swap_requests(from_employe_id);
CREATE INDEX IF NOT EXISTS idx_swap_to_employe ON public.swap_requests(to_employe_id);
CREATE INDEX IF NOT EXISTS idx_swap_statut ON public.swap_requests(statut);
CREATE INDEX IF NOT EXISTS idx_swap_from_assignation ON public.swap_requests(from_assignation_id);
CREATE INDEX IF NOT EXISTS idx_swap_to_assignation ON public.swap_requests(to_assignation_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_swap_updated_at ON public.swap_requests;
CREATE TRIGGER trg_swap_updated_at
  BEFORE UPDATE ON public.swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS swap_select_concerned ON public.swap_requests;
CREATE POLICY swap_select_concerned ON public.swap_requests
  FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR from_employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
    OR to_employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS swap_insert_self ON public.swap_requests;
CREATE POLICY swap_insert_self ON public.swap_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    is_chef_or_admin()
    OR from_employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS swap_update_concerned ON public.swap_requests;
CREATE POLICY swap_update_concerned ON public.swap_requests
  FOR UPDATE TO authenticated
  USING (
    is_chef_or_admin()
    OR from_employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
    OR to_employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS swap_delete_admin ON public.swap_requests;
CREATE POLICY swap_delete_admin ON public.swap_requests
  FOR DELETE TO authenticated
  USING (is_chef_or_admin());

-- ------------------------------------------------------------
-- Trigger : valider la cohérence métier à la création
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_swap_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _from_metier INT;
  _to_metier INT;
  _to_employe_metier INT;
BEGIN
  -- Récupérer métier de l'assignation source
  SELECT metier_id INTO _from_metier FROM assignations WHERE id = NEW.from_assignation_id;
  SELECT metier_principal_id INTO _to_employe_metier FROM employes WHERE id = NEW.to_employe_id;

  -- Vérifier compatibilité métier (principal OU dans employe_metiers)
  IF _from_metier <> _to_employe_metier
     AND NOT EXISTS (
       SELECT 1 FROM employe_metiers
       WHERE employe_id = NEW.to_employe_id AND metier_id = _from_metier
     ) THEN
    RAISE EXCEPTION 'Le collègue cible n''a pas le métier requis pour ce créneau.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Si échange : vérifier réciproquement
  IF NEW.type = 'echange' AND NEW.to_assignation_id IS NOT NULL THEN
    SELECT metier_id INTO _to_metier FROM assignations WHERE id = NEW.to_assignation_id;
    IF _to_metier <> (SELECT metier_principal_id FROM employes WHERE id = NEW.from_employe_id)
       AND NOT EXISTS (
         SELECT 1 FROM employe_metiers
         WHERE employe_id = NEW.from_employe_id AND metier_id = _to_metier
       ) THEN
      RAISE EXCEPTION 'Vous n''avez pas le métier requis pour le créneau du collègue.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_swap_request ON public.swap_requests;
CREATE TRIGGER trg_validate_swap_request
  BEFORE INSERT ON public.swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_swap_request();

-- ------------------------------------------------------------
-- Trigger : appliquer le swap quand statut passe à 'validee_chef'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_swap_on_validation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Seulement si on passe à validee_chef
  IF NEW.statut <> 'validee_chef' OR OLD.statut = 'validee_chef' THEN
    RETURN NEW;
  END IF;

  -- Délégation : on transfère from_assignation à to_employe
  IF NEW.type = 'delegation' THEN
    UPDATE public.assignations
       SET employe_id = NEW.to_employe_id, updated_at = now()
     WHERE id = NEW.from_assignation_id;
  ELSE
    -- Échange : on swap les employes des 2 assignations
    UPDATE public.assignations SET employe_id = NEW.to_employe_id, updated_at = now() WHERE id = NEW.from_assignation_id;
    UPDATE public.assignations SET employe_id = NEW.from_employe_id, updated_at = now() WHERE id = NEW.to_assignation_id;
  END IF;

  -- Marquer comme appliquée
  NEW.statut := 'appliquee';
  NEW.appliquee_le := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_swap ON public.swap_requests;
CREATE TRIGGER trg_apply_swap
  BEFORE UPDATE ON public.swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_swap_on_validation();

-- ------------------------------------------------------------
-- Trigger : notifications swap
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_swap_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _from_profile UUID;
  _to_profile UUID;
  _from_emp RECORD;
  _to_emp RECORD;
  _ass RECORD;
  _date_fr TEXT;
  _chef RECORD;
BEGIN
  SELECT prenom, nom, profile_id INTO _from_emp FROM employes WHERE id = NEW.from_employe_id;
  SELECT prenom, nom, profile_id INTO _to_emp FROM employes WHERE id = NEW.to_employe_id;
  _from_profile := _from_emp.profile_id;
  _to_profile := _to_emp.profile_id;
  SELECT a.date, aff.numero, aff.nom AS aff_nom
    INTO _ass
    FROM assignations a
    JOIN affaires aff ON aff.id = a.affaire_id
    WHERE a.id = NEW.from_assignation_id;
  _date_fr := to_char(_ass.date, 'DD/MM/YYYY');

  -- INSERT : notifier le collègue cible
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_notification(
      _to_profile,
      'assignation_modifiee'::notification_type,
      'Demande d''échange de créneau',
      format('%s %s vous propose %s sur %s — %s. À toi de répondre.',
        _from_emp.prenom, _from_emp.nom,
        CASE WHEN NEW.type = 'delegation' THEN 'de prendre son créneau du ' || _date_fr ELSE 'd''échanger un créneau du ' || _date_fr END,
        COALESCE(_ass.numero, '?'), COALESCE(_ass.aff_nom, '')),
      '/mes-swaps',
      jsonb_build_object('swap_id', NEW.id)
    );
    RETURN NEW;
  END IF;

  -- UPDATE : selon transition
  IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
    IF NEW.statut = 'acceptee_collegue' THEN
      -- Notifier l'auteur ET tous les chefs/admins
      PERFORM public.create_notification(
        _from_profile,
        'assignation_modifiee'::notification_type,
        'Échange accepté par le collègue',
        format('%s %s a accepté ton échange du %s. En attente de validation chef.', _to_emp.prenom, _to_emp.nom, _date_fr),
        '/mes-swaps',
        jsonb_build_object('swap_id', NEW.id)
      );
      FOR _chef IN SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin', 'chef_chantier') LOOP
        PERFORM public.create_notification(
          _chef.user_id,
          'assignation_modifiee'::notification_type,
          'Échange à valider',
          format('%s %s ↔ %s %s — créneau du %s à valider.', _from_emp.prenom, _from_emp.nom, _to_emp.prenom, _to_emp.nom, _date_fr),
          '/validation-heures?tab=swaps',
          jsonb_build_object('swap_id', NEW.id)
        );
      END LOOP;
    ELSIF NEW.statut = 'refusee_collegue' THEN
      PERFORM public.create_notification(
        _from_profile,
        'assignation_modifiee'::notification_type,
        'Échange refusé',
        format('%s %s a refusé ton échange du %s.%s', _to_emp.prenom, _to_emp.nom, _date_fr,
          CASE WHEN NEW.collegue_motif IS NOT NULL THEN ' Motif : ' || NEW.collegue_motif ELSE '' END),
        '/mes-swaps',
        jsonb_build_object('swap_id', NEW.id)
      );
    ELSIF NEW.statut IN ('appliquee', 'validee_chef') THEN
      PERFORM public.create_notification(_from_profile, 'assignation_modifiee'::notification_type,
        'Échange validé par le chef',
        format('Ton échange du %s a été validé et appliqué.', _date_fr),
        '/mes-swaps', jsonb_build_object('swap_id', NEW.id));
      PERFORM public.create_notification(_to_profile, 'assignation_modifiee'::notification_type,
        'Échange validé',
        format('L''échange avec %s %s du %s a été validé et appliqué.', _from_emp.prenom, _from_emp.nom, _date_fr),
        '/mes-swaps', jsonb_build_object('swap_id', NEW.id));
    ELSIF NEW.statut = 'rejetee_chef' THEN
      PERFORM public.create_notification(_from_profile, 'assignation_modifiee'::notification_type,
        'Échange rejeté par le chef',
        format('Le chef a rejeté ton échange du %s.%s', _date_fr,
          CASE WHEN NEW.chef_motif IS NOT NULL THEN ' Motif : ' || NEW.chef_motif ELSE '' END),
        '/mes-swaps', jsonb_build_object('swap_id', NEW.id));
      PERFORM public.create_notification(_to_profile, 'assignation_modifiee'::notification_type,
        'Échange rejeté',
        format('Le chef a rejeté l''échange avec %s %s du %s.', _from_emp.prenom, _from_emp.nom, _date_fr),
        '/mes-swaps', jsonb_build_object('swap_id', NEW.id));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_swap ON public.swap_requests;
CREATE TRIGGER trg_notify_swap
  AFTER INSERT OR UPDATE ON public.swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_swap_change();

-- ============================================================
-- FEATURE 2 : CONFIRMATION INTERIMAIRES
-- ============================================================

-- Enum statut confirmation
DO $$ BEGIN
  CREATE TYPE public.confirmation_status AS ENUM (
    'non_requise',
    'en_attente',
    'confirmee',
    'refusee'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Colonnes sur assignations
ALTER TABLE public.assignations
  ADD COLUMN IF NOT EXISTS statut_confirmation confirmation_status NOT NULL DEFAULT 'non_requise',
  ADD COLUMN IF NOT EXISTS confirmee_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refusee_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motif_refus TEXT;

CREATE INDEX IF NOT EXISTS idx_assignations_statut_conf ON public.assignations(statut_confirmation) WHERE statut_confirmation = 'en_attente';

-- ------------------------------------------------------------
-- Trigger : auto-positionner statut_confirmation selon type contrat employé
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_assignation_confirmation_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _type contrat_type;
BEGIN
  SELECT type_contrat INTO _type FROM employes WHERE id = NEW.employe_id;

  IF TG_OP = 'INSERT' THEN
    IF _type IN ('Interim', 'Independant') THEN
      NEW.statut_confirmation := 'en_attente';
    ELSE
      NEW.statut_confirmation := 'non_requise';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.employe_id IS DISTINCT FROM NEW.employe_id THEN
    -- Réassignation à un autre employé : reset confirmation
    IF _type IN ('Interim', 'Independant') THEN
      NEW.statut_confirmation := 'en_attente';
      NEW.confirmee_le := NULL;
      NEW.refusee_le := NULL;
      NEW.motif_refus := NULL;
    ELSE
      NEW.statut_confirmation := 'non_requise';
      NEW.confirmee_le := NULL;
      NEW.refusee_le := NULL;
      NEW.motif_refus := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_confirmation ON public.assignations;
CREATE TRIGGER trg_set_confirmation
  BEFORE INSERT OR UPDATE ON public.assignations
  FOR EACH ROW EXECUTE FUNCTION public.set_assignation_confirmation_status();

-- ------------------------------------------------------------
-- Trigger : notifier l'intérimaire à création + chef à confirmation/refus
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_assignation_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _emp RECORD;
  _aff RECORD;
  _date_fr TEXT;
  _demi TEXT;
  _chef RECORD;
BEGIN
  IF NEW.statut_confirmation = 'non_requise' THEN
    RETURN NEW;
  END IF;

  SELECT prenom, nom, profile_id INTO _emp FROM employes WHERE id = NEW.employe_id;
  SELECT numero, nom INTO _aff FROM affaires WHERE id = NEW.affaire_id;
  _date_fr := to_char(NEW.date, 'DD/MM/YYYY');
  _demi := CASE NEW.demi_journee WHEN 'AM' THEN 'matin' WHEN 'PM' THEN 'après-midi' ELSE 'journée' END;

  -- INSERT en_attente : notifier l'intérimaire
  IF TG_OP = 'INSERT' AND NEW.statut_confirmation = 'en_attente' THEN
    PERFORM public.create_notification(
      _emp.profile_id,
      'assignation_creee'::notification_type,
      'Nouvelle proposition de mission',
      format('Tu es proposé(e) le %s (%s) sur %s — %s. À confirmer.', _date_fr, _demi, COALESCE(_aff.numero, '?'), COALESCE(_aff.nom, '')),
      '/mes-propositions',
      jsonb_build_object('assignation_id', NEW.id)
    );
    RETURN NEW;
  END IF;

  -- UPDATE transition : notifier les chefs
  IF TG_OP = 'UPDATE' AND OLD.statut_confirmation IS DISTINCT FROM NEW.statut_confirmation THEN
    IF NEW.statut_confirmation = 'confirmee' THEN
      FOR _chef IN SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin', 'chef_chantier') LOOP
        PERFORM public.create_notification(
          _chef.user_id,
          'assignation_modifiee'::notification_type,
          'Proposition confirmée',
          format('%s %s a confirmé le créneau du %s sur %s.', _emp.prenom, _emp.nom, _date_fr, COALESCE(_aff.numero, '?')),
          '/planning',
          jsonb_build_object('assignation_id', NEW.id)
        );
      END LOOP;
    ELSIF NEW.statut_confirmation = 'refusee' THEN
      FOR _chef IN SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin', 'chef_chantier') LOOP
        PERFORM public.create_notification(
          _chef.user_id,
          'conflit_staffing'::notification_type,
          'Proposition refusée',
          format('%s %s a refusé le créneau du %s sur %s.%s', _emp.prenom, _emp.nom, _date_fr, COALESCE(_aff.numero, '?'),
            CASE WHEN NEW.motif_refus IS NOT NULL THEN ' Motif : ' || NEW.motif_refus ELSE '' END),
          '/planning',
          jsonb_build_object('assignation_id', NEW.id)
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_confirmation ON public.assignations;
CREATE TRIGGER trg_notify_confirmation
  AFTER INSERT OR UPDATE OF statut_confirmation ON public.assignations
  FOR EACH ROW EXECUTE FUNCTION public.notify_assignation_confirmation();

-- ------------------------------------------------------------
-- Trigger : auto-fill confirmee_le / refusee_le et garde motif_refus
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_assignation_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.statut_confirmation IS DISTINCT FROM NEW.statut_confirmation THEN
    IF NEW.statut_confirmation = 'confirmee' THEN
      NEW.confirmee_le := COALESCE(NEW.confirmee_le, now());
      NEW.refusee_le := NULL;
      NEW.motif_refus := NULL;
    ELSIF NEW.statut_confirmation = 'refusee' THEN
      IF NEW.motif_refus IS NULL OR length(trim(NEW.motif_refus)) = 0 THEN
        RAISE EXCEPTION 'Un motif de refus est obligatoire.' USING ERRCODE = 'check_violation';
      END IF;
      NEW.refusee_le := COALESCE(NEW.refusee_le, now());
      NEW.confirmee_le := NULL;
    ELSIF NEW.statut_confirmation = 'en_attente' THEN
      NEW.confirmee_le := NULL;
      NEW.refusee_le := NULL;
      NEW.motif_refus := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_confirmation ON public.assignations;
CREATE TRIGGER trg_guard_confirmation
  BEFORE UPDATE ON public.assignations
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignation_confirmation();

-- ------------------------------------------------------------
-- Politique UPDATE : permettre à l'employé intérim de modifier
-- uniquement statut_confirmation/motif_refus de SES assignations
-- ------------------------------------------------------------
DROP POLICY IF EXISTS assignations_self_confirm ON public.assignations;
CREATE POLICY assignations_self_confirm ON public.assignations
  FOR UPDATE TO authenticated
  USING (
    employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
    AND statut_confirmation IN ('en_attente', 'confirmee', 'refusee')
  )
  WITH CHECK (
    employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
  );
