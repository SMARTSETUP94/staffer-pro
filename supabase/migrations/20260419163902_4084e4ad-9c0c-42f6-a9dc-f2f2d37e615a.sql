-- Enum des types de notifications
CREATE TYPE public.notification_type AS ENUM (
  'assignation_creee',
  'assignation_modifiee',
  'assignation_supprimee',
  'heures_soumises',
  'heures_validees',
  'heures_rejetees',
  'absence_demandee',
  'absence_validee',
  'conflit_staffing',
  'depassement_budget',
  'mention'
);

-- Table notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type public.notification_type NOT NULL,
  titre TEXT NOT NULL,
  message TEXT NOT NULL,
  lien TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  lu BOOLEAN NOT NULL DEFAULT false,
  lu_le TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id, lu, created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_self_select"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_self_update"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_self_delete"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Pas de policy INSERT publique : seuls les triggers SECURITY DEFINER créent

-- Helper : créer une notification
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id UUID,
  _type public.notification_type,
  _titre TEXT,
  _message TEXT,
  _lien TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (user_id, type, titre, message, lien, metadata)
  VALUES (_user_id, _type, _titre, _message, _lien, _metadata)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- ====== TRIGGER 1 : assignations ======
CREATE OR REPLACE FUNCTION public.notify_assignation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id UUID;
  _affaire RECORD;
  _date_fr TEXT;
  _demi TEXT;
