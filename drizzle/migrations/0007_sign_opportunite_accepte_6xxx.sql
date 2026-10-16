CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid, _new_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_code text;
  _phase public.affaire_phase;
  _statut public.opportunite_statut;
  _exists boolean;
BEGIN
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'Action réservée : capability action.sign_opportunite requise.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Regex aligné sur le front : fabrication → 6XXX (5XXX épuisés), 4XXX montage/démontage,
  -- 1XXX/3XXX non opérationnel, 2XXXX stockage. 9XXX (prototype) refusé : reste opportunité.
  IF _new_code !~ '^([1-6][0-9]{3}|2[0-9]{4})$' THEN
    RAISE EXCEPTION 'Code affaire invalide. Attendu : 1XXX, 2XXXX, 3XXX, 4XXX, 5XXX ou 6XXX. Reçu : %', _new_code
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT numero, phase, statut_opportunite
    INTO _old_code, _phase, _statut
    FROM public.affaires
   WHERE id = _affaire_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunité introuvable.' USING ERRCODE = 'no_data_found';
  END IF;

  IF _phase <> 'opportunite' THEN
    RAISE EXCEPTION 'Cette affaire n''est pas une opportunité (phase=%).', _phase
      USING ERRCODE = 'check_violation';
  END IF;

  IF _statut <> 'gagne' THEN
    RAISE EXCEPTION 'Seules les opportunités gagnées peuvent être signées.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Anti-collision : un autre affaire ne doit pas déjà porter ce numéro.
  SELECT EXISTS (
    SELECT 1 FROM public.affaires
    WHERE numero = _new_code AND id <> _affaire_id
  ) INTO _exists;
  IF _exists THEN
    RAISE EXCEPTION 'Le code % est déjà utilisé par une autre affaire.', _new_code
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.affaires
     SET numero = _new_code,
         code_opportunite = _old_code,
         phase = 'signe',
         statut_opportunite = NULL,
         statut = 'en_cours',
         signed_at = now(),
         updated_at = now()
   WHERE id = _affaire_id;

  RETURN _affaire_id;
END;
$function$;