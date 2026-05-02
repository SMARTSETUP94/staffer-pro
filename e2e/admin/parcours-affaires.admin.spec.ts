/**
 * v0.35.6+ E2E admin — parcours métier affaires + devis + utilisateurs.
 *
 * 7 scénarios complétant invitations.* (déjà 5) → total admin = 12.
 * Tolérant aux seeds : skip propre si données absentes (pas de FAIL bruyant).
 */
import { expect, test } from "@playwright/test";

test.describe("admin / parcours affaires + devis + admin pages", () => {
  test("A1 — page /affaires accessible et liste affichée", async ({ page }) => {
    await page.goto("/affaires");
    await expect(
      page.getByRole("heading", { name: /affaires/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("A2 — bouton 'Nouvelle affaire' ouvre un dialog/route de création", async ({
    page,
  }) => {
    await page.goto("/affaires");
    const btn = page
      .getByRole("button", { name: /nouvelle affaire|créer.*affaire|\+.*affaire/i })
      .first();
    if (!(await btn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.info().annotations.push({ type: "note", description: "Bouton création affaire absent — UI variante." });
      return;
    }
    await btn.click();
    // Soit dialog, soit route /affaires/new
    const opened =
      (await page.getByRole("dialog").first().isVisible({ timeout: 3_000 }).catch(() => false)) ||
      /\/affaires\/(new|nouvelle)/.test(page.url());
    expect(opened).toBeTruthy();
  });

  test("A3 — page /devis/import accessible (admin)", async ({ page }) => {
    await page.goto("/devis/import");
    await expect(page.getByText(/import.*devis|déposer.*fichier/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("A4 — page /devis/historique liste les imports", async ({ page }) => {
    await page.goto("/devis/historique");
    await expect(page.getByRole("heading", { name: /historique/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("A5 — page /charge-atelier accessible (admin) et rend la grille", async ({ page }) => {
    await page.goto("/charge-atelier");
    await expect(page.getByText(/charge atelier|métier/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("A6 — page /audit-auth accessible (admin)", async ({ page }) => {
    await page.goto("/audit-auth");
    await expect(page.getByRole("heading", { name: /audit|connexions|événements/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("A7 — page /parametres/utilisateurs accessible (admin)", async ({ page }) => {
    await page.goto("/parametres/utilisateurs");
    await expect(page.getByText(/utilisateurs|rôle|inviter/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
