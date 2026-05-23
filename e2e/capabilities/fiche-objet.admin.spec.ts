/**
 * Lot 8.2 — Fiche Objet : smoke admin (édition tous champs + bascule heures).
 *
 * Pré-requis :
 *   - flag `fiche_objet_v1` activé pour l'admin (ou globalement),
 *   - une affaire 5XXX avec au moins 1 objet de fab (seed standard),
 *   - storageState admin disponible.
 *
 * Le test découvre dynamiquement le 1er objet via l'UI Fabrication.
 */
import { test, expect } from "@playwright/test";

test.describe("fiche-objet :: admin", () => {
  test("rend la fiche d'un objet, affiche bouton Éditer et bascule heures", async ({ page }) => {
    // 1. Aller sur la liste des affaires fab (5XXX)
    await page.goto("/affaires?typologie=fabrication");
    // 2. Cliquer la 1ère affaire
    const firstAffaireLink = page.locator('a[href*="/affaires/"][href*="-"]').first();
    if ((await firstAffaireLink.count()) === 0) {
      test.skip(true, "Aucune affaire fab seedée — spec ignorée");
      return;
    }
    await firstAffaireLink.click();
    // 3. Onglet fabrication
    await page.getByRole("link", { name: /fabrication/i }).first().click();
    await page.waitForURL(/\/fabrication$/);

    // 4. Repérer l'URL d'un objet : un <a href="…/objets/…">
    // Au Lot 8.2, le lien depuis la fab n'est PAS encore ajouté → on
    // teste plutôt la route directe en récupérant un objet_id via le
    // dataset si présent. Sinon on skip.
    const objetCard = page.locator('[data-objet-id]').first();
    if ((await objetCard.count()) === 0) {
      test.skip(true, "Liste objets sans data-objet-id — relier en 8.5");
      return;
    }
    const objetId = await objetCard.getAttribute("data-objet-id");
    const affaireUrl = page.url();
    const affaireId = affaireUrl.match(/affaires\/([^/]+)/)?.[1];
    if (!objetId || !affaireId) {
      test.skip(true, "Impossible d'extraire IDs");
      return;
    }

    // 5. Navigation directe vers la fiche objet
    await page.goto(`/affaires/${affaireId}/objets/${objetId}`);

    // Fiche affichée
    await expect(page.getByTestId("fiche-objet-title")).toBeVisible({ timeout: 10_000 });
    // Bouton Éditer présent (admin a la cap)
    await expect(page.getByTestId("btn-editer-objet")).toBeVisible();

    // Toggle Total/Unitaire présent
    await expect(page.getByRole("tab", { name: "Total" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Unitaire" })).toBeVisible();
  });
});
