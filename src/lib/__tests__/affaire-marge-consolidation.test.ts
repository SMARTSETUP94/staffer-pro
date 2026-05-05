import { describe, it, expect } from "vitest";
import { consolidateByMetier, type RawConsoLine } from "../affaire-marge-consolidation";

const mk = (devis: string, metier_id: number, prev: number, staff = 0, val = 0, soum = 0): RawConsoLine => ({
  devis_id: `d-${devis}`,
  devis_numero: devis,
  metier_id,
  metier: `M${metier_id}`,
  couleur: "#000",
  heures_prevues: prev,
  heures_assignees: staff,
  heures_reelles_validees: val,
  heures_reelles_soumises: soum,
});

describe("v0.40.0e — consolidateByMetier", () => {
  it("groupe 2 devis sur le même métier en 1 ligne avec somme", () => {
    const out = consolidateByMetier([
      mk("D-2113", 3, 36.7),
      mk("D-2141", 3, 371.7),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].metier_id).toBe(3);
    expect(out[0].prevues).toBeCloseTo(408.4, 1);
    expect(out[0].devis).toHaveLength(2);
    expect(out[0].devis.map((d) => d.devis_numero).sort()).toEqual(["D-2113", "D-2141"]);
  });

  it("garde des lignes séparées par métier", () => {
    const out = consolidateByMetier([
      mk("D-2113", 3, 36.7),
      mk("D-2113", 7, 6.4),
    ]);
    expect(out).toHaveLength(2);
    const m3 = out.find((g) => g.metier_id === 3)!;
    const m7 = out.find((g) => g.metier_id === 7)!;
    expect(m3.devis).toHaveLength(1);
    expect(m7.devis).toHaveLength(1);
  });

  it("tri par heures prévues décroissantes", () => {
    const out = consolidateByMetier([
      mk("D", 1, 10),
      mk("D", 2, 100),
      mk("D", 3, 50),
    ]);
    expect(out.map((g) => g.metier_id)).toEqual([2, 3, 1]);
  });

  it("calcule statut tone sur la consolidation, pas par devis", () => {
    // Devis 1 OK (50/100=50%), Devis 2 dépasse (90/100=90%) → consolidé 140/200=70% = ok
    const out = consolidateByMetier([
      mk("D1", 5, 100, 50),
      mk("D2", 5, 100, 90),
    ]);
    expect(out[0].pctStaff).toBeCloseTo(70, 0);
    expect(out[0].tone).toBe("ok");
  });

  it("marge consolidée = prévues - validées (somme)", () => {
    const out = consolidateByMetier([
      mk("D1", 5, 100, 0, 30),
      mk("D2", 5, 200, 0, 100),
    ]);
    expect(out[0].validees).toBe(130);
    expect(out[0].ecart).toBe(170);
  });

  it("supporte heures soumises (réalisé en attente)", () => {
    const out = consolidateByMetier([
      mk("D1", 5, 100, 0, 20, 30),
    ]);
    expect(out[0].soumises).toBe(30);
    expect(out[0].realisees).toBe(50);
  });

  it("retourne [] si aucune ligne", () => {
    expect(consolidateByMetier([])).toEqual([]);
  });
});
