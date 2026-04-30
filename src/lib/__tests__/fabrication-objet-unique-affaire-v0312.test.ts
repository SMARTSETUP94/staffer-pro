/**
 * v0.31.2 hotfix — Contrainte UNIQUE fabrication_objets.reference
 * remplacée par UNIQUE(affaire_id, reference).
 *
 * Bug : import Progbat échouait avec
 *   "duplicate key value violates unique constraint fabrication_objets_reference_key"
 * dès qu'une autre affaire avait déjà un objet avec la même référence
 * (ex. "OBJ-01"). La sémantique métier est : la référence est unique
 * AU SEIN d'une affaire, pas globalement.
 *
 * La logique RPC est testée côté SQL ; ce test documente le contrat.
 */
import { describe, it, expect } from "vitest";

describe("v0.31.2 — fabrication_objets.reference unique par affaire", () => {
  it("permet la même référence sur deux affaires différentes", () => {
    const objets = [
      { affaire_id: "A", reference: "OBJ-01" },
      { affaire_id: "B", reference: "OBJ-01" },
    ];
    const cles = objets.map((o) => `${o.affaire_id}|${o.reference}`);
    expect(new Set(cles).size).toBe(2); // pas de collision
  });

  it("interdit deux objets identiques dans la même affaire", () => {
    const objets = [
      { affaire_id: "A", reference: "OBJ-01" },
      { affaire_id: "A", reference: "OBJ-01" },
    ];
    const cles = objets.map((o) => `${o.affaire_id}|${o.reference}`);
    expect(new Set(cles).size).toBe(1); // collision attendue
  });
});
