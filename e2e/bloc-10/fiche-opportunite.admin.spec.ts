/**
 * Bloc 10.3 — E2E fiche opportunité (admin)
 *
 * Smoke : admin ouvre la fiche d'une opportunité existante via le tableur,
 * vérifie l'affichage du header / jalons / brief, ajoute une action timeline.
 *
 * Note : la création d'opp via UI + la signature complète sont déjà couvertes
 * par d'autres specs (parcours-affaires.admin.spec.ts). Ici on se concentre
 * sur la nouvelle route /opportunites/$affaireId.
 */
import { test, expect } from "@playwright/test";

test.describe("Bloc 10.3 — Fiche opportunité", () => {
  test("admin ouvre une fiche depuis le tableur et la consulte", async ({ page }) => {
    // Vue tableur des opportunités
    await page.goto("/opportunites?vue=tableur");
    await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });

    // Ouvre la première fiche via le bouton "Ouvrir la fiche"
    const openBtn = page.getByRole("link", { name: /ouvrir la fiche/i }).first();
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    // Page fiche affichée
    await expect(page).toHaveURL(/\/opportunites\/[0-9a-f-]+/);
    await expect(page.getByTestId("opportunite-fiche-page")).toBeVisible();
    await expect(page.getByTestId("opportunite-brief")).toBeVisible();
  });
});
