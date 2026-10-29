# Correctif — droits d'écriture sur l'équipe projet (affaire_roles)

Mode plan strict : rien n'est appliqué avant l'accord écrit de Gabin. Aucune publication.

## Constat vérifié (relu en base)

- `affaire_roles_write` (PERMISSIVE, ALL) : `user_has_cap('affaires.edit') AND user_has_affaire_access(affaire_id)` en USING et WITH CHECK.
- `user_has_affaire_access` renvoie vrai uniquement si l'utilisateur figure dans `assignations` de l'affaire (via `employes.profile_id`).
- `app_affecter_role_projet` est SECURITY INVOKER : il passe `app_assert_affaire_write(_affaire_id,'affaires.edit')` (portée all/own/team…), puis l'INSERT/UPDATE/DELETE est bloqué par la policy. L'erreur RLS sur 9471 s'explique ainsi.
- **Écran « Équipe projet » : oui, il était bloqué aussi.** `src/hooks/use-equipe-projet.ts` appelle le même RPC `app_affecter_role_projet` sous la session de l'utilisateur ; un admin non affecté recevait la même erreur. La même chose vaut pour le retrait d'un rôle (DELETE couvert par la policy ALL).
- **role_referents : pas le même problème.** `role_referents_admin_write` = `is_admin()` (sans condition d'affectation) ; le select est ouvert aux connectés ; les restrictives OAuth bloquent Claude. Rien à modifier (simple signalement : l'écriture y est réservée aux admins, ce qui correspond à l'écran Paramètres > Référents).

## Migration 0045 proposée (complète)

```sql
-- 0045 — affaire_roles : portée d'écriture alignée sur app_assert_affaire_write
CREATE OR REPLACE FUNCTION public.user_can_write_affaire(_affaire_id uuid, _cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.user_has_cap(_cap)
     AND EXISTS (
       SELECT 1
       FROM public.affaires a
       WHERE a.id = _affaire_id
         AND a.archived_at IS NULL
         AND (
               public.user_cap_scope(_cap) = 'all'
           OR (public.user_cap_scope(_cap) = 'own'
               AND a.charge_affaires_id = auth.uid())
           OR (public.user_cap_scope(_cap) IN ('team','affaire','assigned')
               AND public.user_has_affaire_access(_affaire_id))
         )
     );
$function$;

REVOKE ALL ON FUNCTION public.user_can_write_affaire(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_write_affaire(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS affaire_roles_write ON public.affaire_roles;
CREATE POLICY affaire_roles_write
  ON public.affaire_roles
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.user_can_write_affaire(affaire_id, 'affaires.edit'))
  WITH CHECK (public.user_can_write_affaire(affaire_id, 'affaires.edit'));
```

Notes :
- Le rôle de dispatch `mcp_business_rls` hérite d'`authenticated` : il obtient EXECUTE par héritage, et `auth.uid()` reste celui du jeton Claude, donc la portée de l'utilisateur s'applique.
- Inchangés : `affaire_roles_select`, les 3 policies restrictives `mcp_oauth_block_*`, triggers de synchronisation, `app_affecter_role_projet`, `app_assert_affaire_write`, toutes les fonctions existantes, `role_referents`.
- Idempotente : `CREATE OR REPLACE` + `DROP POLICY IF EXISTS`.
- Ajout d'une ligne dans `AGENTS.md` : écriture affaire_roles via `user_can_write_affaire`, même portée que `app_assert_affaire_write`.

## Tests après application (transaction annulée, données fictives)

1. Admin non affecté (scope all) → `app_affecter_role_projet` sur une opportunité fictive : OK.
2. Utilisateur scope `own`, chargé d'affaires de l'affaire → OK.
3. Utilisateur scope `own` sur une affaire d'un autre chargé → refus.
4. Utilisateur affecté (assignation) scope `assigned`/`team` → OK.
5. Affaire archivée → refus (même admin).
6. Jeton Claude (`client_id` présent), INSERT direct hors confirmation → refusé (restrictive + garde RPC).
7. Jeton Claude dans le contexte de dispatch (`mcp_business_rls`) via `app_affecter_role_projet` → OK.
8. Retrait d'un rôle (employé NULL → DELETE) par admin non affecté → OK.

Puis contrôle UI : affecter un responsable projet depuis l'écran « Équipe projet » avec un admin non affecté (donnée temporaire, nettoyée).
