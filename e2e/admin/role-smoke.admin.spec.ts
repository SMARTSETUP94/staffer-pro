/**
 * v0.34.x — Battery role-smoke ADMIN.
 *
 * Parcourt en lecture seule l'ensemble des routes accessibles à un admin
 * et vérifie : pas de redirect login, pas d'error-boundary, 0 console.error.
 *
 * Cible : pré-merge guard contre régressions de routing/RLS/dashboard.
 */
import { test, expect } from "@playwright/test";
import { visitAllowedRoutes } from "../helpers/role-smoke";

const ADMIN_ALLOWED_ROUTES = [
  // Dashboard & vues centrales
  "/dashboard",
  "/planning",
  "/charge-atelier",
  // Affaires
  "/affaires",
  "/opportunites",
  // Devis
  "/devis",
  "/devis/historique",
  "/devis/import",
  "/devis/progbat-import",
  "/devis/rattachement-historique",
  // Fabrication
  "/fabrication",
  // Heures
  "/audit-heures",
  "/heures-analyse",
  "/validation-heures",
  "/saisie-pour-equipe",
  // RH & Conformité
  "/employes",
  "/interimaires",
  "/rh/contrats",
  "/mes-contrats",
  "/absences",
  "/flotte",
  "/signalements",
  // Exports
  "/export",
  "/export/demandes-devis",
  // Paramétrage (admin only)
  "/parametres/utilisateurs",
  "/parametres/metiers",
  "/parametres/postes",
  "/parametres/lieux",
  "/parametres/competences-equipe",
  "/parametres/roles-fabrication",
  "/parametres/sous-traitants",
  "/parametres/autorisations-vehicules",
  // Admin tools
  "/admin/audit",
  "/admin/feedback",
  "/admin/contenu-widgets",
  "/admin/employes-poste-principal",
  "/admin/email-preview",
  "/audit-auth",
  "/incident-auth",
  "/imports",
  "/employes/import",
  "/opportunites/import",
  // Vues perso (un admin peut aussi y accéder)
  "/ma-semaine",
  "/mes-heures",
  "/mes-propositions",
  "/mes-swaps",
  "/mon-equipe-type",
  "/roadmap",
] as const;

test.describe("v0.34.x — Battery role-smoke ADMIN", () => {
  test("toutes les routes admin se chargent sans erreur console ni error-boundary", async ({
    page,
  }) => {
    const errors = await visitAllowedRoutes(page, ADMIN_ALLOWED_ROUTES);
    expect(
      errors,
      `Erreurs console détectées sur le parcours admin :\n${errors.join("\n")}`,
    ).toEqual([]);
  });
});
