/**
 * v0.32.1 — Contrôle cohérence totaux import devis :
 *  - validateRowSumMatch : qte × PU vs total ligne
 *  - validateMetierTotalsConsistency : heures source vs heures consolidées par métier
 */
import { describe, it, expect } from "vitest";
import {
  validateRowSumMatch,
  validateMetierTotalsConsistency,
} from "@/lib/import-validation";

describe("validateRowSumMatch", () => {
  it("ne signale rien quand qte × pu = total (tolérance ok)", () => {
    const rows = [
      { rowIndex: 2, q: 10, pu: 5, t: 50 },
      { rowIndex: 3, q: 3, pu: 12.5, t: 37.5 },
    ];
    const issues = validateRowSumMatch(
      rows,
      (r) => ({ rowIndex: r.rowIndex, quantite: r.q, pu: r.pu, total: r.t }),
    );
    expect(issues).toHaveLength(0);
  });

  it("signale chaque ligne incohérente avec écart > tolérance", () => {
    const rows = [
      { rowIndex: 5, q: 10, pu: 5, t: 60, label: "Châssis bois" },
      { rowIndex: 6, q: 2, pu: 100, t: 200 }, // ok
      { rowIndex: 7, q: 4, pu: 25, t: 90 }, // 100 attendu
    ];
    const issues = validateRowSumMatch(
      rows,
      (r) => ({ rowIndex: r.rowIndex, quantite: r.q, pu: r.pu, total: r.t, label: r.label }),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]!.rowIndex).toBe(5);
    expect(issues[0]!.message).toContain("Châssis bois");
    expect(issues[0]!.message).toContain("écart 10");
    expect(issues[0]!.severity).toBe("warning");
    expect(issues[1]!.rowIndex).toBe(7);
  });

  it("ignore les lignes incomplètes (champ null)", () => {
    const rows = [
      { rowIndex: 2, q: null, pu: 5, t: 50 },
      { rowIndex: 3, q: 10, pu: null, t: 50 },
      { rowIndex: 4, q: 10, pu: 5, t: null },
    ];
    const issues = validateRowSumMatch(
      rows,
      (r) => ({ rowIndex: r.rowIndex, quantite: r.q, pu: r.pu, total: r.t }),
    );
    expect(issues).toHaveLength(0);
  });

  it("respecte tolérance personnalisée (centimes d'arrondi)", () => {
    const rows = [{ rowIndex: 2, q: 3, pu: 33.33, t: 99.99 }]; // 99.99 vs 99.99
    const issues = validateRowSumMatch(
      rows,
      (r) => ({ rowIndex: r.rowIndex, quantite: r.q, pu: r.pu, total: r.t }),
      { tolerance: 0.01 },
    );
    expect(issues).toHaveLength(0);
  });
});

describe("validateMetierTotalsConsistency", () => {
  type L = { rowIndex: number; metier: string | null; heures: number; excluded: boolean };
  type P = { metier: string | null; heures: number };

  it("aucun écart : pas d'issue", () => {
    const lines: L[] = [
      { rowIndex: 2, metier: "construction", heures: 10, excluded: false },
      { rowIndex: 3, metier: "construction", heures: 5, excluded: false },
      { rowIndex: 4, metier: "peinture", heures: 8, excluded: false },
    ];
    const postes: P[] = [
      { metier: "construction", heures: 15 },
      { metier: "peinture", heures: 8 },
    ];
    const issues = validateMetierTotalsConsistency(
      lines,
      postes,
      (l) => l,
      (p) => p,
    );
    expect(issues).toHaveLength(0);
  });

  it("détecte heures réduites manuellement (poste édité en UI)", () => {
    const lines: L[] = [
      { rowIndex: 2, metier: "construction", heures: 10, excluded: false },
      { rowIndex: 5, metier: "construction", heures: 6, excluded: false },
    ];
    const postes: P[] = [{ metier: "construction", heures: 12 }]; // -4h
    const issues = validateMetierTotalsConsistency(lines, postes, (l) => l, (p) => p);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("construction");
    expect(issues[0]!.message).toContain("16.0 h");
    expect(issues[0]!.message).toContain("12.0 h");
    expect(issues[0]!.message).toContain("-4.0 h");
    expect(issues[0]!.message).toContain("Lignes source : 2, 5");
  });

  it("détecte métier inventé en UI (pas de ligne source)", () => {
    const lines: L[] = [
      { rowIndex: 2, metier: "construction", heures: 10, excluded: false },
    ];
    const postes: P[] = [
      { metier: "construction", heures: 10 },
      { metier: "metallerie", heures: 4 }, // inventé
    ];
    const issues = validateMetierTotalsConsistency(lines, postes, (l) => l, (p) => p);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("metallerie");
    expect(issues[0]!.message).toContain("ajoutées manuellement");
  });

  it("ignore les lignes excluded", () => {
    const lines: L[] = [
      { rowIndex: 2, metier: "construction", heures: 10, excluded: false },
      { rowIndex: 3, metier: "construction", heures: 999, excluded: true }, // total/sous-total
    ];
    const postes: P[] = [{ metier: "construction", heures: 10 }];
    const issues = validateMetierTotalsConsistency(lines, postes, (l) => l, (p) => p);
    expect(issues).toHaveLength(0);
  });

  it("regroupe les lignes sans métier sous '(sans métier)'", () => {
    const lines: L[] = [
      { rowIndex: 4, metier: null, heures: 7, excluded: false },
    ];
    const postes: P[] = [{ metier: null, heures: 0 }];
    const issues = validateMetierTotalsConsistency(lines, postes, (l) => l, (p) => p);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("(sans métier)");
    expect(issues[0]!.message).toContain("7.0 h");
  });

  it("tronque la liste de lignes affichées au-delà de 8", () => {
    const lines: L[] = Array.from({ length: 12 }, (_, i) => ({
      rowIndex: i + 2,
      metier: "peinture",
      heures: 1,
      excluded: false,
    }));
    const postes: P[] = [{ metier: "peinture", heures: 5 }]; // -7h
    const issues = validateMetierTotalsConsistency(lines, postes, (l) => l, (p) => p);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("+4");
  });

  it("respecte tolérance (arrondi 0.05 h ne déclenche pas)", () => {
    const lines: L[] = [
      { rowIndex: 2, metier: "construction", heures: 10.05, excluded: false },
    ];
    const postes: P[] = [{ metier: "construction", heures: 10 }];
    const issues = validateMetierTotalsConsistency(
      lines,
      postes,
      (l) => l,
      (p) => p,
      { tolerance: 0.1 },
    );
    expect(issues).toHaveLength(0);
  });
});
