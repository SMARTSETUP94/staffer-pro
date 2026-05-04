# Contribuer à Staffer Pro

## Lecture obligatoire avant tout dev

- **Toute modif touchant `heures_saisies`, `assignations`, `staffing_plan*`, `affaires`** :
  lire `docs/rls-policies.md` (matrice acteur × action × table + anti-patterns).
- **Toute migration RLS** : passer `supabase--linter` sans warning + mettre à jour la matrice
  dans la même PR.
- **Mémoire projet** : consulter `mem://index.md` (Core rules) avant de proposer un changement
  d'architecture / design system / routing.

## Conventions

- TypeScript strict, pas d'`any` non justifié.
- Imports `@tanstack/react-router` (jamais `react-router-dom`).
- `console.log` interdit en prod : utiliser `console.warn` / `console.error` ou retirer
  avant merge.
- Tests : Vitest pour unitaire, Playwright pour E2E (suffixe `.chef.spec.ts`,
  `.admin.spec.ts`, `.employe.spec.ts`, `.smoke.spec.ts`).
