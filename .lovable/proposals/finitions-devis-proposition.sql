-- PROPOSITION UNIQUEMENT — NE PAS APPLIQUER SANS ACCORD EXPLICITE DE GABIN.
-- Finitions des devis, état lu le 24/11/2026. Aucun seed, backfill ni prix saisi.
-- Les INSERT/UPDATE ci-dessous sont dans les fonctions ; leur définition seule ne les exécute pas.

-- 1. CGV versionnées et choix par devis.
ALTER TABLE public.devis ADD COLUMN joindre_cgv boolean NOT NULL DEFAULT true;
CREATE TABLE public.devis_cgv_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_effet date NOT NULL UNIQUE,
  texte text NOT NULL CHECK (length(texte) <= 80000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id)
);
GRANT SELECT ON public.devis_cgv_versions TO authenticated;
GRANT ALL ON public.devis_cgv_versions TO service_role;
ALTER TABLE public.devis_cgv_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY devis_cgv_versions_admin_lecture ON public.devis_cgv_versions
  FOR SELECT TO authenticated USING (public.is_admin());
COMMENT ON COLUMN public.parametres_entreprise.cgv_devis IS
  'DEPRECATED: replaced by devis_cgv_versions; legacy content left untouched.';

-- 2. Journal de confirmation : aucune écriture directe du navigateur ni de Claude.
CREATE TABLE public.devis_controles_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id),
  cible public.devis_redaction_statut NOT NULL,
  empreinte text NOT NULL,
  controles jsonb NOT NULL,
  avertissements_confirmes boolean NOT NULL DEFAULT false,
  confirmation text,
  auteur uuid NOT NULL REFERENCES public.profiles(id),
  source text NOT NULL CHECK (source IN ('application','mcp')),
  transaction_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.devis_controles_journal TO authenticated;
GRANT ALL ON public.devis_controles_journal TO service_role;
ALTER TABLE public.devis_controles_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY devis_controles_journal_lecture ON public.devis_controles_journal
  FOR SELECT TO authenticated USING (public.devis_peut_lire(devis_id));
CREATE INDEX devis_controles_journal_devis ON public.devis_controles_journal(devis_id,created_at DESC);

-- 3. Historique des prix ajoutés aux articles déjà actifs mais sans prix.
CREATE TABLE public.materiaux_prix_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  materiau_id uuid NOT NULL REFERENCES public.materiaux_catalogue(id),
  ancien_prix numeric,
  nouveau_prix numeric NOT NULL CHECK (nouveau_prix > 0),
  ancienne_date_tarif date,
  nouvelle_date_tarif date NOT NULL,
  auteur uuid NOT NULL REFERENCES public.profiles(id),
  lot_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.materiaux_prix_historique TO authenticated;
GRANT ALL ON public.materiaux_prix_historique TO service_role;
ALTER TABLE public.materiaux_prix_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY materiaux_prix_historique_admin_lecture ON public.materiaux_prix_historique
  FOR SELECT TO authenticated USING (public.is_admin() AND auth.jwt()->>'client_id' IS NULL);
CREATE INDEX materiaux_prix_historique_article ON public.materiaux_prix_historique(materiau_id,created_at DESC);

