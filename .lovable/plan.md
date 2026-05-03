# v0.37 — Refonte algo auto-staffing déterministe

Suppression complète des helpers de lissage/cascade v0.36 et réécriture en pipeline 5 étapes par objet, avec phasage Manutention 35/15/50, BE séquentiel global, et caps métier durs. Validé sur D-2141 Hermès et D-2151.

## 1. Migration DB

Migration unique `v0.37_refonte_algo`:
- `ALTER TABLE staffing_plan_step ADD COLUMN phase TEXT CHECK (phase IN ('DEBUT','TRANSFERT','FIN')) NULL;` (NULL pour métiers ≠ Manut)
- `DROP COLUMN IF EXISTS anchor` sur `chantier_metier_config` (audit colonnes existantes au préalable via supabase--read_query)
- Régénération `src/integrations/supabase/types.ts` (auto)

## 2. Réécriture algo (`src/lib/staffing/algo.ts`)

Nouveau `computeAutoStaffingPlanV2(input: PlanInput): PlanResult` en 5 étapes pures :

### Étape 1 — Tri objets (4 priorités)
```
sortObjets(objets):
  P1: heures_be == 0 && heures_numerique == 0  → tête (fab démarre direct)
  P2: ceil(heures_be/8) + ceil(heures_numerique/8) ASC
  P3: heures_numerique ASC (libère CNC tôt)
  P4: heures_be DESC (égalité)
```

### Étape 2 — Calendrier BE séquentiel
- 1 BE chantier global (cap=1, HARD), 8h/j ouvrés
- Backward depuis `date_fin_fab − marge_prod_min` puis on garde ordre étape 1
- Émission steps `metier=BE, pers=1, span=ceil(h_be/8)`

