-- 1.2 Flag a_usiner sur fabrication_objets
ALTER TABLE public.fabrication_objets
  ADD COLUMN IF NOT EXISTS a_usiner boolean NOT NULL DEFAULT true;

-- 1.3 Colonnes heures prévues par métier + budget matériaux
ALTER TABLE public.fabrication_objets
  ADD COLUMN IF NOT EXISTS heures_prevues_be numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heures_prevues_numerique numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heures_prevues_bois numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heures_prevues_metal numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heures_prevues_peinture numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heures_prevues_tapisserie numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heures_prevues_manutention numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_materiaux numeric(10,2) NOT NULL DEFAULT 0;

-- 1.4 Heures chantier sur affaires
ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS heures_prevues_montage numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heures_prevues_demontage numeric(8,2) NOT NULL DEFAULT 0;

-- 1.7 Flag rôle profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS est_usinage_numerique boolean NOT NULL DEFAULT false;

-- 1.5 Trigger create_fabrication_etapes_for_objet (mise à jour 5 étapes)
CREATE OR REPLACE FUNCTION public.create_fabrication_etapes_for_objet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.fabrication_etapes (objet_id, type_etape, statut)
  VALUES
    (NEW.id, 'be',          CASE WHEN NEW.a_dessiner   THEN 'a_faire'::public.fabrication_etape_statut ELSE 'non_applicable'::public.fabrication_etape_statut END),
    (NEW.id, 'usinage',     CASE WHEN NEW.a_usiner     THEN 'a_faire'::public.fabrication_etape_statut ELSE 'non_applicable'::public.fabrication_etape_statut END),
    (NEW.id, 'respo_fab',   CASE WHEN NEW.a_construire THEN 'a_faire'::public.fabrication_etape_statut ELSE 'non_applicable'::public.fabrication_etape_statut END),
    (NEW.id, 'finition',    CASE WHEN NEW.est_brut     THEN 'non_applicable'::public.fabrication_etape_statut ELSE 'a_faire'::public.fabrication_etape_statut END),
    (NEW.id, 'manutention', CASE WHEN NEW.a_emballer   THEN 'a_faire'::public.fabrication_etape_statut ELSE 'non_applicable'::public.fabrication_etape_statut END);
  RETURN NEW;
END;
$function$;

-- 1.5 Backfill étape 'usinage' pour les objets existants
INSERT INTO public.fabrication_etapes (objet_id, type_etape, statut)
SELECT o.id, 'usinage'::public.fabrication_etape_type,
       CASE WHEN o.a_usiner THEN 'a_faire'::public.fabrication_etape_statut
            ELSE 'non_applicable'::public.fabrication_etape_statut END
FROM public.fabrication_objets o
WHERE NOT EXISTS (
  SELECT 1 FROM public.fabrication_etapes e
  WHERE e.objet_id = o.id AND e.type_etape = 'usinage'::public.fabrication_etape_type
);

-- 1.6 Trigger sync étendu pour a_usiner
CREATE OR REPLACE FUNCTION public.sync_fabrication_etapes_on_flags_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Usinage Numérique
  IF NEW.a_usiner IS DISTINCT FROM OLD.a_usiner THEN
    IF NEW.a_usiner = false THEN
      UPDATE public.fabrication_etapes
         SET statut = 'non_applicable'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'usinage';
    ELSE
      UPDATE public.fabrication_etapes
         SET statut = 'a_faire'::public.fabrication_etape_statut, updated_at = now()
       WHERE objet_id = NEW.id AND type_etape = 'usinage'
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

-- 1.8 Helper etape_for_metier
CREATE OR REPLACE FUNCTION public.etape_for_metier(metier text)
RETURNS public.fabrication_etape_type
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE metier
    WHEN 'be'          THEN 'be'::public.fabrication_etape_type
    WHEN 'numerique'   THEN 'usinage'::public.fabrication_etape_type
    WHEN 'bois'        THEN 'respo_fab'::public.fabrication_etape_type
    WHEN 'metal'       THEN 'respo_fab'::public.fabrication_etape_type
    WHEN 'peinture'    THEN 'finition'::public.fabrication_etape_type
    WHEN 'tapisserie'  THEN 'finition'::public.fabrication_etape_type
    WHEN 'manutention' THEN 'manutention'::public.fabrication_etape_type
    ELSE NULL
  END;
$function$;