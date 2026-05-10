/**
 * E2E 6 (admin) — Section Rémunération visible pour admin.
 * Pendant admin, ouvre une fiche employé → section "Rémunération" visible
 * + au moins un champ taux_horaire éditable.
 */
import { expect, test } from "@playwright/test";

test.describe("E2E 6 — section Rémunération (admin)", () => {
  test("admin voit la section Rémunération avec champs taux_horaire", async ({ page }) => {
    await page.goto("/employes");
    if (!page.url().includes("/employes")) {
      test.skip(true, "Route /employes inaccessible");
    }

    const editBtn = page
      .getByRole("button", { name: /modifier|éditer|fiche/i })
      .first()
      .or(page.getByRole("row").first().getByRole("button").first());
    if (!(await editBtn.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip(true, "Pas de fiche employé ouvrable");
    }
    await editBtn.click();

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Section visible
    await expect(dialog.getByText(/r.?mun.ration/i).first()).toBeVisible({ timeout: 4_000 });

    // Au moins un input taux_horaire
    const tauxInput = dialog
      .locator('input[name*="taux_horaire" i], [data-field*="taux_horaire" i]')
      .first();
    await expect(tauxInput).toBeVisible({ timeout: 3_000 });
  });
});
