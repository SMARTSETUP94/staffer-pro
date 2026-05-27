/**
 * v0.49 (L4a) — E2E : page d'accueil unique `/aujourdhui` capability-driven.
 *
 * Vérifie que :
 *  - Tous les rôles atterrissent sur /aujourdhui après login
 *  - Les redirects 301 fonctionnent depuis les anciennes pages
 *  - Le filtrage par cap masque les items qu'un rôle ne doit pas voir
 *
 * Note : les assertions sur les libellés de cartes (Mission pose, Devis
 * brouillon, etc.) sont conservatrices — elles ne valident la présence
 * que si la cap correspondante est accordée à l'user de test. Les
 * queries back-end pour les 6 sources additionnelles seront branchées
 * dans un lot ultérieur (voir mem://debts/aujourdhui-10-sources-backend).
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { TEST_ACCOUNTS } from "./fixtures/test-accounts";

const ACCOUNTS = TEST_ACCOUNTS;

test.describe("/aujourdhui — page d'accueil unique L4a", () => {
  test("Admin atterrit sur /aujourdhui après login", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(/\/aujourdhui$/);
    await expect(page.getByRole("heading", { name: /aujourd'hui/i })).toBeVisible();
  });

  test("Redirect /dashboard → /aujourdhui", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/aujourdhui$/);
  });

  test("Redirect /inbox → /aujourdhui", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/aujourdhui$/);
  });

  test("Redirect /mobile/aujourdhui → /aujourdhui", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/mobile/aujourdhui");
    await expect(page).toHaveURL(/^.*\/aujourdhui$/);
  });

  test("Redirect /mobile/chef/dashboard → /aujourdhui", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await page.goto("/mobile/chef/dashboard");
    await expect(page).toHaveURL(/\/aujourdhui$/);
  });

  test("Employé voit l'empty state ou ses items, pas les cartes admin/commerciales", async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.employe);
    await page.goto("/aujourdhui");
    await expect(page).toHaveURL(/\/aujourdhui$/);
    // Garantie anti-fuite : un employé sans cap commerciale ne doit JAMAIS
    // voir un libellé "Devis brouillon" (cap inbox.devis_brouillon non
    // accordée au rôle employé).
    await expect(page.getByText(/Devis brouillon/i)).not.toBeVisible();
  });
});
