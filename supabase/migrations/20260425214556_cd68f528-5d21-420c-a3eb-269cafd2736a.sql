-- 1. Ajout valeur enum
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'fabrication_pret_livraison';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'fabrication_assignation';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'affaire_signee';

-- 2. Trigger : notif sur assignation d'étape (assignee_id devient non null ou change)
CREATE OR REPLACE FUNCTION public.notify_fabrication_etape_assignation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _objet RECORD;
  _affaire RECORD;
  _etape_label text;
BEGIN
  -- On notifie uniquement si assignee_id devient non null ou change
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT DISTINCT FROM NEW.assignee_id THEN
    RETURN NEW;
  END IF;
  -- Pas d'auto-notif (si l'assignee est celui qui fait l'action)
  IF NEW.assignee_id = auth.uid() THEN RETURN NEW; END IF;

  SELECT o.reference, o.nom, o.affaire_id INTO _objet
    FROM public.fabrication_objets o WHERE o.id = NEW.objet_id;
  SELECT a.numero, a.nom INTO _affaire
    FROM public.affaires a WHERE a.id = _objet.affaire_id;

  _etape_label := CASE NEW.type_etape
    WHEN 'be' THEN 'BE'
    WHEN 'respo_fab' THEN 'Respo Fab'
    WHEN 'finition' THEN 'Finition'
    WHEN 'manutention' THEN 'Manutention'
    ELSE NEW.type_etape::text
  END;

  PERFORM public.create_notification(
    NEW.assignee_id,
    'fabrication_assignation'::public.notification_type,
    'Nouvelle assignation fabrication',
    format('%s de %s (%s) — affaire %s %s',
      _etape_label, _objet.reference, _objet.nom,
      COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
    '/affaires/' || _objet.affaire_id::text || '/fabrication',
    jsonb_build_object('etape_id', NEW.id, 'objet_id', NEW.objet_id, 'affaire_id', _objet.affaire_id)
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_fabrication_etape_assignation ON public.fabrication_etapes;
CREATE TRIGGER trg_notify_fabrication_etape_assignation
  AFTER INSERT OR UPDATE OF assignee_id ON public.fabrication_etapes
  FOR EACH ROW EXECUTE FUNCTION public.notify_fabrication_etape_assignation();

-- 3. Trigger : notif chef projet + chargé affaires quand affaire prête à livrer
-- (toutes étapes Manutention de tous les objets non archivés sont 'termine' ou 'non_applicable')
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
BEGIN
  -- Déterminer l'affaire concernée
  SELECT o.affaire_id INTO _affaire_id
    FROM public.fabrication_objets o WHERE o.id = NEW.objet_id;
  IF _affaire_id IS NULL THEN RETURN NEW; END IF;

  -- Récupérer tous les objets non archivés de l'affaire
  SELECT array_agg(o.id) INTO _objets_ids
    FROM public.fabrication_objets o
   WHERE o.affaire_id = _affaire_id AND o.archive = false;

  IF _objets_ids IS NULL OR array_length(_objets_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Vérifier que TOUTES les étapes Manutention sont termine ou non_applicable
  SELECT NOT EXISTS (
    SELECT 1 FROM public.fabrication_etapes e
     WHERE e.objet_id = ANY (_objets_ids)
       AND e.type_etape = 'manutention'
       AND e.statut NOT IN ('termine', 'non_applicable')
  ) INTO _ready;

  IF NOT _ready THEN RETURN NEW; END IF;

  -- Garde-fou anti-spam : si la dernière notif fab_pret_livraison de cette affaire date < 24h, on skip
  SELECT EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.type = 'fabrication_pret_livraison'
       AND n.metadata->>'affaire_id' = _affaire_id::text
       AND n.created_at > now() - interval '24 hours'
  ) INTO _already_notified;
  IF _already_notified THEN RETURN NEW; END IF;

  SELECT a.numero, a.nom, a.chef_projet_id, a.charge_affaires_id
    INTO _affaire FROM public.affaires a WHERE a.id = _affaire_id;

  -- Notif chef projet
  IF _affaire.chef_projet_id IS NOT NULL THEN
    PERFORM public.create_notification(
      _affaire.chef_projet_id,
      'fabrication_pret_livraison'::public.notification_type,
      'Affaire prête à livrer',
      format('Affaire %s — %s : toutes les étapes manutention sont terminées.',
        COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/affaires/' || _affaire_id::text || '/fabrication',
      jsonb_build_object('affaire_id', _affaire_id)
    );
  END IF;

  -- Notif chargé d'affaires (si différent du chef projet)
  IF _affaire.charge_affaires_id IS NOT NULL
     AND _affaire.charge_affaires_id IS DISTINCT FROM _affaire.chef_projet_id THEN
    PERFORM public.create_notification(
      _affaire.charge_affaires_id,
      'fabrication_pret_livraison'::public.notification_type,
      'Affaire prête à livrer',
      format('Affaire %s — %s : prête à expédier.',
        COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/affaires/' || _affaire_id::text || '/fabrication',
      jsonb_build_object('affaire_id', _affaire_id)
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_affaire_pret_livraison ON public.fabrication_etapes;
CREATE TRIGGER trg_notify_affaire_pret_livraison
  AFTER INSERT OR UPDATE OF statut ON public.fabrication_etapes
  FOR EACH ROW
  WHEN (NEW.type_etape = 'manutention' AND NEW.statut IN ('termine', 'non_applicable'))
  EXECUTE FUNCTION public.notify_affaire_pret_livraison();

-- 4. Trigger : notif chef projet (ou admins) à la signature d'opportunité 9XXX → 5XXX
CREATE OR REPLACE FUNCTION public.notify_affaire_signee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _admin RECORD;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.phase = NEW.phase OR OLD.phase <> 'opportunite' OR NEW.phase <> 'signe' THEN
    RETURN NEW;
  END IF;

  IF NEW.chef_projet_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.chef_projet_id,
      'affaire_signee'::public.notification_type,
      format('Tu es chef de projet de l''affaire %s', NEW.numero),
      format('Affaire %s — %s signée. Démarre la fabrication.',
        NEW.numero, COALESCE(NEW.nom, '')),
      '/affaires/' || NEW.id::text || '/fabrication',
      jsonb_build_object('affaire_id', NEW.id)
    );
  ELSE
    -- Pas de chef projet → notifier tous les admins
    FOR _admin IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      PERFORM public.create_notification(
        _admin.user_id,
        'affaire_signee'::public.notification_type,
        format('Affaire %s signée — chef de projet à désigner', NEW.numero),
        format('%s — %s', NEW.numero, COALESCE(NEW.nom, '')),
        '/affaires/' || NEW.id::text || '/fabrication',
        jsonb_build_object('affaire_id', NEW.id)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_affaire_signee ON public.affaires;
CREATE TRIGGER trg_notify_affaire_signee
  AFTER UPDATE OF phase ON public.affaires
  FOR EACH ROW EXECUTE FUNCTION public.notify_affaire_signee();