BEGIN
  -- Récupérer le profile_id de l'employé
  IF TG_OP = 'DELETE' THEN
    SELECT profile_id INTO _profile_id FROM public.employes WHERE id = OLD.employe_id;
    SELECT numero, nom INTO _affaire FROM public.affaires WHERE id = OLD.affaire_id;
    _date_fr := to_char(OLD.date, 'DD/MM/YYYY');
    _demi := CASE OLD.demi_journee WHEN 'AM' THEN 'matin' WHEN 'PM' THEN 'après-midi' ELSE 'journée' END;
    PERFORM public.create_notification(
      _profile_id,
      'assignation_supprimee'::public.notification_type,
      'Assignation supprimée',
      format('Votre assignation du %s (%s) sur %s — %s a été supprimée.', _date_fr, _demi, COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/mobile/heures',
      jsonb_build_object('affaire_id', OLD.affaire_id, 'date', OLD.date)
    );
    RETURN OLD;
  END IF;

  SELECT profile_id INTO _profile_id FROM public.employes WHERE id = NEW.employe_id;
  SELECT numero, nom INTO _affaire FROM public.affaires WHERE id = NEW.affaire_id;
  _date_fr := to_char(NEW.date, 'DD/MM/YYYY');
  _demi := CASE NEW.demi_journee WHEN 'AM' THEN 'matin' WHEN 'PM' THEN 'après-midi' ELSE 'journée' END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_notification(
      _profile_id,
      'assignation_creee'::public.notification_type,
      'Nouvelle assignation',
      format('Vous êtes assigné le %s (%s) sur %s — %s.', _date_fr, _demi, COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/mobile/heures',
      jsonb_build_object('affaire_id', NEW.affaire_id, 'date', NEW.date, 'assignation_id', NEW.id)
    );
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.affaire_id IS DISTINCT FROM NEW.affaire_id
    OR OLD.date IS DISTINCT FROM NEW.date
    OR OLD.demi_journee IS DISTINCT FROM NEW.demi_journee
    OR OLD.heure_debut IS DISTINCT FROM NEW.heure_debut
    OR OLD.heure_fin IS DISTINCT FROM NEW.heure_fin
  ) THEN
    PERFORM public.create_notification(
      _profile_id,
      'assignation_modifiee'::public.notification_type,
      'Assignation modifiée',
      format('Votre assignation du %s a été modifiée — %s — %s.', _date_fr, COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/mobile/heures',
      jsonb_build_object('affaire_id', NEW.affaire_id, 'date', NEW.date, 'assignation_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_assignation_change
AFTER INSERT OR UPDATE OR DELETE ON public.assignations
FOR EACH ROW EXECUTE FUNCTION public.notify_assignation_change();

-- ====== TRIGGER 2 : heures_saisies (soumission + validation) ======
CREATE OR REPLACE FUNCTION public.notify_heures_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id UUID;
  _employe RECORD;
  _affaire RECORD;
  _date_fr TEXT;
  _chef RECORD;
BEGIN
  SELECT prenom, nom, profile_id INTO _employe FROM public.employes WHERE id = NEW.employe_id;
  SELECT numero, nom INTO _affaire FROM public.affaires WHERE id = NEW.affaire_id;
  _date_fr := to_char(NEW.date, 'DD/MM/YYYY');

  -- Passage à 'soumis' : notifier tous les chefs/admins
  IF (TG_OP = 'INSERT' AND NEW.statut = 'soumis')
     OR (TG_OP = 'UPDATE' AND OLD.statut <> 'soumis' AND NEW.statut = 'soumis') THEN
    FOR _chef IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin', 'chef_chantier')
    LOOP
      PERFORM public.create_notification(
        _chef.user_id,
        'heures_soumises'::public.notification_type,
        'Heures à valider',
        format('%s %s a soumis ses heures du %s sur %s.', _employe.prenom, _employe.nom, _date_fr, COALESCE(_affaire.numero, '?')),
        '/validation-heures',
        jsonb_build_object('heures_id', NEW.id, 'employe_id', NEW.employe_id, 'date', NEW.date)
      );
    END LOOP;
  END IF;

  -- Passage à 'valide' ou 'rejete' : notifier l'employé
  IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
    IF NEW.statut = 'valide' THEN
      PERFORM public.create_notification(
        _employe.profile_id,
        'heures_validees'::public.notification_type,
        'Heures validées',
        format('Vos heures du %s sur %s ont été validées.', _date_fr, COALESCE(_affaire.numero, '?')),
        '/mobile/heures',
        jsonb_build_object('heures_id', NEW.id, 'date', NEW.date)
      );
    ELSIF NEW.statut = 'rejete' THEN
      PERFORM public.create_notification(
        _employe.profile_id,
        'heures_rejetees'::public.notification_type,
        'Heures rejetées',
        format('Vos heures du %s sur %s ont été rejetées. Merci de les corriger.', _date_fr, COALESCE(_affaire.numero, '?')),
        '/mobile/heures',
        jsonb_build_object('heures_id', NEW.id, 'date', NEW.date)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_heures_change
AFTER INSERT OR UPDATE ON public.heures_saisies
FOR EACH ROW EXECUTE FUNCTION public.notify_heures_change();

-- ====== TRIGGER 3 : absences (création employé + validation chef) ======
CREATE OR REPLACE FUNCTION public.notify_absence_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employe RECORD;
  _chef RECORD;
  _periode TEXT;
  _is_self_chef BOOLEAN;
BEGIN
  SELECT prenom, nom, profile_id INTO _employe FROM public.employes WHERE id = NEW.employe_id;
  IF NEW.date_debut = NEW.date_fin THEN
    _periode := to_char(NEW.date_debut, 'DD/MM/YYYY');
  ELSE
    _periode := format('du %s au %s', to_char(NEW.date_debut, 'DD/MM/YYYY'), to_char(NEW.date_fin, 'DD/MM/YYYY'));
  END IF;

  -- Création par un employé (non valide) → notifier chefs
  IF TG_OP = 'INSERT' AND NEW.valide = false THEN
    FOR _chef IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('admin', 'chef_chantier')
    LOOP
      PERFORM public.create_notification(
        _chef.user_id,
        'absence_demandee'::public.notification_type,
        'Demande d''absence',
        format('%s %s a demandé une absence (%s) %s.', _employe.prenom, _employe.nom, NEW.type, _periode),
        '/absences',
        jsonb_build_object('absence_id', NEW.id, 'employe_id', NEW.employe_id)
      );
    END LOOP;
  END IF;

  -- Passage valide=false → true → notifier employé
  IF TG_OP = 'UPDATE' AND OLD.valide = false AND NEW.valide = true THEN
    PERFORM public.create_notification(
      _employe.profile_id,
      'absence_validee'::public.notification_type,
      'Absence validée',
      format('Votre absence (%s) %s a été validée.', NEW.type, _periode),
      '/mobile/profil',
      jsonb_build_object('absence_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_absence_change
AFTER INSERT OR UPDATE ON public.absences
FOR EACH ROW EXECUTE FUNCTION public.notify_absence_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;