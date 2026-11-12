# Lot « Fermeture des accès aux fonctions de la base »

Restrictions uniquement. Aucune donnée, aucun devis, aucun taux, aucune politique de `employes` touchés. Rien publié.

## État relu le 12/11/2026 (avant ce plan)

- 292 fonctions SECURITY DEFINER dans `public` ; **101 exécutables par `anon`**, dont 71 parce que PUBLIC a le droit (ACL vide ou PUBLIC explicite). 25 d'entre elles sont des fonctions de trigger.
- `pg_cron` : schéma non lisible depuis mon accès ; la tâche quotidienne 3h UTC sur `audit_staffing_divergence` est connue par le code et la documentation interne, à confirmer par lecture admin à l'étape 1.
- Aucune politique applicable à `anon` ou `public` n'appelle une fonction d'aide (requête sur `pg_policies` : 0 ligne). Retirer `anon` ne casse donc aucune politique.
- Le rôle `mcp_business_rls` est bien membre de `authenticated` : tout ce qui reste à `authenticated` lui reste.
- Le formulaire /demande-logistique passe par une fonction serveur ; les fonctions `demande_log_public_*` ne sont déjà **pas** exécutables par `anon`.

## Tableau des fonctions des points 1 et 2

| Fonction | Appelants trouvés | Contrôle retenu |
|---|---|---|
| `detect_client_duplicates(real)` | page `/clients/admin/fusion` (garde `clients.merge`) | `anon` retiré ; erreur si `current_user_has_capability('clients.merge')` est faux. Passage de SQL à plpgsql (`RETURN QUERY`), même requête. |
| `mes_affaires_chef(uuid)` | `use-mes-affaires-chef.ts` (toujours l'employé du connecté), formulaire Staffer mobile | `anon` retiré ; résultat seulement si l'employé passé est celui de l'utilisateur connecté, ou si admin. Sinon liste vide. |
| `sync_equipes_from_plan` (2 versions) | `staffing-publish.functions.ts` (fonction serveur connectée, client de l'utilisateur) | `anon` retiré ; si `auth.uid()` présent : erreur sauf `user_can_write_affaire(affaire du plan)` et capacité `section.planning_fab` (celle de la page plan). Sans `auth.uid()` (service, trigger) : inchangé. |
| `detect_equipe_overrides(uuid)` | même fonction serveur | même contrôle que ci-dessus (lecture du plan). |
| `objet_journal_log(...)` | uniquement 6 fonctions de trigger SECURITY DEFINER (`trg_*_journal`) | EXECUTE retiré à `anon`, `authenticated`, PUBLIC ; gardé à `service_role`. Les triggers l'appellent en propriétaire : non affectés. |
| `refresh_affaire_equipe_historique(uuid)` | `trg_aeh_on_affaire`, `trg_aeh_on_assignation` (triggers) ; aucun écran | EXECUTE retiré à `anon`, `authenticated`, PUBLIC ; `service_role` gardé. Corps inchangé. |
| `audit_staffing_divergence()` | pg_cron ; `run_staffing_divergence_audit()` (déjà réservé admin, appelé par l'onglet Cohérence) | EXECUTE retiré à `anon`, `authenticated`, PUBLIC ; cron (propriétaire) et la fonction admin continuent. |
| `get_user_effective_caps(uuid)` | fenêtre admin `UserCapsDebugModal`, `admin-actions.ts` (clé service) | `anon` retiré ; erreur sauf soi-même ou admin ; sans `auth.uid()` (service) inchangé. |
| `etape_prete(uuid)`, `etapes_pretes_batch(uuid[])` | tableau `/atelier` (`use-atelier-board.ts`), `etapes_pretes_batch` appelle `etape_prete` | `anon` retiré ; erreur sauf accès à la page atelier (capacité de la garde de `/atelier`, relue à l'étape 1) ou admin. Ne renvoie que des vrais/faux. |

Règle commune : `auth.uid()` vide n'est accepté que parce que `anon` et PUBLIC perdent le droit ; seuls le propriétaire (triggers, cron) et `service_role` peuvent alors appeler.

## Point 3 — liste explicite gardée pour `anon`

Établie par le code (pages `/dispos`, `/demande-logistique`, connexion, mot de passe, consentement OAuth) :

- `dispos_public_semaine()`
- `dispos_public_identifier(text,text,text,text[],text[],text)`
- `dispos_public_moi(text)`
- `dispos_public_enregistrer(text,jsonb,text)`
- `dispos_public_maj_qualifs(text,text[],text[],text)`

Rien d'autre : connexion et mot de passe passent par l'authentification, pas par des fonctions ; `is_feature_flag_enabled` n'est appelé qu'une fois connecté.

Pour les 96 autres : `REVOKE EXECUTE FROM PUBLIC, anon` puis `GRANT EXECUTE TO authenticated, service_role` (sauf les 3 réservées ci-dessus), pour ne rien retirer à l'application connectée ni au connecteur Claude.

## Fonctions citées dans les politiques (restent à `authenticated`)

`can_saisie_on_affaire`, `current_user_has_capability`, `current_user_is_chef_on_affaire`, `devis_peut_lire`, `fab_objet_affaire_id`, `has_role`, `is_admin`, `is_chef_global`, `is_chef_or_admin`, `is_devis_termine`, `is_feature_flag_enabled`, `objet_matches_user_metier`, `planning_atelier_ecriture_autorisee`, `planning_terrain_ecrire_autorise`, `planning_terrain_lire_autorise`, `user_can_write_affaire`, `user_cap_scope`, `user_has_affaire_access`, `user_has_cap`, `user_has_capability`, `user_is_mentioned_on_affaire`, `user_is_on_fab_objet` (plus `auth.uid`, `auth.jwt`, `storage.foldername`, hors périmètre). La migration leur redonne explicitement EXECUTE à `authenticated` et une requête de contrôle le confirme.

## Étapes

1. Relire, juste avant, la définition complète des 11 fonctions redéfinies, les capacités `clients.merge` et celle de `/atelier`, la signature de `user_can_write_affaire`, et la tâche cron (lecture admin). Écrire le fichier `/mnt/documents/fermeture-acces-fonctions-migration.sql` avec, pour chaque fonction, le texte **avant** (commentaire) et **après**, plus le retour arrière. **Arrêt pour relecture** — rien n'est appliqué avant votre accord.
2. Après accord : appliquer la migration.
3. Contrôles en base : liste des SECURITY DEFINER encore à `anon` (attendu : les 5) ; fonctions des politiques exécutables par `authenticated` et `mcp_business_rls` ; `detect_client_duplicates` appelé avec la clé publique sans connexion (refus), compte non admin (refus), admin (résultat).
4. Parcours à l'écran en session admin : fusion des clients, publication d'un plan d'essai, fiche objet et journal, onglet Cohérence ; sans connexion : `/dispos` et `/demande-logistique` ; connexion et déconnexion ; si un compte chef existe, ses chantiers via `mes_affaires_chef`.
5. Lancer les tests existants. Compte rendu séparant écran / base / tests. Données d'essai effacées.

## Détails techniques

Forme de la migration (texte complet produit à l'étape 1) :

```sql
-- Point 3 : toutes les SECURITY DEFINER de public sauf la liste explicite
REVOKE EXECUTE ON FUNCTION public.<f>(<args>) FROM PUBLIC, anon;   -- une ligne par fonction, listée en clair
GRANT  EXECUTE ON FUNCTION public.<f>(<args>) TO authenticated, service_role;

-- Fonctions internes
REVOKE EXECUTE ON FUNCTION public.objet_journal_log(uuid,objet_journal_event_type,uuid,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_affaire_equipe_historique(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_staffing_divergence() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ... TO service_role;

-- Exemple de garde (detect_client_duplicates)
CREATE OR REPLACE FUNCTION public.detect_client_duplicates(min_similarity real DEFAULT 0.5)
 RETURNS TABLE(... colonnes inchangées ...) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.current_user_has_capability('clients.merge') THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY <requête actuelle inchangée>;
END $function$;
```

Les gardes de `sync_equipes_from_plan`, `detect_equipe_overrides`, `get_user_effective_caps`, `etape_prete(s)` sont ajoutées en tête de corps, le reste du texte recopié tel que relu. `mes_affaires_chef` garde le langage SQL avec une condition ajoutée au `WHERE`. Aucune réécriture par remplacement de texte.

Retour arrière : rétablir `GRANT EXECUTE ... TO PUBLIC` (ou `anon`) sur les fonctions concernées et recréer les 11 fonctions depuis leur texte « avant ».

Règle d'architecture ajoutée à `AGENTS.md` : toute nouvelle fonction SECURITY DEFINER est créée avec `REVOKE ... FROM PUBLIC, anon` ; seule la liste publique explicite garde `anon`.
