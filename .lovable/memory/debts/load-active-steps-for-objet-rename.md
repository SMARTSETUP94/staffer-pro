---
name: Renommage loadPublishedStepsForObjet
description: La SF charge désormais draft+published, le nom est trompeur — renommer en loadActiveStepsForObjet
type: constraint
---
Depuis le hotfix v8.3 (révision arbitrage mutations sur draft), la fonction `loadPublishedStepsForObjet` dans `src/server/objet-equipe-mutations.functions.ts` charge en réalité les steps des plans `draft` OU `published` (avec préférence published si les deux coexistent sur le même métier).

**Action** : renommer en `loadActiveStepsForObjet` (ou `loadEditableStepsForObjet`) lors du Lot 8.6 polish. Mettre à jour tous les call sites + commentaires.

**Why** : éviter qu'un futur dev tombe sur le nom et présume à tort que seuls les plans publiés sont concernés.
