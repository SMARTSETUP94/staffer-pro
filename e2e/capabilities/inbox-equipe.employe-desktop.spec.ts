/**
 * Lot 7.0c — Capabilities partagées — EMPLOYÉ.
 *
 * - /inbox : autorisé (employé a inbox.view).
 * - /affaires/$id/equipe : INTERDIT (pas de cap affaire.equipe.view) →
 *   doit rediriger (anti-fuite RGPD). On teste avec un UUID factice :
 *   `requireCapability` court-circuite la route AVANT le loader, donc
 *   le redirect doit se produire indépendamment de l'existence de l'id.
 */
import { test, expect } from "@playwright/test";
import { visitAllowedRoutes, assertForbiddenRoutes } from "../helpers/role-smoke";

const FAKE_AFFAIRE_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Lot 7.0c — Capabilities partagées (EMPLOYÉ)", () => {
  test("employé accède à /inbox", async ({ page }) => {
    const errors = await visitAllowedRoutes(page, ["/inbox"] as const);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("employé est bloqué sur /affaires/$id/equipe (cap manquante)", async ({ page }) => {
    await assertForbiddenRoutes(page, [`/affaires/${FAKE_AFFAIRE_ID}/equipe`] as const);
  });

  test("employé ne voit pas d'entrée 'Équipe' dans la sidebar", async ({ page }) => {
    await page.goto("/ma-semaine");
    // L'employé ne doit pas avoir de lien sidebar pointant vers /affaires/*/equipe.
    await expect(
      page.locator('a[href*="/equipe"]'),
    ).toHaveCount(0);
  });
});
