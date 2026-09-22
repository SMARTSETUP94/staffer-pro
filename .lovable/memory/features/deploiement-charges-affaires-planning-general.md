---
name: Déploiement chargés d'affaires — planning général par métier
description: Flag deploiement_charges_affaires (menu réduit suivi affaires) + route /planning-general (frise dates début/fin par métier, table affaire_planning_metier)
type: feature
---

## Feature flag `deploiement_charges_affaires`
- Activé globalement (feature_flags.enabled_globally = true).
- Dans `AppSidebar.tsx` : `applyDeploiementCAMode()` whitelist URL = `/`, `/affaires`, `/planning-general`, `/devis`, `/opportunites`, `/echeances` + section Admin conservée. Prend le pas sur `mode_simplifie_managers`. Aucun blocage d'URL (masquage menu uniquement).

## Planning indicatif par métier
- Table `affaire_planning_metier` : affaire_id FK affaires, metier_id int FK metiers, date_debut, date_fin, commentaire, UNIQUE(affaire_id, metier_id), CHECK date_fin >= date_debut. RLS via `current_user_has_capability('section.affaires')`.
- Helpers `src/lib/planning-general.ts` : fetchPlanningGeneral, upsertPlanningMetier, deletePlanningMetierRows, isProspectAffaire.
- Route `/planning-general` (`src/routes/_app.planning-general.tsx`, cap `section.affaires`) : frise hebdomadaire, horizons 3m/6m/12m, dialogue PlanifierMetiersDialog par affaire (upsert idempotent).
- Entrée sidebar « Planning général » (icône GanttChart) dans le groupe Pilotage.

## Piège typage TanStack search (à retenir)
- Ne JAMAIS typer la sortie de `validateSearch` avec des clés requises (`{ scope: UrlScope }`, ou zod `.default()` via zodValidator) : cela rend `search` obligatoire sur tous les Link/navigate vers la route et casse les reducers `to: "."` des autres routes (union FullSearchSchema). Toujours des clés optionnelles + valeurs par défaut au read site (`scope = "mine"`, `search.horizon ?? "3m"`).
- Pour `navigate({ to: ".", search: reducer })` typé par la route : utiliser `Route.useNavigate()` (pas `useNavigate()` global).
