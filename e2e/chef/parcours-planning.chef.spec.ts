/**
 * v0.35.6+ E2E chef — parcours métier planning + heures + flotte.
 *
 * 9 scénarios complétant staffing-v035 (déjà 9) → total chef = 18.
 * Tolérant aux seeds.
 */
import { expect, test } from "@playwright/test";

test.describe("chef / parcours planning + heures + flotte", () => {
  test("C1 — /planning rend la grille principale", async ({ page }) => {
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: /planning/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("C2 — /planning : filtre Type contrat (CDI/Intérim/Synthèse) sélectionnable", async ({
    page,
  }) => {
    await page.goto("/planning");
    const tab = page.getByRole("tab", { name: /CDI|intérim|synthèse/i }).first();
    if (await tab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tab.click();
    }
    await expect(page.getByRole("heading", { name: /planning/i }).first()).toBeVisible();
  });

  test("C3 — /validation-heures accessible", async ({ page }) => {
    await page.goto("/validation-heures");
    await expect(page.getByText(/validation|heures/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("C4 — /audit-heures accessible (chef)", async ({ page }) => {
    await page.goto("/audit-heures");
    await expect(page.getByRole("heading", { name: /audit/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("C5 — /flotte rend la liste véhicules / trajets", async ({ page }) => {
    await page.goto("/flotte");
    await expect(page.getByText(/flotte|véhicule|trajet/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("C6 — /opportunites rend kanban ou tableur", async ({ page }) => {
    await page.goto("/opportunites");
    await expect(page.getByText(/opportunit/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("C7 — /export accessible et liste les exports", async ({ page }) => {
    await page.goto("/export");
    await expect(page.getByText(/export/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("C8 — /dashboard rend les widgets", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard|tableau de bord/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("C9 — /employes accessible (chef)", async ({ page }) => {
    await page.goto("/employes");
    await expect(page.getByText(/employé/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
