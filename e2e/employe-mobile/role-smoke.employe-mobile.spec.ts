/**
 * v0.34.x — Battery role-smoke EMPLOYÉ MOBILE.
 *
 * Surface mobile dédiée (préfixe /mobile/...). Routes desktop bloquées.
 */
import { test, expect } from "@playwright/test";
import {
  visitAllowedRoutes,
  assertForbiddenRoutes,
} from "../helpers/role-smoke";

const MOBILE_ALLOWED_ROUTES = [
  "/mobile/aujourdhui",
  "/mobile/heures",
  "/mobile/absences",
  "/mobile/contrats",
  "/mobile/propositions",
  "/mobile/swaps",
  "/mobile/profil",
] as const;

const MOBILE_FORBIDDEN_ROUTES = [
  "/dashboard",
  "/planning",
  "/affaires",
  "/devis",
  "/employes",
  "/validation-heures",
  "/parametres/utilisateurs",
  "/admin/audit",
  "/mobile/chef",
  "/mobile/chef/dashboard",
  "/mobile/chef/equipe",
  "/mobile/chef/a-valider",
] as const;

test.describe("v0.34.x — Battery role-smoke EMPLOYÉ MOBILE", () => {
  test("les routes mobile perso chargent sans erreur", async ({ page }) => {
    const errors = await visitAllowedRoutes(page, MOBILE_ALLOWED_ROUTES);
    expect(
      errors,
      `Erreurs console détectées sur le parcours mobile :\n${errors.join("\n")}`,
    ).toEqual([]);
  });

  test("les routes desktop/chef/admin sont bloquées sur mobile (anti-fuite)", async ({
    page,
  }) => {
    await assertForbiddenRoutes(page, MOBILE_FORBIDDEN_ROUTES);
  });
});
