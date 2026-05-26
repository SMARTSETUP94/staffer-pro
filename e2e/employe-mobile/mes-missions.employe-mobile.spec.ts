/**
 * Bloc 9 Lot 9.2 — E2E /mobile/mes-missions.
 *
 * Charge la liste, vérifie l'en-tête et le rendu d'un des deux états
 * (vide OU au moins une carte mission). Pas de seed dédié : la spec
 * couvre les deux branches du composant.
 */
import { expect, test } from "@playwright/test";

test.describe("Bloc 9 — /mobile/mes-missions", () => {
  test("la liste des missions pose charge sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/mobile/mes-missions");

    // En-tête
    await expect(page.getByRole("heading", { name: /Montage.*démontage/i })).toBeVisible({
      timeout: 15_000,
    });

    // Soit empty state, soit au moins un bucket
    const emptyOrBucket = page
      .getByTestId("mes-missions-empty")
      .or(page.locator('[data-testid^="mission-bucket-"]').first());
    await expect(emptyOrBucket).toBeVisible({ timeout: 10_000 });

    expect(errors).toEqual([]);
  });

  test("bottom nav mobile reste accessible depuis /mobile/mes-missions", async ({ page }) => {
    await page.goto("/mobile/mes-missions");
    const nav = page.locator("nav").last();
    await expect(nav).toBeVisible({ timeout: 10_000 });
  });
});
