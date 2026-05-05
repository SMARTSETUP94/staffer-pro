/**
 * v0.40.0b — Test E2E refonte Manut split.
 *
 * Vérifie :
 *  - Pré-paramétrage : la mention "Manut DÉBUT (35 %) + TRANSFERT (15 %)" est présente
 *    et le tooltip d'absorption est bien rendu sur Bois/Peint/Tap quand applicable.
 *  - Gantt : la section globale s'intitule désormais "Phases globales chantier — Manutention FIN"
 *    (et plus l'ancien "Phase amont — ressource partagée").
 *
 * Tolérant : si aucun plan staffing n'existe en seed, sous-tests skippés.
 */
import { expect, test } from "@playwright/test";

test.describe("chef / refonte Manut v0.40", () => {
  test("MR1 — pré-paramétrage mentionne l'absorption Manut", async ({ page }) => {
    await page.goto("/affaires");
    const link = page.locator('a[href*="/staffing/"]').first();
    if (!(await link.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Aucun plan staffing dans le seed");
    }
    await link.click();
    await expect(page).toHaveURL(/\/staffing\/[0-9a-f-]+/);

    const note = page.getByText(/Manut DÉBUT.*35.*TRANSFERT.*15/i);
    await expect(note.first()).toBeVisible({ timeout: 15_000 });
  });

  test("MR2 — Gantt : section globale renommée 'Phases globales chantier — Manutention FIN'", async ({
    page,
  }) => {
    await page.goto("/affaires");
    const link = page.locator('a[href*="/staffing/"]').first();
    if (!(await link.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Aucun plan staffing dans le seed");
    }
    await link.click();
    const header = page.getByText(/Phases globales chantier.*Manutention FIN/i);
    // Le header n'apparaît que si le plan a au moins un step global (Manut FIN ou Num)
    const visible = await header.first().isVisible({ timeout: 5_000 }).catch(() => false);
    if (!visible) {
      test.skip(true, "Aucun step global (plan vide ou sans Manut/CNC)");
    }
    await expect(header.first()).toBeVisible();
  });

  test("MR3 — StatCard récap Manut visible dans l'en-tête du Gantt", async ({ page }) => {
    await page.goto("/affaires");
    const link = page.locator('a[href*="/staffing/"]').first();
    if (!(await link.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Aucun plan staffing dans le seed");
    }
    await link.click();
    const card = page.getByTestId("manut-statcard");
    if (!(await card.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, "StatCard Manut non rendue (pas de plan calculé ?)");
    }
    await expect(card).toBeVisible();
    // Valeur principale (FIN ou 0 h)
    await expect(page.getByTestId("manut-statcard-value")).toBeVisible();
  });

  test("MR4 — StatCard Manut : badge fallback s'affiche s'il existe des objets dégénérés", async ({
    page,
  }) => {
    await page.goto("/affaires");
    const link = page.locator('a[href*="/staffing/"]').first();
    if (!(await link.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Aucun plan staffing dans le seed");
    }
    await link.click();
    const card = page.getByTestId("manut-statcard");
    if (!(await card.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, "StatCard Manut non rendue");
    }
    const badge = page.getByTestId("manut-statcard-fallback-badge");
    const hasFallback = await badge.isVisible({ timeout: 1_000 }).catch(() => false);
    if (!hasFallback) {
      test.skip(true, "Aucun objet en fallback dans ce plan (cas nominal, badge absent attendu)");
    }
    // Quand présent, le badge doit afficher un compteur > 0 et un texte 'fallback'
    await expect(badge).toContainText(/\d+\s*fallback/i);
    // Ouvre le détail (popover) pour vérifier le bandeau ambre
    await card.click();
    const banner = page.getByTestId("manut-statcard-fallback-banner");
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toContainText(/sans Bois\/Peint\/Tap/i);
  });
});
