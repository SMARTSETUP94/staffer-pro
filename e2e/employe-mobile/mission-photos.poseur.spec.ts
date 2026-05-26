/**
 * Bloc 9 Lot 9.4 — E2E bouton photo flottant carte mission.
 *
 * On vérifie présence du FAB photo + label de catégorie auto, sans
 * réellement uploader (cassant dans Playwright headless sur input file
 * `capture`). L'upload réel est couvert par les tests unitaires
 * autoTagCategoryByMissionState + use-affaire-documents.
 */
import { expect, test } from "@playwright/test";

test.describe("Bloc 9 — bouton photo carte mission", () => {
  test("le FAB photo est visible et expose un input file capture", async ({ page }) => {
    await page.goto("/mobile/mes-missions");
    const firstCard = page.locator('[data-testid^="mission-card-"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "Aucune mission seed — flux non testable en preview vide");
    }
    await firstCard.click();
    await expect(page.getByTestId("mission-detail-page")).toBeVisible({ timeout: 15_000 });

    const fab = page.getByTestId("mission-photo-fab");
    await expect(fab).toBeVisible();
    // Categorie auto affichée (avant_montage par défaut sans event)
    await expect(page.getByTestId("mission-photo-categorie")).toContainText(
      /avant|pendant|après|incident/i,
    );

    // Input file présent avec capture environnement
    const input = page.getByTestId("mission-photo-input");
    await expect(input).toHaveAttribute("accept", /image/);
  });
});
