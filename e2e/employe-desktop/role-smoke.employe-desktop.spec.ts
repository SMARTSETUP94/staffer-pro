/**
 * v0.34.x — Battery role-smoke EMPLOYÉ DESKTOP.
 *
 * Surface très réduite : ses heures + son planning perso uniquement.
 * Garde-fou strict anti-fuite : aucune route métier (planning global,
 * affaires, devis, employés...) ne doit s'afficher.
 */
import { test, expect } from "@playwright/test";
import {
  visitAllowedRoutes,
  assertForbiddenRoutes,
} from "../helpers/role-smoke";

const EMPLOYE_ALLOWED_ROUTES = [
  "/ma-semaine",
  "/mes-heures",
  "/mes-contrats",
  "/mes-propositions",
  "/mes-swaps",
  "/dashboard-employe",
  "/fabrication/mes-etapes",
] as const;

const EMPLOYE_FORBIDDEN_ROUTES = [
  "/dashboard",
  "/planning",
  "/charge-atelier",
  "/affaires",
  "/opportunites",
  "/devis",
  "/devis/historique",
  "/employes",
  "/interimaires",
  "/validation-heures",
  "/saisie-pour-equipe",
  "/parametres/utilisateurs",
  "/parametres/metiers",
  "/admin/audit",
  "/audit-heures",
  "/heures-analyse",
  "/audit-auth",
  "/mon-equipe-type",
  "/flotte",
] as const;

test.describe("v0.34.x — Battery role-smoke EMPLOYÉ DESKTOP", () => {
  test("les routes perso autorisées chargent sans erreur", async ({ page }) => {
    const errors = await visitAllowedRoutes(page, EMPLOYE_ALLOWED_ROUTES);
    expect(
      errors,
      `Erreurs console détectées sur le parcours employé desktop :\n${errors.join("\n")}`,
    ).toEqual([]);
  });

  test("les routes métier/admin sont bloquées (anti-fuite RGPD critique)", async ({
    page,
  }) => {
    await assertForbiddenRoutes(page, EMPLOYE_FORBIDDEN_ROUTES);
  });
});
