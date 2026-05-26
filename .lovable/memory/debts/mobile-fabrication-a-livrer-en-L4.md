---
name: Mobile fabrication atelier à livrer en L4
description: Stub /mobile/chef/fabrication supprimé v0.49 Batch 9.7 P4 ; remplacement propre via capability `mobile.fabrication_atelier` en L4 refonte rôles (cible : atelier_metier + atelier_chef).
type: feature
---

## Contexte

- v0.49 Batch 9.7 P4 a supprimé `src/routes/mobile.chef.fabrication.tsx` (stub Tour 2, jamais terminé, route orpheline).
- La refonte rôles/permissions L1 (`outputs/roles-permissions-setup-paris.md`) prévoit une vraie page atelier mobile gated par la capability `mobile.fabrication_atelier`.

## À livrer en L4

- Route `/mobile/fabrication` (et NON `/mobile/chef/fabrication` — préfixe `/mobile/chef/*` à éliminer).
- Affichage liste objets de l'atelier de l'utilisateur (atelier_metier voit son métier, atelier_chef voit tous métiers atelier).
- Actions terrain : marquer objet "en cours", "terminé", uploader photo, ajouter commentaire.
- Onglet "Atelier" du bottom nav adaptatif (unique nav mobile post-L4).

## Dépendances

- Lot L2 (seed matrice capabilities DB).
- Lot L4 (refacto MobileBottomNav unique adaptative selon caps).
