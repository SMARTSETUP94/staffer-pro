-- ============================================================================
-- Lot 2 — Refacto liens notifications role-aware
-- ============================================================================

-- 1. Helper resolve_notification_link : reroute selon caps destinataire
CREATE OR REPLACE FUNCTION public.resolve_notification_link(
  _user_id uuid,
  _raw_link text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _qs text := '';
  _path text;
BEGIN
  IF _raw_link IS NULL OR _user_id IS NULL THEN
    RETURN _raw_link;
  END IF;

  -- Extraire querystring/hash
  IF position('?' in _raw_link) > 0 THEN
    _path := split_part(_raw_link, '?', 1);
    _qs := '?' || substring(_raw_link from position('?' in _raw_link) + 1);
  ELSIF position('#' in _raw_link) > 0 THEN
    _path := split_part(_raw_link, '#', 1);
    _qs := '#' || substring(_raw_link from position('#' in _raw_link) + 1);
  ELSE
    _path := _raw_link;
  END IF;

  -- Routes mobiles mortes : remap inconditionnel
  IF _path LIKE '/mobile/heures%' THEN
    RETURN '/mes-heures' || _qs;
  ELSIF _path LIKE '/mobile/contrats%' THEN
    RETURN '/mes-contrats' || _qs;
  ELSIF _path LIKE '/mobile/profil%' THEN
    RETURN '/';
  ELSIF _path LIKE '/mobile/%' THEN
    RETURN '/';
  END IF;

  -- Routes gardées par capacité : downgrade si le destinataire ne peut pas y accéder
  IF _path = '/planning' OR _path LIKE '/planning/%' THEN
    IF public.user_has_capability(_user_id, 'section.planning_fab') THEN
      RETURN _raw_link;
    ELSIF public.user_has_capability(_user_id, 'mobile.mes_missions')
       OR public.user_has_capability(_user_id, 'mes_missions.view') THEN
      RETURN '/mes-missions';
    ELSE
      RETURN '/mes-heures';
    END IF;
  END IF;

  IF _path = '/absences' OR _path LIKE '/absences/%' THEN
    IF public.user_has_capability(_user_id, 'section.equipes') THEN
      RETURN _raw_link;
    ELSE
      RETURN '/';
    END IF;
  END IF;

  IF _path = '/validation-heures' OR _path LIKE '/validation-heures/%' THEN
    IF public.user_has_capability(_user_id, 'action.validate_hours') THEN
      RETURN _raw_link;
    ELSE
      RETURN '/';
    END IF;
  END IF;

  IF _path = '/admin/feedback' OR _path LIKE '/admin/feedback/%' THEN
    IF public.user_has_capability(_user_id, 'admin.feedback.view') THEN
      RETURN _raw_link;
    ELSE
      RETURN '/';
    END IF;
  END IF;

  RETURN _raw_link;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_notification_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_notification_link(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_notification_link(uuid, text) IS
  'Reroute un lien de notification vers une cible accessible par le destinataire (Lot 2 — 28 mai 2026). Couvre /mobile/* morts + downgrade pour caps manquantes (planning, absences, validation-heures, admin/feedback).';

-- 2. Trigger BEFORE INSERT : applique la résolution sur tout nouvel insert
CREATE OR REPLACE FUNCTION public.notifications_resolve_lien()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lien IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    NEW.lien := public.resolve_notification_link(NEW.user_id, NEW.lien);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_resolve_lien ON public.notifications;
CREATE TRIGGER trg_notifications_resolve_lien
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_resolve_lien();

-- 3. Backfill : remettre les ~460 notifs existantes en cohérence
UPDATE public.notifications
SET lien = public.resolve_notification_link(user_id, lien)
WHERE lien IS NOT NULL
  AND (
    lien LIKE '/mobile/%'
    OR lien LIKE '/planning%'
    OR lien LIKE '/absences%'
    OR lien LIKE '/validation-heures%'
    OR lien LIKE '/admin/feedback%'
  );
