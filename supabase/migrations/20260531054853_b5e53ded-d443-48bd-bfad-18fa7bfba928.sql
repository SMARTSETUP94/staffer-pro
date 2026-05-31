UPDATE public.role_capabilities
SET granted = true
WHERE capability IN ('inbox_smart.view','candidatures.view','candidatures.manage')
  AND role IN ('admin','rh','chef_chantier');