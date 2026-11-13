-- Lot note et commentaires des devis : historique, édition dédiée, fusion des notes Claude, limite 8 000.

CREATE TABLE public.devis_textes_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  ligne_id uuid REFERENCES public.devis_lignes(id) ON DELETE SET NULL,
  cible text NOT NULL CHECK (cible IN ('note','commentaire')),
  avant text,
  apres text,
  auteur_id uuid,
  source text NOT NULL CHECK (source IN ('humain','mcp','systeme')),
  restaure_depuis uuid REFERENCES public.devis_textes_historique(id) ON DELETE SET NULL,
  cree_le timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (cible = 'commentaire' OR ligne_id IS NULL)
);
CREATE INDEX devis_textes_historique_devis_idx ON public.devis_textes_historique (devis_id, cible, cree_le DESC);
CREATE INDEX devis_textes_historique_ligne_idx ON public.devis_textes_historique (ligne_id, cree_le DESC);
GRANT SELECT ON public.devis_textes_historique TO authenticated;
GRANT ALL ON public.devis_textes_historique TO service_role;
ALTER TABLE public.devis_textes_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY devis_textes_historique_lecture ON public.devis_textes_historique
  FOR SELECT TO authenticated USING (public.devis_peut_lire(devis_id));
-- Aucune règle d'écriture : seuls les déclencheurs écrivent.

ALTER TABLE public.devis ADD CONSTRAINT devis_note_mcp_len CHECK (char_length(note_mcp) <= 8000) NOT VALID;
ALTER TABLE public.devis VALIDATE CONSTRAINT devis_note_mcp_len;

-- Trace (note sur devis, texte des commentaires)
CREATE OR REPLACE FUNCTION public.devis_textes_tracer()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src text := CASE WHEN public.mcp_dispatch_actif() THEN 'mcp' WHEN auth.uid() IS NULL THEN 'systeme' ELSE 'humain' END;
  v_rest uuid := NULLIF(current_setting('app.devis_restaure', true), '')::uuid;
BEGIN
  IF TG_TABLE_NAME = 'devis' THEN
    IF NEW.note_mcp IS DISTINCT FROM OLD.note_mcp THEN
      INSERT INTO public.devis_textes_historique(devis_id, cible, avant, apres, auteur_id, source, restaure_depuis)
      VALUES (NEW.id, 'note', OLD.note_mcp, NEW.note_mcp, auth.uid(), v_src, v_rest);
    END IF;
  ELSIF NEW.type = 'commentaire' AND NEW.texte IS DISTINCT FROM OLD.texte THEN
    INSERT INTO public.devis_textes_historique(devis_id, ligne_id, cible, avant, apres, auteur_id, source, restaure_depuis)
    VALUES (NEW.devis_id, NEW.id, 'commentaire', OLD.texte, NEW.texte, auth.uid(), v_src, v_rest);
  END IF;
  RETURN NULL;
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_textes_tracer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_devis_note_hist AFTER UPDATE OF note_mcp ON public.devis
  FOR EACH ROW EXECUTE FUNCTION public.devis_textes_tracer();
CREATE TRIGGER trg_devis_comm_hist AFTER UPDATE OF texte ON public.devis_lignes
  FOR EACH ROW EXECUTE FUNCTION public.devis_textes_tracer();

-- Cases cochées repérées par le texte du point : on retire celles dont le texte a disparu.
CREATE OR REPLACE FUNCTION public.devis_coches_elaguer()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.note_mcp IS DISTINCT FROM OLD.note_mcp AND jsonb_typeof(NEW.note_mcp_coches) = 'array' THEN
    NEW.note_mcp_coches := (
      SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      FROM jsonb_array_elements_text(NEW.note_mcp_coches) c
      WHERE NEW.note_mcp IS NOT NULL AND position(c IN NEW.note_mcp) > 0);
  END IF;
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_coches_elaguer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_devis_coches_elaguer BEFORE UPDATE OF note_mcp ON public.devis
  FOR EACH ROW EXECUTE FUNCTION public.devis_coches_elaguer();

