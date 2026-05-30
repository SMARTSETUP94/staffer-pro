---
name: Marge chantier Phase 3 bridge devis
description: Brancher l'onglet Devis sur les tables devis + affaires Supabase (sélecteur chantier → import auto lignes)
type: feature
---
Différée post-Option A (30 mai 2026). ~5h.

## Périmètre
- Sélecteur "Importer un devis Staffer" dans onglet Devis (autocomplete sur `affaires` filtré typologie 5XXX prioritaire).
- ServerFn `importDevisForMarge(devis_id)` qui SELECT devis + devis_lignes + fabrication_objets (heures par métier) → mappe vers `AppData.devis[]` (lignes prix + lignes heures).
- Synchronisation des Référentiels postes/métiers depuis `postes_catalogue` + métiers DB pour éviter divergence avec engine.
- Bouton "Rafraîchir" par devis importé (re-pull si avenant côté Staffer).
- Tag visuel "Importé Staffer" vs "Saisi manuel".

## Dépendances
- Phase 2 idéalement (référentiel postes/métiers cohérent).
- RLS : admin a déjà SELECT sur devis + affaires.

## Valeur métier
Élimine la re-saisie manuelle des devis et registre devis (gain temps massif + zéro erreur typo). Permet drilldown chantier ↔ marge réelle.

## Hors scope
- Pas de propagation marge réelle → affaire (lecture seule de devis).
