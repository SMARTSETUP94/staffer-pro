---
name: catalogue-capabilities-sync
description: src/lib/capabilities/catalog.ts doit rester le miroir exact des 142 lignes de public.capabilities (test d'intégrité + comparaison DB via psql)
type: constraint
---
`src/lib/capabilities/catalog.ts` est généré depuis `public.capabilities`
(clé + label, groupés par `category`). Toute migration qui ajoute, retire ou
renomme une capability DOIT mettre ce fichier à jour dans le même lot.

Garde-fou : `src/lib/capabilities/__tests__/matrix-integrity.test.ts`
- compte figé (142)
- clés uniques, pointées, labels non vides
- comparaison stricte avec la table via `psql` quand `PGHOST` est disponible
  (test neutre sinon, pour un CI front pur).

Fiche objet : les gardes UI utilisent `objet.view` / `objet.edit` /
`objet.photo.upload` / `objet.photo.delete` (cette dernière = admin uniquement),
et non plus les anciennes `action.upload_photo` / `action.delete_photo`.
