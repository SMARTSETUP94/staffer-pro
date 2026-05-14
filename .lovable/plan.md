# v0.48 RÉVISÉ — Par pôle simplifié + différenciation visuelle 9XXX

Refonte drastique du scope initial : on aligne la nouvelle vue sur la structure familière "Par chantier", on retire tous les ornements (capacités, alertes, export, compact/détaillé), et on ajoute la teinte ambrée 9XXX là où elle a du sens.

## 1. Nouvelle vue "Par pôle" — structure alignée sur "Par chantier"

**Matrice** : lignes = métiers (ordre `metiers.ordre`), colonnes = jours de la semaine (lun→ven, +sam/dim si toggle week-end actif, identique aux autres onglets via la même `WeekPicker` / état global partagé).

**Cellule** :
- Badge simple avec un chiffre = nb de personnes DISTINCT staffées sur ce métier ce jour.
- Vide (cellule grisée discrète) si 0.
- Pas de heures, pas de coloration utilisation, pas de bordure dashed sur la cellule elle-même.

**Hover popover** :
- Réutilise le composant vignette existant (celui de "Par chantier") : avatar/initiales + nom court (`Achille V.J`).
- Sous chaque nom : numéro + nom court du chantier d'affectation.
- Si la personne est staffée sur un chantier 9XXX → badge `PRÉV` ambré sur sa vignette (icône + bg `amber-100` text `amber-800`) pour distinguer confirmé vs prévisionnel d'un coup d'œil.

**Click cellule** : no-op pour ce sprint (drilldown reporté).

**Filtres branchés** (état global du planning, déjà partagé entre onglets) :
- Semaine (`WeekPicker`)
- Toggle "Inclure opportunités (proto)" → si OFF, les personnes staffées uniquement sur des 9XXX ne sont pas comptées dans le badge ; si ON, comptées normalement.
- Statut chantier (multi-select existant)
- Métiers (multi-select existant) → filtre les lignes affichées.

**Supprimé du scope** : sticky header capacités, sticky footer total/%, KPI alertes, toggle Compact/Détaillé, export Excel, RPC `capacite_par_metier` (plus appelée — on la garde en DB pour usage futur mais on ne la branche pas en UI).

## 2. RPC simplifiée

Réécriture de `staffing_par_pole_consolide` (ou nouvelle `staffing_par_pole_jours`) :
- Input : `p_periode_debut`, `p_periode_fin`, `p_inclure_opportunites`, `p_filtres_metier_ids`, `p_filtres_statut`.
- Sortie : 1 ligne par `(metier_id, date_jour)` avec :
  - `nb_personnes` (DISTINCT employe_id)
  - `personnes` JSONB array `[{ employe_id, prenom, nom_court, avatar_url, chantier_id, chantier_numero, chantier_nom, est_opportunite }]` pour alimenter le popover sans seconde requête.
- Source : `assignations` joint à `affaires` + `employes`. Métier = `COALESCE(a.metier_id, e.metier_principal_id)`.
- Si `p_inclure_opportunites = false` : exclut les rows où `affaires.numero LIKE '9%'` AVANT agrégation (donc le badge ne les compte pas).
- SECURITY INVOKER, RLS héritée.

## 3. Teinte ambrée 9XXX sur la vue "Par chantier" existante

**Endroit** : `src/components/planning/.../par-chantier/...` (le composant qui rend la table actuelle Par chantier).

**Règle** : pour toute ligne dont `chantier.numero` commence par `9` :
- Les **cellules de staffing** (pas le label ligne) reçoivent un background subtil `bg-amber-50/40` (light) / `bg-amber-950/20` (dark) — harmonisé avec le chip "PROTOTYPE 187" existant.
- Les vignettes des personnes restent inchangées (typo, couleur normales) — seul le fond de cellule signale.
- Pas de bordure dashed, pas d'opacity-60 (on garde ça pour la vue Par pôle popover uniquement).

## 4. Composants à créer / modifier

**Nouveaux** :
- `src/components/planning/par-pole/ParPoleMatrice.tsx` — table métiers × jours, cellules badge.
- `src/components/planning/par-pole/ParPoleCellPopover.tsx` — popover hover réutilisant la vignette existante + badge PRÉV.

**Modifiés** :
- `src/hooks/use-planning-par-pole.ts` — réécrit, appelle uniquement la nouvelle RPC, plus de capacités.
- `src/components/planning/par-pole/StaffingParPole.tsx` — devient un simple wrapper qui rend `ParPoleMatrice` (on retire sticky header/footer, KPI, toggle compact, export).
- `src/routes/_app.planning.tsx` — onglet déjà en place, juste vérifier que les filtres globaux sont passés en props.
- Composant Par chantier existant (à identifier précisément à l'implémentation) — ajout de la classe conditionnelle `bg-amber-50/40` sur les `<td>` staffing quand `numero.startsWith('9')`.

**Supprimés** :
- `src/components/planning/par-pole/PoleDrilldownDialog.tsx`
- `src/components/planning/par-pole/pole-export-excel.ts`

## 5. Tests E2E (battery `e2e/staffing/`)

3 specs (au lieu de 5) :
1. `par-pole-matrice.chef.spec.ts` — la matrice rend les métiers en lignes et 5 jours en colonnes, badge cohérent avec le seed.
2. `par-pole-toggle-opp.chef.spec.ts` — toggle "Inclure opportunités" OFF → badge décrémente sur métiers où seuls 9XXX étaient staffés ; ON → badge ré-incrémente.
3. `par-chantier-9xxx-tint.chef.spec.ts` — sur Par chantier, les `<td>` staffing des lignes 9XXX ont la classe `bg-amber-50/40`, les autres non.

## 6. Mémoire

Mise à jour de `mem://features/planning-par-pole-v048.md` : retirer mentions sticky header/footer/export/compact, ajouter règle hover popover + teinte 9XXX Par chantier.

## Effort révisé

~10h : 1h RPC + 4h matrice + 2h popover + 1h teinte 9XXX + 1h filtres + 1h tests.

## Validation

Skip / Edit / Approve ?
