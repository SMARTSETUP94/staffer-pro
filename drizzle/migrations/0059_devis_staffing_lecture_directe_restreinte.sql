-- Les devis rédigés dans Staffing (totaux figés avec coût et marge) ne se lisent directement
-- que par les profils autorisés à voir les coûts ; les autres passent par devis_lire / devis_lister qui masquent ces champs.
CREATE POLICY devis_staffing_lecture_couts ON public.devis
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT redige_dans_staffing OR public.current_user_has_capability('devis.couts'));