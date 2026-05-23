/**
 * Lot 8.2b — Fiche Objet : matrice bureau_etude.
 *
 * Attendu :
 *   - Voit la fiche.
 *   - Bouton Éditer visible (commentaire + plans CAD).
 *   - nom + quantité + heures DISABLED, commentaire activable.
 */
import { test, expect } from "@playwright/test";

test.describe("fiche-objet :: bureau_etude (commentaire + plans)", () => {
  test("nom/qté disabled, commentaire éditable", async ({ page }) => {
    await page.goto("/affaires?typologie=fabrication");
    const firstAffaire = page.locator('a[href*="/affaires/"][href*="-"]').first();
    if ((await firstAffaire.count()) === 0) {
      test.skip(true, "Aucune affaire fab seedée");
      return;
    }
    await firstAffaire.click();
    await page.getByRole("link", { name: /fabrication/i }).first().click();
    await page.waitForURL(/\/fabrication$/);

    const ficheLink = page.getByTestId("objet-fiche-link").first();
    if ((await ficheLink.count()) === 0) {
      test.skip(true, "Lien Fiche absent — flag OFF");
      return;
    }
    await ficheLink.click();
    await page.waitForURL(/\/objets\//);

    await expect(page.getByTestId("fiche-objet-title")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("btn-editer-objet")).toBeVisible();

    await page.getByTestId("btn-editer-objet").click();
    await expect(page.locator("#fo-nom")).toBeDisabled();
    await expect(page.locator("#fo-qte")).toBeDisabled();
    await expect(page.locator("#fo-comm")).toBeEnabled();
  });
});
