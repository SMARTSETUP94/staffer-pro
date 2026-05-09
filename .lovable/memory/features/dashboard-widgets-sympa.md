---
name: dashboard-widgets-sympa
description: 5 widgets humanisation dashboard livrés v0.40.x (Anniversaires, Saint, Top constructeur, Chef projet, Tip) + Quiz Phase 4 à venir
type: feature
---
# Widgets dashboard cohésion équipe (v0.40.x)

## Livré (Phases 1-3)
- **anniversaires** — match `employes.date_naissance` mois+jour=today, RGPD: prénom+avatar uniquement, confetti CSS (`@keyframes confetti-fall` 3s) au mount.
- **saint_du_jour** — liste hardcodée `src/lib/saints-fr.ts` (~110 dates FR), match `normalizePrenom(employes.prenom)` ↔ saints du jour. Auto-hide si 0 match.
- **top_constructeur** — `SUM(heures_reelles)` `heures_saisies WHERE statut='valide' AND date >= lundi`, restreint codes métier `construction|metallerie|peinture|tapisserie|logistique|numerique` (set `ATELIER_METIER_CODES`). Reset par calcul, pas DB. Self-recognition « C'est toi le top ! ».
- **chef_projet_mois** — pour `fabrication_etapes` type=`respo_fab`, statut=`termine`, date_fin >= 1er du mois → ratio `etape.date_fin <= affaire.date_demontage` group by `objet.respo_fab_id`. Tri ratio desc, ties par count desc.
- **tip_du_jour** — 25 tips `src/lib/dashboard-tips.ts`, rotation `weekIndex(today) % length`.

## Helpers (`src/lib/dashboard-fun-helpers.ts`)
`weekIndex`, `dateIndex`, `getMondayOfWeek`, `getFirstOfMonth`, `isBirthdayToday`, `toIsoDate`, `ATELIER_METIER_CODES`. Tests : `src/lib/__tests__/dashboard-fun-helpers.test.ts` (10 tests verts).

## Intégration
- Catégorie `WidgetCategory` étendue avec `"fun"` + label « Cohésion équipe » + ajouté à `CATEGORY_ORDER`.
- Ajouts `ALL_WIDGET_IDS`, `WIDGET_META`, `ROLE_PRESETS.chef_chantier`, `ROLE_PRESETS.employe`, et **whitelist** `getAllowedWidgetsForRole` pour admin/chef/employe (les 5 widgets fun sont autorisés à TOUS les rôles).
- `register-all.ts` enregistre les 5 nouveaux composants.
- Auto-hide : chaque widget retourne `null` si data vide → cellule grid vide (pas de placeholder texte).

## Phase 4 à livrer (Quiz)
- Nouvelle table `user_quiz_responses(user_id, question_id, response_index, is_correct, answered_at)` + RLS self.
- 90+ questions hardcodées `src/lib/dashboard-quiz.ts` (scéno événementielle, art, anecdotes Setup, lexique métier).
- Rotation quotidienne `dateIndex(today) % length`, reveal après clic, score « X/Y bonnes réponses » + streak consécutif. Spec complète dans message Gabin du 9 mai 2026.
