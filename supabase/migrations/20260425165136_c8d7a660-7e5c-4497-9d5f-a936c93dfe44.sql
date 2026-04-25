-- 1. Ajout des 4 flags d'applicabilité
ALTER TABLE public.fabrication_objets
  ADD COLUMN IF NOT EXISTS a_dessiner   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS a_construire boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS est_brut     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS a_emballer   boolean NOT NULL DEFAULT true;

-- 2. Rétro-init : déduire est_brut depuis type_finition pour les objets existants
UPDATE public.fabrication_objets
   SET est_brut = (type_finition = 'aucune'::public.fabrication_finition_type)
 WHERE est_brut = false AND type_finition = 'aucune';

-- 3. Refactor du trigger de création des étapes : se base sur les flags
CREATE OR REPLACE FUNCTION public.create_fabrication_etapes_for_objet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.fabrication_etapes (objet_id, type_etape, statut)
  VALUES
    (NEW.id, 'be',          CASE WHEN NEW.a_dessiner   THEN 'a_faire'::public.fabrication_etape_statut ELSE 'non_applicable'::public.fabrication_etape_statut END),
    (NEW.id, 'respo_fab',   CASE WHEN NEW.a_construire THEN 'a_faire'::public.fabrication_etape_statut ELSE 'non_applicable'::public.fabrication_etape_statut END),
    (NEW.id, 'finition',    CASE WHEN NEW.est_brut     THEN 'non_applicable'::public.fabrication_etape_statut ELSE 'a_faire'::public.fabrication_etape_statut END),
    (NEW.id, 'manutention', CASE WHEN NEW.a_emballer   THEN 'a_faire'::public.fabrication_etape_statut ELSE 'non_applicable'::public.fabrication_etape_statut END);
  RETURN NEW;
END;
$function$;

-- 4. Trigger de synchro flags ↔ étapes sur UPDATE
CREATE OR REPLACE FUNCTION public.sync_fabrication_etapes_on_flags_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- BE
  IF NEW.a_dessiner IS DISTINCT FROM OLD.a_dessiner THEN
    IF NEW.a_dessiner = false THEN
      UPDATE public.fabrication_etapes
         SET statut = 'non_applicable'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'be';
    ELSE
      UPDATE public.fabrication_etapes
         SET statut = 'a_faire'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'be'
         AND statut = 'non_applicable'::public.fabrication_etape_statut;
    END IF;
  END IF;

  -- Respo Fab
  IF NEW.a_construire IS DISTINCT FROM OLD.a_construire THEN
    IF NEW.a_construire = false THEN
      UPDATE public.fabrication_etapes
         SET statut = 'non_applicable'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'respo_fab';
    ELSE
      UPDATE public.fabrication_etapes
         SET statut = 'a_faire'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'respo_fab'
         AND statut = 'non_applicable'::public.fabrication_etape_statut;
    END IF;
  END IF;

  -- Finition (logique inversée : est_brut=true → non_applicable)
  IF NEW.est_brut IS DISTINCT FROM OLD.est_brut THEN
    IF NEW.est_brut = true THEN
      UPDATE public.fabrication_etapes
         SET statut = 'non_applicable'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'finition';
    ELSE
      UPDATE public.fabrication_etapes
         SET statut = 'a_faire'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'finition'
         AND statut = 'non_applicable'::public.fabrication_etape_statut;
    END IF;
  END IF;

  -- Manutention
  IF NEW.a_emballer IS DISTINCT FROM OLD.a_emballer THEN
    IF NEW.a_emballer = false THEN
      UPDATE public.fabrication_etapes
         SET statut = 'non_applicable'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'manutention';
    ELSE
      UPDATE public.fabrication_etapes
         SET statut = 'a_faire'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'manutention'
         AND statut = 'non_applicable'::public.fabrication_etape_statut;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_fabrication_etapes_on_flags_change ON public.fabrication_objets;
CREATE TRIGGER trg_sync_fabrication_etapes_on_flags_change
  AFTER UPDATE ON public.fabrication_objets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_fabrication_etapes_on_flags_change();