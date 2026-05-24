---
name: Fiche objet — section Équipe affectée
description: Règles de mutation équipe sur un objet (draft/published, préférence, manual_assignment_origin)
type: feature
---
Section « Équipe affectée » de la fiche objet (`ObjetEquipeSection`) — règles de mutation post-hotfix v8.3 :

## Statuts de plan et mutations
- `published` : mutations autorisées (bandeau neutre)
- `draft` : mutations autorisées (bandeau ambre d'avertissement)
- `no_plan` : mutations bloquées, boutons disabled + tooltip « créez un plan brouillon ou publié »

## Coexistence draft + published sur un même objet/métier
Cas réel : plan v1 publié sur le chantier + plan v2 en brouillon préparé par le chef pour republication.

**Règle actuelle** : `loadPublishedStepsForObjet` (à renommer `loadActiveStepsForObjet`, cf. mem://debts/load-active-steps-for-objet-rename) **préfère les steps published si les deux existent sur le même objet/métier**. Les assignations manuelles depuis la fiche objet écrivent donc sur le plan en production.

**Conséquence UX** : pour staffer sur un draft alors qu'un published existe encore, le chef doit dépublier le published d'abord (ou supprimer son plan publié). Pas de UI dédiée pour forcer le draft — comportement assumé pour éviter d'écrire en parallèle sur deux versions.

## Protection contre PRESENCE_MISMATCH
Toute assignation issue de la fiche objet est marquée `staffing_plan_assignment.manual_assignment_origin = 'fiche_objet'`. Le moteur auto-staffing et l'algo de republication respectent ce marqueur : l'assignation est conservée même si le plan est republié, ce qui évite l'alerte `PRESENCE_MISMATCH`.

## Composants & SF
- UI : `src/components/objets/equipe/ObjetEquipeSection.tsx` + `AddPersonneDialog` + `RemovePersonneDialog`
- SF : `src/server/objet-equipe.functions.ts` (lecture) + `src/server/objet-equipe-mutations.functions.ts` (mutations)
- Dette UI : Dialog au lieu de Sheet, cf. mem://debts/equipe-add-personne-dialog-vs-sheet
