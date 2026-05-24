---
name: Equipe AddPersonne Dialog vs Sheet
description: Lot 8.3b a livré AddPersonneDialog (modal centré) au lieu du AssignerPersonneSheet prévu (panneau latéral). À migrer en Sheet lors du polish Lot 8.6.
type: constraint
---

## Contexte
Lot 8.3b — Mutations équipe fiche objet.

## Dette
- Composant livré : `src/components/objets/equipe/AddPersonneDialog.tsx` (Dialog centré shadcn)
- Composant prévu dans la note d'analyse : `AssignerPersonneSheet` (Sheet latéral droit)

## Pourquoi c'est une dette
Le Dialog cache la fiche objet derrière l'overlay. L'utilisateur perd le contexte
(KPI métier, autres personnes déjà assignées, présence cumulée) pendant qu'il
choisit un coéquipier. Un Sheet à droite laisserait la fiche visible, plus pratique
pour itérer (ajouter 2-3 personnes à la suite, ajuster les % de présence).

Même remarque pour `RemovePersonneDialog` : confirmation simple, OK en AlertDialog,
mais cohérence visuelle à revoir si on bascule l'ajout en Sheet.

## À traiter en Lot 8.6 (polish)
- Migrer `AddPersonneDialog` → `AddPersonneSheet` (composant `Sheet` shadcn, `side="right"`).
- Garder la même API props pour minimiser le diff côté `ObjetEquipeSection`.
- Vérifier responsive mobile : sur petit écran, Sheet `side="bottom"` peut être préférable.

## Why
Choix de raccourci d'implémentation, pas délibéré. Mentionné par l'utilisateur lors
des retours 8.3b (23 mai 2026).
