/**
 * v0.34 — E2E smoke : page /login (3 onglets).
 *
 * Sans storageState (utilisateur non connecté).
 * On teste uniquement le rendu et la validation HTML — pas de submit réel
 * (sinon on pollue la base auth).
 */
import { expect, test } from "@playwright/test";

test.describe("/login — 3 onglets", () => {
  test("affiche les 3 onglets et le formulaire mot de passe par défaut", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Mot de passe/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Lien magique/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Créer/i })).toBeVisible();

    // Onglet "Mot de passe" actif par défaut
    await expect(page.getByLabel(/^Email$/i).first()).toBeVisible();
    await expect(page.getByLabel(/^Mot de passe$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Se connecter/ })).toBeVisible();

    // Lien "Oublié ?" pointe vers /auth/forgot-password
    const oublie = page.getByRole("link", { name: /Oublié/i });
    await expect(oublie).toHaveAttribute("href", /\/auth\/forgot-password/);
  });

  test("onglet Lien magique : affiche un seul champ email", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: /Lien magique/i }).click();

    await expect(page.getByRole("button", { name: /Envoyer le lien magique/ })).toBeVisible();
    // Le champ password ne doit pas être visible dans cet onglet
    await expect(page.getByLabel(/^Mot de passe$/i)).toBeHidden();
  });

  test("onglet Créer : affiche nom, email, mot de passe", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: /Créer/i }).click();

    await expect(page.getByLabel(/Nom complet/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Créer le compte/ })).toBeVisible();

    // minLength=8 enforced par le navigateur
    const pwd = page.locator("#password-up");
    await expect(pwd).toHaveAttribute("minLength", "8");
  });

  test("validation HTML5 : submit vide refusé sur Mot de passe", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Se connecter/ }).click();
    // L'URL ne change pas — la validation native bloque
    await expect(page).toHaveURL(/\/login/);
  });
});
