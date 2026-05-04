# Modale d'assignation scrollable

## Problème observé

Sur la capture (viewport 1015×768), la modale "Créer une nouvelle assignation" déborde sous le pli : on voit le bandeau budget mais les boutons "Annuler / Confirmer" en bas sont coupés. Il manque un scroll interne pour pouvoir parcourir tout le contenu de la modale sans perdre l'accès aux actions.

Cause technique : dans `src/components/planning/AssignationDialog.tsx` ligne 514, le `<DialogContent>` est rendu avec uniquement `className="max-w-lg"` — pas de `max-h`, pas d'`overflow`. Quand la modale dépasse la hauteur du viewport, elle est simplement tronquée.

## Correctif

Un seul fichier touché : `src/components/planning/AssignationDialog.tsx`.

1. **Borner la hauteur du `DialogContent`** à ~90 % du viewport et le passer en flex-column pour que header / footer restent visibles et que seul le corps scrolle.
   - `className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0"`

2. **Wrapper le corps** (entre `DialogHeader` et `DialogFooter`) dans une `<div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">` pour qu'il devienne la zone scrollable.

3. **Sortir le `DialogHeader` et le `DialogFooter`** du flux scrollable (les laisser sticky en haut/bas du `DialogContent`) avec un padding propre (`px-6 pt-6` et `px-6 pb-6 border-t`) pour que les boutons "Annuler / Confirmer" et le bandeau budget restent toujours visibles et cliquables.

4. **Vérifier les sous-éléments scrollables existants** (la liste des objets ligne 768 a déjà son propre `max-h-40 overflow-y-auto`) — pas de conflit, ils restent fonctionnels à l'intérieur du scroll parent.

## Résultat attendu

- Sur grand écran : aucun changement visible, la modale s'affiche en entier comme avant.
- Sur écran moyen/petit (≤ 800 px de haut) : le titre et les boutons d'action restent fixes ; le contenu central (champs + liste objets + budget) scrolle verticalement.
- Aucun changement de comportement métier, juste une amélioration d'accessibilité visuelle.
