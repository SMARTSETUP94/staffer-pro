/**
 * Bloc 9.6 bis — E2E nav vers /mobile/mes-missions.
 *
 * Vérifie que l'onglet "Missions" du bottom nav mobile pointe bien vers
 * /mobile/mes-missions et que la navigation fonctionne depuis /mobile/aujourdhui.
 */
import { expect, test } from "@playwright/test";

test.describe("Bloc 9.6 bis — Nav vers Mes missions", () => {
  test("le bottom nav mobile expose l'onglet Missions", async ({ page }) => {
    await page.goto("/mobile/aujourdhui");
    const link = page.getByRole("link", { name: /^Missions$/i }).first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect(page).toHaveURL(/\/mobile\/mes-missions/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /Montage.*démontage/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
