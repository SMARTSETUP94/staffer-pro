CREATE OR REPLACE FUNCTION public.guard_swap_no_double_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conflict_id UUID;
BEGIN
  -- Vérifier la from_assignation
  SELECT id INTO _conflict_id
  FROM public.swap_requests
  WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND statut IN ('proposee'::swap_status, 'acceptee_collegue'::swap_status)
    AND (
      from_assignation_id = NEW.from_assignation_id
      OR to_assignation_id = NEW.from_assignation_id
    )
  LIMIT 1;

  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ce créneau est déjà engagé dans une autre demande d''échange en cours (id: %).', _conflict_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Vérifier la to_assignation (si fournie, cas échange)
  IF NEW.to_assignation_id IS NOT NULL THEN
    SELECT id INTO _conflict_id
    FROM public.swap_requests
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND statut IN ('proposee'::swap_status, 'acceptee_collegue'::swap_status)
      AND (
        from_assignation_id = NEW.to_assignation_id
        OR to_assignation_id = NEW.to_assignation_id
      )
    LIMIT 1;

    IF _conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'Le créneau cible est déjà engagé dans une autre demande d''échange en cours (id: %).', _conflict_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_swap_no_double_engagement ON public.swap_requests;

CREATE TRIGGER trg_guard_swap_no_double_engagement
BEFORE INSERT ON public.swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_swap_no_double_engagement();