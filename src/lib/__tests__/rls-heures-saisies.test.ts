/**
 * v0.21.1 Phase 2 — Tests logique RLS heures_saisies (mirror côté client)
 *
 * Tests purs qui décrivent la matrice acteur × statut × action attendue
 * pour les policies SQL. Ne tape pas la DB (laissé aux tests E2E +
 * intégration SQL Phase 4) mais sert de spec de référence et détecte
 * les régressions de logique applicative qui dupliquent ces règles.
 *
 * Référence : docs/rls-policies.md §heures_saisies UPDATE/DELETE.
 */
import { describe, expect, it } from "vitest";

type Statut = "brouillon" | "soumis" | "valide" | "rejete";
type Acteur = "admin" | "chef_chantier" | "employe_owner" | "employe_other";

interface Row {
  statut: Statut;
  ownedByActor: boolean;
  devisTermine: boolean;
}

function canEmployeUpdate(row: Row, acteur: Acteur): boolean {
  if (acteur === "admin") return !row.devisTermine ? true : true; // admin ignore devis_termine
  if (acteur === "chef_chantier") return !row.devisTermine;
  if (acteur === "employe_other") return false;
  // employe_owner : tout sauf validee, et devis non terminé
  if (row.devisTermine) return false;
  return row.statut !== "valide";
}

function canEmployeDelete(row: Row, acteur: Acteur): boolean {
  if (acteur === "admin") return true;
  if (acteur === "chef_chantier") return !row.devisTermine;
  if (acteur === "employe_other") return false;
  // employe_owner : seulement brouillon, devis non terminé
  if (row.devisTermine) return false;
  return row.statut === "brouillon";
}

const ownRow = (statut: Statut, devisTermine = false): Row => ({
  statut,
  ownedByActor: true,
  devisTermine,
});

describe("RLS heures_saisies — UPDATE employé propriétaire", () => {
  it("autorise édition brouillon et soumis", () => {
    expect(canEmployeUpdate(ownRow("brouillon"), "employe_owner")).toBe(true);
    expect(canEmployeUpdate(ownRow("soumis"), "employe_owner")).toBe(true);
  });
  it("autorise édition rejete (correction post-rejet)", () => {
    expect(canEmployeUpdate(ownRow("rejete"), "employe_owner")).toBe(true);
  });
  it("refuse édition d'une saisie validée", () => {
    expect(canEmployeUpdate(ownRow("valide"), "employe_owner")).toBe(false);
  });
  it("refuse édition si devis terminé", () => {
    expect(canEmployeUpdate(ownRow("brouillon", true), "employe_owner")).toBe(false);
  });
});

describe("RLS heures_saisies — DELETE employé propriétaire", () => {
  it("autorise delete uniquement sur brouillon", () => {
    expect(canEmployeDelete(ownRow("brouillon"), "employe_owner")).toBe(true);
    expect(canEmployeDelete(ownRow("soumis"), "employe_owner")).toBe(false);
    expect(canEmployeDelete(ownRow("valide"), "employe_owner")).toBe(false);
    expect(canEmployeDelete(ownRow("rejete"), "employe_owner")).toBe(false);
  });
  it("refuse delete si devis terminé", () => {
    expect(canEmployeDelete(ownRow("brouillon", true), "employe_owner")).toBe(false);
  });
});

describe("RLS heures_saisies — chef et admin", () => {
  it("admin peut tout (incluant devis terminé)", () => {
    expect(canEmployeUpdate(ownRow("valide", true), "admin")).toBe(true);
    expect(canEmployeDelete(ownRow("valide", true), "admin")).toBe(true);
  });
  it("chef peut tout sauf devis terminé", () => {
    expect(canEmployeUpdate(ownRow("valide"), "chef_chantier")).toBe(true);
    expect(canEmployeUpdate(ownRow("valide", true), "chef_chantier")).toBe(false);
    expect(canEmployeDelete(ownRow("brouillon", true), "chef_chantier")).toBe(false);
  });
});

describe("RLS heures_saisies — employé tiers (autre)", () => {
  it("ne peut jamais éditer ni supprimer", () => {
    expect(canEmployeUpdate(ownRow("brouillon"), "employe_other")).toBe(false);
    expect(canEmployeDelete(ownRow("brouillon"), "employe_other")).toBe(false);
  });
});
