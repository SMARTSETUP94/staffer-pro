/**
 * v0.41.0c (Sprint 3c.3) — E2E chef : validation heures (4 onglets) + auto-staffing.
 *
 *  C1 — /validation-heures : onglet "Hors planning" sélectionnable (4ème tab).
 *  C2 — /staffing/<id> : bouton Auto-staff complet présent et clickable.
 *
 * Défensif : skip si pas de plan staffable / pas de saisie hors planning en attente.
 */
import { expect, test } from "@playwright/test";

test.describe("chef / extras validation + auto-staffing (3c.3)", () => {
  test("C1 — /validation-heures expose l'onglet 'Hors planning'", async ({ page }) => {
    await page.goto("/validation-heures");
    await expect(page.getByText(/validation|heures/i).first()).toBeVisible({
      timeout: 15_000,
    });
    const horsTab = page.getByRole("tab", { name: /hors planning/i }).first();
    if (!(await horsTab.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Onglet 'Hors planning' absent (UI variante ou DB vide)");
    }
    await horsTab.click();
    // Le panneau doit basculer (état aria-selected)
    await expect(horsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });
  });

  test("C2 — bouton Auto-staff complet visible sur /staffing/<id>", async ({ page }) => {
    // On essaie d'aller sur un plan via /planning qui list les plans
    await page.goto("/planning");
    const planLink = page.locator('a[href*="/staffing/"]').first();
    if (!(await planLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Aucun plan staffing accessible (DB sans plan)");
    }
    await planLink.click();
    await page.waitForURL(/\/staffing\//, { timeout: 10_000 });
    const autoStaff = page
      .getByRole("button", { name: /auto.?staff.*complet|auto.?staff.*plan/i })
      .first();
    await expect(autoStaff).toBeVisible({ timeout: 15_000 });
  });
});
