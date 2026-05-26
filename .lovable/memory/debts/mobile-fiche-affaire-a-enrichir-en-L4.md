---
name: Fiche affaire mobile à enrichir en L4
description: /mobile/chef/affaires/$affaireId conservée en V1 (gallery seul) ; à enrichir en L4 avec accès Casting/équipe selon capabilities (vue affaire mobile responsive complète).
type: feature
---

## Contexte

- v0.49 Batch 9.7 P4 a gardé `src/routes/mobile.chef.affaires.$affaireId.tsx` en l'état (gallery uniquement).
- La refonte L1 prévoit une fiche affaire mobile unifiée gated par capabilities, accessible à tous les rôles terrain (chef_chantier, chef_pose, atelier_chef, poseur…).

## À livrer en L4

- Route cible `/mobile/affaires/$affaireId` (éliminer le préfixe `/mobile/chef/*`).
- Sections gated par cap :
  - Infos affaire (lieu, dates, client) — cap `affaire.read`
  - Casting/équipe en lecture — cap `casting.read`
  - Photos chantier (existant) — cap `affaire.photos.read`
  - Commentaires journal — cap `affaire.journal.read`
  - Documents (devis, plans) — cap `affaire.documents.read`
- Bouton retour vers contexte source (mission pose / hub chef / liste affaires).

## Dépendances

- Lot L2 (seed matrice capabilities DB).
- Lot L4 (refacto routes mobile + nav adaptative).
- Réutiliser composants existants `AffaireInfosPoseSection`, `CastingChantierSection` en mode lecture mobile.
