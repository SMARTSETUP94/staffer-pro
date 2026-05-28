-- Fix: retirer section.contrats_rh des rôles poseur et employe
UPDATE public.role_capabilities 
SET granted = false 
WHERE capability = 'section.contrats_rh'
  AND role IN ('poseur', 'employe');