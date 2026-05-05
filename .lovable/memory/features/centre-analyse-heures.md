---
name: Centre d'analyse heures consolidé
description: Backlog — onglet centralisé heures saisies + à valider, 8 filtres combinables, exports Excel/CSV/PDF/SILAE, KPIs, RLS chef/admin
type: feature
---

# Centre d'analyse heures consolidé (BACKLOG, ~8-10h)

Idée Gabin (5 mai 2026, fin session v0.21.1). À développer plus tard, pas de dev ce soir.

## Position

Soit nouvel onglet sur `/audit-heures` existant, soit nouvelle page dédiée `/heures-analyse`. Accès admin + chef (RoleGuard `chef_or_admin`). Employé : redirect vers `/mes-heures`.

## Vue tableau

Colonnes : Date | Employé | Chantier | Devis | Métier | Heures (jour/nuit) | Statut (brouillon / à valider / validée / refusée / hors-planning) | Saisi par (employé lui-même ou chef) | Validée par | Action (edit / supprimer si applicable).

Lignes : `heures_saisies` avec jointures profiles / affaires / devis / metiers.

## Filtres combinables (AND, compteur live)

1. **Chantier** : multi-select dropdown avec recherche (5XXX / 2XXX...)
2. **Employé** : multi-select recherche fuzzy (nom + prénom)
3. **Date précise** : date picker single
4. **Période** : presets (cette semaine / ce mois / mois dernier / 30 derniers jours / personnalisé)
5. **Devis** : multi-select (D-XXXXXX-YYYY) — utile multi-lots
6. **Heures de nuit** : toggle ON/OFF (plage 21h-6h ou flag nuit)
7. **Statut** : multi-select (brouillon / a_valider / validee / refusee / hors_planning)
8. **Saisi par** : toggle 'employé seul' / 'chef pour employé' / 'tous'

Compteur "X résultats" en haut. Filtres persistés en URL (sharable links).

## Exports (respectent filtres actifs)

Bouton "Exporter" dropdown :
- **Excel (.xlsx)** — toutes colonnes affichées (xlsx-js-style obligatoire, cf mem://constraints/xlsx-package-policy)
- **CSV UTF-8** — séparateur `;` (Excel FR)
- **PDF A4 paysage** — preview imprimable
- **SILAE** — uniquement validées, 28 colonnes, réutiliser export existant `/validation-heures`

## KPIs (4 cards en haut)

- Total heures sur la période
- Heures validées (% du total)
- Heures de nuit (% du total)
- Coût estimé (heures × taux horaire moyen)

## UX

- Pagination 50 lignes / page
- Sort sur chaque colonne (date desc par défaut)
- Vue mobile : cards empilées, filtres dans Sheet latéral
- RoleGuard appliqué

## Permissions

- **Admin** : toutes les heures de tous les employés
- **Chef** : uniquement heures de son équipe (filtre RLS auto)
- **Employé** : redirect `/mes-heures`

## Tests

- Vitest unit : helpers de filtre + helpers d'export
- E2E `e2e/admin/centre-analyse-heures.admin.spec.ts` : 3 filtres → vérifier compteur → export CSV → valider download
- RLS : chef ne voit pas employés d'autres équipes

## Effort

8-10h. Feature transverse mais sans archi complexe (tableau filtré + export, base existante).
