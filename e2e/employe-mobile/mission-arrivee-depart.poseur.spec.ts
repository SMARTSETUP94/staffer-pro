/**
 * Bloc 9 Lot 9.4 — E2E carte mission : arrivée → départ → section heures.
 *
 * Robuste à l'absence de seed (skip propre).
 */
import { expect, test } from "@playwright/test";

test.describe("Bloc 9 — mission arrivée/départ → saisie heures", () => {
  test("après depart, la section heures pré-remplie s'affiche", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/mobile/mes-missions");
    const firstCard = page.locator('[data-testid^="mission-card-"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "Aucune mission seed — flux non testable en preview vide");
    }
    await firstCard.click();
    await expect(page.getByTestId("mission-detail-page")).toBeVisible({ timeout: 15_000 });

    // Stub géoloc pour éviter le prompt navigateur
    await page.context().grantPermissions(["geolocation"], { origin: page.url() });

    // Arrivée puis départ
    await page.getByTestId("action-arrivee").click();
    await expect(page.getByTestId("mission-events")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("action-depart").click();

    // La section heures apparaît pré-remplie (>= 0h calculé)
    const heuresSection = page.getByTestId("mission-heures-section");
    await expect(heuresSection).toBeVisible({ timeout: 10_000 });
    await expect(heuresSection.getByTestId("mission-heures-debut")).toHaveValue(/\d{2}:\d{2}/);
    await expect(heuresSection.getByTestId("mission-heures-fin")).toHaveValue(/\d{2}:\d{2}/);

    expect(errors).toEqual([]);
  });
});
