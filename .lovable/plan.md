# v0.42.2 — Plan d'architecture

3 items à enchaîner. Estimation : ~600 lignes nettes, 3 fichiers nouveaux, 2 fichiers modifiés.

## ITEM 1 — Saisie en lot poste principal

**Arbitrage UX** : nouvelle route dédiée `/admin/employes-poste-principal` (pas sous-onglet) car :
- La page `/employes` est déjà dense (spreadsheet + dialogs CRUD)
- Action one-shot RH (162 fiches → 0 à terme), mérite un écran focus
- Plus simple à découvrir via lien direct depuis bandeau de complétion

**Fichier** : `src/routes/_app.admin.employes-poste-principal.tsx` (nouveau)

**Layout** :
```
┌──────────────────────────────────────────────────┐
│ ← Retour Employés    Postes principaux à saisir │
│                                                  │
│ [Compteur sticky] 47 / 162 fiches à compléter   │
│ [Filtres] Statut contrat ▾  Chantier ▾  🔍 Nom │
│                                                  │
│ ┌─ Table ──────────────────────────────────────┐│
│ │ Nom   │Prénom│Email│Stat│3 chantiers│Poste ⌨ ││
│ │ ...   │ ...  │ ... │ .. │ 9231-Atel │ [____] ││
│ └────────────────────────────────────────────┘ │
│         [💾 Sauvegarder tout (12 modifs)]       │
└──────────────────────────────────────────────────┘
```

**Logique** :
- Query : `employes` WHERE (poste_principal IS NULL OR poste_principal = '') AND actif=true
- Subquery 3 derniers chantiers : via `assignations` JOIN `affaires` ORDER BY date DESC LIMIT 3 GROUP BY employe
- Local state `Map<employeId, posteValue>` modifié, autosave on blur (debounce 500ms)
- Bouton bulk save = boucle UPDATE par chunks de 50
- Suggestion intelligente : top 1 métier des 3 derniers chantiers → mappe vers POSTES_SUGGESTIONS via heuristique (metier "machinerie" → "Machiniste", etc.) → injecté en `placeholder=`

**Filtres** :
- Statut contrat : multi-select (Checkbox group) sur enum `contrat_type` + `statut_contrat`
- Chantier récent : Combobox autocomplete sur `affaires` actives, filtre via assignations.affaire_id IN (...)
- Recherche nom/prénom : input free text (fuzzy)

**Datalist** : `<datalist id="postes-suggestions">` avec POSTES_SUGGESTIONS (centralisé dans lib existante)

**Lien dans sidebar** : ajout entrée Admin "Postes principaux" avec badge count si > 0.

## ITEM 2 — Export/Import Excel employés

**Fichier** : `src/lib/employes-excel.ts` (nouveau, lazy-loaded)

**Export** :
- Bouton "Exporter Excel" ajouté dans `_app.employes.tsx` (header) + page `/admin/employes-poste-principal`
- Lib : `xlsx-js-style` (déjà policy projet)
- Colonnes : Nom, Prénom, Email, Statut contrat, Poste principal, Taux brut, Taux chargé, Date dernière activité (max(assignations.date)), Chantier récent
- Filename : `employes-setup-paris-${date}.xlsx`

**Import inverse** :
- Bouton "Importer Excel postes" dans `_app.employes.tsx` + page admin
- Drop zone → parse → matching par `normalizeName(nom+' '+prenom)` (helper existant)
- Modal diff preview : "X mises à jour | Y inchangés | Z non trouvés"
- Validation finale → `UPDATE employes SET poste_principal=$1 WHERE id=$2` boucle
- Idempotent : si poste_principal Excel == DB, skip

**Sécurité** : RLS update employes déjà chef_or_admin (pas de migration nécessaire)

## ITEM 3 — Validation E2E template PDF

**Fichier** : enrichissement `src/routes/_app.rh.contrats.tsx` onglet "Template"

**Bouton "Tester le template"** → ouvre `TemplateTestDialog` avec :

**5 cas de test prédéfinis** (en mémoire, pas DB) :
| # | Cas | Données |
|---|-----|---------|
| A | Poste renseigné | SAVOYEN, poste="Constructeur", chantier 9231 court |
| B | Fallback null | DUPONT, poste=null → "Technicien de plateau" |
| C | Adresse longue | MARTIN, adresse 90 chars |
| D | Libellé chantier long | DURAND, "Atelier mandarine M&Ms version pilote 2" |
| E | Intérim vs CDDU | LEROY intérim avec agence_interim |

**Implémentation** :
- Réutilise `renderContratHtml()` de `contrats-templates.ts` avec fixtures hardcodées
- Génère 5 PDF via fonction existante `generateContratPdf()` côté client (jsPDF/html2canvas) ou edge function `contrat-pdf`
- Affiche en grid 5 thumbnails (iframes srcDoc HTML) avec bouton "Télécharger PDF" + "Ouvrir plein écran"

**Tests Playwright** (bonus) — `e2e/contrats/template-validation.admin.spec.ts` :
1. Ouvre /rh/contrats?tab=template → clic "Tester le template"
2. Pour chaque iframe : `expect(html).not.toMatch(/\{\{[^}]+\}\}/)`
3. Sections attendues : array de 15 titres, chaque `expect(html).toContain(title)`
4. Page count : impose en CSS `@page` count via parsing du PDF (skip si trop complexe → check `<div class="page">` count == 4)

## Fichiers touchés

| Fichier | Action |
|---|---|
| `src/routes/_app.admin.employes-poste-principal.tsx` | NEW |
| `src/lib/employes-excel.ts` | NEW |
| `src/components/employes/EmployesImportPostesDialog.tsx` | NEW |
| `src/components/contrats/TemplateTestDialog.tsx` | NEW |
| `src/lib/contrats-template-fixtures.ts` | NEW (5 fixtures) |
| `src/routes/_app.employes.tsx` | EDIT (boutons export/import) |
| `src/routes/_app.rh.contrats.tsx` | EDIT (bouton Tester template) |
| `src/components/AppSidebar.tsx` | EDIT (lien Postes principaux) |
| `src/routes/_app.roadmap.tsx` | EDIT (entrée v0.42.2) |
| `e2e/contrats/template-validation.admin.spec.ts` | NEW (bonus) |

## Pas de migration DB requise

Tout réutilise `employes.poste_principal` (déjà ajouté en v0.42.x précédent), RLS existante.

## Ordre d'exécution

1. ITEM 1 (route + filtres + autosave) — ~30 min
2. ITEM 2 (export + import + diff modal) — ~25 min
3. ITEM 3 (5 fixtures + dialog gallery) — ~20 min
4. Roadmap + sidebar link — ~5 min
5. Bonus E2E Playwright — ~15 min

Total : ~1h30 de génération, livrable PR cohérent.

**OK pour lancer ?**
