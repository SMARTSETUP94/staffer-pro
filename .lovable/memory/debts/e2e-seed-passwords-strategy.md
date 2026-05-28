---
name: e2e-seed-passwords-strategy
description: Pourquoi on garde le seed E2E en TypeScript (service role) plutôt qu'un seed.test.sql idempotent
type: constraint
---

## Décision

Le seed des comptes E2E reste dans `e2e/seed.ts` (TypeScript, lancé via
`bun run e2e/seed.ts`) plutôt qu'un `supabase/seed.test.sql` idempotent
comme la spec L5-B le suggérait.

## Pourquoi

`auth.users.password` est stocké hashé bcrypt par Supabase Auth. On ne peut
PAS le seeder en SQL pur sans :

1. soit pré-calculer un hash bcrypt et l'injecter (fragile, pas idempotent
   sur rotation, dépend de la version pgcrypto / bcrypt côté serveur),
2. soit utiliser une extension SQL bcrypt qui n'est pas garantie présente
   en cloud managé.

L'API `supabase.auth.admin.createUser({ password })` règle ça côté serveur
proprement, idempotent (cf. `ensureUser` → `listUsers` + reset password).
Le coût : il faut le service_role key au runtime du seed (`E2E_SUPABASE_SERVICE_ROLE_KEY`),
exposé uniquement en GitHub Secrets pour la CI, jamais en prod.

## Workaround si on veut vraiment du SQL

Possible mais hors scope L5-B :
- Créer un wrapper SQL `seed_e2e_user(email text, password text, role app_role)`
  qui appelle `auth.admin_create_user(...)` côté Postgres (extension supabase_auth_admin),
  PUIS persister un `supabase/seed.test.sql` qui n'appelle que ce wrapper.
- Vérifier la dispo de `supabase_auth_admin` sur le projet cloud.

À écrire dans un sprint dédié si la CI veut un seed SQL pur (par exemple
pour exécuter le seed depuis un job sans Node).

## Aujourd'hui

CI :
```
bun run e2e/seed.ts      # crée/reset les 11 comptes (3 + 8 ajoutés depuis L5-A)
bun run test:e2e         # lance Playwright avec storageState par rôle
```

Les 11 comptes test (env vars `E2E_*_EMAIL` / `E2E_*_PASSWORD`) sont
documentés dans `e2e/fixtures/test-accounts.ts` et créés par
`e2e/seed.ts`.
