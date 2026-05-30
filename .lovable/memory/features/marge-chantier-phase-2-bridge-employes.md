---
name: Marge chantier Phase 2 bridge employés
description: Remplacer la saisie manuelle Base RH par lecture depuis table employes Supabase (bouton "Importer depuis Staffer")
type: feature
---
Différée post-Option A (30 mai 2026). ~5h.

## Périmètre
- Bouton "Importer depuis Staffer" dans l'onglet Base RH.
- ServerFn `importEmployesForMarge` qui SELECT sur `employes` (statut actif, contrat CDI/CDD/Intérim, salaire_brut, taux horaire conventionnel, poste_principal, metier_principal).
- Mapping : `employes.poste_principal` → `AppData.rh[].poste`, `employes.metier_principal` → `.metier`, `employes.type_contrat` → `.statut` (avec table de conversion CDI→Permanent 35h, Intérim→Intermittent, …).
- Diff preview (à importer / à mettre à jour / inchangés) avant écriture dans `AppData.rh`.
- Conservation des lignes manuelles existantes (merge intelligent par nom+email).

## Dépendances
- Cap `section.admin` (déjà OK).
- Table `employes` existante (OK depuis v0.42.2 `poste_principal`).

## Valeur métier
Évite ressaisie des ~160 employés. Sync automatique des salaires lors des avenants. Cohérence référentiel.

## Hors scope
- Pas d'écriture vers `employes` depuis cet outil (lecture seule).
- Pas de sync auto en background (bouton manuel uniquement).
