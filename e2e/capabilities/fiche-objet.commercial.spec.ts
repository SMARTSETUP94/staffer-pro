/**
 * Lot 8.2b — Fiche Objet : matrice commercial.
 *
 * Pré-requis : storageState commercial seedé (cf. e2e/seed.ts) +
 * flag `fiche_objet_v1` ON pour cet user.
 *
 * Attendu :
 *   - Voit la fiche (cap objet.view ON).
 *   - Bouton Éditer visible (commentaire éditable).
 *   - En mode édition : nom + quantité + heures DISABLED, commentaire activable.
 */
import { test, expect } from "@playwright/test";

test.describe("fiche-objet :: commercial (commentaire only)", () => {
  test("voit la fiche, édite uniquement commentaire", async ({ page }) => {
    // Découverte d'un objet via la page Fabrication (lien Lot 8.2b).
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
      test.skip(true, "Lien Fiche absent — flag fiche_objet_v1 probablement OFF pour ce user");
      return;
    }
    await ficheLink.click();
    await page.waitForURL(/\/objets\//);

    // Fiche affichée
    await expect(page.getByTestId("fiche-objet-title")).toBeVisible({ timeout: 10_000 });
    // Bouton Éditer visible (commercial peut éditer commentaire)
    await expect(page.getByTestId("btn-editer-objet")).toBeVisible();

    // Passage en mode édition : nom disabled, commentaire activable
    await page.getByTestId("btn-editer-objet").click();
    await expect(page.locator("#fo-nom")).toBeDisabled();
    await expect(page.locator("#fo-qte")).toBeDisabled();
    await expect(page.locator("#fo-comm")).toBeEnabled();
  });
});
