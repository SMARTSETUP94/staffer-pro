# Sprint A — v0.45 RLS Hardening Chef Métier scoped (~8h)

## Objectif

Introduire un nouveau niveau d'accès **chef_metier_scoped** (par-affaire stricte) à côté du **chef_chantier** actuel (global). Aucune migration forcée des comptes existants : tous les chefs actuels gardent leur accès global. Les nouveaux chefs métier (peinture, bois, manut, etc.) sont ajoutés avec le nouveau rôle. Audit + adaptation des pages desktop qui supposent un accès global, pgTAP pour vérouiller l'isolation.

## 1. Modèle de rôles (DB)

### 1.1 Enum `app_role` étendu

```text
admin                 (full)
chef_chantier         (global, existant — comportement inchangé)
chef_metier_scoped    (NOUVEAU — accès UNIQUEMENT aux affaires où il est référencé)
employe               (ses heures uniquement)
```

`chef_metier_scoped` est référencé sur une affaire de l'une des 3 façons existantes :
- `affaires.chef_chantier_id` (lead chantier)
- `affaires.responsable_montage_id` / `affaires.responsable_demontage_id`
- `fabrication_objets.respo_fab_id` (chef métier sur un objet de l'affaire)

### 1.2 Helpers RLS modifiés (SECURITY DEFINER)

Tous existants — pas de REVOKE EXECUTE (cf. core memory) :

- `is_chef_or_admin()` → reste `admin ∪ chef_chantier ∪ chef_metier_scoped`. **Sémantique préservée** : aucune politique RLS existante ne casse.
- `is_chef_global()` → **NOUVEAU** : `admin ∪ chef_chantier` (PAS `chef_metier_scoped`). Utilisé là où l'on veut vraiment l'accès global.
- `current_user_is_chef_on_affaire(_affaire_id)` → étendu : retourne TRUE si admin, chef_chantier global, ou si chef_metier_scoped référencé sur l'affaire (chef_chantier_id, respo_montage/demontage, respo_fab d'un objet de l'affaire, ou ligne dans `mes_affaires_chef`).
- `user_has_affaire_access(_affaire_id)` → inchangé.

### 1.3 RLS durcie sur 4 tables sensibles

Politiques `chef_metier_scoped` = `current_user_is_chef_on_affaire(affaire_id)` :

| Table | Avant (chef_or_admin) | Après chef_metier_scoped |
|---|---|---|
| `heures_saisies` | global | scoped par-affaire (SELECT + INSERT + UPDATE + DELETE) |
| `fabrication_objets` | global modify | SELECT all auth (inchangé) ; MODIFY scoped par-affaire |
| `contrats_intermittents` | admin-only modify (inchangé) | SELECT élargi : chef_metier_scoped sur affaires de ses staffings |
| `affaire_documents` | déjà scopé via `current_user_is_chef_on_affaire` | aucun changement (déjà OK) |

NB : `affaires` & `assignations` gardent leur SELECT large via `is_chef_or_admin()` car le filtrage est délégué aux requêtes app (`mes_affaires_chef`). Durcir `affaires` casserait trop de queries.

## 2. Audit pages desktop concernées

Inventaire des pages qui supposent un accès chef global :

| Page | Constat | Adaptation |
|---|---|---|
| `/validation-heures` | Liste toutes les heures à valider | Filtrer par `mes_affaires_chef` quand `chef_metier_scoped` |
| `/audit-heures` | Audit transversal | Bandeau "Vue scopée à vos affaires" + filtre auto |
| `/planning` | Vue planning global | OK : RLS sur assignations laisse passer; le chef voit ce qui le concerne |
| `/affaires` | Liste affaires | Filtrage app via `useMesAffairesChef` si scoped |
| `/equipe` | Roster équipe | `is_chef_global()` pour autoriser ; sinon redirect |
| `/parametres/*` | Réservé admin (inchangé) | — |

Pattern UI :
- Nouveau hook `useChefScope()` → retourne `{ isGlobal: boolean, isScoped: boolean }` à partir de `has_role()`.
- Bandeau réutilisable `<ScopedAccessBanner />` sur les pages où le scope a un effet visible.

## 3. Migration DB (idempotente)

```text
1) ALTER TYPE app_role ADD VALUE 'chef_metier_scoped' (si absent)
2) CREATE OR REPLACE FUNCTION is_chef_global() — admin ∪ chef_chantier
3) CREATE OR REPLACE FUNCTION current_user_is_chef_on_affaire(_id uuid)
     — ajout branche chef_metier_scoped via mes_affaires_chef
4) Politiques RLS sur heures_saisies / fabrication_objets / contrats_intermittents :
     — DROP + RECREATE chaque policy SELECT/INSERT/UPDATE/DELETE
     — chef_chantier global continue de passer, chef_metier_scoped passe via la nouvelle branche
5) GRANT EXECUTE on ces functions to authenticated (jamais REVOKE — core rule)
```

Aucun chef actuel n'est touché. Bascule d'un compte = simple INSERT dans `user_roles (user_id, role='chef_metier_scoped')` + delete éventuel de la ligne chef_chantier — opération manuelle admin via SQL ou page `/admin/utilisateurs` existante.

## 4. Tests pgTAP

Fichier `supabase/tests/v0.45_rls_chef_metier_scoped.sql` :

1. Setup : 2 affaires (A1 où chef_test est respo_fab d'un objet, A2 où il n'est rien).
2. Test : chef_metier_scoped SELECT heures_saisies sur A1 → ≥0 lignes, JAMAIS sur A2 → 0 ligne.
3. Test : INSERT heures_saisies sur A2 → ÉCHEC (violates RLS).
4. Test : UPDATE/DELETE heures_saisies sur A2 → ÉCHEC.
5. Test : SELECT/UPDATE fabrication_objets sur A2 → SELECT autorisé (vue large), UPDATE refusé.
6. Test : SELECT affaires : voit A1, ne voit pas A2 via `mes_affaires_chef`.
7. Test : chef_chantier global garde accès complet aux 2 affaires.
8. Test : admin accède à tout.

## 5. Livrables

- Migration `20260510_xxxxxx_v0.45_chef_metier_scoped.sql` (irreversible + idempotent)
- Helper `is_chef_global()` + `current_user_is_chef_on_affaire()` étendu
- Page `/admin/utilisateurs` : nouveau choix de rôle chef_metier_scoped (UI uniquement)
- Hook `src/hooks/use-chef-scope.ts`
- Composant `src/components/auth/ScopedAccessBanner.tsx`
- Adaptations : `/validation-heures`, `/audit-heures`, `/affaires` (filtrage `useMesAffairesChef`)
- Tests `supabase/tests/v0.45_rls_chef_metier_scoped.sql` (8 cas)
- E2E `e2e/admin/v045-chef-metier-scoped.admin.spec.ts` (3 specs : isolation SELECT + INSERT refusé + UI bandeau)
- Doc `docs/sprint-v045-checklist.md`
- Memory `mem://features/chef-metier-scoped` + entrée roadmap

## 6. Risques & mitigation

- **Risque** : politique RLS cassée pour les chefs actuels. **Mitigation** : `is_chef_or_admin()` inchangé (sémantique élargie), tous les chefs actuels passent toujours. Tests pgTAP couvrent l'invariant.
- **Risque** : `mes_affaires_chef` ne référence pas `responsable_montage_id` ou `respo_fab_id`. **Mitigation** : audit + extension de la vue/RPC si nécessaire (vérification à faire en premier).
- **Risque** : énumération de rôle bloquée par Postgres (ALTER TYPE ADD VALUE doit être hors transaction). **Mitigation** : migration en 2 étapes (1 commit ADD VALUE, 2 commit policies) si Supabase migration refuse l'inline.

## 7. Hors scope (v0.46+)

- Migration forcée des chefs actuels vers `chef_metier_scoped` (décision business)
- Page admin dédiée à la gestion des affectations chef×affaire (déjà géré via `affaires.chef_chantier_id` UI existante)
- RLS sur `affaires` durcie (trop de queries app à refactorer)

## Estimation

~8h : 2h DB+helpers, 1h tests pgTAP, 3h audit+adaptation pages, 1h E2E, 1h docs/memory.
