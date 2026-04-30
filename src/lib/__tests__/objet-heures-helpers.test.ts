/**
 * v0.27.7 — Tests pour les 3 fixes UX/logique groupés.
 *  Fix #1 : filtrage heures par métier (Planning par objet)
 *  Fix #2 : prorata heures multi-objets (Option B)
 *  Fix #3 : filtre typologies (non_operationnel + stockage) sur AffaireCombobox
 */
import { describe, it, expect } from "vitest";
import {
  metierIdToHeuresKey,
  getHeuresPrevuesUnitForMetiers,
  getHeuresPrevuesTotalForMetiers,
  repartirHeuresProRata,
  buildProRataInputsForMetier,
  type MetierLite,
} from "@/lib/objet-heures-helpers";
import { getAffaireTypologie } from "@/lib/affaire-typologie";

const METIERS: MetierLite[] = [
  { id: 1, code: "construction" },
  { id: 2, code: "metallerie" },
  { id: 3, code: "peinture" },
  { id: 4, code: "numerique" },
  { id: 5, code: "tapisserie" },
  { id: 6, code: "machiniste" },
  { id: 7, code: "logistique" },
  { id: 8, code: "suivi_projet" },
];

describe("v0.27.7 — Fix #1 : filtre métier sur Planning par objet", () => {
  const fausseBriques = {
    heures_prevues_be: 10,
    heures_prevues_numerique: 20,
    heures_prevues_bois: 100,
    heures_prevues_metal: 200,
    heures_prevues_peinture: 18,
    heures_prevues_tapisserie: 0,
    heures_prevues_manutention: 5,
    quantite: 3,
  };
  // total unit = 353, × qte 3 = 1059

  it("sans filtre → somme totale × quantité", () => {
    expect(getHeuresPrevuesTotalForMetiers(fausseBriques, null, METIERS)).toBe(1059);
    expect(getHeuresPrevuesTotalForMetiers(fausseBriques, new Set(), METIERS)).toBe(1059);
  });

  it("filtre Peinture → 18 × 3 = 54h", () => {
    const set = new Set([3]);
    expect(getHeuresPrevuesTotalForMetiers(fausseBriques, set, METIERS)).toBe(54);
  });

  it("filtre multi-métier (Bois + Métal) → (100+200) × 3 = 900h", () => {
    const set = new Set([1, 2]);
    expect(getHeuresPrevuesTotalForMetiers(fausseBriques, set, METIERS)).toBe(900);
  });

  it("métier sans colonne (machiniste) → 0h", () => {
    expect(getHeuresPrevuesTotalForMetiers(fausseBriques, new Set([6]), METIERS)).toBe(0);
  });

  it("mapping métier_id → clé heures_prevues", () => {
    expect(metierIdToHeuresKey(8, METIERS)).toBe("be");
    expect(metierIdToHeuresKey(1, METIERS)).toBe("bois");
    expect(metierIdToHeuresKey(2, METIERS)).toBe("metal");
    expect(metierIdToHeuresKey(3, METIERS)).toBe("peinture");
    expect(metierIdToHeuresKey(7, METIERS)).toBe("manutention");
    expect(metierIdToHeuresKey(6, METIERS)).toBe(null);
    expect(metierIdToHeuresKey(999, METIERS)).toBe(null);
  });

  it("getHeuresPrevuesUnitForMetiers (sans qte)", () => {
    expect(getHeuresPrevuesUnitForMetiers(fausseBriques, new Set([3]), METIERS)).toBe(18);
  });
});

