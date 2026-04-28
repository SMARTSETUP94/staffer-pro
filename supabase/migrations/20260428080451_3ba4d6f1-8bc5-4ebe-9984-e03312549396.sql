-- v0.21.0 Bloc 5 — Feuille de route : type_operation + est_chef_jour
ALTER TABLE public.assignations
  ADD COLUMN IF NOT EXISTS type_operation text,
  ADD COLUMN IF NOT EXISTS est_chef_jour boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_assignations_chef_jour
  ON public.assignations(affaire_id, date)
  WHERE est_chef_jour = true;

-- Trigger d'unicité : 1 seul est_chef_jour=true par (affaire_id, date)
-- Si on désigne un nouveau chef du jour, le précédent perd son flag.
CREATE OR REPLACE FUNCTION public.enforce_unique_chef_jour()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.est_chef_jour = true THEN
    UPDATE public.assignations
    SET est_chef_jour = false
    WHERE affaire_id = NEW.affaire_id
      AND date = NEW.date
      AND id <> NEW.id
      AND est_chef_jour = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unique_chef_jour ON public.assignations;
CREATE TRIGGER trg_unique_chef_jour
  BEFORE INSERT OR UPDATE OF est_chef_jour, affaire_id, date
  ON public.assignations
  FOR EACH ROW
  WHEN (NEW.est_chef_jour = true)
  EXECUTE FUNCTION public.enforce_unique_chef_jour();