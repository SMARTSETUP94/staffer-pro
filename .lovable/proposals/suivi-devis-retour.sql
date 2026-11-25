-- Retour arrière du lot « Suivi des devis »
DROP FUNCTION IF EXISTS public.devis_marquer_envoye(uuid,date,text,text);
DROP FUNCTION IF EXISTS public.devis_signer_version(uuid,date,boolean);
DROP FUNCTION IF EXISTS public.suivi_ecarts_lire();
COMMENT ON COLUMN public.devis.statut IS NULL;
-- puis rejouer tel quel : suivi-devis-actuel-app_modifier_affaire.sql
