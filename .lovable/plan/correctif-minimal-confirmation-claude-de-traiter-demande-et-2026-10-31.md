# Correctif minimal — confirmation Claude de `traiter_demande` et `ajouter_action_opportunite`

Rien n'est appliqué ni publié avant votre accord écrit.

## Ce que j'ai vérifié en base (lecture seule)

- `app_traiter_demande(uuid[], text, uuid, text, boolean)` et `app_ajouter_action_opportunite(uuid, opp_action_type, text, date)` existent avec ces types.
- Dans `mcp_dispatch_write`, il y a exactement **3** opérateurs `->` qui renvoient du jsonb là où il faut du texte :
  - `traiter_demande` : `_p->'action'` et `_p->'motif'`
  - `ajouter_action_opportunite` : `_p->'note'`
- **Point 2, vérification des autres branches :** tous les autres appels ont les bons types, donc aucune autre correction.
  - `creer_opportunite` : `app_creer_opportunite_client(jsonb)` reçoit du jsonb, et `app_traiter_demande(…,'rattacher',…,NULL,false)` reçoit des littéraux texte.
  - `ajouter_note_chantier` : `_p->>'texte'`.
  - `modifier_chantier` / `mettre_a_jour_opportunite` : `app_modifier_affaire(uuid, jsonb)` et notes en `->>`.
  - Les quatre branches d'étapes logistiques et `affecter_role_projet` : jsonb, `->>` ou casts explicites, conformes aux signatures.
- Propriétaire `mcp_business_rls` et SECURITY DEFINER avec `search_path = public`. `CREATE OR REPLACE` conserve le propriétaire et les droits : aucun GRANT ni REVOKE n'est rejoué.
- **À signaler, sans le modifier :** la liste des droits actuels contient `anon=X`, ce qui donne à anon le droit EXECUTE sur `mcp_dispatch_write`. La fonction commence par `mcp_assert_write`, qui refuse tout appel hors contexte de dispatch, donc l'impact est nul en pratique. Je ne touche à rien dans ce lot, comme vous l'avez demandé. Dites-moi si vous voulez un REVOKE séparé.

## Diff (seules lignes modifiées)

```text
- result:=app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids_resolus')::uuid),_p->'action',NULLIF(_p->>'opportunite_id','')::uuid,_p->'motif',false);
+ result:=app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids_resolus')::uuid),_p->>'action',NULLIF(_p->>'opportunite_id','')::uuid,NULLIF(trim(_p->>'motif'),''),false);

- result:=app_ajouter_action_opportunite(_affaire_id,(_p->>'type')::public.opp_action_type,_p->'note',(_p->>'echeance')::date);
+ result:=app_ajouter_action_opportunite(_affaire_id,(_p->>'type')::public.opp_action_type,_p->>'note',(_p->>'echeance')::date);
```

## Migration complète (0046_fix_mcp_dispatch_text_args)

