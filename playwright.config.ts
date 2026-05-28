/**
 * v0.34 — Playwright config E2E.
 *
 * Installation locale (pas dans package.json pour ne pas alourdir le bundle prod) :
 *   bun add -D @playwright/test
 *   bunx playwright install chromium
 *
 * Lancement :
 *   bun run test:e2e               # full (HTML report local)
 *   bun run test:e2e:ui            # UI mode interactif
 *   bun run test:e2e:report        # ouvre le dernier rapport HTML
 *   bun run test:e2e -- --shard=1/4
 *
 * En CI (.github/workflows/e2e.yml) :
 *   - 4 shards en parallèle (cible <15min) émettent chacun un BLOB report
 *     (`blob-report/`), uploadés comme artefacts.
 *   - Un job `merge-reports` télécharge les 4 blobs et produit un UNIQUE
 *     rapport HTML consolidé (`playwright-report/`) → artefact final
 *     `playwright-report` exploré directement dans l'UI GitHub Actions.
 *
 * Diagnostics sur échec (admin + smoke) :
 *   - screenshot fullPage automatique (`only-on-failure`)
 *   - trace zip (timeline DOM + réseau + console) sur premier retry
 *   - vidéo MP4 conservée si test échoue après retry
 *   Tous attachés au rapport HTML, accessibles via clic sur le test rouge.
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;

/**
 * Reporters :
 *  - Local : list (console) + html (auto-ouvert seulement sur échec).
 *  - CI    : github (annotations PR) + blob (mergeable) + dot (logs compacts).
 *    Le rapport HTML final est généré par le job `merge-reports` à partir
 *    des blobs des 4 shards (cf. .github/workflows/e2e.yml).
 */
const reporter: Parameters<typeof defineConfig>[0]["reporter"] = isCI
  ? [
      ["github"],
      ["blob", { outputDir: "blob-report" }],
      ["dot"],
    ]
  : [
      ["list"],
      ["html", { outputFolder: "playwright-report", open: "on-failure" }],
    ];

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter,

  /** Dossier des artefacts bruts (screenshots/videos/traces avant rapport). */
  outputDir: "test-results",

  use: {
    baseURL: BASE_URL,
    /** Trace zip seulement sur premier retry → léger en succès, complet sur flake. */
    trace: "on-first-retry",
    /** Screenshot fullPage automatique à l'échec → contexte visuel dans le rapport. */
    screenshot: { mode: "only-on-failure", fullPage: true },
    /** Vidéo MP4 conservée uniquement pour les tests qui finissent en échec. */
    video: "retain-on-failure",
    actionTimeout: 10_000,
    /** Empêche les requêtes inattendues de masquer l'erreur réelle. */
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: "admin-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      testMatch: /.*\.admin\.spec\.ts/,
    },
    {
      name: "chef-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/chef.json" },
      testMatch: /.*\.chef\.spec\.ts/,
    },
    {
      name: "employe-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/employe-desktop.json" },
      testMatch: /.*\.employe-desktop\.spec\.ts/,
    },
    {
      name: "employe-mobile",
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/employe-mobile.json" },
      testMatch: /.*\.employe-mobile\.spec\.ts/,
    },
    {
      name: "smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.smoke\.spec\.ts/,
    },
    // Lot 8.2b — Comptes test matrice Fiche Objet.
    {
      name: "commercial-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/commercial.json" },
      testMatch: /.*\.commercial\.spec\.ts/,
    },
    {
      name: "bureau-etude-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/bureau-etude.json" },
      testMatch: /.*\.bureau-etude\.spec\.ts/,
    },
    {
      name: "atelier-chef-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/atelier-chef.json" },
      testMatch: /.*\.atelier-chef\.spec\.ts/,
    },
    // L5-B clôture — 4 rôles manquants.
    {
      name: "rh-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/rh.json" },
      testMatch: /.*\.rh\.spec\.ts/,
    },
    {
      name: "atelier-metier-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/atelier-metier.json" },
      testMatch: /.*\.atelier-metier\.spec\.ts/,
    },
    {
      name: "logistique-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/logistique.json" },
      testMatch: /.*\.logistique\.spec\.ts/,
    },
    {
      name: "poseur-mobile",
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/poseur.json" },
      testMatch: /.*\.poseur\.spec\.ts/,
    },
  ],

  webServer: isCI
    ? undefined
    : {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
