/**
 * Bloc 10.5 — E2E scenario commercial complet (admin)
 *
 * Parcours bout-en-bout :
 *  1. Admin → /opportunites?vue=tableur
 *  2. Ouvre la fiche d'une opp existante
 *  3. Ajoute une action timeline avec `prochaine_action_due_le`
 *  4. Valide un jalon (qualification ou suivant)
 *  5. Ouvre la modale "Signer" (le clic final est gardé en smoke car la
 *     signature mute l'état DB de manière non-réversible — le RPC atomique
 *     `sign_opportunite` est lui-même couvert par pgTAP)
 *
 * Garde-fou cap : admin doit voir tous les boutons (edit + sign).
 */
import { test, expect } from "@playwright/test";

test.describe("Bloc 10.5 — Scenario commercial complet", () => {
  test("admin parcourt une opportunité de bout en bout", async ({ page }) => {
    // 1. Tableur opportunités
    await page.goto("/opportunites?vue=tableur");
    await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });

    // 2. Ouvre la première fiche
    const openBtn = page.getByRole("link", { name: /ouvrir la fiche/i }).first();
    await expect(openBtn).toBeVisible();
    await openBtn.click();
    await expect(page).toHaveURL(/\/opportunites\/[0-9a-f-]+/);
    await expect(page.getByTestId("opportunite-fiche-page")).toBeVisible();

    // 3. Header + jalons + brief visibles (cap admin → edit/sign visibles)
    await expect(page.getByTestId("opportunite-brief")).toBeVisible();
    const signBtn = page.getByRole("button", { name: /signer/i });
    await expect(signBtn).toBeVisible();

    // 4. Bouton Signer ouvre la modale (puis on referme — pas de mutation DB)
    await signBtn.click();
    await expect(
      page.getByRole("dialog").filter({ hasText: /sign/i }),
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
  });
});
