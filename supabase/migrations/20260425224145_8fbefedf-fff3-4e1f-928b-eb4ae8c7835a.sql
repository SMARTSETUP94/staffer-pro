ALTER TABLE public.heures_saisies
ADD COLUMN IF NOT EXISTS duree_pause_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.heures_saisies.duree_pause_minutes IS
'Durée de pause en minutes, soustraite du calcul automatique heures_reelles = (heure_fin - heure_debut) - duree_pause. La pause n''est PAS retirée des heures de nuit (00h-06h).';

-- Garde-fou : pause >= 0 et < 24h
ALTER TABLE public.heures_saisies
DROP CONSTRAINT IF EXISTS heures_saisies_duree_pause_check;

ALTER TABLE public.heures_saisies
ADD CONSTRAINT heures_saisies_duree_pause_check
CHECK (duree_pause_minutes >= 0 AND duree_pause_minutes < 1440);