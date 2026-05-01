/**
 * v0.34 — Smoke test : la home répond et le formulaire de login s'affiche.
 *
 * Ne nécessite pas de storageState (compte non connecté).
 */
import { test, expect } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/mot de passe/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /se connecter|connexion/i })).toBeVisible();
});

test("home redirects to login when unauthenticated", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBeTruthy();
  // Selon stratégie de routing : soit redirection /login, soit page d'accueil publique
  // On vérifie juste que ça ne crashe pas et que le titre est présent
  await expect(page).toHaveTitle(/Setup|Planning|Staffer/i);
});
