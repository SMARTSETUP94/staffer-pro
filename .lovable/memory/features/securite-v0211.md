---
name: Sécurité v0.21.1 — RBAC + RLS + UNIQUE INDEX
description: Sprint sécurité (5 mai 2026) - RoleGuard centralisé, durcissement RLS heures_saisies, UNIQUE INDEX chef du jour, doc RLS étendue
type: feature
---

# Sécurité v0.21.1 (5 mai 2026)

Dernier sprint backlog moyen avant v0.40 horaires SILAE. Verrouille la sécurité applicative.

## Phase 1 — RoleGuard UI centralisé (livré)

Composant `src/components/auth/RoleGuard.tsx` avec props `required: "admin" | "chef_or_admin"`.
- Loader pendant `!rolesLoaded`.
- Redirect `/dashboard` + toast d'erreur si rôle insuffisant.
- Migré sur 3 routes critiques : `/saisie-pour-equipe`, `/audit-heures`, `/audit-auth`.
- Les 7 routes `/parametres/*` gardent leur garde ad-hoc existante (déjà fonctionnelle, pas de régression à risque).

5 tests Vitest sur la matrice rôle × requirement.

## Phase 2 — RLS heures_saisies durci (livré)

Migration v0.21.1 :
- `heures_saisies_self_update` : employé propriétaire peut éditer si `statut <> 'valide'` (au lieu de `IN (brouillon, soumis)`). Autorise la correction post-rejet sans toucher à la validation.
- Nouvelle policy `heures_saisies_self_delete_brouillon` : employé peut supprimer ses brouillons (capacité auparavant absente).

9 tests Vitest sur la matrice acteur × statut × action (UPDATE + DELETE).

## Phase 3 — UNIQUE INDEX chef du jour (livré)

Migration : `assignations_chef_jour_unique (affaire_id, date, demi_journee) WHERE est_chef_jour = true`.

Renforce atomiquement le trigger `enforce_unique_chef_jour` existant. En cas de désignations concurrentes par 2 admins, la seconde transaction est rejetée par contrainte au lieu d'écraser silencieusement.

5 tests Vitest sur l'invariant (slots AM/PM, dates, retrait de flag).

## Phase 4 — Tests intégration SQL (partiellement livré)

Logique RLS dupliquée en tests purs Vitest (cf. ci-dessus, 19 tests). Tests d'intégration contre DB live avec `service_role` vs `anon` reportés (setup CI dédié requis : pool de connexion, snapshot/restore par run). Doc `docs/rls-policies.md` étendue avec matrice complète + référence des tests automatisés livrés.

## Acceptance v0.21.1

- 19 nouveaux tests Vitest verts (1459+ total)
- Migration appliquée sans régression (linter warnings pré-existants ignorés cf. mem://constraints/rls-helpers-execute-grant)
- Doc `docs/rls-policies.md` § "v0.21.1 — Durcissement édition employé" ajoutée
- Roadmap site MAJ
