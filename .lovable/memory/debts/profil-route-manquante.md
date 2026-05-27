---
name: Route /profil manquante
description: L4c redirige /mobile/profil et /mobile/chef/moi vers /aujourdhui faute de page profil dédiée — à créer (~30 lignes)
type: feature
---

## Contexte

L4c (v0.50) a fusionné les 20 routes `/mobile/*` dans l'arborescence
principale. Deux routes pointaient vers un "profil utilisateur" mobile :
- `/mobile/profil` (employés)
- `/mobile/chef/moi` (chefs)

Aucune route `/profil` n'existe dans le repo principal. Décision Gabin
(27 mai 2026) : fallback temporaire sur `/aujourdhui` pour ne pas bloquer
L4c. Les liens `ChefMobileHeader` ont été repointés sur `/aujourdhui`
également.

## Dette à rembourser

Créer une vraie route `/profil` (~30 lignes) :
- `src/routes/_app.profil.tsx`
- Contenu minimum : email, rôles, type contrat, bouton logout, lien vers
  `/parametres/utilisateurs` si admin.
- Whitelister dans `EMPLOYE_DESKTOP_ALLOWED` (`src/routes/_app.tsx`).
- Repointer les 3 redirects (`mobile.profil`, `mobile.chef.moi`,
  `mobile.chef.index`) vers `/profil`.
- Repointer `ChefMobileHeader.tsx` lignes 32 + 48 vers `/profil`.
- Ajouter l'entrée dans `AppSidebar` (capability `*` → toujours visible).

## Estimation

~30 minutes (route + 3 redirects + sidebar + smoke E2E).
