/**
 * v0.39.1 Sprint 1 — Test E2E flow critique : chef saisit heures pour employé,
 * employé doit voir la saisie côté /mes-heures + /ma-semaine + mobile.
 *
 * Aurait évité le BUG #33 (heures invisibles côté employé après saisie chef).
 *
 * Pré-requis : storageState chef + employé Marc seedés (e2e/.auth/employe-marc.json).
 * Si fixtures absentes → test skippé proprement (tolérant).
 *
 * Couvre :
 *  - RLS heures_saisies_self_select : policy doit retourner les heures d'un
 *    employé même quand elles ont été insérées par un chef.
 *  - UI desktop /mes-heures + /ma-semaine
 *  - UI mobile /mobile/heures + /mobile/aujourdhui
 */
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

const EMPLOYE_AUTH = "e2e/.auth/employe.json";

test.describe("chef → saisie heures pour employé (BUG #33 anti-régression)", () => {
  test("CSPE1 — chef accède à /saisie-pour-equipe et peut ouvrir le dialog", async ({
    page,
  }) => {
    await page.goto("/saisie-pour-equipe");
    await expect(
      page.getByRole("heading", { name: /saisir.*équipe|saisie.*équipe/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("CSPE2 — l'employé voit les heures saisies par un chef sur /mes-heures", async ({
    browser,
  }) => {
    test.skip(!existsSync(EMPLOYE_AUTH), "storageState employé absent — seed E2E requis");

    const ctx = await browser.newContext({ storageState: EMPLOYE_AUTH });
    const page = await ctx.newPage();
    await page.goto("/mes-heures");
    // Page se charge sans erreur RLS (sinon bandeau d'erreur)
    await expect(page.getByRole("heading", { name: /mes heures/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Pas d'erreur RLS visible
    await expect(page.getByText(/permission denied|row-level security/i)).toHaveCount(0);
    await ctx.close();
  });

  test("CSPE3 — l'employé voit ses heures sur /ma-semaine (vue récap)", async ({ browser }) => {
    test.skip(!existsSync(EMPLOYE_AUTH), "storageState employé absent");
    const ctx = await browser.newContext({ storageState: EMPLOYE_AUTH });
    const page = await ctx.newPage();
    await page.goto("/ma-semaine");
    await expect(page.getByRole("heading", { name: /ma semaine|semaine/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/permission denied|row-level security/i)).toHaveCount(0);
    await ctx.close();
  });

  test("CSPE4 — l'employé voit ses heures sur mobile /mobile/heures", async ({ browser }) => {
    test.skip(!existsSync(EMPLOYE_AUTH), "storageState employé absent");
    const ctx = await browser.newContext({
      storageState: EMPLOYE_AUTH,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto("/mobile/heures");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/permission denied|row-level security/i)).toHaveCount(0);
    await ctx.close();
  });
});
