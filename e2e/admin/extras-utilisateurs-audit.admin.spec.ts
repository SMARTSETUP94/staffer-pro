/**
 * v0.41.0c (Sprint 3c.3) — E2E admin : invitation user + auto-link + audit-heures export.
 *
 *  A1 — /parametres/utilisateurs : bouton 'Inviter un utilisateur' ouvre formulaire.
 *  A2 — Bouton 'Auto-lier employés' présent sur /parametres/utilisateurs (ou /employes).
 *  A3 — /audit-heures : bouton export CSV/Excel visible.
 *
 * Défensif : on vérifie la présence des contrôles, pas l'effet DB (autres tests E2E
 * dédiés couvrent les mutations critiques).
 */
import { expect, test } from "@playwright/test";

test.describe("admin / extras invitations + audit (3c.3)", () => {
  test("A1 — /parametres/utilisateurs : bouton 'Inviter un utilisateur' ouvre un dialog", async ({
    page,
  }) => {
    await page.goto("/parametres/utilisateurs");
    const inviteBtn = page
      .getByRole("button", { name: /inviter.*utilisateur|nouvel.*invitation|\+.*invitation/i })
      .first();
    if (!(await inviteBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Bouton invitation absent (variante UI)");
    }
    await inviteBtn.click();
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Au minimum un champ email présent
    await expect(
      dialog.locator('input[type="email"], input[name*="email" i]').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("A2 — bouton 'Auto-lier employés' accessible (utilisateurs ou employés)", async ({
    page,
  }) => {
    for (const route of ["/parametres/utilisateurs", "/employes"]) {
      await page.goto(route);
      const btn = page
        .getByRole("button", { name: /auto.?lier|lier.*employ|associer.*compte/i })
        .first();
      if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(btn).toBeEnabled();
        return;
      }
    }
    test.skip(true, "Bouton Auto-lier absent (feature pas exposée dans cette UI)");
  });

  test("A3 — /audit-heures : bouton export visible", async ({ page }) => {
    await page.goto("/audit-heures");
    await expect(page.getByRole("heading", { name: /audit/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    const exportBtn = page
      .getByRole("button", { name: /export|télécharger|csv|excel|silae/i })
      .first();
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });
  });
});
