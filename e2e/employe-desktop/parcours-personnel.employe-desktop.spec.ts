/**
 * v0.35.6+ E2E employé desktop — parcours personnel + RGPD.
 *
 * 6 scénarios complétant staffing-v035-blocked (déjà 2) → total employé desktop = 8.
 */
import { expect, test } from "@playwright/test";

test.describe("employé desktop / parcours personnel + RGPD", () => {
  test("E1 — login employé redirige vers /ma-semaine (anti-fuite RGPD)", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL((url) => /\/(ma-semaine|mobile\/aujourdhui)/.test(url.pathname), {
      timeout: 15_000,
    });
    expect(page.url()).toMatch(/\/(ma-semaine|mobile\/aujourdhui)/);
  });

  test("E2 — /ma-semaine rend les créneaux de la semaine", async ({ page }) => {
    await page.goto("/ma-semaine");
    await expect(page.getByText(/semaine|lundi|mardi/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("E3 — /mes-heures accessible et liste les saisies", async ({ page }) => {
    await page.goto("/mes-heures");
    await expect(page.getByText(/heures|saisi/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("E4 — /mes-propositions accessible", async ({ page }) => {
    await page.goto("/mes-propositions");
    await expect(page.getByText(/proposition|affectation/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("E5 — /mes-swaps accessible", async ({ page }) => {
    await page.goto("/mes-swaps");
    await expect(page.getByText(/swap|échange/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("E6 — /audit-auth refuse l'accès à un employé (anti-fuite)", async ({ page }) => {
    const response = await page.goto("/audit-auth");
    // Soit redirect, soit 403, soit page vide / message d'accès refusé
    const blocked =
      !/\/audit-auth$/.test(page.url()) ||
      (await page.getByText(/accès refusé|non autorisé|403/i).first().isVisible({ timeout: 3_000 }).catch(() => false));
    expect(blocked || (response?.status() ?? 200) >= 400).toBeTruthy();
  });
});
