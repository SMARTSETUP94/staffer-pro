# Lot — Outil Claude `traiter_demande` (Demandes entrantes, boîte devis) — version corrigée

Rien n'est appliqué avant votre accord écrit. Pas de publication.

## Corrections par rapport à la version précédente
1. **Écarter sans opportunité** : `mcp_execute_write_locked` est redéfini explicitement (définition actuelle relue) avec une branche dédiée `traiter_demande` : affaire NULL autorisée pour écarter, empreinte des mails obligatoire dans les deux cas, recalculée sous verrou à la confirmation.
2. **Fil figé à l'aperçu** : la liste finale des mails (demandés + fil) est calculée à l'aperçu et transmise telle quelle (`email_ids_resolus`) ; la confirmation n'ajoute jamais un mail que l'aperçu n'a pas montré.
3. `validated_by` / `validated_at` renseignés aussi à l'écart (votre réponse).
4. Audit : en écart sans affaire, `email_ids` et `action` sont journalisés dans le diff.
5. `mcp_write_preview` relu : il accepte déjà affaire NULL + snapshot (le contrôle d'accès affaire ne s'applique que si une affaire est fournie) ; **aucune modification**.

## Constat (vérifié en base)
- `emails_entrants` a un déclencheur qui met à jour `updated_at` à chaque modification : toute intervention humaine change l'empreinte.
- Pas de policy restrictive anti-jeton Claude sur `emails_entrants` (fermée ci-dessous).
- `app_creer_opportunite_client` renvoie `affaire_id`.
- `mcp_execute_write_locked` exigeait aujourd'hui affaire + snapshot pour tout outil autre que `creer_opportunite`, et comparait le snapshot comme une date.

## Règles de l'outil (inchangées sauf fil)
- `email_ids` 1–20, `action` rattacher | ecarter, `opportunite_id` obligatoire si rattacher (interdit si écarter), `motif` 1–500 obligatoire si écarter (interdit sinon), `inclure_fil` défaut false, `cle_externe` optionnelle.
- Tout ou rien ; seulement boîte devis + en attente ; jamais d'écrasement d'une décision humaine.
- `inclure_fil` : mails devis en attente du même fil, ajoutés à l'aperçu (déjà traités ignorés), total ≤ 50.
- `creer_opportunite` + `email_ids` : pas de fil ; si un mail n'est plus en attente au moment de la confirmation, toute l'écriture est refusée (l'opportunité n'est pas créée non plus) — refus clair.

