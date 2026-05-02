/**
 * v0.35.6+ E2E employé mobile — parcours saisie rapide + navigation.
 *
 * 6 scénarios complétant saisie-hors-planning (déjà 1) → total mobile = 7.
 */
import { expect, test } from "@playwright/test";

test.describe("employé mobile / parcours quotidien", () => {
  test("M1 — /mobile/aujourdhui rend les créneaux du jour", async ({ page }) => {
    await page.goto("/mobile/aujourdhui");
    await expect(page.getByText(/aujourd|jour|chantier/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("M2 — bottom nav mobile présent et clickable", async ({ page }) => {
    await page.goto("/mobile/aujourdhui");
    const nav = page.locator("nav").last();
    await expect(nav).toBeVisible({ timeout: 10_000 });
  });

  test("M3 — /mobile/heures accessible", async ({ page }) => {
    await page.goto("/mobile/heures");
    await expect(page.getByText(/heures/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("M4 — /mobile/mois rend la vue mensuelle", async ({ page }) => {
    await page.goto("/mobile/mois");
    await expect(page.getByText(/mois|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("M5 — /mobile/swaps accessible", async ({ page }) => {
    await page.goto("/mobile/swaps");
    await expect(page.getByText(/swap|échange/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("M6 — /mobile/profil affiche les infos perso", async ({ page }) => {
    await page.goto("/mobile/profil");
    await expect(page.getByText(/profil|déconn/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