```sql
CREATE OR REPLACE FUNCTION public.mcp_dispatch_write(_tool text, _p jsonb, _affaire_id uuid, _etape_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE result jsonb; k text; patch jsonb; allowed text[]; a public.affaires; BEGIN PERFORM mcp_assert_write(_tool); IF _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite') THEN SELECT * INTO a FROM affaires WHERE id=_affaire_id AND phase='opportunite' AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Opportunité non signée requise'; END IF; END IF; IF _tool='creer_opportunite' THEN result:=app_creer_opportunite_client(_p-'email_ids'); IF jsonb_array_length(COALESCE(_p->'email_ids','[]'::jsonb))>0 THEN result:=result || jsonb_build_object('demandes',app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids')::uuid),'rattacher',(result->>'affaire_id')::uuid,NULL,false)); END IF; ELSIF _tool='traiter_demande' THEN result:=app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids_resolus')::uuid),_p->>'action',NULLIF(_p->>'opportunite_id','')::uuid,NULLIF(trim(_p->>'motif'),''),false); ELSIF _tool='ajouter_action_opportunite' THEN result:=app_ajouter_action_opportunite(_affaire_id,(_p->>'type')::public.opp_action_type,_p->>'note',(_p->>'echeance')::date); ELSIF _tool='ajouter_note_chantier' THEN result:=app_ajouter_note_chantier(_affaire_id,_p->>'texte'); ELSIF _tool IN ('modifier_chantier','mettre_a_jour_opportunite') THEN patch:=_p->'patch'; allowed:=CASE WHEN _tool='modifier_chantier' THEN ARRAY['date_montage','date_demontage','lieu','contact_site_nom','contact_site_tel','chef_projet_id','charge_affaires_id','dessinateur_id','statut','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','notes'] ELSE ARRAY['nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','date_visite_technique','typologie_future','ca_estime_ht','charge_affaires_id','statut_opportunite'] END; FOR k IN SELECT jsonb_object_keys(patch) LOOP IF NOT k=ANY(allowed) THEN RAISE EXCEPTION 'Champ interdit'; END IF; END LOOP; IF _tool='mettre_a_jour_opportunite' AND patch ? 'statut_opportunite' AND patch->>'statut_opportunite' NOT IN ('a_faire','envoye','a_l_etude','presque_gagne') THEN RAISE EXCEPTION 'Statut gagné/perdu réservé à l''application'; END IF; IF patch<>'{}'::jsonb THEN result:=app_modifier_affaire(_affaire_id,patch); ELSE result:=jsonb_build_object('id',_affaire_id); END IF; IF _tool='mettre_a_jour_opportunite' THEN IF _p->>'prochaine_action' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'prochaine_action',(_p->>'echeance')::date); END IF; IF _p->>'motif' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'motif',NULL); END IF; IF _p->>'jalon' IS NOT NULL THEN IF _p->>'jalon' NOT IN ('qualification','devis_envoye','negociation') THEN RAISE EXCEPTION 'Jalon signature interdit'; END IF; UPDATE opportunite_jalons SET date_prevue=(_p->>'echeance')::date WHERE affaire_id=_affaire_id AND etape::text=_p->>'jalon'; IF NOT FOUND THEN RAISE EXCEPTION 'Jalon absent: initialiser dans l’UI'; END IF; END IF; END IF; ELSIF _tool='creer_etape_logistique' THEN result:=app_creer_etape_logistique(_p-'cle_externe'); ELSIF _tool='modifier_etape_logistique' THEN patch:=_p->'patch'; IF patch ? 'statut' AND patch->>'statut' NOT IN ('propose','valide','fait') THEN RAISE EXCEPTION 'Annulation nécessite motif'; END IF; result:=app_modifier_etape_logistique(_etape_id,patch); ELSIF _tool='deplacer_etape_logistique' THEN result:=deplacer_etape_logistique(_etape_id,(_p->>'nouveau_debut')::date,(_p->>'nouvelle_fin')::date); ELSIF _tool='annuler_etape_logistique' THEN IF length(trim(_p->>'motif')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF; result:=app_modifier_etape_logistique(_etape_id,jsonb_build_object('statut','annule','commentaire_equipe',_p->>'motif')); ELSIF _tool='affecter_role_projet' THEN result:=app_affecter_role_projet(_affaire_id,(_p->>'role')::public.projet_role,(_p->>'employe_id')::uuid,(_p->>'date_debut')::date,(_p->>'date_fin')::date,NULL,COALESCE((_p->>'remplacer_dates')::boolean,false)); ELSE RAISE EXCEPTION 'Outil interdit'; END IF; RETURN result || jsonb_build_object('affaire_id',COALESCE(_affaire_id,(result->>'affaire_id')::uuid)); END $function$;

NOTIFY pgrst, 'reload schema';
```

Le corps est copié tel quel depuis la définition actuelle en base (`pg_get_functiondef`), sans réécriture automatique. Seules les 3 expressions ci-dessus changent.

## Tests après accord (transaction annulée, données fictives)

Tous les tests passent par le contexte de dispatch Claude (`mcp_execute_write_locked`) :
1. `traiter_demande` en mode rattacher, sur un mail devis@ en `pending_review` : le mail passe en `validated`, `opportunite_id` est renseigné et une action `email_recu` est créée.
2. `traiter_demande` en mode écarter sans motif, puis avec un motif fait seulement d'espaces : les deux sont refusés. Avec un motif : le mail passe en `dismissed`.
3. Mail déjà `validated` ou `dismissed` : refusé.
4. `ajouter_action_opportunite` : l'action est créée et sa note correspond exactement au texte envoyé.
5. `creer_opportunite` avec `email_ids` : toujours OK, et les mails sont rattachés.
6. Contrôle : relire la définition après la migration, vérifier que le diff ne porte que sur les 3 expressions et que propriétaire et droits sont inchangés.

Aucune modification du code de l'application, des outils Claude, des droits ni des données. Aucune publication.
