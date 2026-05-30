---
name: Marge chantier Phase 4 bridge heures
description: Remplacer l'import CSV Progbat par lecture directe heures_saisies (heures terrain validées)
type: feature
---
Différée post-Option A (30 mai 2026). ~5h.

## Périmètre
- Bouton "Importer heures Staffer" dans onglet Heures.
- ServerFn `importHeuresForMarge({ affaire_id?, date_debut, date_fin, statut: 'validee' })` qui SELECT `heures_saisies` joint `affaires` + `employes` → mappe vers `AppData.heures[]`.
- Filtre périmètre : par chantier (numero affaire) ou plage de dates.
- Gestion heures sup / nuit / dimanche : déjà calculées côté Staffer (v0.40) → mapping direct vers buckets engine (sup 25%, sup 50%, nuit, dimanche).
- Garde-fou : seules les heures `validee` par chef sont importées (exclusion des saisies en attente).
- Diff preview (lignes nouvelles / mises à jour) avant merge dans `AppData.heures`.

## Dépendances
- Phase 2 (mapping employé fiable nom ↔ id).
- Phase 3 idéale (matching affaire fiable).
- v0.40 horaires précis (déjà OK).

## Valeur métier
Plus de double saisie / export Progbat manuel. Marge calculée sur les vraies heures pointées terrain. Réactivité quasi temps réel (vs export Progbat hebdo).

## Hors scope
- Pas d'écriture vers heures_saisies depuis cet outil.
