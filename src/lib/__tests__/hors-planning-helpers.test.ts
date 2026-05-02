import { describe, it, expect } from "vitest";
import {
  validateHorsPlanningInput,
  buildHorsPlanningInsert,
  canEmployeDeleteSaisie,
  HORS_PLANNING_ERROR_LABELS,
} from "@/lib/hors-planning-helpers";

describe("v0.32.3 — hors-planning-helpers", () => {
  describe("validateHorsPlanningInput", () => {
    // v0.32.4 — date dans le passé pour ne pas déclencher DATE_FUTURE
    const valid = {
      affaire_id: "aff-1",
      metier_id: 3,
      date: "2026-04-15",
      heures_reelles: 7,
      commentaire: null,
    };

    it("accepte un input valide", () => {
      expect(validateHorsPlanningInput(valid)).toEqual({ ok: true, errors: [] });
    });

    it("rejette si affaire manquante", () => {
      const r = validateHorsPlanningInput({ ...valid, affaire_id: "" });
      expect(r.ok).toBe(false);
      expect(r.errors).toContain("AFFAIRE_REQUISE");
    });

    it("rejette si métier non fourni ou non numérique", () => {
      const r1 = validateHorsPlanningInput({ ...valid, metier_id: undefined });
      expect(r1.errors).toContain("METIER_REQUIS");
      const r2 = validateHorsPlanningInput({ ...valid, metier_id: NaN as unknown as number });
      expect(r2.errors).toContain("METIER_REQUIS");
    });

    it("rejette si date manquante ou mal formée", () => {
      expect(validateHorsPlanningInput({ ...valid, date: "" }).errors).toContain("DATE_REQUISE");
      expect(validateHorsPlanningInput({ ...valid, date: "04/05/2026" }).errors).toContain(
        "DATE_INVALIDE",
      );
      expect(validateHorsPlanningInput({ ...valid, date: "2026-13-45" }).errors).toContain(
        "DATE_INVALIDE",
      );
    });

    it("rejette si heures hors bornes (≤0 ou >24)", () => {
      expect(validateHorsPlanningInput({ ...valid, heures_reelles: 0 }).errors).toContain(
        "HEURES_HORS_BORNES",
      );
      expect(validateHorsPlanningInput({ ...valid, heures_reelles: -1 }).errors).toContain(
        "HEURES_HORS_BORNES",
      );
      expect(validateHorsPlanningInput({ ...valid, heures_reelles: 25 }).errors).toContain(
        "HEURES_HORS_BORNES",
      );
    });

    it("rejette si heures non numériques", () => {
      const r = validateHorsPlanningInput({
        ...valid,
        heures_reelles: "abc" as unknown as number,
      });
      expect(r.errors).toContain("HEURES_INVALIDE");
    });

    it("cumule les erreurs (ne s'arrête pas à la première)", () => {
      const r = validateHorsPlanningInput({});
      expect(r.errors.length).toBeGreaterThanOrEqual(4);
      expect(r.errors).toContain("AFFAIRE_REQUISE");
      expect(r.errors).toContain("METIER_REQUIS");
      expect(r.errors).toContain("DATE_REQUISE");
      expect(r.errors).toContain("HEURES_INVALIDE");
    });
  });

  describe("buildHorsPlanningInsert", () => {
    const input = {
      affaire_id: "aff-1",
      metier_id: 3,
      date: "2026-05-04",
      heures_reelles: 7,
      commentaire: null,
    };

    it("construit le payload attendu (statut brouillon, assignation_id null)", () => {
      const out = buildHorsPlanningInsert("emp-1", input);
      expect(out).toEqual({
        employe_id: "emp-1",
        assignation_id: null,
        affaire_id: "aff-1",
        metier_id: 3,
        date: "2026-05-04",
        heures_reelles: 7,
        commentaire: null,
        statut: "brouillon",
      });
    });

    it("trim le commentaire et le met à null si vide", () => {
      const a = buildHorsPlanningInsert("emp-1", { ...input, commentaire: "   " });
      expect(a.commentaire).toBeNull();
      const b = buildHorsPlanningInsert("emp-1", { ...input, commentaire: "  hello  " });
      expect(b.commentaire).toBe("hello");
    });

    it("throw si employeId manquant", () => {
      expect(() => buildHorsPlanningInsert("", input)).toThrow(/employeId/);
    });

    it("throw si input invalide", () => {
      expect(() => buildHorsPlanningInsert("emp-1", { ...input, heures_reelles: 0 })).toThrow(
        /HEURES_HORS_BORNES/,
      );
    });
  });

  describe("canEmployeDeleteSaisie", () => {
    it("autorise la suppression d'une saisie hors planning brouillon", () => {
      expect(canEmployeDeleteSaisie({ assignation_id: null, statut: "brouillon" })).toBe(true);
    });

    it("refuse si la saisie est rattachée à une assignation", () => {
      expect(canEmployeDeleteSaisie({ assignation_id: "a-1", statut: "brouillon" })).toBe(false);
    });

    it("refuse si la saisie n'est plus en brouillon", () => {
      for (const s of ["soumis", "valide", "rejete"]) {
        expect(canEmployeDeleteSaisie({ assignation_id: null, statut: s })).toBe(false);
      }
    });
  });

  describe("HORS_PLANNING_ERROR_LABELS", () => {
    it("fournit un libellé FR pour chaque code d'erreur", () => {
      const codes = [
        "AFFAIRE_REQUISE",
        "METIER_REQUIS",
        "DATE_REQUISE",
        "DATE_INVALIDE",
        "HEURES_INVALIDE",
        "HEURES_HORS_BORNES",
      ] as const;
      for (const c of codes) {
        expect(HORS_PLANNING_ERROR_LABELS[c]).toBeTruthy();
        expect(HORS_PLANNING_ERROR_LABELS[c].length).toBeGreaterThan(5);
      }
    });
  });
});
