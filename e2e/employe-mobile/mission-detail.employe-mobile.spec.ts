/**
 * Bloc 9 Lot 9.3 — E2E /mobile/mission/$affaireId/$phase.
 *
 * Cherche la première carte mission depuis la liste ; si présente,
 * clique dessus et vérifie le rendu du détail. Sinon, vérifie le
 * comportement « affaire introuvable » avec un UUID aléatoire.
 */
import { expect, test } from "@playwright/test";

test.describe("Bloc 9 — /mobile/mission/$affaireId/$phase", () => {
  test("ouvre une carte mission depuis la liste OU rend l'erreur 'introuvable'", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/mobile/mes-missions");
    await expect(page.getByRole("heading", { name: /Montage.*démontage/i })).toBeVisible({
      timeout: 15_000,
    });

    const firstCard = page.locator('[data-testid^="mission-card-"]').first();
    const empty = page.getByTestId("mes-missions-empty");

    if ((await firstCard.count()) > 0) {
      await firstCard.click();
      await expect(page.getByTestId("mission-detail-page")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("mission-hero")).toBeVisible();
      await expect(page.getByTestId("mission-actions-bar")).toBeVisible();
      // Au moins un des 3 boutons d'actions est rendu
      await expect(page.getByTestId("action-arrivee")).toBeVisible();
      await expect(page.getByTestId("action-depart")).toBeVisible();
      await expect(page.getByTestId("action-probleme")).toBeVisible();
    } else {
      await expect(empty).toBeVisible();
      // Pas de mission → on teste qu'une URL fabriquée tombe sur l'erreur
      await page.goto(
        "/mobile/mission/00000000-0000-0000-0000-000000000000/montage",
      );
      await expect(page.getByText(/introuvable|aucune mission/i).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    expect(errors).toEqual([]);
  });

  test("le dialogue 'Signaler un problème' s'ouvre", async ({ page }) => {
    await page.goto("/mobile/mes-missions");
    const firstCard = page.locator('[data-testid^="mission-card-"]').first();
    if ((await firstCard.count()) === 0) {
      test.skip(true, "aucune mission seed pour le compte employé mobile");
      return;
    }
    await firstCard.click();
    await expect(page.getByTestId("mission-detail-page")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("action-probleme").click();
    await expect(page.getByTestId("probleme-note-input")).toBeVisible({ timeout: 5_000 });
  });
});
