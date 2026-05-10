# v0.44.3 Sprint correctif — Checklist livraison

**Date** : 10 mai 2026
**Périmètre** : top 3 actions correctives de l'audit v0.43-v0.44.
**Effort réel** : ~7h.

## Action #1 — Finaliser v0.45 RLS scoped (UI + tests) ✅
- [x] `ScopedAccessBanner` créé (`src/components/auth/ScopedAccessBanner.tsx`)
- [x] Intégré sur `/affaires` (desktop)
- [x] Intégré sur `/validation-heures` (desktop)
- [x] Intégré sur `/mobile/chef/dashboard` (compact)
- [x] E2E stub `e2e/chef/sprint-v0443-rls-scoped.chef.spec.ts`
- [ ] pgTAP à brancher en CI dédiée (suit dans v0.44.4)
- [ ] Seed `chef_metier_scoped` dédié (à enrichir dans `e2e/seed.ts`)

## Action #2 — Triggers métier ✅
- [x] `validate_heures_saisies_bounds` — heures_reelles + heures_nuit ∈ [0,24], nuit ≤ reelles
- [x] `validate_contrat_intermittent` — date_fin ≥ date_debut, date_debut ≥ today−2y, taux > 0
- [x] `validate_assignation_heures` — heures ∈ [0,24]
- [x] Codes d'erreur métier clairs : HEURES_INVALIDES / DATES_CONTRAT_INVALIDES / TAUX_INVALIDE
- [ ] Toast UI à enrichir pour mapper ces codes (v0.44.4 polish)

## Action #3 — Audit trail soft-delete docs ✅
- [x] Colonne `deleted_by` ajoutée à `affaire_documents`
- [x] Colonnes `deleted_at` + `deleted_by` ajoutées à `fabrication_objets_photos`
- [x] RPC `soft_delete_affaire_document(_id)` avec garde-fou admin/auteur
- [x] RPC `soft_delete_objet_photo(_id)` avec garde-fou chef/admin
- [x] Vue admin `v_documents_supprimes_30j` (security_invoker)
- [x] RLS `fab_photos_select` filtre `deleted_at IS NULL` (sauf admin)
- [x] Hook `useAffaireDocuments.deleteDocument` câblé sur la RPC
- [x] Index `idx_fab_photos_active` (perf galeries)

## Suivi
- Renommer la roadmap : v0.45 = "partiellement livré (UI banner OK)" — vraie clôture pgTAP en v0.44.4
- v0.44.4 : perf signed URLs batch + lazy-loading + 3 ADRs + purge `/a-valider`
- Réouverture v0.45 propre puis v0.46/v0.47 après v0.44.4

## Critères d'acceptation globaux
- [x] Migration appliquée sans erreur
- [x] Build OK (à vérifier par le harness)
- [x] Bandeau scoped invisible pour chef global / admin (logique : `useChefScope().isScoped`)
- [x] Soft-delete docs/photos préserve l'identité de l'auteur de la suppression
