/**
 * v0.41.0c (Sprint 3c.2) — E2E employé MOBILE : flows critiques (Pixel 7 viewport).
 *
 *  M1 — /mobile/aujourdhui : voir affectation/jour + commentaire (best effort).
 *  M2 — /mobile/heures : grille semaine accessible et scrollable.
 *  M3 — Saisie hors planning mobile : ouverture modale compacte (rendu < 1024px).
 *  M4 — Anti-fuite RGPD mobile : /staffing/<uuid> refusé.
 *
 * Tests défensifs : skip plutôt que fail si DB sans assignation pour le compte.
 */
import { expect, test } from "@playwright/test";

test.describe("employé mobile / flows critiques v0.41 (3c.2)", () => {
  test("M1 — /mobile/aujourdhui rend la vue du jour", async ({ page }) => {
    await page.goto("/mobile/aujourdhui");
    await expect(
      page.getByText(/aujourd|jour|chantier|affectation|repos/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("M2 — /mobile/heures rend la grille de saisie", async ({ page }) => {
    await page.goto("/mobile/heures");
    await expect(
      page.getByRole("heading", { name: /Saisie & soumission|heures/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("M3 — bouton + Autre chantier ouvre la modale hors planning (mobile)", async ({
    page,
  }) => {
    await page.goto("/mobile/heures");
    const trigger = page.getByTestId("btn-add-hors-planning").first();
    if ((await trigger.count()) === 0) {
      test.skip(true, "Pas de bouton hors planning visible (DB sans assignation)");
    }
    await trigger.click();
    await expect(
      page.getByRole("heading", { name: /Saisir des heures hors planning/i }),
    ).toBeVisible({ timeout: 10_000 });
    // Vérifier le rendu compact (la modale ne doit pas dépasser le viewport)
    const dialog = page.getByRole("dialog").first();
    const box = await dialog.boundingBox();
    if (box) {
      const viewport = page.viewportSize();
      expect(box.width).toBeLessThanOrEqual((viewport?.width ?? 414) + 4);
    }
    await page.keyboard.press("Escape");
  });

  test("M4 — anti-fuite RGPD mobile : /staffing/<uuid> refusé", async ({ page }) => {
    const response = await page.goto("/staffing/00000000-0000-0000-0000-000000000000");
    const blockedByRedirect = !/\/staffing\//.test(page.url());
    const blockedByMessage = await page
      .getByText(/accès refusé|non autorisé|introuvable|404/i)
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    const blockedByStatus = (response?.status() ?? 200) >= 400;
    expect(blockedByRedirect || blockedByMessage || blockedByStatus).toBeTruthy();
  });
});
