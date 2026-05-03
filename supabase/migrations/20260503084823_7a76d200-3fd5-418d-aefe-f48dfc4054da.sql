-- v0.35.x — Compétences 4 niveaux par cellule employe x métier
-- Principal reste géré via employes.metier_principal_id (1 seul par employé).
-- employe_metiers stocke désormais le niveau pour les autres métiers : secondaire / depannage / bloque.

CREATE TYPE public.competence_niveau AS ENUM ('secondaire', 'depannage', 'bloque');

ALTER TABLE public.employe_metiers
  ADD COLUMN niveau public.competence_niveau NOT NULL DEFAULT 'secondaire';

-- Les lignes existantes représentaient les "métiers secondaires" : default 'secondaire' OK.

CREATE INDEX IF NOT EXISTS employe_metiers_employe_niveau_idx
  ON public.employe_metiers (employe_id, niveau);
