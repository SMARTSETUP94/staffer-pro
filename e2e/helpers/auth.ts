/**
 * v0.34 — Helper de login E2E.
 *
 * Utilisé par `e2e/global-setup.ts` pour générer un storageState par rôle,
 * puis injecté via `playwright.config.ts > projects[].use.storageState`.
 */
import type { Page } from "@playwright/test";
import type { TestAccount } from "../fixtures/test-accounts";

export async function loginAs(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel(/mot de passe/i).fill(account.password);
  await page.getByRole("button", { name: /se connecter|connexion/i }).click();

  // Attente d'une route post-login : admin/chef → /dashboard, employé → /ma-semaine
  await page.waitForURL(
    (url) => /\/(dashboard|ma-semaine|mobile\/aujourdhui)/.test(url.pathname),
    { timeout: 15_000 },
  );
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /déconnexion|logout/i }).click();
  await page.waitForURL("**/login", { timeout: 5_000 });
}