describe("v0.27.7 — Fix #2 : répartition prorata multi-objets (Option B)", () => {
  it("3 objets aux heures différentes → prorata correct + total = saisi", () => {
    // Cas Gabin : 8h sur peinture, objets 540h / 16h / 9h
    const r = repartirHeuresProRata(8, [
      { objetId: "1.1", heuresPrevuesUnit: 540, quantite: 1 },
      { objetId: "1.2", heuresPrevuesUnit: 16, quantite: 1 },
      { objetId: "1.3", heuresPrevuesUnit: 9, quantite: 1 },
    ]);
    expect(r[0].heuresAttribuees).toBeCloseTo(7.65, 2);
    expect(r[1].heuresAttribuees).toBeCloseTo(0.23, 2);
    // Le 3ème absorbe l'arrondi pour totaliser 8.00
    const total = r.reduce((s, x) => s + x.heuresAttribuees, 0);
    expect(total).toBeCloseTo(8, 2);
    expect(r.every((x) => !x.fallback)).toBe(true);
  });

  it("edge case heures = 0 sur tous → fallback équitable 1/N", () => {
    const r = repartirHeuresProRata(8, [
      { objetId: "a", heuresPrevuesUnit: 0, quantite: 1 },
      { objetId: "b", heuresPrevuesUnit: 0, quantite: 1 },
      { objetId: "c", heuresPrevuesUnit: 0, quantite: 1 },
      { objetId: "d", heuresPrevuesUnit: 0, quantite: 1 },
    ]);
    expect(r.every((x) => x.fallback)).toBe(true);
    // 8 / 4 = 2 chacun
    for (const x of r) expect(x.heuresAttribuees).toBe(2);
    expect(r.reduce((s, x) => s + x.heuresAttribuees, 0)).toBe(8);
  });

  it("1 seul objet → reçoit tout", () => {
    const r = repartirHeuresProRata(8, [
      { objetId: "solo", heuresPrevuesUnit: 100, quantite: 2 },
    ]);
    expect(r[0].heuresAttribuees).toBe(8);
  });

  it("liste vide → []", () => {
    expect(repartirHeuresProRata(8, [])).toEqual([]);
  });

  it("quantité prise en compte dans le prorata", () => {
    // Objet A : 10h × 3 = 30h, Objet B : 10h × 1 = 10h. Total = 40h.
    // 4h saisies → A = 4×30/40 = 3h, B = 4×10/40 = 1h
    const r = repartirHeuresProRata(4, [
      { objetId: "A", heuresPrevuesUnit: 10, quantite: 3 },
      { objetId: "B", heuresPrevuesUnit: 10, quantite: 1 },
    ]);
    expect(r[0].heuresAttribuees).toBeCloseTo(3, 2);
    expect(r[1].heuresAttribuees).toBeCloseTo(1, 2);
  });

  it("buildProRataInputsForMetier pour métier peinture", () => {
    const objets = [
      {
        id: "o1",
        heures_prevues_peinture: 18,
        heures_prevues_bois: 100,
        quantite: 2,
      },
      {
        id: "o2",
        heures_prevues_peinture: 5,
        heures_prevues_bois: 50,
        quantite: 1,
      },
    ];
    const inputs = buildProRataInputsForMetier(objets, 3, METIERS);
    expect(inputs[0].heuresPrevuesUnit).toBe(18);
    expect(inputs[0].quantite).toBe(2);
    expect(inputs[1].heuresPrevuesUnit).toBe(5);
    expect(inputs[1].quantite).toBe(1);
  });

  it("conservation : somme arrondie = total saisi (18 objets aléatoires)", () => {
    const objets = Array.from({ length: 18 }, (_, i) => ({
      objetId: `o${i}`,
      heuresPrevuesUnit: Math.floor(Math.random() * 100) + 1,
      quantite: Math.floor(Math.random() * 3) + 1,
    }));
    const r = repartirHeuresProRata(7.77, objets);
    const total = r.reduce((s, x) => s + x.heuresAttribuees, 0);
    expect(Math.round(total * 100) / 100).toBe(7.77);
  });
});

describe("v0.27.7 — Fix #3 : filtre typologies sur AffaireCombobox", () => {
  // Logique pure : on simule le filter du combobox
  function shouldDisplay(
    numero: string,
    opts: { includeNonOp: boolean; includeStockage: boolean },
  ): boolean {
    const typo = getAffaireTypologie(numero);
    if (typo === "non_operationnel" && !opts.includeNonOp) return false;
    if (typo === "stockage" && !opts.includeStockage) return false;
    return true;
  }

  it("par défaut : montage_demontage (4XXX) affiché", () => {
    expect(shouldDisplay("4123", { includeNonOp: false, includeStockage: false })).toBe(true);
  });

  it("par défaut : fabrication (5XXX) affiché", () => {
    expect(shouldDisplay("5042", { includeNonOp: false, includeStockage: false })).toBe(true);
  });

  it("par défaut : non_operationnel (1XXX) MASQUÉ", () => {
    expect(shouldDisplay("1001", { includeNonOp: false, includeStockage: false })).toBe(false);
  });

  it("par défaut : non_operationnel (3XXX) MASQUÉ", () => {
    expect(shouldDisplay("3050", { includeNonOp: false, includeStockage: false })).toBe(false);
  });

  it("par défaut : stockage (2XXXX) MASQUÉ", () => {
    expect(shouldDisplay("20015", { includeNonOp: false, includeStockage: false })).toBe(false);
  });

  it("toggle non_operationnel ON → 1XXX et 3XXX inclus", () => {
    expect(shouldDisplay("1001", { includeNonOp: true, includeStockage: false })).toBe(true);
    expect(shouldDisplay("3050", { includeNonOp: true, includeStockage: false })).toBe(true);
  });

  it("toggle stockage ON → 2XXXX inclus", () => {
    expect(shouldDisplay("20015", { includeNonOp: false, includeStockage: true })).toBe(true);
  });

  it("toggles indépendants : stockage ON ne dégèle pas non_op", () => {
    expect(shouldDisplay("1001", { includeNonOp: false, includeStockage: true })).toBe(false);
    expect(shouldDisplay("20015", { includeNonOp: false, includeStockage: true })).toBe(true);
  });
});
