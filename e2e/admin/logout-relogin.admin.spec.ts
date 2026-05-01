/**
 * v0.34 — E2E admin : logout depuis une session active, puis re-login via /login.
 *
 * Vérifie :
 * 1. Le bouton "Se déconnecter" de la sidebar termine la session (redirige vers /login).
 * 2. Après logout, l'accès direct à /dashboard renvoie sur /login (session bien purgée).
 * 3. La page /login re-affiche les 3 onglets (Mot de passe / Lien magique / Créer).
 * 4. Re-login via mot de passe → reprise de session vers /dashboard.
 *
 * Project : admin-desktop (storageState admin chargé). On ne touche pas au fichier
 * storageState pour ne pas casser les autres specs : à la fin, on logout à nouveau
 * uniquement dans le contexte de la page (pas persisté).
 */
import { expect, test } from "@playwright/test";
import { TEST_ACCOUNTS } from "../fixtures/test-accounts";

test.describe("Logout puis re-login (admin)", () => {
  test("déconnecte depuis la sidebar, retourne sur /login avec les 3 onglets, puis relogin OK", async ({
    page,
    context,
  }) => {
    const admin = TEST_ACCOUNTS.admin;

    // 1. Session active → /dashboard
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    // 2. Logout depuis la sidebar
    await page.getByRole("button", { name: /Se déconnecter/i }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // 3. Vérifier que la session est bien purgée : accéder à /dashboard renvoie /login
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // 4. Les 3 onglets sont rendus
    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Mot de passe/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Lien magique/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Créer/i })).toBeVisible();

    // L'onglet Mot de passe est actif par défaut
    await expect(page.getByRole("button", { name: /Se connecter/ })).toBeVisible();

    // 5. Re-login via Mot de passe
    await page.getByLabel(/^Email$/i).first().fill(admin.email);
    await page.getByLabel(/^Mot de passe$/i).fill(admin.password);
    await page.getByRole("button", { name: /Se connecter/ }).click();

    // 6. Reprise de session : admin → /dashboard
    await page.waitForURL(
      (url) => /\/(dashboard|ma-semaine|mobile\/aujourdhui)/.test(url.pathname),
      { timeout: 15_000 },
    );
    expect(page.url()).toMatch(/\/dashboard/);

    // 7. On déconnecte à nouveau dans ce context (non persisté) pour laisser
    //    la page propre. Le storageState admin partagé n'est PAS modifié.
    await page.getByRole("button", { name: /Se déconnecter/i }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // Sanity : bien revenu sur la page de login avec ses 3 onglets
    await expect(page.getByRole("tab", { name: /Mot de passe/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Lien magique/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Créer/i })).toBeVisible();

    // Évite que Playwright sauvegarde par accident un storageState altéré
    await context.clearCookies();
  });

  test("après logout, le clic sur l'onglet Lien magique masque le champ mot de passe", async ({
    page,
  }) => {
    // Démarre depuis une session active puis se déconnecte
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Se déconnecter/i }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    await page.getByRole("tab", { name: /Lien magique/i }).click();
    await expect(page.getByRole("button", { name: /Envoyer le lien magique/ })).toBeVisible();
    await expect(page.getByLabel(/^Mot de passe$/i)).toBeHidden();
  });
});
