# E2E Playwright — Setup local & CI (v0.34)

## Installation locale

Playwright n'est volontairement pas dans `package.json` (pour ne pas alourdir le
bundle prod Lovable). Installation à la demande :

```bash
bun add -D @playwright/test
bunx playwright install chromium
```

## Variables d'environnement

Créer `.env.test` à la racine (ne PAS committer) :

```env
E2E_BASE_URL=http://localhost:3000
E2E_ADMIN_EMAIL=admin.e2e@setup.paris
E2E_ADMIN_PASSWORD=...
E2E_CHEF_EMAIL=chef.e2e@setup.paris
E2E_CHEF_PASSWORD=...
E2E_EMPLOYE_EMAIL=employe.e2e@setup.paris
E2E_EMPLOYE_PASSWORD=...
```

Charger avant les commandes :

```bash
set -a && source .env.test && set +a
bun run test:e2e
```

## Comptes test à seeder

| Rôle           | Profil attendu                                   |
| -------------- | ------------------------------------------------ |
| admin          | `app_role='admin'`                               |
| chef_chantier  | `app_role='chef_chantier'` + ≥1 affaire assignée |
| employe        | `app_role='employe'` + ≥1 assignation cette semaine |

Seedage manuel via Supabase Dashboard (créer 3 users + INSERT user_roles).
À automatiser plus tard via script `e2e/seed.ts`.

## Scripts

```bash
bun run test:e2e            # full run (4 projets)
bun run test:e2e:ui         # UI mode (debug)
bun run test:e2e -- --project=employe-mobile
bun run test:e2e -- --shard=1/4
```

## Architecture des tests

```
e2e/
├── .auth/                    # storageState par rôle (gitignored)
├── fixtures/test-accounts.ts # comptes test (lus depuis env)
├── helpers/auth.ts           # loginAs / logout
├── global-setup.ts           # login → save storageState par rôle
├── smoke/                    # *.smoke.spec.ts (sans auth)
├── admin/                    # *.admin.spec.ts
├── chef/                     # *.chef.spec.ts
├── employe-desktop/          # *.employe-desktop.spec.ts (anti-fuite RGPD)
└── employe-mobile/           # *.employe-mobile.spec.ts
```

Convention nommage fichier : `<feature>.<projectName>.spec.ts`
→ Playwright route automatiquement vers le bon project (storageState + viewport).

## CI GitHub Actions

`.github/workflows/e2e.yml` — déclenché sur push main, 4 shards parallèles.
Secrets à configurer dans Settings → Secrets → Actions (cf liste en haut du
workflow).

## Cibles v0.34

50 tests verts en <15 min. 12 tests par rôle + smoke. Voir
[mem://features/e2e-playwright-coverage](../.lovable/memory/features/e2e-playwright-coverage.md).

## Targets data-testid déjà posés

- `btn-add-hors-planning` — bouton "+ Autre chantier" (v0.32.3)
- `btn-submit-hors-planning` — submit modale hors planning
- `btn-delete-hors-planning` — Trash saisie hors planning
- `select-metier-hors-planning` — select métier dans modale
- `badge-hors-planning` — badge sur card de saisie hors planning
