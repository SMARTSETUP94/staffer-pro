import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0102_qualite_actions_admin_sans_contrat_ni_classement.sql", "utf8");
describe("actions admin qualité approuvées", () => {
  it("vérifie admin et refuse OAuth avant les écritures", () => {
    expect(sql).toContain("NOT has_role(auth.uid(),'admin')");
    expect(sql).toContain("auth.jwt()->>'client_id' IS NOT NULL");
  });
  it("ne propose aucune écriture contrat ou rémunération", () => {
    expect(sql).not.toMatch(/UPDATE\s+contrats_intermittents/i);
    expect(sql).not.toMatch(/SET\s+(statut_contrat|taux_horaire_brut|salaire|forfait)\s*=/i);
    expect(sql).toContain("Fusion refusée : contrats liés");
  });
  it("fusionne sans supprimer et rapporte les références restées", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).toContain("actif=false,fusionne_dans=_garder");
    expect(sql).toContain("references_restantes");
  });
  it("n’installe aucune action de classement des devis", () => {
    expect(sql).not.toContain("qualite_classer_devis");
  });
});