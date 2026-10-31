-- Chefs d'équipe : lecture des devis Staffing limitée aux affaires auxquelles ils ont accès.
CREATE OR REPLACE FUNCTION public.devis_peut_lire(_devis_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM devis d WHERE d.id=_devis_id AND d.redige_dans_staffing AND (
     current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')
     OR (d.affaire_id IS NOT NULL AND current_user_has_capability('devis.view') AND (is_admin() OR user_has_affaire_access(d.affaire_id))))) $function$;