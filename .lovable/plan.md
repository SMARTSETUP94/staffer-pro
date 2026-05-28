# Plan L5-A — Suppression définitive de `chef_metier_scoped`

État DB : 0 user, 44 lignes `role_capabilities` orphelines, valeur encore dans l'enum `app_role`, 14 policies RLS et 2 helpers SQL dépendent encore d'elle.

Décision produit déjà actée : on supprime la notion "chef scopé par affaire" — `use-chef-scope.ts` + `ScopedAccessBanner` + leurs consommateurs partent.

## 1. Migration SQL unique atomique (1 transaction)

Découpage en 1 seule migration parce que toutes les étapes sont interdépendantes (DROP TYPE bloqué tant que policies/fonctions y réfèrent, mais ALTER POLICY exige DROP+CREATE).

### 1.1 Refacto 14 policies RLS

Pour chaque policy, retirer la branche `OR (is_chef_metier_scoped() AND <quelque_chose>)`. La sémantique restante = admin + chef_chantier global.

Tables impactées :
- `affaire_equipe` — `affaire_equipe_modify_chef_admin`
- `assignation_objets` — insert + delete
- `assignations` — insert + update + delete
- `employes` — `employes_select_self_or_chef` (perd branche scoped employés)
- `fabrication_objet_equipe` — `foe_modify_chef_admin`
- `fabrication_objets` — `fabrication_objets_modify_chef_admin`
- `heures_saisies` — select + insert + update + delete (4)
- `storage.objects` — `fab_photos_storage_select_scoped`

Pattern : `DROP POLICY ...; CREATE POLICY ... (...)` avec la branche scoped retirée.

### 1.2 DROP helpers SQL

```sql
DROP FUNCTION public.is_chef_metier_scoped();
DROP FUNCTION public.is_chef_metier_scoped_for_employe(uuid);
```

### 1.3 DROP + recréation fonctions typées `app_role`

Signatures dépendent du type → drop obligatoire avant DROP TYPE :
- `has_role(uuid, app_role) → boolean` — recréée à l'identique
- `replace_user_roles(uuid, app_role[]) → void` — recréée SANS la ligne `AND role <> 'chef_metier_scoped'`
- `get_user_effective_caps(uuid) → TABLE(..., source_roles app_role[])` — recréée à l'identique

### 1.4 Cleanup data + enum

```sql
DELETE FROM public.role_capabilities WHERE role = 'chef_metier_scoped';
ALTER TABLE public.user_roles      ALTER COLUMN role TYPE text;
ALTER TABLE public.role_capabilities ALTER COLUMN role TYPE text;
DROP TYPE public.app_role;
CREATE TYPE public.app_role AS ENUM (
  'admin','rh','commercial','bureau_etude','chef_chantier',
  'atelier_chef','atelier_metier','chef_pose','poseur','logistique','employe'
);
ALTER TABLE public.user_roles      ALTER COLUMN role TYPE public.app_role USING role::public.app_role;
ALTER TABLE public.role_capabilities ALTER COLUMN role TYPE public.app_role USING role::public.app_role;
```

### 1.5 GRANTs (contrat mémoire core : NEVER REVOKE EXECUTE)

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_user_roles(uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_effective_caps(uuid)          TO authenticated, service_role;
```

## 2. Cleanup TypeScript (parallel writes)

### Suppressions de fichiers
- `src/hooks/use-chef-scope.ts`
- `src/components/auth/ScopedAccessBanner.tsx`

### Patches
| Fichier | Action |
|---|---|
| `src/lib/auth-context.tsx` | Retirer `"chef_metier_scoped"` du type `AppRole`, props `isChefMetierScoped` + `isChefAny`, leurs dérivations lignes 277-278 et value object lignes 291-298 |
| `src/lib/labels.ts` | Retirer du type union, de `USER_ROLE_LABELS`, de `USER_ROLE_OPTIONS` |
| `src/components/atoms/RoleSwitcher.tsx` | Retirer de `ROLE_PRIORITY` |
| `src/lib/admin-actions.ts` | Retirer ligne 560 + commentaire ligne 599 |
| `src/lib/email-templates/invitation.ts` | Retirer du type union ligne 9 + if ligne 44 |
| `src/lib/dashboard/types.ts` | Retirer preset `chef_metier_scoped` lignes 81-83 |
| `src/routes/_app.validation-heures.tsx` | Retirer import `useChefScope` + `ScopedAccessBanner` + leur usage (lignes 39-40, 74, 262) |
| `src/routes/_app.affaires.index.tsx` | Idem (lignes 26-27, 94, 226) |
| `src/routes/_app.admin.feature-flags.tsx` | Retirer mention dans le commentaire ligne 7 |
| `src/routes/_app.audit-heures.tsx` | Retirer mention dans le commentaire ligne 41 |
| `src/routes/_app.admin.utilisateurs.tsx` | Retirer commentaire ligne 69 |
| `src/lib/objet-fiche-permissions.ts` | Mettre à jour commentaires lignes 12 + 69 |
| `src/server/objet-equipe-mutations.functions.ts` | Commentaire ligne 5 |
| `src/components/dashboard/widgets/MonEquipeTypeWidget.tsx` | Commentaire ligne 5 |
| `src/lib/__tests__/labels.test.ts` | Retirer assertions sur `chef_metier_scoped` lignes 20 + 44 |
| `src/lib/__tests__/objet-fiche-permissions.test.ts` | Retirer du tableau lignes 70 + 77 |

`src/integrations/supabase/types.ts` : régénéré automatiquement après la migration, ne pas y toucher.

## 3. Vérifications post-livraison

```bash
rg -n "chef_metier_scoped" -g "*.ts" -g "*.tsx" src/   # doit être vide
```

```sql
-- enum
SELECT array_agg(unnest::text ORDER BY unnest::text)
FROM unnest(enum_range(NULL::app_role));
-- doit retourner SANS 'chef_metier_scoped'

-- policies
SELECT count(*) FROM pg_policies
WHERE qual LIKE '%chef_metier_scoped%' OR with_check LIKE '%chef_metier_scoped%';
-- doit retourner 0

-- helpers
SELECT count(*) FROM pg_proc WHERE proname LIKE 'is_chef_metier_scoped%';
-- doit retourner 0
```

Build + typecheck doivent passer (TanStack regen types après migration).

## 4. Hors scope (reportés)

- **L5-B** (sprint dédié) : suppression complète du bridge layer `auth-context` (les ~12 autres bools `isAdmin/isChef/isRh/...`), règle ESLint `no-restricted-syntax` + extension MemberExpression, 11 specs E2E par rôle + seed users test, adapter `e2e/helpers/auth.ts`.
- **Flag `sidebar_capability_v1`** : déjà actif globalement, rien à faire.

## 5. Risques résiduels

- Les 14 ALTER POLICY retirent un accès qui était potentiellement encore consommé par RLS pour des users avec `chef_metier_scoped`. Mais : **0 user n'a ce rôle en DB**, donc en pratique aucun comportement runtime ne change.
- L'enum recreation via `text` détour fonctionne sur Supabase Postgres standard.
- Si la migration échoue à mi-parcours, la transaction rollback automatiquement.

## 6. Format de livraison

- 1 migration SQL atomique (1 appel `supabase--migration`)
- ~17 patches TS + 2 suppressions (en parallèle après migration approuvée)
- Mise à jour `mem://index.md` roadmap : L5-A livré, L5-B en attente
- Pas de test E2E nouveau (reporté en L5-B)

**Volume estimé** : 1 migration ~250 lignes SQL + ~17 patches TS = 2-3h Lovable d'exécution une fois validé.

Tu valides ?