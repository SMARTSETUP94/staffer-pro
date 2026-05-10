# v0.44.4 Polish audit — Checklist livraison

**Date** : 10 mai 2026
**Périmètre** : top 5 audit restant après le sprint correctif v0.44.3.
**Effort réel** : ~4h.

## 1. Batch signed URLs galerie ✅
- [x] `useAffaireDocuments.prefetchSignedUrls(paths[])` ajouté
  — utilise `supabase.storage.createSignedUrls` (1 round-trip)
- [x] Cache intelligent (filtre les paths déjà valides, ne refait pas l'appel)
- [x] `AffaireDocumentsGallery` déclenche le préfetch dès que `documents` change
- [x] Bénéfice : 20 photos = 1 appel HTTP au lieu de 20 (idem `useObjetPhotos` qui wrappe le hook)

## 2. Lazy-loading thumbnails ✅
- [x] `DocumentThumbnail` utilise `IntersectionObserver` (`rootMargin: 200px`)
- [x] `getSignedUrl` n'est appelé QUE quand la miniature entre dans le viewport
- [x] Combiné avec le préfetch en lot → la résolution est en général un cache-hit
- [x] Fallback `decoding="async"` + `loading="lazy"` sur la balise `<img>`
- [x] Dégradation propre si `IntersectionObserver` indisponible (anciens browsers)

## 3. Helper toast codes métier triggers ✅
- [x] `src/lib/business-errors.ts` : `parseBusinessError` + `formatBusinessError`
- [x] Mapping 4 codes : `HEURES_INVALIDES`, `DATES_CONTRAT_INVALIDES`, `TAUX_INVALIDE`, `VOLUME_ECART_DEVIS`
- [x] Fallback UNKNOWN sur message brut PostgreSQL
- [x] 6/6 tests vitest verts (`src/lib/__tests__/business-errors.test.ts`)
- [ ] À brancher progressivement dans les hooks d'écriture (use-heures-*, contrats) — backlog v0.44.5

## 4. 3 ADRs ✅
- [x] `docs/adr/README.md` — index
- [x] `docs/adr/001-rls-scoped-chef-metier.md` — Option D scope app-side
- [x] `docs/adr/002-objet-id-nullable-affaire-documents.md` — 1:N affaire→photo + ON DELETE SET NULL
- [x] `docs/adr/003-tiptap-pour-contrats-cddu.md` — TipTap v2 + visitor JSON→React

## 5. Seed E2E `chef_metier_scoped` ✅
- [x] `e2e/fixtures/test-accounts.ts` : nouveau `TestRole = "chef_metier_scoped"`
- [x] Variables env optionnelles `E2E_CHEF_SCOPED_EMAIL` / `E2E_CHEF_SCOPED_PASSWORD` (avec fallback)
- [x] `e2e/seed.ts` : seed 4e compte + helper `metierOrdre` (peinture par défaut)
- [x] `ensureChefAffaire` paramétré : crée une 2e affaire `5E2E2` "E2E Affaire Chef Scopé"
- [x] Storage state path dédié `e2e/.auth/chef-scoped.json`

## Hors-scope (justifications)

- **Index DB sur `uploaded_at DESC`** : déjà présent (`idx_affaire_documents_affaire_active`
  et `idx_fab_photos_active`) — l'audit avait sous-estimé l'existant.
- **Purge `/mobile/chef/a-valider`** : la route est un redirect intentionnel de 10 lignes
  (`v0.44.2`) qui préserve les bookmarks → conservée. Aucune logique morte derrière
  (le hook `useChefAValider` est toujours utilisé par equipe/dashboard/atelier).

## Suivi

- v0.44.5 backlog : brancher `formatBusinessError` dans les hooks d'écriture (toast UI cohérent)
- v0.45 : ré-ouverture RLS hardening (pgTAP CI + politiques DB scopées)