CREATE OR REPLACE FUNCTION public.devis_note_separateur(_auteur text)
 RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT '— Mise à jour du ' || to_char(now() AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') || ' (' || _auteur || ') —'
$function$;
REVOKE EXECUTE ON FUNCTION public.devis_note_separateur(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_note_separateur(text) TO authenticated, service_role;

-- Fusion d'une note écrite par Claude (création, nouvelle version, soumission). Interne, non appelable.
CREATE OR REPLACE FUNCTION public.devis_note_fusionner(_devis_id uuid, _texte text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_t text := NULLIF(trim(coalesce(_texte, '')), ''); v_old text; v_src text; v_new text;
BEGIN
  IF v_t IS NULL THEN RETURN; END IF;
  SELECT note_mcp INTO v_old FROM public.devis WHERE id = _devis_id FOR UPDATE;
  IF NULLIF(trim(coalesce(v_old, '')), '') IS NOT NULL
     AND (trim(v_old) = v_t OR right(rtrim(v_old), length(v_t)) = v_t) THEN
    RETURN; -- identique ou déjà présent à la fin : rien à écrire
  END IF;
  SELECT source INTO v_src FROM public.devis_textes_historique
   WHERE devis_id = _devis_id AND cible = 'note' ORDER BY cree_le DESC, id DESC LIMIT 1;
  IF NULLIF(trim(coalesce(v_old, '')), '') IS NOT NULL AND v_src = 'humain' THEN
    v_new := rtrim(v_old) || E'\n\n' || public.devis_note_separateur('Claude') || E'\n' || v_t;
  ELSE
    v_new := v_t; -- note écrite seulement par Claude : remplacement, l'historique garde l'ancienne version
  END IF;
  IF char_length(v_new) > 8000 THEN
    RAISE EXCEPTION 'Note trop longue (% caractères, 8 000 au maximum) : raccourcir le texte', char_length(v_new) USING ERRCODE = '22001';
  END IF;
  PERFORM set_config('app.devis_rpc', 'on', true);
  UPDATE public.devis SET note_mcp = v_new WHERE id = _devis_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_note_fusionner(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devis_note_fusionner(uuid, text) TO service_role;

-- Édition de la note ou d'un commentaire (éditeur, restauration, MCP).
CREATE OR REPLACE FUNCTION public.devis_texte_modifier(_devis_id uuid, _cible text, _ligne_id uuid, _texte text, _mode text DEFAULT 'remplacer', _restaure_depuis uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mcp boolean := public.mcp_dispatch_actif(); v_st text; v_old text; v_txt text := _texte; v_new text; v_mode text := coalesce(_mode, 'remplacer');
BEGIN
  IF _cible NOT IN ('note', 'commentaire') THEN RAISE EXCEPTION 'Cible inconnue'; END IF;
  IF v_mode NOT IN ('remplacer', 'ajouter') THEN RAISE EXCEPTION 'Mode inconnu : remplacer ou ajouter'; END IF;
  IF _cible = 'note' AND _ligne_id IS NOT NULL THEN RAISE EXCEPTION 'La note ne porte pas sur une ligne'; END IF;
  IF _cible = 'commentaire' AND _ligne_id IS NULL THEN RAISE EXCEPTION 'Commentaire non précisé'; END IF;
  PERFORM public.devis_assert_ecriture(_devis_id, false); -- devis.rediger + droit d'écriture sur l'affaire
  SELECT statut_redaction::text, note_mcp INTO v_st, v_old FROM public.devis WHERE id = _devis_id FOR UPDATE;
  IF v_mcp AND v_st <> 'brouillon' THEN
    RAISE EXCEPTION 'Devis verrouillé (%) : Claude ne modifie la note que sur un brouillon', v_st USING ERRCODE = '42501';
  END IF;
  IF NOT v_mcp AND v_st NOT IN ('brouillon', 'a_valider') THEN
    RAISE EXCEPTION 'Devis figé (%) : note et commentaires en lecture seule', v_st USING ERRCODE = '42501';
  END IF;

  IF _restaure_depuis IS NOT NULL THEN
    SELECT apres INTO v_txt FROM public.devis_textes_historique
     WHERE id = _restaure_depuis AND devis_id = _devis_id AND cible = _cible AND ligne_id IS NOT DISTINCT FROM _ligne_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Version introuvable pour cet élément du devis'; END IF;
    v_mode := 'remplacer';
  END IF;

  IF _cible = 'note' THEN
    IF v_mode = 'ajouter' AND NULLIF(trim(coalesce(v_old, '')), '') IS NOT NULL THEN
      IF NULLIF(trim(coalesce(v_txt, '')), '') IS NULL THEN RAISE EXCEPTION 'Texte à ajouter vide'; END IF;
      v_new := rtrim(v_old) || E'\n\n' || public.devis_note_separateur(CASE WHEN v_mcp THEN 'Claude' ELSE 'Staffing' END) || E'\n' || trim(v_txt);
    ELSE
      v_new := NULLIF(trim(coalesce(v_txt, '')), '');
    END IF;
    IF char_length(v_new) > 8000 THEN
      RAISE EXCEPTION 'Note trop longue (% caractères, 8 000 au maximum)', char_length(v_new) USING ERRCODE = '22001';
    END IF;
    PERFORM set_config('app.devis_restaure', coalesce(_restaure_depuis::text, ''), true);
    UPDATE public.devis SET note_mcp = v_new WHERE id = _devis_id;
    PERFORM set_config('app.devis_restaure', '', true);
    RETURN jsonb_build_object('devis_id', _devis_id, 'cible', 'note', 'longueur', coalesce(char_length(v_new), 0));
  END IF;

  IF v_mode = 'ajouter' THEN RAISE EXCEPTION 'Mode ajouter réservé à la note'; END IF;
  IF char_length(coalesce(v_txt, '')) > 8000 THEN RAISE EXCEPTION 'Commentaire trop long (8 000 caractères au maximum)' USING ERRCODE = '22001'; END IF;
  PERFORM 1 FROM public.devis_lignes WHERE id = _ligne_id AND devis_id = _devis_id AND type = 'commentaire' AND supprime_le IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commentaire introuvable ou retiré'; END IF;
  PERFORM set_config('app.devis_restaure', coalesce(_restaure_depuis::text, ''), true);
  UPDATE public.devis_lignes SET texte = coalesce(v_txt, ''), updated_at = now() WHERE id = _ligne_id;
  PERFORM set_config('app.devis_restaure', '', true);
  RETURN jsonb_build_object('devis_id', _devis_id, 'cible', 'commentaire', 'ligne_id', _ligne_id);
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_texte_modifier(uuid, text, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_texte_modifier(uuid, text, uuid, text, text, uuid) TO authenticated, service_role;

-- Redéfinitions explicites (depuis leur texte relu)
CREATE OR REPLACE FUNCTION public.devis_mcp_marquer(_devis_id uuid, _cle text, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT mcp_dispatch_actif() THEN RAISE EXCEPTION 'Réservé aux écritures MCP confirmées' USING ERRCODE='42501'; END IF;
  IF NOT devis_peut_ecrire(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants sur ce devis' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  -- La marque « repris par un humain » n'est effacée que dans la transaction qui crée le devis.
  UPDATE devis SET cree_par_mcp=true, cle_externe=coalesce(_cle, cle_externe),
         modifie_par_humain_le = CASE WHEN created_at = now() THEN NULL ELSE modifie_par_humain_le END,
         modifie_par_humain_id = CASE WHEN created_at = now() THEN NULL ELSE modifie_par_humain_id END
   WHERE id=_devis_id;
  PERFORM devis_note_fusionner(_devis_id, _note);
END $function$;

CREATE OR REPLACE FUNCTION public.devis_soumettre(_devis_id uuid, _note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  PERFORM devis_statut_changer(_devis_id, 'a_valider');
  PERFORM set_config('app.devis_rpc','on',true);
  PERFORM devis_note_fusionner(_devis_id, _note);
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_redaction','a_valider');
END $function$;

CREATE OR REPLACE FUNCTION public.devis_note_mcp_cocher(_devis_id uuid, _coches jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_note text;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  IF jsonb_typeof(_coches) <> 'array' OR jsonb_array_length(_coches) > 200 THEN RAISE EXCEPTION 'Liste de points invalide'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_coches) e WHERE jsonb_typeof(e) <> 'string' OR char_length(e #>> '{}') > 2000) THEN
    RAISE EXCEPTION 'Liste de points invalide'; END IF;
  SELECT note_mcp INTO v_note FROM devis WHERE id = _devis_id;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(_coches) c WHERE v_note IS NULL OR position(c IN v_note) = 0) THEN
    RAISE EXCEPTION 'Point absent de la note'; END IF;
  UPDATE devis SET note_mcp_coches = _coches, updated_at = now() WHERE id = _devis_id;
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
  ELSIF _tool='devis_ajouter_photo' THEN
    IF NOT EXISTS (SELECT 1 FROM devis_mcp_ligne_objet((etat->>'id')::uuid, (_p->>'ligne_id')::uuid)) THEN RAISE EXCEPTION 'La photo doit être rattachée à un objet du devis'; END IF;
    v_id := devis_photo_ajouter((_p->>'ligne_id')::uuid, jsonb_build_object('storage_path',_p->>'storage_path','mime',_p->>'mime','size_bytes',(_p->>'size_bytes')::int,
             'legende',left(concat_ws(' — ', NULLIF(_p->>'legende',''), 'Source : '||coalesce(NULLIF(_p->>'source',''),'Claude')),500),
             'visible_client',coalesce((_p->>'visible_client')::boolean,false),
             'source_document_id',NULLIF(_p->>'source_document_id','')));
    RETURN jsonb_build_object('devis_id',etat->>'id','photo_id',v_id);
  ELSIF _tool='devis_soumettre' THEN
    RETURN devis_soumettre((etat->>'id')::uuid, _p->>'note');
  END IF;
  RAISE EXCEPTION 'Outil devis interdit';
END $function$;