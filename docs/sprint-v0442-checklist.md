# Sprint v0.44.2 — Polish Atelier Hub Chef Mobile

Date : 10 mai 2026

## Les 4 items demandés

### (1) ✅ Redirect `/mobile/chef/a-valider` → `/mobile/chef/atelier`

- Route file `src/routes/mobile.chef.a-valider.tsx` retransformé en redirect via
  `beforeLoad: () => { throw redirect({ to: "/mobile/chef/atelier", replace: true }) }`.
- `replace: true` ne pollue pas l'historique navigation.
- Conserve les bookmarks chefs sauvegardés avant v0.44.1.
- Test E2E spec (1) dans `e2e/mobile-chef/sprint-v0442-polish.chef.spec.ts`.

### (2) ✅ Dashboard chef KPI cards alignées sur le nouveau scope

`src/routes/mobile.chef.dashboard.tsx` :

| Card | Avant | Après |
|---|---|---|
| Heures à valider | `/mobile/chef/a-valider` | `/mobile/chef/equipe` |
| Objets à valider | `/mobile/chef/a-valider` | `/mobile/chef/atelier` |
| **Photos récentes (7j)** _(nouveau)_ | — | `/mobile/chef/atelier` |
| Alerte "Objets en retard" | `/mobile/chef/a-valider` | `/mobile/chef/atelier` |

Nouvelle requête `photosQ` : compte les `affaire_documents` non supprimés
de type `image/*` uploadés ≤ 7 jours sur les `mes_affaires_chef`.

Type union `KpiCard.href` mis à jour (`/atelier` à la place de `/a-valider`).

Bottom nav (`ChefMobileBottomNav`) : déjà correct depuis v0.44.1 — le badge
de l'onglet Atelier consomme uniquement `objets.length` (pas les heures).

### (3) ✅ Tests E2E v0.44.1 + v0.44.2

Nouveau fichier `e2e/mobile-chef/sprint-v0442-polish.chef.spec.ts` (6 specs) :

1. Redirect `/a-valider` → `/atelier` (URL finale + page Atelier visible)
2. Dashboard chef : KPI Heures linke vers /equipe, Objets linke vers /atelier, Photos récentes (7j) visible
3. Sous-tab Valider dans `/mobile/chef/equipe`
4. Kanban 4 colonnes (Bois/Peinture/Manut/Validé) + badges compteur + empty states
5. Photos par objet : sélection objet → bouton Retour liste + uploader visibles
6. Bottom nav `/atelier` lien visible (badge déjà testé en (4) indirectement)

Specs marquées `test.skip()` si le seed E2E n'a pas de chantier pour le compte
chef — pattern identique aux specs Sprint 1/2 existantes.

### (4) ✅ Polish Kanban Vue chantier en cours

`src/hooks/use-chantier-kanban.ts` :
- Ajout des champs `date_fin_souhaitee` (min `fabrication_etapes.date_fin` non
  terminée) + `is_en_retard` (deadline < aujourd'hui & statut ≠ fini).
- Tri global : **en retard d'abord** → deadline ascendante → référence alphabétique.

`src/routes/mobile.chef.atelier.tsx` :
- **Filtres chantier persistés en localStorage** (`v0.44.2:kanban-filter-affaires`),
  rechargés au mount, écrits à chaque toggle.
- **Badge compteur par colonne** : `<Badge variant="secondary">` au lieu d'un
  span discret.
- **Empty state propre** par colonne : icône `Inbox` grise + label
  "Aucun objet en cours".
- **Animations 200ms ease-out** : transitions colorées sur les filtres
  (`transition-colors duration-200 ease-out`) et sur les cards
  (`transition-all duration-200 ease-out`).
- **Badge "Retard"** rouge en haut des cards dépassant l'échéance
  (icône `AlertCircle`, fond `destructive/15`, bordure card en
  `destructive/50`).
- **Affichage échéance** dans la ligne quantité (`Qté X • échéance MM/DD`).
- `data-testid` ajoutés pour les tests E2E (`kanban-board`,
  `kanban-col-{bois|peinture|manut|valide}`, `kanban-filter-{numero}`).

**Bonus drag-drop reporté** : dnd-kit est installé, mais l'avancement d'étape
nécessite une RPC dédiée pour valider la transition entre `type_etape` non
encore créée. Sera traité dans un sprint suivant si demandé.

## URLs preview

- Hub chef : `/mobile/chef/dashboard`
- Atelier (3 sous-tabs) : `/mobile/chef/atelier`
- Équipe (sous-tab Valider) : `/mobile/chef/equipe`
- Redirect legacy : `/mobile/chef/a-valider` → `/mobile/chef/atelier`

## Fichiers modifiés

- `src/routes/mobile.chef.a-valider.tsx` (transformé en redirect)
- `src/routes/mobile.chef.dashboard.tsx` (KPI + alertes)
- `src/routes/mobile.chef.atelier.tsx` (polish Kanban + localStorage)
- `src/hooks/use-chantier-kanban.ts` (deadline + tri retard)
- `e2e/mobile-chef/sprint-v0442-polish.chef.spec.ts` (nouveau, 6 specs)
- `.lovable/memory/index.md` (entrée v0.44.2)
- `docs/sprint-v0442-checklist.md` (ce fichier)
