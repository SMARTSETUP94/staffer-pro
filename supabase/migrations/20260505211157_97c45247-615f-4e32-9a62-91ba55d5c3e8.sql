-- v0.20.1 Phase 2 — Indexes composites perf
CREATE INDEX IF NOT EXISTS idx_fab_etapes_objet_statut
  ON public.fabrication_etapes (objet_id, statut);

CREATE INDEX IF NOT EXISTS idx_fab_etapes_assignee_statut
  ON public.fabrication_etapes (assignee_id, statut)
  WHERE assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staffing_plan_step_plan_metier
  ON public.staffing_plan_step (plan_id, metier_id);

-- v0.20.1 Phase 4 — Notification "prête à livrer" étendue au CA
CREATE OR REPLACE FUNCTION public.notify_affaire_pret_livraison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _affaire_id uuid;
  _affaire RECORD;
  _objets_ids uuid[];
  _ready boolean;
  _already_notified boolean;
  _destinataires uuid[];
  _user uuid;
BEGIN
  SELECT o.affaire_id INTO _affaire_id
    FROM public.fabrication_objets o WHERE o.id = NEW.objet_id;
  IF _affaire_id IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(o.id) INTO _objets_ids
    FROM public.fabrication_objets o
   WHERE o.affaire_id = _affaire_id AND o.archive = false;

  IF _objets_ids IS NULL OR array_length(_objets_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.fabrication_etapes e
     WHERE e.objet_id = ANY (_objets_ids)
       AND e.type_etape = 'manutention'
       AND e.statut NOT IN ('termine', 'non_applicable')
  ) INTO _ready;

  IF NOT _ready THEN RETURN NEW; END IF;

  -- Garde-fou anti-spam : si la dernière notif date < 24h, skip
  SELECT EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.type = 'fabrication_pret_livraison'
       AND n.metadata->>'affaire_id' = _affaire_id::text
       AND n.created_at > now() - interval '24 hours'
  ) INTO _already_notified;
  IF _already_notified THEN RETURN NEW; END IF;

  SELECT a.numero, a.nom, a.chef_projet_id, a.charge_affaires_id
    INTO _affaire FROM public.affaires a WHERE a.id = _affaire_id;

  -- v0.20.1 — Notif chef projet ET chargé d'affaires (déduplique)
  _destinataires := ARRAY[]::uuid[];
  IF _affaire.chef_projet_id IS NOT NULL THEN
    _destinataires := array_append(_destinataires, _affaire.chef_projet_id);
  END IF;
  IF _affaire.charge_affaires_id IS NOT NULL
     AND _affaire.charge_affaires_id <> ALL(_destinataires) THEN
    _destinataires := array_append(_destinataires, _affaire.charge_affaires_id);
  END IF;

  FOREACH _user IN ARRAY _destinataires LOOP
    PERFORM public.create_notification(
      _user,
      'fabrication_pret_livraison'::public.notification_type,
      'Affaire prête à livrer',
      format('Affaire %s — %s : toutes les étapes manutention sont terminées.',
        COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/affaires/' || _affaire_id::text || '/fabrication',
      jsonb_build_object('affaire_id', _affaire_id)
    );
  END LOOP;

  RETURN NEW;
END;
$function$;