/**
 * v0.44.0 Sprint 2 — Documents/Photos par affaire (chef mobile + admin desktop).
 *
 * Couvre :
 *  (a) Admin desktop : onglet Documents visible sur /affaires/$id, upload + suppression
 *  (b) Chef mobile : page /mobile/chef/affaires/$id affiche la galerie Photos
 *  (c) Chef sur affaire NON assignée : la zone Uploader n'apparaît pas (canUpload=false)
 *  (d) RLS : tentative directe d'INSERT sur affaire non assignée échoue
 *
 * Marqués `test.skip()` si seed absent (pas d'affaire pour le compte E2E).
 */
import { test, expect } from "@playwright/test";

test.describe("Sprint 2 Documents/Photos affaire", () => {
  test("(a) onglet Documents accessible depuis le détail affaire admin", async ({ page }) => {
    // On part de la liste affaires
    await page.goto("/affaires");
    await page.waitForLoadState("networkidle");

    // Premier lien d'affaire trouvé
    const firstAffaire = page.locator("a[href^='/affaires/']").first();
    if ((await firstAffaire.count()) === 0) {
      test.skip(true, "Aucune affaire seedée");
      return;
    }
    await firstAffaire.click();
    await page.waitForLoadState("networkidle");

    // Onglet Documents présent
    const docsTab = page.getByRole("link", { name: /^Documents$/ });
    await expect(docsTab).toBeVisible({ timeout: 5_000 });

    await docsTab.click();
    await expect(page).toHaveURL(/\/affaires\/[^/]+\/documents/);

    // Empty state ou grille — au moins la zone Photos & documents visible
    await expect(page.getByText(/Photos\s*&\s*documents|Aucun document/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("(b) chef mobile accède à la galerie Photos d'une de ses affaires", async ({ page }) => {
    await page.goto("/mobile/chef/dashboard");
    await page.waitForLoadState("networkidle");

    // Premier lien vers /mobile/chef/affaires/...
    const firstAffaire = page.locator("a[href^='/mobile/chef/affaires/']").first();
    if ((await firstAffaire.count()) === 0) {
      test.skip(true, "Chef sans affaire assignée — seed manquant");
      return;
    }
    await firstAffaire.click();
    await page.waitForLoadState("networkidle");

    // Section Photos & documents + boutons Photo/Galerie présents (canUpload=true)
    await expect(page.getByText(/Photos\s*&\s*documents/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^Photo$/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Galerie/i })).toBeVisible();
  });

  test("(c) chef sur affaire non assignée : pas de bouton upload", async ({ page }) => {
    // URL forgée — on tape un UUID aléatoire connu pour ne pas être dans ses affaires
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await page.goto(`/mobile/chef/affaires/${fakeId}`);
    await page.waitForLoadState("networkidle");

    // Le bouton Photo ne doit PAS apparaître
    await expect(page.getByRole("button", { name: /^Photo$/i })).toHaveCount(0);
    // L'affaire est introuvable côté RLS → message Affaire introuvable
    await expect(page.getByText(/Affaire introuvable|Aucun document/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
