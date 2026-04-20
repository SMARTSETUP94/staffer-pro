# Audit RLS — Setup Paris Planning Chantiers

**Date** : 2026-04-20
**Méthode** : audit statique des policies + sondes SQL read-only
**Rôles testés** : `admin`, `chef_chantier`, `employe`

## Hypothèses de test

- `admin` : `is_admin() = true` ⇒ `is_chef_or_admin() = true`
- `chef_chantier` : `is_admin() = false`, `is_chef_or_admin() = true`
- `employe` : `is_admin() = false`, `is_chef_or_admin() = false`. Lié à un `employes.profile_id = auth.uid()`.
- `employe sans profile_id` (intérimaire / indep) : pas de session ⇒ ne déclenche aucune policy.

## Tableau récapitulatif (✅ attendu / ❌ blocage / 🟡 limité)

### Lecture (SELECT)

| Table | admin | chef_chantier | employe |
|---|---|---|---|
| `affaires` | ✅ all | ✅ all | ❌ none |
| `employes` | ✅ all | ✅ all | 🟡 self only (`profile_id=auth.uid()`) |
| `devis` | ✅ all | ✅ all | ❌ none |
| `devis_postes` | ✅ all | ✅ all | ❌ none |
| `assignations` | ✅ all | ✅ all | 🟡 self only |
| `absences` | ✅ all | ✅ all | 🟡 self only |
| `heures_saisies` | ✅ all | ✅ all | 🟡 self only |
| `heures_saisies_historique` | ✅ all | ✅ all | 🟡 self only (via JOIN) |
| `swap_requests` | ✅ all | ✅ all | 🟡 from/to self only |
| `notifications` | 🟡 self only | 🟡 self only | 🟡 self only |
| `affaire_commentaires` | ✅ all | ✅ all | ❌ none |
| `metiers` | ✅ all | ✅ all | ✅ all (référentiel public) |
| `profiles` | ✅ all | ✅ all | 🟡 self only |
| `user_roles` | ✅ all | 🟡 self only | 🟡 self only |

### Écriture (INSERT/UPDATE/DELETE)

| Table | admin | chef_chantier | employe |
|---|---|---|---|
| `affaires` | ✅ CRUD | ✅ CRUD | ❌ |
| `employes` | ✅ CRUD | ✅ CRUD | ❌ |
| `devis` / `devis_postes` | ✅ CRUD | ✅ CRUD | ❌ |
| `assignations` | ✅ CRUD | ✅ CRUD | 🟡 UPDATE `statut_confirmation` self only |
| `absences` | ✅ CRUD | ✅ CRUD | 🟡 INSERT self avec `valide=false` |
| `heures_saisies` | ✅ CRUD | ✅ CRUD | 🟡 INSERT/UPDATE self (`brouillon`/`soumis` only) |
| `heures_saisies_historique` | ❌ (auto-trigger seul) | ❌ | ❌ |
| `swap_requests` | ✅ CRUD | ✅ CRUD | 🟡 INSERT self (from), UPDATE concerned |
| `notifications` | 🟡 UPDATE/DELETE self | 🟡 self | 🟡 self (INSERT bloqué pour tous) |
| `affaire_commentaires` | ✅ INSERT/SELECT/DELETE | ✅ idem | ❌ |
| `metiers` | ✅ CRUD | ❌ (admin only) | ❌ |
| `profiles` | ✅ CRUD | 🟡 UPDATE self | 🟡 UPDATE self |
| `user_roles` | ✅ CRUD | ❌ | ❌ |

## Vérifications fines

### ✅ Cohérence triggers vs RLS

1. **`create_notification(_user_id NULL)`** → `RETURN NULL` immédiat. Tous les triggers de notification (`notify_*`) passent `_employe.profile_id` qui peut être NULL pour 345 intérimaires sans compte → **aucun crash**, juste pas de notif.
2. **`guard_assignation_confirmation`** : refuse `refusee` sans `motif_refus`. Cohérent.
3. **`guard_heures_saisies_transition`** : bloque re-soumission si `motif_rejet` non acquitté (`motif_rejet_lu_le IS NULL`). Cohérent.
4. **`apply_swap_on_validation`** : passe `statut → 'appliquee'` après UPDATE des assignations. Trigger `BEFORE UPDATE` correct.
5. **`validate_swap_request`** : vérifie compatibilité métier via `metier_principal_id` OU `employe_metiers`. Cohérent.

### 🟡 Points d'attention (non bloquants)

| # | Constat | Recommandation |
|---|---|---|
| 1 | `notifications` n'a **pas de policy INSERT** → l'insert ne passe que via `create_notification` (SECURITY DEFINER). ✅ Sécurisé. | RAS |
| 2 | `heures_saisies_historique` : pas de policy INSERT/UPDATE/DELETE → seul le trigger `log_heures_saisies_transition` (SECURITY DEFINER) écrit. ✅ Sécurisé. | RAS |
| 3 | ~~Policy `heures_saisies_self_update` permet UPDATE sur statut `soumis`.~~ **✅ CORRIGÉ (2026-04-20)** : policy restreinte à `brouillon`, et acquittement de rejet via RPC `acknowledge_heures_rejet` (SECURITY DEFINER). | RAS |
| 4 | Policy `assignations_self_confirm` couvre `[en_attente, confirmee, refusee]` → un employé peut re-passer `confirmee → refusee` ou inverse indéfiniment. | Acceptable si workflow voulu, sinon ajouter contrainte `OLD.statut_confirmation = 'en_attente'` |
| 5 | `affaire_commentaires` : aucun accès employé → un employé connecté ne peut pas lire les commentaires de SON chantier. | Si pas voulu, ajouter policy `SELECT` filtrant par `affaire_id IN (assignations self)` |
| 6 | 345 intérimaires sans `profile_id` → ne reçoivent aucune notif et n'ont pas accès à `/mes-propositions`. | Documenter : pour qu'un intérimaire confirme, il faut lui créer un compte (`inviteUser` dans admin-actions.ts) |
| 7 | Aucun trigger anti-double-swap. | Optionnel : trigger qui empêche un swap si l'assignation source/target est déjà dans un swap actif (`proposee`/`acceptee_collegue`) |

### 🔴 Pas de finding critique

Aucune table sans RLS. Aucune policy `USING (true)` sur table sensible. Aucune fuite de PII (les emails sont dans `employes` / `profiles`, accessibles seulement aux chefs/admins ou self).

## Recommandation finale

**Production-ready** côté RLS, modulo le point #3 (durcir `heures_saisies_self_update` pour bloquer le statut `soumis`). Les autres points sont des choix produit à arbitrer.