## Aperçu côté code (`write-preview.ts`)
1. Validation du schéma (bornes, motif / opportunité).
2. `app_demandes_resoudre(email_ids, inclure_fil)` (lecture, sous les droits de l'appelant) → liste finale triée.
3. Lecture des mails (sujet, expéditeur, date, boîte, statut, fil) sous RLS ; refus immédiat (`ToolError`, rien enregistré) si un mail demandé est introuvable, hors devis ou déjà traité.
4. Rattacher : lecture de l'opportunité (numéro, nom, phase, archivage) ; refus si signée ou archivée.
5. `mcp_demandes_empreinte(liste, false)` → snapshot.
6. `mcp_write_preview` avec `_affaire_id` = opportunité (rattacher) ou NULL (écarter), `_snapshot` = empreinte, payload = arguments + `email_ids_resolus`, diff = `{action, email_ids, opportunite}`.
7. Réponse : mails concernés (dont « ajoutés par le fil »), opportunité cible, nombre d'actions « mail reçu » prévues, confirmation_id.

## Textes (validés, inchangés)
Instructions serveur, description `traiter_demande`, ajout `creer_opportunite`, description `demandes_clients` + filtre `source_boite` : identiques à la version précédente.

## SQL complet (une migration, 0043)

```sql
-- 1. Fermeture écriture directe par jeton Claude sur emails_entrants
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.emails_entrants;
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.emails_entrants;
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.emails_entrants;
CREATE POLICY mcp_oauth_block_insert ON public.emails_entrants AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL OR current_user = 'mcp_business_rls');
CREATE POLICY mcp_oauth_block_update ON public.emails_entrants AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL OR current_user = 'mcp_business_rls')
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL OR current_user = 'mcp_business_rls');
CREATE POLICY mcp_oauth_block_delete ON public.emails_entrants AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL OR current_user = 'mcp_business_rls');

-- 2. Résolution de la liste finale (lecture seule, droits de l'appelant)
CREATE OR REPLACE FUNCTION public.app_demandes_resoudre(_email_ids uuid[], _inclure_fil boolean DEFAULT false)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE ids uuid[];
BEGIN
  ids := ARRAY(SELECT DISTINCT unnest(_email_ids) ORDER BY 1);
  IF coalesce(array_length(ids,1),0) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Entre 1 et 20 demandes'; END IF;
  IF _inclure_fil THEN
    ids := ARRAY(SELECT x FROM (
      SELECT unnest(ids) AS x
      UNION
      SELECT f.id FROM emails_entrants f
      WHERE f.source_boite='devis' AND f.statut='pending_review' AND f.conversation_id IS NOT NULL
        AND f.conversation_id IN (SELECT conversation_id FROM emails_entrants WHERE id = ANY(_email_ids))
    ) s ORDER BY x);
    IF array_length(ids,1) > 50 THEN RAISE EXCEPTION 'Fil trop long (plus de 50 demandes)'; END IF;
  END IF;
  RETURN ids;
END $function$;

-- 3. Empreinte de l'état des demandes (id, statut, rattachement, motif, updated_at)
CREATE OR REPLACE FUNCTION public.mcp_demandes_empreinte(_ids uuid[], _verrou boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE n int; s text;
BEGIN
  IF _verrou THEN PERFORM 1 FROM emails_entrants WHERE id = ANY(_ids) ORDER BY id FOR UPDATE; END IF;
  SELECT count(*), string_agg(id::text||':'||statut::text||':'||coalesce(opportunite_id::text,'')||':'
           ||coalesce(dismiss_reason,'')||':'||updated_at::text, '|' ORDER BY id)
    INTO n, s FROM emails_entrants WHERE id = ANY(_ids);
  IF n <> coalesce(array_length(_ids,1),0) OR n = 0 THEN RAISE EXCEPTION 'Demande introuvable ou non accessible'; END IF;
  RETURN encode(extensions.digest(s,'sha256'),'hex');
END $function$;

-- 4. Fonction métier (SECURITY INVOKER : RLS de l'appelant)
CREATE OR REPLACE FUNCTION public.app_traiter_demande(
  _email_ids uuid[], _action text, _opportunite_id uuid DEFAULT NULL,
  _motif text DEFAULT NULL, _inclure_fil boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE ids uuid[]; n_demandes int; n_ok int; e record; n_actions int := 0;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL AND current_user <> 'mcp_business_rls' THEN
    RAISE EXCEPTION 'Écriture OAuth uniquement via confirmation MCP'; END IF;
  IF auth.uid() IS NULL OR NOT public.user_has_cap('action.edit_opportunite') THEN
    RAISE EXCEPTION 'Droit métier insuffisant'; END IF;
  IF _action NOT IN ('rattacher','ecarter') THEN RAISE EXCEPTION 'Action invalide'; END IF;
  IF _action = 'ecarter' AND (_motif IS NULL OR length(trim(_motif)) NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION 'Motif obligatoire (1 à 500 caractères)'; END IF;
  IF _action = 'ecarter' AND _opportunite_id IS NOT NULL THEN RAISE EXCEPTION 'Pas d''opportunité pour un écart'; END IF;
  IF _action = 'rattacher' AND _opportunite_id IS NULL THEN RAISE EXCEPTION 'Opportunité obligatoire'; END IF;

  ids := ARRAY(SELECT DISTINCT unnest(_email_ids) ORDER BY 1);
  IF coalesce(array_length(ids,1),0) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Nombre de demandes invalide'; END IF;

  SELECT count(*), count(*) FILTER (WHERE source_boite='devis' AND statut='pending_review')
    INTO n_demandes, n_ok
    FROM (SELECT source_boite, statut FROM emails_entrants WHERE id = ANY(ids) ORDER BY id FOR UPDATE) s;
  IF n_demandes <> array_length(ids,1) THEN RAISE EXCEPTION 'Demande introuvable ou non accessible'; END IF;
  IF n_ok <> n_demandes THEN
    RAISE EXCEPTION 'Refus : demande hors boîte devis ou déjà traitée (décision humaine conservée)'; END IF;

  IF _inclure_fil THEN
    ids := ids || ARRAY(
      SELECT f.id FROM emails_entrants f
      WHERE f.source_boite='devis' AND f.statut='pending_review' AND f.conversation_id IS NOT NULL
        AND f.conversation_id IN (SELECT conversation_id FROM emails_entrants WHERE id = ANY(_email_ids))
        AND NOT f.id = ANY(ids)
      ORDER BY f.id FOR UPDATE);
    IF array_length(ids,1) > 50 THEN RAISE EXCEPTION 'Fil trop long (plus de 50 demandes)'; END IF;
  END IF;

  IF _action = 'rattacher' THEN
    PERFORM app_assert_affaire_write(_opportunite_id, 'action.edit_opportunite');
    IF NOT EXISTS (SELECT 1 FROM affaires WHERE id=_opportunite_id AND phase='opportunite' AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'Opportunité non signée et non archivée requise'; END IF;
    FOR e IN SELECT id, subject, from_name, from_email, received_at FROM emails_entrants
             WHERE id = ANY(ids) ORDER BY received_at, id LOOP
      UPDATE emails_entrants SET opportunite_id=_opportunite_id, statut='validated',
        validated_by=auth.uid(), validated_at=now() WHERE id=e.id AND statut='pending_review';
      IF NOT FOUND THEN RAISE EXCEPTION 'Demande modifiée entre-temps'; END IF;
      PERFORM app_ajouter_action_opportunite(_opportunite_id, 'email_recu',
        left(format('Mail reçu — %s — de %s <%s> — %s', coalesce(e.subject,'(sans objet)'),
          coalesce(e.from_name,''), coalesce(e.from_email,''),
          to_char(e.received_at AT TIME ZONE 'Europe/Paris','DD/MM/YYYY HH24:MI')), 2000), NULL);
      n_actions := n_actions + 1;
    END LOOP;
  ELSE
    UPDATE emails_entrants SET statut='dismissed', dismiss_reason=trim(_motif),
      validated_by=auth.uid(), validated_at=now()
      WHERE id = ANY(ids) AND statut='pending_review';
  END IF;
  RETURN jsonb_build_object('action',_action,'email_ids',to_jsonb(ids),
    'nb_demandes',array_length(ids,1),'nb_actions',n_actions,'affaire_id',_opportunite_id);
END $function$;

REVOKE ALL ON FUNCTION public.app_demandes_resoudre(uuid[],boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_demandes_empreinte(uuid[],boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_traiter_demande(uuid[],text,uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_demandes_resoudre(uuid[],boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_demandes_empreinte(uuid[],boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_traiter_demande(uuid[],text,uuid,text,boolean) TO authenticated, service_role;
```

```sql
-- 5. mcp_assert_write : définition actuelle relue, seul ajout = 'traiter_demande' (action.edit_opportunite)
CREATE OR REPLACE FUNCTION public.mcp_assert_write(_tool text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE c text:=auth.jwt()->>'client_id'; cap text; BEGIN IF auth.uid() IS NULL OR c IS NULL OR NOT user_has_cap('api.mcp') OR NOT user_has_cap('api.mcp.write') OR NOT is_feature_flag_enabled('mcp_v1') OR NOT is_feature_flag_enabled('mcp_v2_write') OR NOT EXISTS(SELECT 1 FROM mcp_connections WHERE user_id=auth.uid() AND client_id=c AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Écriture MCP refusée'; END IF; cap:=CASE WHEN _tool='creer_opportunite' THEN 'action.create_opportunite' WHEN _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite','traiter_demande') THEN 'action.edit_opportunite' WHEN _tool IN ('modifier_chantier','ajouter_note_chantier') THEN 'section.affaires' WHEN _tool IN ('creer_etape_logistique','modifier_etape_logistique','deplacer_etape_logistique','annuler_etape_logistique') THEN 'logistique.etape.edit' WHEN _tool='affecter_role_projet' THEN 'affaires.edit' END; IF cap IS NULL OR NOT user_has_cap(cap) THEN RAISE EXCEPTION 'Outil ou droit métier refusé'; END IF; RETURN cap; END $function$;
```

```sql
-- 6. mcp_execute_write_locked : définition actuelle relue. Ajouts uniquement :
--    (a) branche ELSIF _tool='traiter_demande' (cible, verrou, empreinte des mails)
--    (b) comparaison du snapshot en texte pour traiter_demande (date pour les autres, inchangé)
--    (c) diff d'audit enrichi de action + email_ids pour traiter_demande
CREATE OR REPLACE FUNCTION public.mcp_execute_write_locked(_confirmation_id uuid, _tool text, _arguments_hash text, _payload jsonb, _diff jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.mcp_write_confirmations; cap text; output jsonb; kh text; a public.affaires; current_snapshot text; existing public.mcp_write_external_keys;
BEGIN BEGIN
cap:=mcp_assert_write(_tool);
IF user_cap_scope(cap) IS DISTINCT FROM 'all' THEN RAISE EXCEPTION 'Périmètre global requis pour les écritures MCP'; END IF;
SELECT * INTO c FROM mcp_write_confirmations WHERE id=_confirmation_id AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id' FOR UPDATE;
IF NOT FOUND OR c.tool<>_tool OR c.arguments_hash<>_arguments_hash OR c.payload_hash<>encode(extensions.digest(_payload::text,'sha256'),'hex') THEN RAISE EXCEPTION 'Confirmation invalide ou arguments modifiés'; END IF;
IF _tool='creer_opportunite' THEN IF c.affaire_id IS NOT NULL OR c.etape_id IS NOT NULL THEN RAISE EXCEPTION 'Cible création incohérente'; END IF;
ELSIF _tool='traiter_demande' THEN
IF c.etape_id IS NOT NULL OR c.snapshot IS NULL OR jsonb_array_length(COALESCE(_payload->'email_ids_resolus','[]'::jsonb))=0 THEN RAISE EXCEPTION 'Cible et état initial obligatoires'; END IF;
IF _payload->>'action'='rattacher' THEN
IF c.affaire_id IS NULL OR c.affaire_id IS DISTINCT FROM NULLIF(_payload->>'opportunite_id','')::uuid THEN RAISE EXCEPTION 'Opportunité cible incohérente'; END IF;
SELECT * INTO a FROM affaires WHERE id=c.affaire_id AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
ELSIF c.affaire_id IS NOT NULL THEN RAISE EXCEPTION 'Cible écart incohérente'; END IF;
current_snapshot:=mcp_demandes_empreinte(ARRAY(SELECT jsonb_array_elements_text(_payload->'email_ids_resolus')::uuid),true);
ELSE
IF c.affaire_id IS NULL OR c.snapshot IS NULL THEN RAISE EXCEPTION 'Cible et état initial obligatoires'; END IF;
SELECT * INTO a FROM affaires WHERE id=c.affaire_id AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
IF _tool='creer_etape_logistique' AND (_payload->>'affaire_id')::uuid IS DISTINCT FROM c.affaire_id THEN RAISE EXCEPTION 'Chantier de création incohérent'; END IF;
IF _tool IN ('modifier_etape_logistique','deplacer_etape_logistique','annuler_etape_logistique') THEN
IF c.etape_id IS NULL THEN RAISE EXCEPTION 'Étape obligatoire'; END IF;
SELECT updated_at::text INTO current_snapshot FROM affaire_etapes_logistiques WHERE id=c.etape_id AND affaire_id=c.affaire_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Étape et chantier incohérents'; END IF;
ELSE IF c.etape_id IS NOT NULL THEN RAISE EXCEPTION 'Étape inattendue'; END IF; current_snapshot:=a.updated_at::text; END IF;
END IF;
IF c.executed_at IS NOT NULL THEN RETURN c.result || jsonb_build_object('idempotent',true); END IF;
IF c.expires_at<=now() THEN RAISE EXCEPTION 'Confirmation expirée'; END IF;
IF c.snapshot IS NOT NULL AND (CASE WHEN _tool='traiter_demande' THEN c.snapshot IS DISTINCT FROM current_snapshot ELSE c.snapshot::timestamptz IS DISTINCT FROM current_snapshot::timestamptz END) THEN RAISE EXCEPTION 'Données changées: demander un nouvel aperçu'; END IF;
IF _payload->>'cle_externe' IS NOT NULL THEN
kh:=encode(extensions.digest(auth.uid()::text||':'||(auth.jwt()->>'client_id')||':'||(_payload->>'cle_externe'),'sha256'),'hex');
PERFORM pg_advisory_xact_lock(hashtextextended(_tool||kh,0));
SELECT * INTO existing FROM mcp_write_external_keys WHERE tool=_tool AND key_hash=kh;
IF FOUND THEN IF existing.request_hash IS DISTINCT FROM _arguments_hash OR (_tool<>'creer_opportunite' AND existing.affaire_id IS DISTINCT FROM c.affaire_id) THEN RAISE EXCEPTION 'Clé externe déjà utilisée avec un contenu différent'; END IF; output:=existing.result||jsonb_build_object('doublon_cle_externe',true); END IF;
END IF;
IF output IS NULL THEN
  INSERT INTO public.mcp_write_dispatch_context(txid,tool,user_id,client_id) VALUES(txid_current(),_tool,auth.uid(),auth.jwt()->>'client_id');
  output:=mcp_dispatch_write(_tool,_payload,c.affaire_id,c.etape_id);
  DELETE FROM public.mcp_write_dispatch_context WHERE txid=txid_current();
END IF;
IF kh IS NOT NULL THEN INSERT INTO mcp_write_external_keys(tool,key_hash,affaire_id,etape_id,result,request_hash) VALUES(_tool,kh,(output->>'affaire_id')::uuid,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END,output,_arguments_hash) ON CONFLICT DO NOTHING; END IF;
UPDATE mcp_write_confirmations SET executed_at=now(),result=output WHERE id=c.id;
INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id,diff,nb_lignes) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'executed',c.id,COALESCE(c.affaire_id,(output->>'affaire_id')::uuid),COALESCE(c.etape_id,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END),COALESCE(mcp_safe_diff(_diff),'{}'::jsonb)||CASE WHEN _tool='traiter_demande' THEN jsonb_build_object('action',_payload->>'action','email_ids',_payload->'email_ids_resolus') ELSE '{}'::jsonb END,CASE WHEN _tool='traiter_demande' THEN jsonb_array_length(_payload->'email_ids_resolus') ELSE 1 END);
RETURN output||jsonb_build_object('statut','executed');
EXCEPTION WHEN OTHERS THEN INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'refused',_confirmation_id,c.affaire_id,c.etape_id); RETURN jsonb_build_object('error',SQLERRM,'statut','refused'); END; END $function$;
```

```sql
-- 7. mcp_dispatch_write : définition actuelle (0042) relue. Ajouts uniquement :
--    (a) creer_opportunite : rattachement optionnel des email_ids (sans fil)
--    (b) branche traiter_demande, sur la liste figée email_ids_resolus (inclure_fil=false)
--    Propriétaire / exécution via mcp_business_rls conservés : CREATE OR REPLACE ne change ni le propriétaire ni les droits.
CREATE OR REPLACE FUNCTION public.mcp_dispatch_write(_tool text, _p jsonb, _affaire_id uuid, _etape_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE result jsonb; k text; patch jsonb; allowed text[]; a public.affaires; BEGIN PERFORM mcp_assert_write(_tool); IF _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite') THEN SELECT * INTO a FROM affaires WHERE id=_affaire_id AND phase='opportunite' AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Opportunité non signée requise'; END IF; END IF; IF _tool='creer_opportunite' THEN result:=app_creer_opportunite_client(_p-'email_ids'); IF jsonb_array_length(COALESCE(_p->'email_ids','[]'::jsonb))>0 THEN result:=result || jsonb_build_object('demandes',app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids')::uuid),'rattacher',(result->>'affaire_id')::uuid,NULL,false)); END IF; ELSIF _tool='traiter_demande' THEN result:=app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids_resolus')::uuid),_p->>'action',NULLIF(_p->>'opportunite_id','')::uuid,_p->>'motif',false); ELSIF _tool='ajouter_action_opportunite' THEN result:=app_ajouter_action_opportunite(_affaire_id,(_p->>'type')::public.opp_action_type,_p->>'note',(_p->>'echeance')::date); ELSIF _tool='ajouter_note_chantier' THEN result:=app_ajouter_note_chantier(_affaire_id,_p->>'texte'); ELSIF _tool IN ('modifier_chantier','mettre_a_jour_opportunite') THEN patch:=_p->'patch'; allowed:=CASE WHEN _tool='modifier_chantier' THEN ARRAY['date_montage','date_demontage','lieu','contact_site_nom','contact_site_tel','chef_projet_id','charge_affaires_id','dessinateur_id','statut','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','notes'] ELSE ARRAY['nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','typologie_future','ca_estime_ht','charge_affaires_id','statut_opportunite'] END; FOR k IN SELECT jsonb_object_keys(patch) LOOP IF NOT k=ANY(allowed) THEN RAISE EXCEPTION 'Champ interdit'; END IF; END LOOP; IF _tool='mettre_a_jour_opportunite' AND patch ? 'statut_opportunite' AND patch->>'statut_opportunite' NOT IN ('a_faire','envoye','presque_gagne') THEN RAISE EXCEPTION 'Statut gagné/perdu réservé à l''application'; END IF; IF patch<>'{}'::jsonb THEN result:=app_modifier_affaire(_affaire_id,patch); ELSE result:=jsonb_build_object('id',_affaire_id); END IF; IF _tool='mettre_a_jour_opportunite' THEN IF _p->>'prochaine_action' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'prochaine_action',(_p->>'echeance')::date); END IF; IF _p->>'motif' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'motif',NULL); END IF; IF _p->>'jalon' IS NOT NULL THEN IF _p->>'jalon' NOT IN ('qualification','devis_envoye','negociation') THEN RAISE EXCEPTION 'Jalon signature interdit'; END IF; UPDATE opportunite_jalons SET date_prevue=(_p->>'echeance')::date WHERE affaire_id=_affaire_id AND etape::text=_p->>'jalon'; IF NOT FOUND THEN RAISE EXCEPTION 'Jalon absent: initialiser dans l’UI'; END IF; END IF; END IF; ELSIF _tool='creer_etape_logistique' THEN result:=app_creer_etape_logistique(_p-'cle_externe'); ELSIF _tool='modifier_etape_logistique' THEN patch:=_p->'patch'; IF patch ? 'statut' AND patch->>'statut' NOT IN ('propose','valide','fait') THEN RAISE EXCEPTION 'Annulation nécessite motif'; END IF; result:=app_modifier_etape_logistique(_etape_id,patch); ELSIF _tool='deplacer_etape_logistique' THEN result:=deplacer_etape_logistique(_etape_id,(_p->>'nouveau_debut')::date,(_p->>'nouvelle_fin')::date); ELSIF _tool='annuler_etape_logistique' THEN IF length(trim(_p->>'motif')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF; result:=app_modifier_etape_logistique(_etape_id,jsonb_build_object('statut','annule','commentaire_equipe',_p->>'motif')); ELSIF _tool='affecter_role_projet' THEN result:=app_affecter_role_projet(_affaire_id,(_p->>'role')::public.projet_role,(_p->>'employe_id')::uuid,(_p->>'date_debut')::date,(_p->>'date_fin')::date,NULL,COALESCE((_p->>'remplacer_dates')::boolean,false)); ELSE RAISE EXCEPTION 'Outil interdit'; END IF; RETURN result || jsonb_build_object('affaire_id',COALESCE(_affaire_id,(result->>'affaire_id')::uuid)); END $function$;
```

Avant application, je vérifierai que le propriétaire et les droits d'exécution de `mcp_dispatch_write` et `mcp_execute_write_locked` sont identiques avant / après (lecture de `pg_proc`).

## Côté code (après accord)
- `write-schemas.ts` : schéma `traiter_demande` (`.strict()`, bornes, refine motif / opportunité) ; `email_ids` optionnel (1–20) sur `creer_opportunite`.
- `write-policy.ts` : `traiter_demande: "action.edit_opportunite"`.
- `write-preview.ts` : aperçu décrit ci-dessus.
- Nouveau `tools/traiter_demande.ts` ; enregistrement + instructions dans `index.ts`.
- `read-data.ts` / `tools/demandes_clients.ts` : `conversation_id`, opportunité `{numero, nom}`, filtre `source_boite`.
- Mémoire `mcp-claude-v2` mise à jour.

## Tests
SQL (transaction annulée, contexte de dispatch Claude) :
1. Rattacher 3 mails à une même opportunité → 3 demandes validées, 3 actions `email_recu`.
2. Écarter avec motif → dismissed + motif + validated_by/at ; sans motif → refus.
3. **Écarter 2 mails sans opportunité → succès** (confirmation acceptée avec affaire NULL).
4. **Écarter : un humain modifie un mail entre aperçu et confirmation → « Données changées: demander un nouvel aperçu »**, rien écrit.
5. Mail boîte smart → refus, rien d'écrit.
6. Mail déjà validé / écarté → refus, rien d'écrit.
7. Opportunité signée ; opportunité archivée → refus.
8. Idempotence : même `cle_externe` rejouée → même résultat, pas de doublon d'actions.
9. `inclure_fil` → mails en attente du fil ajoutés à l'aperçu et traités ; déjà traités ignorés ; un mail arrivé dans le fil après l'aperçu n'est pas touché.
10. Écriture directe sur `emails_entrants` avec un jeton Claude → refusée ; session normale → acceptée (onglet Demandes entrantes intact).
11. Audit : écart sans affaire → `executed` avec `email_ids` et `action` dans le diff.

Vitest : schéma, capability, instructions / description, `creer_opportunite` avec email_ids. Régénération du manifeste (25 outils).

## Hors périmètre
Aucun changement de l'interface de l'onglet Demandes entrantes ni des autres outils. Pas de publication sans votre accord.
