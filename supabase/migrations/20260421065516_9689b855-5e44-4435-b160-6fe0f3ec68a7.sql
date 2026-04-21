-- Drop l'ancienne FK et recrée avec ON DELETE CASCADE
ALTER TABLE public.trajets
  DROP CONSTRAINT IF EXISTS trajets_parent_trajet_id_fkey;

ALTER TABLE public.trajets
  ADD CONSTRAINT trajets_parent_trajet_id_fkey
  FOREIGN KEY (parent_trajet_id)
  REFERENCES public.trajets(id)
  ON DELETE CASCADE;