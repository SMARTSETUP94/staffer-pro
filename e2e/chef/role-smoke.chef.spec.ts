/**
 * v0.34.x — Battery role-smoke CHEF DE CHANTIER.
 *
 * Vérifie :
 *  - toutes les routes opérationnelles autorisées chargent sans erreur,
 *  - les routes de paramétrage (admin only) sont bloquées (anti-fuite).
 */
import { test, expect } from "@playwright/test";
import {
  visitAllowedRoutes,
  assertForbiddenRoutes,
} from "../helpers/role-smoke";

const CHEF_ALLOWED_ROUTES = [
  "/dashboard",
  "/planning",
  "/charge-atelier",
  "/affaires",
  "/opportunites",
  "/devis",
  "/devis/historique",
  "/devis/import",
  "/fabrication",
  "/validation-heures",
  "/saisie-pour-equipe",
  "/audit-heures",
  "/heures-analyse",
  "/employes",
  "/interimaires",
  "/absences",
  "/flotte",
  "/signalements",
  "/rh/contrats",
  "/mes-contrats",
  "/export",
  "/ma-semaine",
  "/mes-heures",
  "/mon-equipe-type",
  "/roadmap",
] as const;

const CHEF_FORBIDDEN_ROUTES = [
  "/parametres/utilisateurs",
  "/parametres/roles-fabrication",
  "/admin/audit",
  "/admin/feedback",
  "/admin/employes-poste-principal",
  "/admin/email-preview",
  "/audit-auth",
  "/incident-auth",
] as const;

test.describe("v0.34.x — Battery role-smoke CHEF", () => {
  test("toutes les routes chef autorisées chargent sans erreur", async ({
    page,
  }) => {
    const errors = await visitAllowedRoutes(page, CHEF_ALLOWED_ROUTES);
    expect(
      errors,
      `Erreurs console détectées sur le parcours chef :\n${errors.join("\n")}`,
    ).toEqual([]);
  });

  test("les routes admin-only sont bloquées (anti-fuite RGPD)", async ({
    page,
  }) => {
    await assertForbiddenRoutes(page, CHEF_FORBIDDEN_ROUTES);
  });
});
