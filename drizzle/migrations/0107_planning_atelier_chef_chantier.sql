CREATE OR REPLACE FUNCTION public.planning_atelier_ecriture_autorisee()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT auth.uid() IS NOT NULL AND auth.jwt()->>'client_id' IS NULL AND (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')
  OR public.has_role(auth.uid(),'atelier_chef') OR public.has_role(auth.uid(),'chef_chantier')); $$;