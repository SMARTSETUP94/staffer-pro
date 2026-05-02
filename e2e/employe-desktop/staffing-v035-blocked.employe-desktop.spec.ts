/**
 * v0.35.6 / Sprint 6 — S10 : un employé NE PEUT PAS accéder à /charge-atelier
 * ni à /staffing/$planId — il est redirigé vers /dashboard (guard client).
 */
import { expect, test } from "@playwright/test";

test.describe("auto-staffing v0.35 / employé bloqué (RGPD + RBAC)", () => {
  test("S10a — /charge-atelier redirige vers /dashboard ou affiche 403", async ({ page }) => {
    await page.goto("/charge-atelier");
    // Le guard client `Navigate to /dashboard`. URL doit basculer.
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).not.toMatch(/\/charge-atelier/);
  });

  test("S10b — /staffing/$planId (n'importe quel id) redirige employé", async ({ page }) => {
    await page.goto("/staffing/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).not.toMatch(/\/staffing\//);
  });
});
