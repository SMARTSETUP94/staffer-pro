---
name: Import planning Excel (LOT 8)
description: Importeur réutilisable du classeur planning mensuel — conversion 1 personne-jour = 8 h, mapping métiers, règles d'idempotence
type: feature
---

# Import planning Excel — `/imports/planning`

Route `src/routes/_app.imports.planning.tsx`, capability `section.admin`, onglet
« Planning Excel » dans `ImportsTabsNav`. Parcours en 3 étapes (dépôt → prévisualisation
→ import), lecture via `xlsx-js-style` **lazy-loadé au clic** (contrainte projet).

## Modules

- `src/lib/imports/planning-xlsx.ts` — parseur PUR (entrée = onglets en AOA), reconnaissance
  souple des noms d'onglets et des en-têtes, mapping métiers.
- `src/lib/imports/planning-plan.ts` — construction PURE du plan (affaires / objets / heures /
  atelier_planning / affectations) + génération des `ImportIssue`.
- `src/lib/imports/planning-apply.ts` — écritures Supabase idempotentes.

## Règle de conversion

Le fichier exprime des **jours-hommes** (`Nb pers.` × 1 jour).
`HEURES_PAR_PERSONNE_JOUR = 8` → heures = `Nb pers. × 8`, cumulées par objet × métier.
`origine = 'ajout'` par défaut (import de planning ≠ devis), commutable sur « devis » dans l'écran.
La colonne `Tâche` alimente `objet_heures_metier.note`.

## Mapping des métiers

Table de synonymes extensible `METIER_SYNONYMES` (insensible casse/accents) :
Bois → 1 (Menuiserie) · Métal → 2 · Peinture → 3 · Numérique → 4 · Tapisserie → 5 ·
Machiniste → 6 · Logistique/Manutention → 7 · Bureau d'étude → 8 · Impression UV → 9.
**`Sous-traitance` n'est pas un métier** : la ligne marque `sous_traitance`, ne génère
ni heures ni ligne de charge, mais crée bien l'objet.

## Idempotence (deux imports consécutifs = même état)

- objets : dédoublonnage `(affaire_id, nom normalisé)`
- heures : upsert sur la contrainte `objet_heures_metier(objet_id, metier_id)` — mode
  **remplacer** (défaut) ou **cumuler**, choix explicite affiché à l'utilisateur
- planning : dédoublonnage `(affaire_id, objet_id, metier_id, date)` (lecture puis update/insert)
- assignations : dédoublonnage `(employe_id, affaire_id, date)`, écriture **exclusivement**
  via `src/lib/assignation-upsert.ts`, avec `atelier_planning_id` + alimentation de `assignation_objets`

## Règles métier

- Aucune affaire n'est créée en silence : case à cocher explicite, sinon les lignes sont ignorées.
- Aucun employé n'est créé : prénom sans correspondance **unique** → warning et affectation ignorée.
- Onglet Livraisons : `Livraison` est traitée comme un **montage** ; une ligne de démontage ne
  peut pas écraser effectif/semi/20 m³/nature (portés par la ligne de montage).
- Date invalide → warning, l'objet et ses heures sont importés, pas la ligne de planning.
- Métier non reconnu → `error` (bloquant).

Tests : `src/lib/imports/__tests__/planning-import.test.ts` (fixture représentative, 19 tests).
