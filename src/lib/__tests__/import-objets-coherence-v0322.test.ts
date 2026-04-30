/**
 * v0.32.2 — Cohérence heures par objet × métier (objets fabrication).
 */
import { describe, it, expect } from "vitest";
import { validateObjetsHeuresConsistency } from "@/lib/import-validation";

type Parsed = { numero: string; nom: string; heures: Record<string, number> };
type Edited = { numero: string; nom: string; selected: boolean; heures: Record<string, number> };

const pickP = (o: Parsed) => ({ key: o.numero, label: o.nom, heuresParMetier: o.heures });
const pickE = (o: Edited) => ({
  key: o.numero,
  label: o.nom,
  selected: o.selected,
  heuresParMetier: o.heures,
});

describe("validateObjetsHeuresConsistency", () => {
  it("aucun écart : aucun warning", () => {
    const parsed: Parsed[] = [{ numero: "1.1", nom: "Châssis", heures: { bois: 10, peinture: 4 } }];
    const edited: Edited[] = [
      { numero: "1.1", nom: "Châssis", selected: true, heures: { bois: 10, peinture: 4 } },
    ];
    expect(validateObjetsHeuresConsistency(parsed, edited, pickP, pickE)).toHaveLength(0);
  });

  it("détecte un métier modifié manuellement", () => {
    const parsed: Parsed[] = [{ numero: "1.1", nom: "Châssis", heures: { bois: 10, peinture: 4 } }];
    const edited: Edited[] = [
      { numero: "1.1", nom: "Châssis", selected: true, heures: { bois: 15, peinture: 4 } },
    ];
    const issues = validateObjetsHeuresConsistency(parsed, edited, pickP, pickE);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("Châssis");
    expect(issues[0]!.message).toContain("bois 10.0→15.0 (+5.0)");
    expect(issues[0]!.message).toContain("écart 5.0 h");
  });

  it("signale un objet ajouté manuellement (absent du fichier)", () => {
    const parsed: Parsed[] = [];
    const edited: Edited[] = [
      { numero: "9.9", nom: "Bonus", selected: true, heures: { bois: 3 } },
    ];
    const issues = validateObjetsHeuresConsistency(parsed, edited, pickP, pickE);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("ajouté manuellement");
  });

  it("signale un objet désélectionné qui contenait des heures", () => {
    const parsed: Parsed[] = [{ numero: "2.1", nom: "Bar", heures: { bois: 8 } }];
    const edited: Edited[] = [
      { numero: "2.1", nom: "Bar", selected: false, heures: { bois: 8 } },
    ];
    const issues = validateObjetsHeuresConsistency(parsed, edited, pickP, pickE);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("désélectionné");
    expect(issues[0]!.message).toContain("ses heures ne seront pas importées");
  });

  it("ne signale rien pour un objet désélectionné sans heures source", () => {
    const parsed: Parsed[] = [{ numero: "3.1", nom: "Vide", heures: {} }];
    const edited: Edited[] = [
      { numero: "3.1", nom: "Vide", selected: false, heures: {} },
    ];
    expect(validateObjetsHeuresConsistency(parsed, edited, pickP, pickE)).toHaveLength(0);
  });

  it("regroupe plusieurs métiers modifiés en un seul message", () => {
    const parsed: Parsed[] = [
      { numero: "1", nom: "Multi", heures: { bois: 10, metal: 5, peinture: 2 } },
    ];
    const edited: Edited[] = [
      { numero: "1", nom: "Multi", selected: true, heures: { bois: 12, metal: 0, peinture: 2 } },
    ];
    const issues = validateObjetsHeuresConsistency(parsed, edited, pickP, pickE);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("bois 10.0→12.0");
    expect(issues[0]!.message).toContain("metal 5.0→0.0");
    expect(issues[0]!.message).not.toContain("peinture");
  });

  it("respecte la tolérance d'arrondi", () => {
    const parsed: Parsed[] = [{ numero: "1", nom: "x", heures: { bois: 10 } }];
    const edited: Edited[] = [
      { numero: "1", nom: "x", selected: true, heures: { bois: 10.05 } },
    ];
    expect(
      validateObjetsHeuresConsistency(parsed, edited, pickP, pickE, { tolerance: 0.1 }),
    ).toHaveLength(0);
  });
});
