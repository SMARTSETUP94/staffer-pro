/**
 * v0.34 — E2E smoke : /auth/forgot-password.
 *
 * On vérifie le rendu et la transition vers l'écran "Email envoyé" — sans
 * réellement déclencher l'envoi (on intercepte la requête server-fn).
 */
import { expect, test } from "@playwright/test";

test.describe("/auth/forgot-password", () => {
  test("affiche le formulaire et le lien retour", async ({ page }) => {
    await page.goto("/auth/forgot-password");
    await expect(page.getByRole("heading", { name: /mot de passe oublié/i })).toBeVisible();
    await expect(page.getByLabel(/^Email$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Envoyer le lien/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Retour à la connexion/ })).toHaveAttribute(
      "href",
      /\/login/,
    );
  });

  test("affiche l'écran de confirmation après submit (server-fn mockée)", async ({ page }) => {
    // Mock toute requête POST vers une server-fn pour répondre ok
    await page.route("**/_serverFn/**", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { ok: true } }),
        });
      }
      return route.continue();
    });

    await page.goto("/auth/forgot-password");
    await page.getByLabel(/^Email$/i).fill("test@setup.paris");
    await page.getByRole("button", { name: /Envoyer le lien/ }).click();

    await expect(page.getByRole("heading", { name: /email envoyé/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/test@setup\.paris/)).toBeVisible();
  });
});
