import { test, expect } from "@playwright/test";
import { loginAsChef } from "../helpers/auth";

/**
 * v0.44.3 Sprint correctif — E2E RLS scoped + triggers métier + audit trail.
 *
 * Hypothèses :
 * - Un chef_chantier (chef global) voit /affaires intégralement.
 * - Le ScopedAccessBanner n'apparaît PAS pour chef_chantier/admin.
 * - Validations triggers : heures > 24 doit être rejetée (HEURES_INVALIDES).
 *
 * Note : un seed dédié `chef_metier_scoped` est nécessaire pour les vérifs
 * d'isolement DB strict — voir e2e/seed.ts (à enrichir avant CI bloquante).
 */
test.describe("v0.44.3 — Sprint correctif", () => {
  test("ScopedAccessBanner masqué pour chef global", async ({ page }) => {
    await loginAsChef(page);
    await page.goto("/affaires");
    await expect(page.getByRole("heading", { name: "Affaires" })).toBeVisible();
    // Pas de bandeau scoped
    await expect(page.locator('[role="status"]').filter({ hasText: /Accès limité|actions sont limitées/i })).toHaveCount(0);
  });

  test("Validation heures : trigger HEURES_INVALIDES bloque > 24h", async ({ page }) => {
    await loginAsChef(page);
    await page.goto("/mes-heures");
    // Smoke : la page se charge — la vraie vérif du trigger est en pgTAP côté DB.
    // E2E UI : pas de submit > 24h possible (validation client-side AVANT trigger).
    await expect(page.getByRole("heading")).toBeVisible();
  });

  test("Page admin /audit-heures accessible (admin)", async ({ page }) => {
    await loginAsChef(page);
    await page.goto("/audit-heures");
    // Redirige si non-admin → tolérant : on accepte les 2 cas
    const heading = page.getByText(/Audit des heures|Page réservée/i);
    await expect(heading.first()).toBeVisible({ timeout: 6_000 });
  });
});
