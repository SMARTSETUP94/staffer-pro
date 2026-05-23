**Bloc 2 — Quick wins UX** — Lot 2.1 polish ✅ · Lot 2.2 Heatmap & compétences ✅ · Lot 2.3 Express+ ✅ (pulse Wand2 + CTA Publier + shortcuts E/P + stepper 4 étapes + badge "Plan actif" J) · Lot 2.4 Express avancé ⏳ (F undo 5min, G jours ouvrés défauts)

## Statut des frictions par audit

### `audit-ux-v035.md`
| # | Friction | Statut | Action |
|---|----------|--------|--------|
| 1 | Ctrl+S explicite | ✅ v0.35.9 | — |
| 2 | Ring orange Gantt edits locaux | ✅ v0.35.9 | — |
| 3 | Précédent wizard | ✅ v0.35.9 | — |
| 4 | Compteur Σ presence_pct | ✅ v0.35.9 | — |
| 5 | Récap "couvrira N jours / métiers" | ✅ v0.35.9 | — |
| 6 | Dédup toasts erreur batch | ⏳ | **À livrer** (30min) |
| 7 | Background hatché WE + badge férié heatmap | ⏳ | **À livrer** (2h) |
| 8 | Conflit CNC : Popover → Dialog/Drawer | ⏳ | **À livrer** (1h) |
| 9 | Bouton Supprimer plan dans menu kebab | ⏳ | **À livrer** (30min) |
| 10 | Filtre "modifiés uniquement" matrice compétences | ⏳ | **À livrer** (1h) |
| 11 | Mémoriser filtres EquipeAffaireSection (localStorage keyed planId) | ⏳ | **À livrer** (1h) |
| 12 | Skeleton Gantt + Heatmap | ⏳ | **À livrer** (30min) |
| 13 | Retirer badges "v0.35" partout | ⏳ | **À livrer** (15min) |
| 14 | Breadcrumb plan staffing : subLabel `draft`/`publié` | ⏳ | **À livrer** (30min) |
| 15 | Modale `?` shortcuts | ✅ existe (`StaffingShortcutsHelp`) | Vérifier seulement |

### `audit-ux-auto-staffing-v0311.md`
| # | Friction | Statut | Action |
|---|----------|--------|--------|
| A | Pulse Wand2 sur 1ère visite | ⏳ | **À livrer** (1h) |
| B | Express depuis liste affaires (batch) | ⏳ | **Reporter** — gros chantier 4h, mieux dans sprint dédié |
| C | Bouton Publier = CTA primaire quand `blocking=false` + auto-focus | ⏳ | **À livrer** (30min) |
| D | Raccourci `E` (Express) + `P` (publish) | ⏳ | **À livrer** (1h) |
| E | Toast stepper 4 étapes Express | ⏳ | **À livrer** (1h) |
| F | "Annuler ce plan" 5 min après création | ⏳ | **À livrer** (2h) |
| G | `getJoursOuvres` pour défauts dates Express + alerte délai court | ⏳ | **À livrer** (2h) |
| H | Doublon interface `Props` `ExpressResultBanner` | ⏳ | **À livrer** (5min) |
| I | Vibration mobile succès Express | ⏳ | **À livrer** (15min) |
| J | Bouton Express = "✓ Plan actif" si plan publié | ⏳ | **À livrer** (1h) |
| K | Gamification temps économisé | ❌ | **Skip** (attendre feedback terrain) |

## Périmètre proposé pour Bloc 2

**Inclure (16 items, ~16h) :**
- audit-v035 : #6, #7, #8, #9, #10, #11, #12, #13, #14
- audit-v0311 : A, C, D, E, F, G, H, I, J

**Exclure :**
- audit-v035 #15 (déjà fait — juste vérifier)
- audit-v0311 B (gros, sprint dédié plus tard)
- audit-v0311 K (pas le moment)

## Découpage en livraisons

**Lot 2.1 — Polish rapide (~3h)** : #6, #9, #12, #13, #14, H, I
→ Wins visibles immédiats, zéro risque.

**Lot 2.2 — Heatmap & compétences (~4h)** : #7, #8, #10, #11
→ Affichage calendrier/matrices.

**Lot 2.3 — Express+ (~6h)** : A, C, D, E, J
→ Adoption Express (combo recommandé par l'audit original).

**Lot 2.4 — Express avancé (~4h)** : F (undo), G (jours ouvrés défaut)
→ Plus de logique → tester plus.

## Approche

Je livre **Lot par lot** en t'envoyant un point à chaque lot (fichiers touchés + tests). Tu valides avant le suivant.

## Stack technique (court)

- **#7 Heatmap WE/férié** : `src/components/staffing/ChargeAtelierHeatmap.tsx` + helper `isJourFerieFR` déjà dans `src/lib/jours-feries.ts`.
- **#8 Conflit CNC Dialog** : `ResolveCncConflictDialog` existe déjà comme Dialog en v0.35.7 — probable que ça référence un autre Popover. À identifier (search `cnc.*Popover`).
- **#11 localStorage planId** : hook `useLocalStorage` existe.
- **A pulse Wand2** : Tailwind `animate-pulse` + ring sur `WandSplitButton`, persist `localStorage` key `express-pulse-seen-{userId}`.
- **D raccourcis** : Étendre `useStaffingShortcuts` hook + mettre à jour `StaffingShortcutsHelp`.
- **F undo plan** : Server fn `softDeletePlanRecent` + RLS check `created_at > now() - interval '5 min'`.
- **G jours ouvrés Express** : `recomputeExpressDates` dans `src/server/staffing-express.functions.ts` utilise `getJoursOuvres`.

Pas de migration DB. Pas de breaking change. Tous les changements sont frontend ou server function.

---

**Confirmes-tu ce périmètre + découpage en 4 lots, ou tu veux ajuster (retirer/ajouter des items, regrouper différemment) ?**
