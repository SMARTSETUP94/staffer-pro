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

## Vocabulaire UI

- **Libellés rôles** → toujours via `src/lib/labels.ts` (`roleLabel`, `affaireRoleLabel`,
  `USER_ROLE_OPTIONS`). Jamais de string en dur du type « Chef de chantier ». Voir
  `mem://constraints/vocabulaire-roles-centralise`.
- **Libellés métier** (Staffer/Assigner, Auto-staffing/Auto-remplir, Plan staffing/Plan
  de fab, Validation/Valider heures) → toujours via `useVocab()` (`src/hooks/use-vocab.ts`).
  Le hook bascule entre LEGACY et NEXT selon le flag `vocab_metier_v1`. Voir
  `mem://constraints/vocabulaire-metier-centralise`.
- **Exception assumée** : « Express » reste tel quel (court, français, compris).
- **Noms techniques** (routes, queryKeys, noms de RPC/serverFn, noms de composants TS)
  → INCHANGÉS. Le rename est uniquement visuel.
- Pour les contextes non-React (head/meta SSR), utiliser directement le label NEXT en dur.
