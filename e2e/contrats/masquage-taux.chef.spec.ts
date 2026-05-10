/**
 * E2E 6 (chef) — Masquage taux_horaire pour non-admin.
 * Chef ouvre fiche employé → section "Rémunération" ABSENTE du DOM
 * (pas juste display:none — vraiment pas rendue).
 */
import { expect, test } from "@playwright/test";

test.describe("E2E 6 — masquage taux horaire (chef)", () => {
  test("chef ne voit pas la section Rémunération", async ({ page }) => {
    await page.goto("/employes");
    if (!page.url().includes("/employes")) {
      test.skip(true, "Route /employes non accessible pour ce chef");
    }

    // Ouvre la 1re fiche employé
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

    // Section "Rémunération" non rendue
    await expect(dialog.getByText(/r.?mun.ration/i)).toHaveCount(0);
    // Champs taux_horaire absents du DOM
    await expect(
      dialog.locator('input[name*="taux_horaire" i], [data-field*="taux_horaire" i]'),
    ).toHaveCount(0);
  });
});
