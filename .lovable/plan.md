## v0.48 — Vue Planning « Par pôle (consolidé) »

Objectif : ajouter un 8ᵉ onglet à `/planning` donnant la vue stratégique directeur/coordinateur — matrice **chantier × métier** avec nb personnes + heures par cellule, capacités sticky en haut et utilisation par pôle sticky en bas. Aucune modification des 7 onglets existants.

---

### 1. Backend — 2 RPC SECURITY DEFINER (RLS-safe via helpers existants)

#### 1.1 `staffing_par_pole_consolide`
```text
staffing_par_pole_consolide(
  p_periode_debut date,
  p_periode_fin   date,
  p_inclure_opportunites boolean default false,
  p_filtres_chantier_ids uuid[]    default null,
  p_filtres_metier_ids   integer[] default null,
  p_filtres_statut       text[]    default null
) RETURNS TABLE (
  chantier_id        uuid,
  chantier_numero    text,
  chantier_nom       text,
  chantier_typologie text,           -- pour badge PRÉV (9XXX)
  chantier_statut    text,
  metier_id          integer,
  metier_libelle     text,
  metier_couleur     text,
  nb_personnes       integer,        -- COUNT(DISTINCT a.employe_id)
  total_demi_jours   integer,        -- SUM des assignations sur la période
  total_heures       numeric         -- demi_jours × 4
)
```