### Étape 3 — Split Manutention par objet
Pour chaque objet : `h_manut = total`, splits :
- `MANUT_DEBUT` = 35% (concourante avec Num/Bois en début d'objet)
- `MANUT_TRANSFERT` = 15% (entre fin Bois et début Peint)
- `MANUT_FIN` = 50% (agrégée chantier, 2 derniers jours ouvrés avant date_fin_fab)
Steps Manut portent `phase` ∈ DEBUT/TRANSFERT/FIN.

### Étape 4 — Production par objet (pipeline strict)
Pour chaque objet (ordre étape 1) :
1. `ManutDébut` (concurrent)
2. `Num` après `BE_objet + LAG_BE_NUM(2j)`, cap 1 mono-CNC, réservations `cnc_reserved_dates`
3. `Bois` après `Num + LAG_NUM_BOIS(1j)`, pers binôme multiples de 2, cap 4
4. `ManutTransfert` entre fin Bois et début Peint
5. `Peint` après `ManutTransfert`, pers binôme multiples 2, cap 6
6. `ManutFin` agrégée, 2 derniers jours

Caps HARD : BE=1, Num=1, Bois=4, Peint=6, Manut=4. Métiers binôme (Bois/Peint/Tap/Manut) → pers ∈ {2,4,6,…}.

### Étape 5 — Restitution
- Steps + reservations CNC + `daily_load`
- Alertes : `PIC_GLOBAL_DEPASSE` (>12), `PEINT_OVERFLOW_MANUT` (Manut Fin chevauche Peint actif), `PERS_PEINT_INSUFFISANT` (capa<charge)

### Suppression code obsolète
- Supprimer `src/lib/staffing/lissage.ts` entièrement (+ test)
- Retirer dans `algo.ts` les helpers `smoothMetierLoad`, `cascadeMetierOverlaps`, `sequenceBeSteps`
- Nettoyer imports dans `staffing-autostaff.functions.ts`, `staffing-autostaff-plan.functions.ts`, `slider-impact.ts`, `pre-parametrage.ts` (toggle lissage)

## 3. Tests Vitest

`src/lib/staffing/__tests__/algo-v037.test.ts` — 28 tests :
- **Tri** (4) : P1 d'abord ; tie BE+Num ; tie Num ASC ; tie BE DESC
- **BE séquentiel** (3) : pas de chevauchement ; ordre = étape 1 ; cap=1
- **Manut split** (4) : 35/15/50 ; arrondi heures ; FIN agrégée 2j ; phase persistée
- **Pipeline** (6) : LAG_BE_NUM 2j ; LAG_NUM_BOIS 1j ; cap CNC mono ; binôme pairs ; cap Bois 4 / Peint 6
- **D-2141 Hermès** (5) : ordre VT→I2→I1→D1 ; BE I2 04/05, I1 05-06/05, D1 07-12/05 ; I2 Peint démarre 05/05 ; gain ≥8j vs v0.36 ; pic ≤10
- **D-2151** (4) : ordre CA→J0→K4→C1→M1 ; BE total 8j séquentiel ; pic 12 le 26/05 ; livraison respectée
- **Alertes** (2) : PIC_GLOBAL_DEPASSE déclenchée >12 ; PEINT_OVERFLOW_MANUT

Fixtures `src/lib/staffing/__tests__/fixtures/{d2141.ts,d2151.ts}` (objets + heures réels anonymisés).

## 4. UI

### `PreParametrageSection.tsx`
- Passage **lecture seule** : sliders `nb_pers_cible`/`capa_max_jour` désactivés (informatifs)
- Suppression toggle `lissage_active` (algo intégré)
- Bandeau « Calculé automatiquement par v0.37 — modifiable via override métier uniquement »
- Garder colonnes `total_h_calc`, `duree_cible_j`, `nb_pers_cible` (lecture)

### `GanttInteractif.tsx` + `GanttBar.tsx`
- Affichage 3 phases Manut par objet : 3 barres distinctes labellisées `Manut Début` / `Manut Transfert` / `Manut Fin`
- Couleurs distinctes (variantes du couleur Manut)
- Tooltip indique phase + heures

### `AlerteBandeau.tsx`
- Ajout codes `PEINT_OVERFLOW_MANUT`, `PERS_PEINT_INSUFFISANT`

### `staffing-autostaff-plan.functions.ts`
- Persister `phase` lors INSERT staffing_plan_step (Manut uniquement)

## 5. E2E Playwright

`e2e/chef/algo-v037.chef.spec.ts` :
- Lance auto-staff sur fixture Hermès → vérifie ordre objets + BE dates + 3 phases Manut visibles
- Lance sur D-2151 → vérifie pic 12 le 26/05
- Vérifie absence toggle Lissage

## 6. Phasage release

- **alpha** : migration DB + algo + tests Vitest (PR feature flag `STAFFING_V037=1` côté server fn)
- **beta** : UI Gantt 3 phases + PreParam lecture seule + E2E
- **GA** : suppression flag, suppression `lissage.ts`, tag `v0.37-refonte-algo-GA`

## Détails techniques

- Constantes nouvelles dans `types.ts` : `MANUT_PCT_DEBUT=0.35`, `MANUT_PCT_TRANSFERT=0.15`, `MANUT_PCT_FIN=0.5`, `LAG_NUM_BOIS=1` (entier, plus de ratio), `MARGE_PROD_MIN_J` configurable
- Type `PlanStep` : ajouter `phase?: 'DEBUT'|'TRANSFERT'|'FIN'`
- Type `AlertCode` : ajouter `PEINT_OVERFLOW_MANUT`, `PERS_PEINT_INSUFFISANT`
- `pre-parametrage.ts` : `lissage_active` ignoré côté algo mais conservé en DB (rétro-compat lecture)
- `slider-impact.ts` : recalculer sur la base v2 (pers cible devient indicatif)

## Fichiers touchés (récap)

Création : `algo-v037` rewrite in `algo.ts`, `__tests__/algo-v037.test.ts`, `__tests__/fixtures/d2141.ts`, `__tests__/fixtures/d2151.ts`, `e2e/chef/algo-v037.chef.spec.ts`, migration SQL.
Suppression : `src/lib/staffing/lissage.ts`, `__tests__/lissage.test.ts`.
Édition : `types.ts`, `algo.ts`, `pre-parametrage.ts`, `slider-impact.ts`, `staffing-autostaff*.functions.ts`, `PreParametrageSection.tsx`, `GanttInteractif.tsx`, `GanttBar.tsx`, `AlerteBandeau.tsx`, mémoire (`mem://features/algo-v037-pipeline-objet`).

## Points à confirmer avant GO

1. **Suppression toggle Lissage** : confirmé qu'aucune autre feature (export, dashboard) ne s'appuie sur `lissage_active` (à grep).
2. **`LAG_NUM_BOIS=1` jour entier** au lieu du ratio 0.3×span actuel — confirmer (impacte algo v0.35 backward).
3. **Manut FIN « 2 derniers jours »** : si total chantier <16h Manut (=2j×8h), réduire à 1j ?
4. **Fixtures D-2141 / D-2151** : disponibles en JSON dans `BRIEF-LOVABLE-v0.37-refonte-algo.md` ? Sinon je les reconstitue à partir de la DB Cloud.
