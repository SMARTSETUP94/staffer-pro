/**
 * v0.35.6+ E2E smoke auth + RGPD.
 *
 * 4 scénarios complémentaires (login/forgot/set-password déjà couverts → 12 smoke).
 */
import { expect, test } from "@playwright/test";

test.describe("auth + RGPD / smoke", () => {
  test("AR1 — page /privacy accessible sans auth", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/confidentialité|privacy|RGPD|données/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("AR2 — /dashboard sans auth redirige vers /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
  });

  test("AR3 — /staffing/00000000-0000-0000-0000-000000000000 sans auth redirige", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/staffing/00000000-0000-0000-0000-000000000000");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
  });

  test("AR4 — /charge-atelier sans auth redirige vers /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/charge-atelier");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
  });
});
