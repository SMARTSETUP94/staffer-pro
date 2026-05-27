/**
 * L3a — E2E admin : page /parametres/utilisateurs en mode multi-rôles.
 *
 * Scénario déterministe (plus de skip défensif) :
 *  1. login admin → /parametres/utilisateurs
 *  2. localiser la ligne du user test `test_commercial@setupparis.test`
 *     (compte seedé par e2e/seed.ts — Lot 8.2b)
 *  3. ouvrir le popover multi-rôles
 *  4. cocher 3 rôles cumulés : commercial + bureau_etude + chef_chantier
 *  5. "Appliquer" → toast OK
 *  6. recharger la page
 *  7. assert : les 3 badges de rôles sont visibles sur la ligne du user test
 *
 * Prérequis : `bun run e2e/seed.ts` exécuté (compte commercial seedé).
 * Auth : storage state admin via global-setup.
 */
import { expect, test } from "@playwright/test";

const TARGET_EMAIL = "test_commercial@setupparis.test";

const TARGET_ROLES = [
  { key: "commercial", label: /^commercial$/i },
  { key: "bureau_etude", label: /bureau.*[ée]tude/i },
  { key: "chef_chantier", label: /chef.*[ée]quipe|chef.*chantier/i },
];

test.describe("L3a — /parametres/utilisateurs multi-rôles", () => {
  test("admin coche 3 rôles cumulés → 3 badges persistés après reload", async ({
    page,
  }) => {
    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /utilisateur/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Ligne cible : déterministe sur l'email seedé.
    const row = page.getByRole("row").filter({ hasText: TARGET_EMAIL }).first();
    await expect(
      row,
      `Compte test ${TARGET_EMAIL} introuvable — lancer 'bun run e2e/seed.ts'`,
    ).toBeVisible({ timeout: 10_000 });

    // Ouvrir le popover multi-rôles.
    const roleTrigger = row
      .getByRole("button", { name: /r[ôo]le|modifier|changer/i })
      .first();
    await expect(roleTrigger).toBeVisible({ timeout: 5_000 });
    await roleTrigger.click();

    // Cocher les 3 rôles cibles.
    for (const r of TARGET_ROLES) {
      const cb = page.getByRole("checkbox", { name: r.label }).first();
      await expect(cb).toBeVisible({ timeout: 5_000 });
      if (!(await cb.isChecked().catch(() => false))) {
        await cb.click();
      }
    }

    // Appliquer.
    await page
      .getByRole("button", { name: /appliquer|enregistrer|valider/i })
      .first()
      .click();

    // Feedback succès (best-effort).
    await page
      .getByText(/r[ôo]les?.*(mis|appliqu|enregistr)/i)
      .first()
      .waitFor({ timeout: 5_000 })
      .catch(() => undefined);

    // Reload → vérifier persistance.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: /utilisateur/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const reloadedRow = page
      .getByRole("row")
      .filter({ hasText: TARGET_EMAIL })
      .first();
    await expect(reloadedRow).toBeVisible({ timeout: 10_000 });

    for (const r of TARGET_ROLES) {
      await expect(
        reloadedRow.getByText(r.label).first(),
        `Badge rôle "${r.key}" attendu sur la ligne ${TARGET_EMAIL}`,
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
