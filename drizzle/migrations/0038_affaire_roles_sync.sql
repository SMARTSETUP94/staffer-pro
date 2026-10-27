DO $$
DECLARE v_smart uuid;
BEGIN
  SELECT id INTO v_smart FROM public.profiles WHERE lower(email) = 'smart@setup.paris';
  IF v_smart IS NULL THEN RAISE EXCEPTION 'Compte smart@setup.paris introuvable'; END IF;
  UPDATE public.employes SET profile_id = NULL
   WHERE id = '87f35983-c9e2-45eb-aa5a-678aed9e59f6' AND profile_id = v_smart;
  UPDATE public.employes SET profile_id = v_smart
   WHERE id = '7b9de5c4-3f3d-4f3d-8608-a533dd0c543d';
END $$;

DO $$
DECLARE v_multi text; v_nonnom text;
BEGIN
  SELECT string_agg(profile_id::text || ' (' || n || ' fiches)', ', ') INTO v_multi
    FROM (SELECT profile_id, count(*) n FROM public.employes
          WHERE profile_id IS NOT NULL GROUP BY profile_id HAVING count(*) > 1) s;
  SELECT string_agg(e.id::text || ' ' || coalesce(e.prenom,'') || ' ' || e.nom, ', ') INTO v_nonnom
    FROM public.employes e
   WHERE e.profile_id IS NOT NULL
     AND (coalesce(trim(e.prenom),'') = ''
          OR e.nom ~* '(smart|restr|setup|log@|devis@|admin|test)');
  IF v_multi IS NOT NULL OR v_nonnom IS NOT NULL THEN
    RAISE EXCEPTION 'Liaison compte/fiche ambiguë. Multiples : % ; non nominatives : %',
      coalesce(v_multi,'aucune'), coalesce(v_nonnom,'aucune');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.affaire_roles_sync_to_affaires()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_profile uuid; v_col text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  v_col := CASE r.role WHEN 'charge_affaires' THEN 'charge_affaires_id'
                       WHEN 'responsable_projet' THEN 'chef_projet_id'
                       WHEN 'concepteur' THEN 'dessinateur_id' END;
  IF v_col IS NULL THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT profile_id INTO v_profile FROM public.employes WHERE id = NEW.employe_id;
  END IF;
  EXECUTE format('UPDATE public.affaires SET %I = $1 WHERE id = $2 AND %I IS DISTINCT FROM $1', v_col, v_col)
    USING v_profile, r.affaire_id;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.affaire_roles_sync_to_affaires() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_affaire_roles_sync ON public.affaire_roles;
CREATE TRIGGER trg_affaire_roles_sync AFTER INSERT OR UPDATE OR DELETE ON public.affaire_roles
  FOR EACH ROW EXECUTE FUNCTION public.affaire_roles_sync_to_affaires();

CREATE OR REPLACE FUNCTION public.affaires_sync_to_affaire_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pair record; v_emp uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  FOR pair IN SELECT * FROM (VALUES
      ('charge_affaires'::public.projet_role, NEW.charge_affaires_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.charge_affaires_id END),
      ('responsable_projet'::public.projet_role, NEW.chef_projet_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.chef_projet_id END),
      ('concepteur'::public.projet_role, NEW.dessinateur_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.dessinateur_id END)
    ) AS t(role, new_p, old_p)
  LOOP
    CONTINUE WHEN TG_OP = 'UPDATE' AND pair.new_p IS NOT DISTINCT FROM pair.old_p;
    IF pair.new_p IS NULL THEN
      -- Choix validé : vider une colonne historique retire le rôle correspondant de l'équipe projet.
      DELETE FROM public.affaire_roles WHERE affaire_id = NEW.id AND role = pair.role;
    ELSE
      v_emp := NULL;
      SELECT id INTO v_emp FROM public.employes WHERE profile_id = pair.new_p
        ORDER BY actif DESC, created_at LIMIT 1;
      IF v_emp IS NOT NULL THEN
        INSERT INTO public.affaire_roles(affaire_id, role, employe_id)
          VALUES (NEW.id, pair.role, v_emp)
        ON CONFLICT (affaire_id, role) DO UPDATE SET employe_id = EXCLUDED.employe_id;
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.affaires_sync_to_affaire_roles() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_affaires_sync_roles ON public.affaires;
CREATE TRIGGER trg_affaires_sync_roles
  AFTER INSERT OR UPDATE OF charge_affaires_id, chef_projet_id, dessinateur_id ON public.affaires
  FOR EACH ROW EXECUTE FUNCTION public.affaires_sync_to_affaire_roles();

INSERT INTO public.affaire_roles(affaire_id, role, employe_id)
SELECT a.id, v.role, e.id
FROM public.affaires a
CROSS JOIN LATERAL (VALUES
  ('charge_affaires'::public.projet_role, a.charge_affaires_id),
  ('responsable_projet'::public.projet_role, a.chef_projet_id),
  ('concepteur'::public.projet_role, a.dessinateur_id)) v(role, profile_id)
JOIN LATERAL (SELECT id FROM public.employes WHERE profile_id = v.profile_id
              ORDER BY actif DESC, created_at LIMIT 1) e ON true
WHERE v.profile_id IS NOT NULL
ON CONFLICT (affaire_id, role) DO NOTHING;