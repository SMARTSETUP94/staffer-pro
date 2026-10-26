ALTER TABLE public.affaires ADD COLUMN dessinateur_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.affaires.dessinateur_id IS 'Dessinateur référent du chantier de fabrication 6XXX ; distinct des responsables BE par objet.';
CREATE INDEX affaires_dessinateur_id_idx ON public.affaires(dessinateur_id) WHERE dessinateur_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid, _new_code text, _chef_projet_id uuid, _dessinateur_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'Action réservée : capability action.sign_opportunite requise.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _dessinateur_id IS NOT NULL AND _new_code !~ '^6[0-9]{3}$' THEN
    RAISE EXCEPTION 'Le dessinateur est réservé aux chantiers Fabrication 6XXX.' USING ERRCODE = 'check_violation';
  END IF;
  v_id := public.sign_opportunite(_affaire_id, _new_code);
  UPDATE public.affaires SET chef_projet_id = _chef_projet_id, dessinateur_id = _dessinateur_id WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sign_opportunite(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_opportunite(uuid,text,uuid,uuid) TO authenticated, service_role;