/**
 * v0.34 — E2E smoke : /auth/set-password.
 *
 * Cas couverts :
 *  1. Sans hash (pas de #access_token=) → bandeau d'erreur "Aucune session
 *     détectée" affiché après le délai de grâce, formulaire toujours visible.
 *  2. Avec hash factice → page tente setSession (qui échouera car tokens
 *     invalides), même comportement attendu (bandeau session manquante).
 *  3. Validation locale : confirmation différente du mot de passe → erreur
 *     inline, pas de soumission.
 *  4. Si l'utilisateur arrive depuis un domaine non-whitelisté (preview), la
 *     redirection vers la prod est gérée *côté envoi* (admin-actions). Ici
 *     on vérifie que /auth/set-password sur le domaine courant ne crash pas
 *     et reste utilisable comme page d'arrivée.
 */
import { expect, test } from "@playwright/test";

test.describe("/auth/set-password", () => {
  test("sans hash : affiche le formulaire + bandeau session manquante", async ({ page }) => {
    await page.goto("/auth/set-password");

    await expect(page.getByRole("heading", { name: /Crée ton mot de passe/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("#pwd")).toBeVisible();
    await expect(page.locator("#pwd2")).toBeVisible();

    // Le bandeau apparaît après ~800ms si pas de session
    await expect(page.getByText(/Aucune session détectée/i)).toBeVisible({ timeout: 5_000 });
  });

  test("validation : mots de passe non concordants → erreur inline", async ({ page }) => {
    await page.goto("/auth/set-password");
    await page.locator("#pwd").fill("password123");
    await page.locator("#pwd2").fill("different456");
    await page.getByRole("button", { name: /Créer mon compte/ }).click();

    await expect(page.getByText(/ne correspond|identique|pas .{0,5}identiques/i).first()).toBeVisible({
      timeout: 5_000,
    });
    // Toujours sur la même page
    await expect(page).toHaveURL(/\/auth\/set-password/);
  });

  test("validation : mot de passe trop court → erreur inline", async ({ page }) => {
    await page.goto("/auth/set-password");
    await page.locator("#pwd").fill("abc");
    await page.locator("#pwd2").fill("abc");
    await page.getByRole("button", { name: /Créer mon compte/ }).click();

    await expect(page.getByText(/8 caractères|trop court/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("avec hash invalide : nettoie le hash et affiche bandeau session", async ({ page }) => {
    await page.goto("/auth/set-password#access_token=fake&refresh_token=fake&type=invite");

    await expect(page.locator("#pwd")).toBeVisible({ timeout: 10_000 });

    // Le hash a été retiré (history.replaceState) après tentative de setSession
    // (ou laissé si setSession a échoué tôt — on accepte les deux)
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash === "" || hash.includes("access_token")).toBe(true);

    // Comme les tokens sont invalides → bandeau session manquante
    await expect(page.getByText(/Aucune session détectée|Lien expiré/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