CREATE FUNCTION public.devis_cgv_enregistrer(_texte text,_date_effet date,_confirmer_passe boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('devis');
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accès admin uniquement' USING ERRCODE='42501'; END IF;
  IF _date_effet IS NULL OR _texte IS NULL OR length(_texte)>80000 THEN RAISE EXCEPTION 'Texte ou date invalide'; END IF;
  IF _date_effet<current_date AND NOT _confirmer_passe THEN RAISE EXCEPTION 'Confirmez la date d''effet passée'; END IF;
  INSERT INTO public.devis_cgv_versions(date_effet,texte,created_by)
    VALUES(_date_effet,_texte,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public.devis_cgv_enregistrer(text,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.devis_cgv_enregistrer(text,date,boolean) TO authenticated,service_role;

CREATE FUNCTION public.devis_joindre_cgv_modifier(_devis_id uuid,_joindre boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  PERFORM public.devis_assert_ecriture(_devis_id);
  IF _joindre IS NULL THEN RAISE EXCEPTION 'Choix CGV obligatoire'; END IF;
  UPDATE public.devis SET joindre_cgv=_joindre,updated_at=now() WHERE id=_devis_id;
END $function$;
REVOKE ALL ON FUNCTION public.devis_joindre_cgv_modifier(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.devis_joindre_cgv_modifier(uuid,boolean) TO authenticated,service_role;

-- Lecteur de contrôles : expose uniquement anomalies et identifiants, jamais coûts/marges.
CREATE FUNCTION public.devis_controles_lire(_devis_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE d public.devis; c public.clients; calc jsonb; points jsonb:='[]'; p record; v_date date; resultat jsonb;
BEGIN
  IF NOT public.devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM public.devis WHERE id=_devis_id;
  SELECT * INTO c FROM public.clients WHERE id=d.client_id;
  calc:=public.devis_calculer_interne(_devis_id);
  v_date:=coalesce(d.date_validite,d.date_devis+d.validite_jours);
  IF coalesce((calc->>'total_ht')::numeric,0)<=0 THEN
    points:=points||jsonb_build_array(jsonb_build_object('code','TOTAL_NON_POSITIF','niveau','bloquant','cible','totaux','message','Total HT inférieur ou égal à 0 €'));
  END IF;
  IF d.client_id IS NULL THEN
    points:=points||jsonb_build_array(jsonb_build_object('code','CLIENT_ABSENT','niveau','bloquant','cible','client','message','Client facturé absent'));
  ELSE
    IF nullif(trim(c.email),'') IS NULL THEN
      points:=points||jsonb_build_array(jsonb_build_object('code','CLIENT_EMAIL','niveau','avertissement','cible','client','message','Client sans e-mail'));
    END IF;
    IF nullif(trim(c.adresse),'') IS NULL OR nullif(trim(c.code_postal),'') IS NULL OR nullif(trim(c.ville),'') IS NULL THEN
      points:=points||jsonb_build_array(jsonb_build_object('code','CLIENT_ADRESSE','niveau','avertissement','cible','client','message','Adresse client incomplète'));
    END IF;
  END IF;
  IF v_date<current_date THEN
    points:=points||jsonb_build_array(jsonb_build_object('code','VALIDITE_PASSEE','niveau','bloquant','cible','dates','message','Date de validité passée'));
  END IF;
  IF d.contact_id IS NULL THEN
    points:=points||jsonb_build_array(jsonb_build_object('code','CONTACT_ABSENT','niveau','avertissement','cible','contact','message','Aucun contact choisi'));
  END IF;
  IF nullif(trim(d.signataire_prenom),'') IS NULL OR nullif(trim(d.signataire_nom),'') IS NULL
     OR nullif(trim(d.signataire_email),'') IS NULL OR nullif(trim(d.signataire_telephone),'') IS NULL THEN
    points:=points||jsonb_build_array(jsonb_build_object('code','SIGNATAIRE_INCOMPLET','niveau','avertissement','cible','signataire','message','Signataire incomplet'));
  END IF;
  -- Même somme récursive que prixLignes : montants propres calculés, pas de revalorisation.
  FOR p IN
    WITH RECURSIVE actifs AS (
      SELECT l.* FROM public.devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL
    ), arbre AS (
      SELECT l.id AS racine,l.id,coalesce((calc->'lignes'->>l.id::text)::numeric,0) AS montant
      FROM actifs l WHERE l.type IN ('objet','option')
      UNION ALL
      SELECT a.racine,l.id,coalesce((calc->'lignes'->>l.id::text)::numeric,0)
      FROM arbre a JOIN actifs l ON l.parent_id=a.id
      WHERE l.type<>'commentaire' AND NOT(l.type='option' AND NOT coalesce(l.option_incluse,false))
    )
    SELECT l.id,l.libelle,l.type,coalesce(sum(a.montant),0) AS montant
      FROM actifs l JOIN arbre a ON a.racine=l.id GROUP BY l.id,l.libelle,l.type HAVING coalesce(sum(a.montant),0)=0
    ORDER BY l.id
  LOOP
    points:=points||jsonb_build_array(jsonb_build_object('code','LIGNE_ZERO','niveau','avertissement','cible','ligne','ligne_id',p.id,'message',coalesce(p.libelle,p.type::text)||' : 0 € HT'));
  END LOOP;
  FOR p IN SELECT l.id,l.libelle FROM public.devis_lignes l
    WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND l.type<>'commentaire'
      AND nullif(trim(l.descriptif_client),'') IS NULL ORDER BY l.ordre,l.id
  LOOP
    points:=points||jsonb_build_array(jsonb_build_object('code','DESCRIPTIF_ABSENT','niveau','avertissement','cible','ligne','ligne_id',p.id,'message',coalesce(p.libelle,'Ligne')||' : descriptif client absent'));
  END LOOP;
  FOR p IN
    SELECT m.id,m.ligne_id,m.designation FROM public.devis_materiaux m
    JOIN public.devis_lignes l ON l.id=m.ligne_id LEFT JOIN public.materiaux_catalogue cat ON cat.id=m.materiau_id
    WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND m.supprime_le IS NULL
      AND (coalesce(m.prix_achat,0)=0 OR (m.materiau_id IS NOT NULL AND coalesce(cat.prix_achat_net,0)=0)) ORDER BY m.id
  LOOP
    points:=points||jsonb_build_array(jsonb_build_object('code','MATIERE_SANS_PRIX','niveau','avertissement','cible','ligne','ligne_id',p.ligne_id,'materiau_id',p.id,'message',coalesce(p.designation,'Matière')||' : prix absent ou nul'));
  END LOOP;
  FOR p IN SELECT f.id,f.ligne_id,f.designation FROM public.devis_lignes_libres f
    JOIN public.devis_lignes l ON l.id=f.ligne_id WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND f.supprime_le IS NULL
    AND ((f.categorie='forfait' OR f.forfait_cle IS NOT NULL) AND f.prix_forfait IS NULL
      OR coalesce(f.prix_forfait,f.prix_achat*f.coefficient,0)=0) ORDER BY f.id
  LOOP
    points:=points||jsonb_build_array(jsonb_build_object('code','ARTICLE_SANS_PRIX','niveau','avertissement','cible','ligne','ligne_id',p.ligne_id,'libre_id',p.id,'message',coalesce(p.designation,'Article')||' : prix absent ou nul'));
  END LOOP;
  FOR p IN SELECT l.id,l.libelle FROM public.devis_lignes l
    WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND l.type='option'
      AND coalesce((calc->'lignes'->>l.id::text)::numeric,0)=0
      AND NOT EXISTS(WITH RECURSIVE enfants AS (
        SELECT k.id,k.type FROM public.devis_lignes k WHERE k.parent_id=l.id AND k.supprime_le IS NULL
        UNION ALL SELECT k.id,k.type FROM enfants e JOIN public.devis_lignes k ON k.parent_id=e.id WHERE k.supprime_le IS NULL
      ) SELECT 1 FROM enfants WHERE type='objet') ORDER BY l.id
  LOOP
    points:=points||jsonb_build_array(jsonb_build_object('code','OPTION_VIDE','niveau','avertissement','cible','ligne','ligne_id',p.id,'message',coalesce(p.libelle,'Option')||' : aucun objet ni prix'));
  END LOOP;
  resultat:=jsonb_build_object('points',points,
    'bloquants',(SELECT count(*) FROM jsonb_array_elements(points) x WHERE x->>'niveau'='bloquant'),
    'avertissements',(SELECT count(*) FROM jsonb_array_elements(points) x WHERE x->>'niveau'='avertissement'));
  RETURN resultat||jsonb_build_object('empreinte',md5(resultat::text||calc::text||coalesce(d.updated_at::text,'')||current_date::text));
END $function$;
REVOKE ALL ON FUNCTION public.devis_controles_lire(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.devis_controles_lire(uuid) TO authenticated,service_role;

-- Helper non appelable : consentement lié au résultat lu et à la transaction courante.
CREATE FUNCTION public.devis_controles_accepter_interne(_devis_id uuid,_cible public.devis_redaction_statut,_confirmer boolean,_empreinte text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE controles jsonb;
BEGIN
  PERFORM 1 FROM public.devis WHERE id=_devis_id FOR UPDATE;
  controles:=public.devis_controles_lire(_devis_id);
  IF (controles->>'bloquants')::int>0 THEN RAISE EXCEPTION 'Contrôles bloquants' USING DETAIL=controles::text; END IF;
  IF controles->>'empreinte' IS DISTINCT FROM _empreinte THEN RAISE EXCEPTION 'Le devis a changé : relisez les contrôles'; END IF;
  IF (controles->>'avertissements')::int>0 AND NOT coalesce(_confirmer,false) THEN
    RAISE EXCEPTION 'Confirmez les avertissements' USING DETAIL=controles::text;
  END IF;
  INSERT INTO public.devis_controles_journal(devis_id,cible,empreinte,controles,avertissements_confirmes,confirmation,auteur,source,transaction_id)
  VALUES(_devis_id,_cible,_empreinte,controles,(controles->>'avertissements')::int>0,
    CASE WHEN (controles->>'avertissements')::int>0 THEN 'je confirme' END,auth.uid(),
    CASE WHEN auth.jwt()->>'client_id' IS NOT NULL THEN 'mcp' ELSE 'application' END,txid_current());
END $function$;
REVOKE ALL ON FUNCTION public.devis_controles_accepter_interne(uuid,public.devis_redaction_statut,boolean,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.devis_controles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE controles jsonb;
BEGIN
  IF NEW.statut_redaction IS DISTINCT FROM OLD.statut_redaction
    AND OLD.statut_redaction IN ('brouillon','a_valider') AND NEW.statut_redaction IN ('a_valider','valide') THEN
    controles:=public.devis_controles_lire(OLD.id);
    IF (controles->>'bloquants')::int>0 THEN RAISE EXCEPTION 'Contrôles bloquants' USING DETAIL=controles::text; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.devis_controles_journal j WHERE j.devis_id=OLD.id
      AND j.cible=NEW.statut_redaction AND j.auteur=auth.uid() AND j.transaction_id=txid_current()
      AND j.empreinte=controles->>'empreinte'
      AND ((controles->>'avertissements')::int=0 OR j.avertissements_confirmes)) THEN
      IF (controles->>'avertissements')::int>0 THEN RAISE EXCEPTION 'Confirmez les avertissements avant de poursuivre' USING DETAIL=controles::text; END IF;
      INSERT INTO public.devis_controles_journal(devis_id,cible,empreinte,controles,auteur,source,transaction_id)
      VALUES(OLD.id,NEW.statut_redaction,controles->>'empreinte',controles,auth.uid(),
        CASE WHEN auth.jwt()->>'client_id' IS NOT NULL THEN 'mcp' ELSE 'application' END,txid_current());
    END IF;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.devis_controles_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER devis_controles_avant_transition BEFORE UPDATE OF statut_redaction ON public.devis
FOR EACH ROW EXECUTE FUNCTION public.devis_controles_guard();

CREATE FUNCTION public.devis_finaliser(_devis_id uuid,_confirmer_avertissements boolean,_empreinte_controles text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  PERFORM public.devis_assert_ecriture(_devis_id,false);
  IF NOT public.devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits de validation insuffisants' USING ERRCODE='42501'; END IF;
  PERFORM public.devis_controles_accepter_interne(_devis_id,'valide',_confirmer_avertissements,_empreinte_controles);
  PERFORM public.devis_statut_changer(_devis_id,'valide');
END $function$;
REVOKE ALL ON FUNCTION public.devis_finaliser(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.devis_finaliser(uuid,boolean,text) TO authenticated,service_role;

CREATE FUNCTION public.devis_soumettre(_devis_id uuid,_note text,_confirmer_avertissements boolean,_empreinte_controles text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  PERFORM public.devis_assert_ecriture(_devis_id);
  IF _confirmer_avertissements AND auth.jwt()->>'client_id' IS NOT NULL
     AND coalesce(_note,'') NOT ILIKE '%je confirme%' THEN
    RAISE EXCEPTION 'La note doit conserver la confirmation humaine « je confirme »';
  END IF;
  PERFORM public.devis_controles_accepter_interne(_devis_id,'a_valider',_confirmer_avertissements,_empreinte_controles);
  PERFORM public.devis_statut_changer(_devis_id,'a_valider');
  PERFORM set_config('app.devis_rpc','on',true);
  PERFORM public.devis_note_fusionner(_devis_id,_note);
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_redaction','a_valider');
END $function$;
REVOKE ALL ON FUNCTION public.devis_soumettre(uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.devis_soumettre(uuid,text,boolean,text) TO authenticated,service_role;

-- Ancienne signature conservée, sans possibilité de valider implicitement des avertissements.
CREATE OR REPLACE FUNCTION public.devis_soumettre(_devis_id uuid,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE controles jsonb;
BEGIN
  PERFORM public.devis_assert_ecriture(_devis_id);
  controles:=public.devis_controles_lire(_devis_id);
  RETURN public.devis_soumettre(_devis_id,_note,false,controles->>'empreinte');
END $function$;

-- Reader admin dédié, pagination déterministe, champs explicites.
CREATE FUNCTION public.materiaux_sans_prix_lire(_recherche text DEFAULT '',_famille text DEFAULT NULL,_limit int DEFAULT 50,_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE resultat jsonb;
BEGIN
  IF NOT public.is_admin() OR auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Accès admin dans l''application uniquement' USING ERRCODE='42501'; END IF;
  WITH filtres AS (
    SELECT c.id,c.produit,c.famille,c.ref,c.unite,c.prix_achat_net,c.date_tarif,f.nom AS fournisseur
    FROM public.materiaux_catalogue c LEFT JOIN public.fournisseurs_tarifs f ON f.id=c.fournisseur_id
    WHERE c.actif AND coalesce(c.prix_achat_net,0)=0
      AND (_famille IS NULL OR c.famille=_famille)
      AND (coalesce(_recherche,'')='' OR concat_ws(' ',c.produit,c.ref,f.nom) ILIKE '%'||_recherche||'%')
  ), page AS (SELECT * FROM filtres ORDER BY produit,id LIMIT least(greatest(_limit,1),100) OFFSET greatest(_offset,0))
  SELECT jsonb_build_object('total',(SELECT count(*) FROM filtres),'lignes',coalesce(jsonb_agg(to_jsonb(page) ORDER BY produit,id),'[]')) INTO resultat FROM page;
  RETURN resultat;
END $function$;
REVOKE ALL ON FUNCTION public.materiaux_sans_prix_lire(text,text,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.materiaux_sans_prix_lire(text,text,int,int) TO authenticated,service_role;

CREATE FUNCTION public.materiaux_sans_prix_enregistrer(_changements jsonb,_date_tarif date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE x jsonb; c public.materiaux_catalogue; n numeric; v_lot uuid:=gen_random_uuid(); v_nb int:=0;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('devis');
  IF NOT public.is_admin() OR auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Accès admin dans l''application uniquement' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_changements) IS DISTINCT FROM 'array' OR jsonb_array_length(_changements) NOT BETWEEN 1 AND 500 OR _date_tarif IS NULL THEN
    RAISE EXCEPTION 'Lot de prix invalide'; END IF;
  IF (SELECT count(DISTINCT z->>'id') FROM jsonb_array_elements(_changements) z)<>jsonb_array_length(_changements) THEN RAISE EXCEPTION 'Article répété dans le lot'; END IF;
  -- Tous les verrous sont pris dans le même ordre, quel que soit l'ordre des cellules.
  PERFORM 1 FROM public.materiaux_catalogue WHERE id IN (SELECT (z->>'id')::uuid FROM jsonb_array_elements(_changements) z) ORDER BY id FOR UPDATE;
  FOR x IN SELECT z FROM jsonb_array_elements(_changements) z ORDER BY z->>'id' LOOP
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('id','ancien_prix','prix'))
      OR NOT x ? 'ancien_prix' OR NOT x ? 'prix' THEN RAISE EXCEPTION 'Champs de prix invalides'; END IF;
    SELECT * INTO c FROM public.materiaux_catalogue WHERE id=(x->>'id')::uuid;
    IF NOT FOUND OR NOT c.actif OR coalesce(c.prix_achat_net,0)<>0 THEN RAISE EXCEPTION 'Article absent, inactif ou déjà chiffré'; END IF;
    IF c.prix_achat_net IS DISTINCT FROM (x->>'ancien_prix')::numeric THEN RAISE EXCEPTION 'Le prix a changé : relisez le récapitulatif'; END IF;
    n:=(x->>'prix')::numeric;
    IF n IS NULL OR n<=0 OR n::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Prix d''achat strictement positif attendu'; END IF;
    INSERT INTO public.materiaux_prix_historique(materiau_id,ancien_prix,nouveau_prix,ancienne_date_tarif,nouvelle_date_tarif,auteur,lot_id)
    VALUES(c.id,c.prix_achat_net,n,c.date_tarif,_date_tarif,auth.uid(),v_lot);
    UPDATE public.materiaux_catalogue SET prix_achat_net=n,date_tarif=_date_tarif WHERE id=c.id;
    v_nb:=v_nb+1;
  END LOOP;
  RETURN jsonb_build_object('lot_id',v_lot,'enregistres',v_nb);
END $function$;
REVOKE ALL ON FUNCTION public.materiaux_sans_prix_enregistrer(jsonb,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.materiaux_sans_prix_enregistrer(jsonb,date) TO authenticated,service_role;

-- Redéfinitions complètes, autres règles conservées.
CREATE OR REPLACE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_calc jsonb;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF d.est_modele THEN RAISE EXCEPTION 'Un modèle n''a pas de statut'; END IF;
  IF _statut='a_valider' AND d.statut_redaction='brouillon' THEN
    UPDATE devis SET statut_redaction='a_valider', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='brouillon' AND d.statut_redaction='a_valider' THEN
    UPDATE devis SET statut_redaction='brouillon', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='valide' AND d.statut_redaction IN ('brouillon','a_valider') THEN
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Validation réservée au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
    -- Les forfaits sans prix sont désormais des avertissements confirmables, contrôlés par le trigger commun.
    v_calc := devis_calculer_interne(_devis_id);
    INSERT INTO devis_snapshot_couts(devis_id, cout_total, marge, fige_le, detail)
      VALUES (_devis_id, (v_calc->>'cout_total')::numeric, v_calc->'marge', now(),
              jsonb_build_object('decomposition',v_calc->'decomposition','marge_pct',v_calc->'marge_pct',
                                 'cout_complet',v_calc->'cout_complet','couts_manquants',v_calc->'couts_manquants','net_ht',v_calc->'net_ht'))
      ON CONFLICT (devis_id) DO UPDATE SET cout_total=EXCLUDED.cout_total, marge=EXCLUDED.marge, fige_le=EXCLUDED.fige_le, detail=EXCLUDED.detail;
    UPDATE devis SET statut_redaction='valide', valide_par=auth.uid(), valide_le=now(),
      totaux_snapshot=v_calc - 'cout_total' - 'marge' - 'cout_complet' - 'marge_pct' - 'decomposition' - 'couts_manquants',
      montant_ht=coalesce((v_calc->>'net_ht')::numeric,(v_calc->>'total_ht')::numeric),
      dates_snapshot=(SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
         'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
         'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id),
      updated_at=now()
    WHERE id=_devis_id;
  ELSIF _statut='refuse' AND d.statut_redaction IN ('a_valider','valide','transfere') THEN
    IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Refus réservé à l''application' USING ERRCODE='42501'; END IF;
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
    UPDATE devis SET statut_redaction='refuse', updated_at=now() WHERE id=_devis_id;
  ELSE
    RAISE EXCEPTION 'Transition non autorisée : % → %', d.statut_redaction, _statut;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_lire_client(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_calc jsonb; v_dates jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id;
  v_calc := coalesce(d.totaux_snapshot, devis_calculer_interne(_devis_id));
  v_dates := coalesce(d.dates_snapshot, (SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
      'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
      'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id));
  RETURN jsonb_build_object(
    'id',d.id,'version',d.version,'statut_redaction',d.statut_redaction,
    'numero',d.numero,'libelle',d.libelle,'date_devis',d.date_devis,'validite_jours',d.validite_jours,
    'date_validite',coalesce(v_dates->>'date_validite',d.date_validite::text),
    'societe',(SELECT jsonb_build_object('raison_sociale',raison_sociale,'marque',marque_commerciale,'adresse',adresse_ligne1,'code_postal',code_postal,'ville',ville,'siret',siret,'email',employeur_email_contact) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'chantier',jsonb_build_object('adresse',d.chantier_adresse,'travaux',d.travaux_libelle,'debut',d.travaux_debut,'duree_jours',d.travaux_duree_jours),
    'signataire',CASE WHEN nullif(trim(d.signataire_prenom),'') IS NOT NULL AND nullif(trim(d.signataire_nom),'') IS NOT NULL AND nullif(trim(d.signataire_email),'') IS NOT NULL THEN jsonb_build_object('nom',trim(d.signataire_prenom)||' '||trim(d.signataire_nom),'email',d.signataire_email,'telephone',d.signataire_telephone) ELSE NULL END,
    'mentions_legales',(SELECT jsonb_build_object('forme',forme_sociale,'capital',capital_social_euros::text||' €','telephone',telephone,'email',employeur_email_contact,'ape',naf,'tva',tva_intracom,'iban',iban,'bic',bic) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'mentions_devis',(SELECT mentions_devis FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'joindre_cgv',d.joindre_cgv,
    'cgv',CASE WHEN d.joindre_cgv THEN (SELECT v.texte FROM public.devis_cgv_versions v WHERE v.date_effet<=d.date_devis ORDER BY v.date_effet DESC LIMIT 1) ELSE NULL END,
    'cgv_date_effet',CASE WHEN d.joindre_cgv THEN (SELECT v.date_effet FROM public.devis_cgv_versions v WHERE v.date_effet<=d.date_devis ORDER BY v.date_effet DESC LIMIT 1) ELSE NULL END,
    'logo_storage_path',(SELECT logo_storage_path FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'reglement',(SELECT jsonb_build_object('mode',mode_reglement,'acompte_pct',acompte_pct,'delai_jours',delai_reglement_jours) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'client',(SELECT jsonb_build_object('nom',nom,'adresse',adresse,'code_postal',code_postal,'ville',ville,'siret',siret,'tva_intracom',tva_intracom) FROM clients WHERE id=d.client_id),
    'client_final',(SELECT nom FROM clients WHERE id=d.client_final_id),
    'interlocuteur',(SELECT jsonb_build_object('nom',trim(coalesce(e.prenom,'')||' '||coalesce(e.nom,'')),
        'email',CASE WHEN lower(p.email) LIKE '%@setup.paris' THEN lower(p.email) WHEN lower(e.email) LIKE '%@setup.paris' THEN lower(e.email) END)
      FROM affaire_roles r JOIN employes e ON e.id=r.employe_id LEFT JOIN profiles p ON p.id=e.profile_id
      WHERE r.affaire_id=d.affaire_id AND r.role='charge_affaires' LIMIT 1),
    'contact',(SELECT jsonb_build_object('nom',coalesce(c.prenom||' ','')||coalesce(c.nom,''),'email',c.email) FROM client_contacts c WHERE c.id=d.contact_id),
    'dates', v_dates,
    'lignes',(WITH RECURSIVE anc AS (
        SELECT l.id, l.id AS a FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL
        UNION ALL SELECT anc.id, p.parent_id FROM anc JOIN devis_lignes p ON p.id=anc.a WHERE p.parent_id IS NOT NULL),
      vis AS (SELECT DISTINCT anc.a FROM anc WHERE v_calc->'lignes' ? anc.id::text)
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'parent_id',l.parent_id,'type',l.type,'ordre',l.ordre,'libelle',l.libelle,
        'quantite',l.quantite,'descriptif_client',l.descriptif_client,'longueur_mm',l.longueur_mm,'largeur_mm',l.largeur_mm,'hauteur_mm',l.hauteur_mm,
        'finition',l.finition,'texte',l.texte,'option_incluse',l.option_incluse,'montant',(v_calc->'lignes'->>l.id::text)::numeric,'sous_total',(v_calc->'racines'->>l.id::text)::numeric) ORDER BY l.ordre),'[]')
      FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND NOT (l.type='commentaire' AND l.interne) AND (l.type='commentaire' OR l.id IN (SELECT vis.a FROM vis))),
    'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('ligne_id',p.ligne_id,'storage_path',p.storage_path,'thumb_path',p.thumb_path,'legende',p.legende,'mime',p.mime) ORDER BY p.ordre),'[]') FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL AND p.visible_client),
    'total_ht',v_calc->'total_ht','remise',coalesce(v_calc->'remise','0'::jsonb),'net_ht',coalesce(v_calc->'net_ht',v_calc->'total_ht'),'tva',v_calc->'tva','tva_pct',v_calc->'tva_pct','ttc',v_calc->'ttc','options_ht',v_calc->'options_ht');
END $function$;

CREATE OR REPLACE FUNCTION public.devis_nouvelle_version(_devis_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; v_version int; v_id uuid;
BEGIN
 PERFORM devis_assert_ecriture(_devis_id,false);
 SELECT * INTO s FROM devis WHERE id=_devis_id;
 IF s.est_modele THEN RAISE EXCEPTION 'Un modèle ne se versionne pas'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||s.affaire_id::text));
 SELECT * INTO s FROM devis WHERE id=_devis_id FOR UPDATE;
 IF s.supprime_le IS NOT NULL THEN RAISE EXCEPTION 'Devis supprimé : restaurez-le avant d''en créer une version'; END IF;
 SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=s.affaire_id AND redige_dans_staffing AND NOT est_modele;
 INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,version_precedente_id,statut_redaction,client_id,contact_id,client_final_id,date_devis,validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id,remise_mode,remise_valeur,joindre_cgv)
 VALUES(s.affaire_id,regexp_replace(s.numero,'-R\d+$','')||'-R'||v_version,s.libelle,'brouillon',true,v_version,s.id,'brouillon',s.client_id,s.contact_id,s.client_final_id,current_date,s.validite_jours,s.tva_pct,s.coef_materiaux_defaut,s.modele_origine_id,auth.uid(),s.remise_mode,s.remise_valeur,s.joindre_cgv) RETURNING id INTO v_id;
 PERFORM devis_copier_sous_arbre(_devis_id,v_id,NULL,NULL,false);
 IF s.statut_redaction NOT IN ('signe','remplace') THEN
  UPDATE devis SET statut_redaction='remplace',updated_at=now() WHERE id=_devis_id;
 END IF;
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_mcp_appliquer(_tool text, _p jsonb, _affaire_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE etat jsonb; ex jsonb; v_id uuid; v_modele uuid; v_mode text := coalesce(_p->>'mode',''); k text; patch jsonb; dates jsonb := '{}'::jsonb; entete jsonb := '{}'::jsonb;
BEGIN
  IF v_mode NOT IN ('autonomie','conversation') THEN RAISE EXCEPTION 'Mode obligatoire : autonomie ou conversation'; END IF;
  IF _tool='devis_creer_brouillon' THEN
    ex := devis_mcp_existants(_affaire_id, NULLIF(_p->>'cle_externe',''));
    IF ex->>'cle' IS NOT NULL THEN RETURN jsonb_build_object('devis_id',ex->>'cle','existant',true); END IF;
    IF ex->'brouillon' IS NOT NULL AND ex->'brouillon'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Un brouillon actif existe déjà sur cette affaire : % (devis_id %)', ex->'brouillon'->>'numero', ex->'brouillon'->>'id'; END IF;
    IF ex->'dernier' IS NOT NULL AND ex->'dernier'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Cette affaire a déjà le devis % (%) : utiliser devis_nouvelle_version (devis_id %)', ex->'dernier'->>'numero', ex->'dernier'->>'statut', ex->'dernier'->>'id'; END IF;
    v_modele := CASE WHEN _p->>'modele_id'='vierge' THEN NULL ELSE coalesce(NULLIF(_p->>'modele_id','')::uuid, devis_modele_defaut_id()) END;
    v_id := (devis_creer_depuis_pipeline(_affaire_id, v_modele)->>'devis_id')::uuid;
    PERFORM devis_mcp_marquer(v_id, NULLIF(_p->>'cle_externe',''), _p->>'note');
    RETURN jsonb_build_object('devis_id',v_id,'existant',false,'modele_id',v_modele,'calcul',devis_calculer(v_id));
  END IF;

  etat := devis_mcp_etat(NULLIF(_p->>'devis_id','')::uuid);
  IF (etat->>'affaire_id')::uuid IS DISTINCT FROM _affaire_id OR etat->>'supprime_le' IS NOT NULL OR (etat->>'est_modele')::boolean THEN
    RAISE EXCEPTION 'Devis et affaire incohérents'; END IF;

  IF _tool='devis_nouvelle_version' THEN
    IF etat->>'statut_redaction'='brouillon' THEN RAISE EXCEPTION 'Ce devis est encore en brouillon : le compléter avec devis_remplir'; END IF;
    v_id := devis_nouvelle_version((etat->>'id')::uuid);
    PERFORM devis_mcp_marquer(v_id, NULL, _p->>'note');
    RETURN jsonb_build_object('devis_id',v_id,'version_precedente_id',etat->>'id','calcul',devis_calculer(v_id));
  END IF;

  IF _tool='devis_enregistrer_transfert' THEN
    IF v_mode<>'conversation' THEN RAISE EXCEPTION 'Transfert ProGBat refusé en autonomie : uniquement en conversation, avec l''accord explicite de l''utilisateur'; END IF;
    RETURN devis_enregistrer_transfert((etat->>'id')::uuid, _p->>'numero_progbat', (_p->>'total_progbat')::numeric, NULLIF(_p->>'motif',''));
  END IF;

  IF coalesce(etat->>'statut_redaction','brouillon') <> 'brouillon' THEN
    RAISE EXCEPTION 'Devis verrouillé (%) : créez une nouvelle version', etat->>'statut_redaction'; END IF;
  IF v_mode='autonomie' AND etat->>'modifie_par_humain_le' IS NOT NULL THEN
    RAISE EXCEPTION 'Brouillon repris par % le % : écriture autonome refusée (passer en mode conversation à la demande explicite de l''utilisateur)',
      coalesce(etat->>'humain','un utilisateur'), to_char((etat->>'modifie_par_humain_le')::timestamptz AT TIME ZONE 'Europe/Paris','DD/MM/YYYY HH24:MI');
  END IF;

  IF _tool='devis_remplir' THEN
    IF v_mode='autonomie' AND NOT coalesce((etat->>'cree_par_mcp')::boolean,false)
       AND (jsonb_array_length(coalesce(_p->'modifications','[]'::jsonb)) > 0 OR jsonb_array_length(coalesce(_p->'suppressions','[]'::jsonb)) > 0
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_p->'lignes','[]'::jsonb)) x WHERE x ? 'ligne_id')) THEN
      RAISE EXCEPTION 'En autonomie, Claude ne modifie ni ne supprime que dans un brouillon qu''il a créé : passer en mode conversation à la demande explicite de l''utilisateur';
    END IF;
    RETURN devis_remplir_lot((etat->>'id')::uuid, coalesce(_p->'lignes','[]'::jsonb),
             jsonb_build_object('modifications', coalesce(_p->'modifications','[]'::jsonb), 'suppressions', coalesce(_p->'suppressions','[]'::jsonb)))
           || jsonb_build_object('devis_id',etat->>'id');
  ELSIF _tool='devis_modifier_entete' THEN
    patch := coalesce(_p->'champs','{}'::jsonb);
    FOR k IN SELECT jsonb_object_keys(patch) LOOP
      IF k IN ('client_id','contact_id','client_final_id','date_devis','date_validite','validite_jours','libelle') THEN entete := entete || jsonb_build_object(k, patch->k);
      ELSIF k IN ('date_visite_technique','date_montage','date_evenement_debut','date_evenement_fin','date_demontage') THEN dates := dates || jsonb_build_object(k, patch->k);
      ELSIF k NOT IN ('remise','note','note_mcp_coches') THEN RAISE EXCEPTION 'Champ interdit : %', k; END IF;
    END LOOP;
    IF entete <> '{}'::jsonb THEN PERFORM devis_entete_modifier((etat->>'id')::uuid, entete, false); END IF;
    IF dates <> '{}'::jsonb THEN PERFORM devis_dates_modifier((etat->>'id')::uuid, dates); END IF;
    IF patch ? 'remise' THEN PERFORM devis_remise_modifier((etat->>'id')::uuid, patch->'remise'->>'mode', coalesce((patch->'remise'->>'valeur')::numeric,0)); END IF;
    IF patch ? 'note' THEN
      IF jsonb_typeof(patch->'note') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(patch->'note') x WHERE x NOT IN ('mode','texte')) > 0 THEN
        RAISE EXCEPTION 'Note : { mode, texte } attendu'; END IF;
      PERFORM devis_texte_modifier((etat->>'id')::uuid, 'note', NULL, patch->'note'->>'texte', patch->'note'->>'mode', NULL);
    END IF;
    IF patch ? 'note_mcp_coches' THEN PERFORM devis_note_mcp_cocher((etat->>'id')::uuid, patch->'note_mcp_coches'); END IF;
    RETURN jsonb_build_object('devis_id',etat->>'id','calcul',devis_calculer((etat->>'id')::uuid));
  ELSIF _tool='devis_ajouter_photo' AND _p ? 'photos' THEN
    IF jsonb_typeof(_p->'photos') <> 'array' OR jsonb_array_length(_p->'photos') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'De 1 à 20 images par appel'; END IF;
    patch := '[]'::jsonb;
    FOR entete IN SELECT x FROM jsonb_array_elements(_p->'photos') x LOOP
      IF NOT EXISTS (SELECT 1 FROM devis_mcp_ligne_objet((etat->>'id')::uuid, (entete->>'ligne_id')::uuid)) THEN RAISE EXCEPTION 'La photo doit être rattachée à un objet du devis (ligne %)', entete->>'ligne_id'; END IF;
      v_id := devis_photo_ajouter((entete->>'ligne_id')::uuid, jsonb_build_object('storage_path',entete->>'storage_path','mime',entete->>'mime','size_bytes',(entete->>'size_bytes')::int,
               'legende',left(concat_ws(' — ', NULLIF(entete->>'legende',''), 'Source : '||coalesce(NULLIF(entete->>'source',''),'Claude')),500),
               'visible_client',coalesce((entete->>'visible_client')::boolean,false),
               'source_document_id',NULLIF(entete->>'source_document_id','')));
      patch := patch || jsonb_build_array(jsonb_build_object('ligne_id',entete->>'ligne_id','photo_id',v_id));
    END LOOP;
    RETURN jsonb_build_object('devis_id',etat->>'id','photos',patch);
  ELSIF _tool='devis_ajouter_photo' THEN
    IF NOT EXISTS (SELECT 1 FROM devis_mcp_ligne_objet((etat->>'id')::uuid, (_p->>'ligne_id')::uuid)) THEN RAISE EXCEPTION 'La photo doit être rattachée à un objet du devis'; END IF;
    v_id := devis_photo_ajouter((_p->>'ligne_id')::uuid, jsonb_build_object('storage_path',_p->>'storage_path','mime',_p->>'mime','size_bytes',(_p->>'size_bytes')::int,
             'legende',left(concat_ws(' — ', NULLIF(_p->>'legende',''), 'Source : '||coalesce(NULLIF(_p->>'source',''),'Claude')),500),
             'visible_client',coalesce((_p->>'visible_client')::boolean,false),
             'source_document_id',NULLIF(_p->>'source_document_id','')));
    RETURN jsonb_build_object('devis_id',etat->>'id','photo_id',v_id);
  ELSIF _tool='devis_soumettre' THEN
    IF coalesce((_p->>'confirmer_avertissements')::boolean,false) AND v_mode<>'conversation' THEN
      RAISE EXCEPTION 'Confirmation des avertissements uniquement après accord humain en conversation';
    END IF;
    RETURN devis_soumettre((etat->>'id')::uuid, _p->>'note',coalesce((_p->>'confirmer_avertissements')::boolean,false),_p->>'empreinte_controles');
  END IF;
  RAISE EXCEPTION 'Outil devis interdit';
END $function$;
