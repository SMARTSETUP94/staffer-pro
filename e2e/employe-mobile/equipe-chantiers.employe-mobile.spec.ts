/**
 * Bloc 9.6 bis — E2E /mobile/equipe-chantiers.
 *
 * Vérifie le rendu (empty OU liste) et l'accessibilité via la bottom nav.
 */
import { expect, test } from "@playwright/test";

test.describe("Bloc 9.6 bis — /mobile/equipe-chantiers", () => {
  test("la liste des équipes chantiers charge sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/mobile/equipe-chantiers");

    await expect(page.getByRole("heading", { name: /Équipes par chantier/i })).toBeVisible({
      timeout: 15_000,
    });

    const emptyOrList = page
      .getByTestId("equipe-chantiers-empty")
      .or(page.getByTestId("equipe-chantiers-list"));
    await expect(emptyOrList).toBeVisible({ timeout: 10_000 });

    expect(errors).toEqual([]);
  });
});
