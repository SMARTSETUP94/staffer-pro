import { describe, expect, it } from "vitest";
import { visibleSidebarSections } from "../sidebar-navigation";

// Granted navigation capabilities read from the live matrix on 14 November.
const roles: Record<string, string[]> = {
  admin: ["section.admin", "section.affaires", "section.equipes", "planning.pilotage", "section.pipeline_opportunites", "opportunites.planning.view", "devis.view", "demandes_clients.view", "clients.view", "logistique.planning.view", "dispos.view", "api.mcp", "devis.parametres"],
  commercial: ["section.affaires", "planning.pilotage", "section.pipeline_opportunites", "opportunites.planning.view", "devis.view", "demandes_clients.view", "clients.view", "logistique.planning.view"],
  bureau_etude: ["section.affaires", "planning.pilotage", "opportunites.planning.view", "devis.view", "logistique.planning.view"],
  chef_chantier: ["section.affaires", "section.equipes", "planning.pilotage", "section.pipeline_opportunites", "opportunites.planning.view", "devis.view", "demandes_clients.view", "clients.view", "logistique.planning.view", "dispos.view"],
  logistique: ["section.affaires", "logistique.planning.view", "dispos.view"],
  poseur: ["logistique.planning.view"],
  atelier_chef: ["section.affaires", "section.equipes", "devis.view", "logistique.planning.view"],
  atelier_metier: ["logistique.planning.view"],
  ecran_atelier: ["logistique.planning.view"],
  employe: ["logistique.planning.view"],
};
// Existing cap-gated links surviving the globally enabled suivi-affaires mode.
const before: Record<string, string[]> = {
  "section.affaires": ["/affaires", "/documents-affaires", "/liste-chantiers", "/planning-atelier"],
  "planning.pilotage": ["/planning-be"],
  "section.pipeline_opportunites": ["/opportunites"],
  "opportunites.planning.view": ["/planning-opportunites"],
  "devis.view": ["/devis-staffing"],
  "demandes_clients.view": ["/demandes-clients"],
  "clients.view": ["/clients"],
  "logistique.planning.view": ["/logistique", "/demandes-logistique", "/nouvelle-demande-logistique", "/jalonnements"],
  "dispos.view": ["/logistique/dispos"],
  "section.equipes": ["/employes"],
  "section.admin": ["/validation-notes-de-frais", "/admin/qualite-donnees", "/admin/utilisateurs", "/parametres/referents-roles", "/parametres/formulaire-logistique"],
  "api.mcp": ["/admin/connecteur-claude"],
  "devis.parametres": ["/parametres/devis-taux"],
};
const quoteRoles = new Set(["admin", "commercial", "bureau_etude", "chef_chantier"]);

describe("Menu unique — aucune extension des entrées visibles", () => {
  for (const [role, capabilities] of Object.entries(roles)) {
    it(`${role} conserve son périmètre (Lieux est la seule exception admin)`, () => {
      const previous = new Set(["/", ...capabilities.flatMap(cap => before[cap] ?? [])]);
      if (!quoteRoles.has(role)) previous.delete("/devis-staffing");
      const current = visibleSidebarSections(new Set(capabilities), quoteRoles.has(role)).flatMap(s => s.items.map(i => i.url));
      expect(current.filter(url => !previous.has(url))).toEqual(role === "admin" ? ["/parametres/lieux"] : []);
      expect(current).not.toContain("/liste-chantiers");
      expect(current).not.toContain("/jalonnements");
      expect(current).toContain("/demandes-logistique");
    });
  }
  it("le drapeau Devis reste obligatoire même avec la capacité", () => {
    expect(visibleSidebarSections(new Set(["devis.view"]), false).flatMap(s => s.items.map(i => i.url))).toEqual(["/"]);
  });
  it("sans capacité seules les entrées universelles sont conservées", () => {
    expect(visibleSidebarSections(new Set(), true).flatMap(s => s.items.map(i => i.url))).toEqual(["/"]);
  });
});