ALTER TABLE public.logistique_parametres
  ADD COLUMN IF NOT EXISTS planning_public_jeton_hash text,
  ADD COLUMN IF NOT EXISTS planning_public_jeton_cree_le timestamptz;

CREATE OR REPLACE FUNCTION public.planning_public_lire(_cle text, _semaine int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _debut date; _fin date;
BEGIN
  IF _cle IS NULL OR length(_cle) < 32 OR NOT EXISTS (SELECT 1 FROM logistique_parametres
       WHERE planning_public_jeton_hash = encode(extensions.digest(_cle,'sha256'),'hex')) THEN
    RAISE EXCEPTION 'Lien invalide ou désactivé' USING ERRCODE = '42501';
  END IF;
  IF _semaine IS NULL OR _semaine NOT IN (0,1) THEN RAISE EXCEPTION 'Semaine non autorisée'; END IF;
  _debut := date_trunc('week', (now() AT TIME ZONE 'Europe/Paris'))::date + 7*_semaine;
  _fin := _debut + 6;
  RETURN jsonb_build_object(
    'debut', _debut, 'genere_le', now(),
    'etapes', coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'date',e.date_debut,'fin',coalesce(e.date_fin,e.date_debut),
        'heure',e.heure_debut,'heure_fin',e.heure_fin,'horaire_libre',e.horaire_libre,'type',e.type,'nb_personnes',e.nb_personnes,
        'responsable',e.responsable,'vehicule',coalesce(v.nom,e.immatriculation_libre),'lieu',coalesce(e.lieu_libre,a.lieu),
        'numero',a.numero,'nom',a.nom,'affaire_id',a.id))
      FROM affaire_etapes_logistiques e JOIN affaires a ON a.id=e.affaire_id LEFT JOIN vehicules v ON v.id=e.vehicule_id
      WHERE e.date_debut<=_fin AND coalesce(e.date_fin,e.date_debut)>=_debut AND e.statut<>'annule'),'[]'::jsonb),
    'affectations', coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'employe_id',s.employe_id,'dispos_intervenant_id',s.dispos_intervenant_id,
        'etape_id',s.etape_logistique_id,'date',s.date,'affaire_id',s.affaire_id,'role',s.role_terrain))
      FROM assignations s JOIN affaire_etapes_logistiques e ON e.id=s.etape_logistique_id AND e.statut<>'annule'
      WHERE s.date BETWEEN _debut AND _fin AND s.pole_planning IS NULL),'[]'::jsonb),
    'personnes', coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'nom',e.nom,'prenom',e.prenom,'origine','employe','actif',true,'chef',e.est_chef_equipe_terrain))
      FROM employes e WHERE e.id IN (SELECT employe_id FROM assignations WHERE date BETWEEN _debut AND _fin AND pole_planning IS NULL AND etape_logistique_id IS NOT NULL)),'[]'::jsonb)
    || coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'nom',d.nom,'prenom',d.prenom,'origine','dispos','actif',true,'chef',d.est_chef_equipe_terrain,'dispos_id',d.id))
      FROM dispos_intervenants d WHERE d.employe_id IS NULL AND d.id IN (SELECT dispos_intervenant_id FROM assignations WHERE date BETWEEN _debut AND _fin AND pole_planning IS NULL AND etape_logistique_id IS NOT NULL)),'[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.planning_public_regenerer()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text := encode(extensions.gen_random_bytes(24),'hex');
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('planning_public_regenerer');
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')) THEN RAISE EXCEPTION 'Réservé aux admins et à la logistique'; END IF;
  UPDATE logistique_parametres SET planning_public_jeton_hash = encode(extensions.digest(v,'sha256'),'hex'), planning_public_jeton_cree_le = now() WHERE true;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.planning_public_desactiver()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('planning_public_desactiver');
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')) THEN RAISE EXCEPTION 'Réservé aux admins et à la logistique'; END IF;
  UPDATE logistique_parametres SET planning_public_jeton_hash = NULL, planning_public_jeton_cree_le = NULL WHERE true;
END $$;

CREATE OR REPLACE FUNCTION public.planning_public_etat()
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')) THEN RAISE EXCEPTION 'Réservé aux admins et à la logistique'; END IF;
  RETURN (SELECT planning_public_jeton_cree_le FROM logistique_parametres WHERE planning_public_jeton_hash IS NOT NULL LIMIT 1);
END $$;

REVOKE EXECUTE ON FUNCTION public.planning_public_lire(text,int), public.planning_public_regenerer(),
  public.planning_public_desactiver(), public.planning_public_etat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planning_public_lire(text,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planning_public_regenerer(), public.planning_public_desactiver(), public.planning_public_etat() TO authenticated;