Source : `assignations` jointes `affaires` + `metiers` (PAS `heures_saisies` — l'agrégat décrit du **planifié**, comme les autres onglets planning ; les heures saisies sont historiques).
- Filtre période : `a.date BETWEEN p_periode_debut AND p_periode_fin`.
- Filtre opportunités : si `p_inclure_opportunites = false`, exclure `affaires.numero LIKE '9%'`.
- Filtres optionnels : `chantier_ids`, `metier_ids`, `statut`.
- `metier_id` = `COALESCE(a.metier_id, e.metier_principal_id)` pour rattacher l'assignation à un pôle (fallback si `a.metier_id` NULL).
- Une ligne par cellule **(chantier, métier) NON-NULL** qui a au moins 1 assignation. Le client remplit les vides.
- GRANT EXECUTE TO `authenticated`. Filtrage RLS hérité via `affaires` lecture (helpers RLS existants — voir `mem://constraints/rls-helpers-execute-grant`, NE PAS REVOKE).

#### 1.2 `capacite_par_metier`
```text
capacite_par_metier() RETURNS TABLE (
  metier_id           integer,
  metier_libelle      text,
  metier_couleur      text,
  metier_ordre        integer,
  capacite_cdi_cdd    integer,   -- statut_contrat IN ('CDI','CDD')
  capacite_interim    integer,
  capacite_totale     integer
)
```
Source : `employes` filtrés `actif = true AND non_staffing = false`, regroupés par `metier_principal_id`. GRANT EXECUTE TO `authenticated`.

Aucune nouvelle table. Aucune modification de table existante.

---

### 2. Frontend — composant `StaffingParPole`

Arborescence :
```
src/components/planning/par-pole/
├── StaffingParPole.tsx              # orchestrateur (data + layout)
├── PoleCapaciteHeader.tsx           # sticky top : capacités par métier
├── PoleMatriceTable.tsx             # matrice chantiers × métiers
├── PoleMatriceCell.tsx              # cellule "3p / 90h" (compact = "3p")
├── PoleUtilisationFooter.tsx        # sticky bottom : total + % util colorisé
├── PoleAlertesBanner.tsx            # KPI saturation / sous-utilisation
├── PoleDrilldownDialog.tsx          # liste des noms staffés sur (chantier × métier)
└── pole-export-excel.ts             # export xlsx-js-style (lazy)
```

Hook data : `src/hooks/use-planning-par-pole.ts` — wrap les 2 RPC via `supabase.rpc(...)` + cache `react-query` keyé sur `(debut, fin, inclureOpp, filtres)`.

Layout dans la matrice :
- Colonne 1 sticky-left = `Chantier (numero — nom)` triée par numéro croissant.
- Colonnes suivantes = métiers dans `ordre` croissant (table `metiers`).
- Cellule vide → tiret discret. Cellule remplie → `Xp` (compact) ou `Xp / Yh` (détaillée).
- Lignes 9XXX (typologie prototype) : `border-dashed`, `opacity-60`, badge `PRÉV` à côté du numéro.
- Sticky header capacités (haut) + sticky footer total/% (bas) figés via `position: sticky` dans le scroll container.
- Couleurs % utilisation : `≤1.0` vert (token `success`), `1.0-1.2` ambre, `>1.2` rouge saturé.
- Scroll horizontal sur écrans étroits, `Chantier` reste collé à gauche.
- ARIA : `role="table"`, `role="columnheader"`, `role="row"`, `aria-label` par cellule.

Filtres haut de page : sélecteur de semaine (réutilise `WeekPicker` du tab `parchantier`), toggle « Inclure opportunités » (relié au state global du planning, **même variable** que celle déjà en place sur les autres onglets), filtre statut chantier (multi-select), filtre métiers (multi-select), bouton « Vue compacte / Vue détaillée » (toggle local, défaut compact).

Drilldown : click cellule → `PoleDrilldownDialog` qui requête `assignations` filtrées sur `(affaire_id, metier_id, période)` et liste les noms (réutilise `useResolvedEmploye`). Bouton « Ouvrir dans Par chantier » qui navigue vers le tab `parchantier` avec query params `?chantier=<id>&metier=<id>`.

Export : `xlsx-js-style` lazy-loadé (cf. `mem://constraints/xlsx-package-policy`). Feuille 1 = matrice. Feuille 2 « Détail par personne » = liste plate `chantier | métier | nom | demi_jours | heures`.

---

### 3. Intégration dans `_app.planning.tsx`

Ajout d'1 `TabsTrigger` `value="parpole"` (libellé « Par pôle ») entre `parobjet` et `budget`, et 1 `TabsContent` correspondant qui rend `<StaffingParPole filters={…} />`. Aucun autre tab modifié. État des filtres existants (semaine + inclure-opp) déjà partagé au niveau parent — on lit la même source.

---

### 4. Tests E2E (`e2e/planning/par-pole.chef.spec.ts`)

1. Navigation onglet → matrice rendue avec données semaine courante.
2. Toggle « Inclure opportunités » OFF → 9XXX absents ; ON → présents avec badge `PRÉV`.
3. Click cellule → dialog drilldown avec noms.
4. Filtre métier multi-select → colonnes filtrées.
5. Export Excel → fichier généré, en-têtes corrects, feuille 2 présente.

---

### 5. Migration mémoire

- Créer `mem://features/planning-par-pole-v048` (description matrice, RPC, drilldown, export).
- Mettre à jour `mem://index.md` : ajouter v0.48 dans Roadmap livré.

---

### 6. Hors scope (à confirmer)

- Pas de heatmap couleur dans la matrice (juste valeurs + différenciation pointillé pour 9XXX).
- Pas de modification du calcul d'heures côté autres onglets.
- Capacité = nombre d'employés actifs ; pas de pondération absences/congés (simplification v1, à revisiter v0.49 si besoin).
- Drilldown via Dialog + lien « Ouvrir dans Par chantier » plutôt que navigation directe (préserve contexte).

---

### Effort estimé

~18h : 3h RPC, 5h matrice + sticky, 2h diff visuelle 9XXX, 2h drilldown, 2h KPI alertes, 2h export, 2h tests E2E.

### Points à valider avant code

1. **RPC sur `assignations` (planifié) plutôt que `heures_saisies`** — cohérent avec les autres tabs planning. OK ?
2. **Capacité = `actif AND NOT non_staffing` regroupé par `metier_principal_id`**, sans pondération absences. OK pour v1 ?
3. **Drilldown = Dialog + lien** vers `parchantier` (pas navigation forcée). OK ?
4. **Position du tab** : entre `parobjet` et `budget`. OK ?
