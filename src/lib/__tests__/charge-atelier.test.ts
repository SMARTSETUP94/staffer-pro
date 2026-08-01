import { describe, expect, it } from "vitest";
import {
  buildChargeMatrix, chargeKey, chargeNiveau, computeChargeKpis, filterChargeRows,
  groupCellByAffaire, segmentsParMois, totalColonne, totalLigne,
  type ChargeDetailRow, type ChargeMetier,
} from "../charge-atelier";

const row = (o: Partial<ChargeDetailRow> = {}): ChargeDetailRow => ({
  plan_id: Math.random().toString(36).slice(2),
  date: "2026-06-01",
  metier_id: 1,
  nb_pers: 2,
  affaire_id: "a1",
  affaire_numero: "6001",
  affaire_nom: "Chantier A",
  prospect: false,
  objet_id: "o1",
  objet_label: "Comptoir",
  lot_id: null,
  lot_label: null,
  sous_traitance: false,
  nommes: [],
  ...o,
});

const metiers: ChargeMetier[] = [
  { id: 1, libelle: "Menuiserie", couleur: null, ordre: 1, capacite_jour: 20 },
  { id: 2, libelle: "Numérique", couleur: null, ordre: 2, capacite_jour: 1 },
  { id: 3, libelle: "Machiniste", couleur: null, ordre: 3, capacite_jour: null },
];

describe("chargeNiveau — seuils relatifs à la capacité", () => {
  it("cellule vide", () => {
    expect(chargeNiveau(0, 20)).toBe("vide");
  });
  it("sous la capacité → vert", () => {
    expect(chargeNiveau(12, 20)).toBe("sous");
  });
  it("à la capacité → ambre", () => {
    expect(chargeNiveau(20, 20)).toBe("plein");
  });
  it("au-dessus de la capacité → rouge", () => {
    expect(chargeNiveau(21, 20)).toBe("surcharge");
    expect(chargeNiveau(2, 1)).toBe("surcharge");
  });
  it("métier sans capacité → neutre", () => {
    expect(chargeNiveau(5, null)).toBe("neutre");
    expect(chargeNiveau(5, 0)).toBe("neutre");
  });
});

describe("filterChargeRows", () => {
  const rows = [
    row({ metier_id: 1, affaire_id: "a1" }),
    row({ metier_id: 2, affaire_id: "a2", prospect: true }),
    row({ metier_id: 1, affaire_id: "a3", sous_traitance: true }),
  ];
  const base = {
    metierIds: [], affaireIds: [], inclureProspects: true, exclureSousTraitance: false,
  };

  it("exclut la sous-traitance", () => {
    expect(filterChargeRows(rows, { ...base, exclureSousTraitance: true })).toHaveLength(2);
  });
  it("exclut les prospects", () => {
    expect(filterChargeRows(rows, { ...base, inclureProspects: false })).toHaveLength(2);
  });
  it("filtre par métier et par chantier", () => {
    expect(filterChargeRows(rows, { ...base, metierIds: [1] })).toHaveLength(2);
    expect(filterChargeRows(rows, { ...base, affaireIds: ["a2"] })).toHaveLength(1);
  });
});

describe("buildChargeMatrix — agrégation", () => {
  it("somme les effectifs et les nommés par métier/jour", () => {
    const m = buildChargeMatrix([
      row({ nb_pers: 2, nommes: [{ id: "e1", nom: "A" }] }),
      row({ nb_pers: 3 }),
      row({ metier_id: 2, nb_pers: 1 }),
      row({ date: "2026-06-02", nb_pers: 4 }),
    ]);
    expect(m.get(chargeKey(1, "2026-06-01"))?.nbPers).toBe(5);
    expect(m.get(chargeKey(1, "2026-06-01"))?.nbNommes).toBe(1);
    expect(m.get(chargeKey(2, "2026-06-01"))?.nbPers).toBe(1);
    expect(m.get(chargeKey(1, "2026-06-02"))?.nbPers).toBe(4);
  });

  it("totaux ligne et colonne", () => {
    const dates = ["2026-06-01", "2026-06-02"];
    const m = buildChargeMatrix([
      row({ nb_pers: 2 }),
      row({ date: "2026-06-02", nb_pers: 3 }),
      row({ metier_id: 2, nb_pers: 1 }),
    ]);
    expect(totalLigne(m, 1, dates)).toBe(5);
    expect(totalColonne(m, [1, 2], "2026-06-01")).toBe(3);
  });
});

describe("computeChargeKpis", () => {
  it("compte les jours en surcharge et repère le métier le plus tendu", () => {
    const dates = ["2026-06-01", "2026-06-02"];
    const m = buildChargeMatrix([
      row({ metier_id: 2, nb_pers: 3, nommes: [{ id: "e1", nom: "A" }] }), // cap 1 → +2
      row({ metier_id: 1, nb_pers: 5 }), // cap 20 → ok
      row({ metier_id: 2, date: "2026-06-02", nb_pers: 2 }), // +1
      row({ metier_id: 3, date: "2026-06-02", nb_pers: 9 }), // sans capacité
    ]);
    const k = computeChargeKpis(m, metiers, dates);
    expect(k.joursSurcharge).toBe(2);
    expect(k.metierTendu).toEqual({ id: 2, libelle: "Numérique", depassement: 3 });
    expect(k.persJoursPlanifiees).toBe(19);
    expect(k.persJoursNommees).toBe(1);
  });

  it("aucune surcharge quand tout tient dans la capacité", () => {
    const k = computeChargeKpis(buildChargeMatrix([row({ nb_pers: 4 })]), metiers, ["2026-06-01"]);
    expect(k.joursSurcharge).toBe(0);
    expect(k.metierTendu).toBeNull();
  });
});

describe("groupCellByAffaire", () => {
  it("regroupe par chantier avec les cibles et les nommés", () => {
    const m = buildChargeMatrix([
      row({ affaire_id: "a1", nb_pers: 2, nommes: [{ id: "e1", nom: "A" }] }),
      row({ affaire_id: "a1", nb_pers: 1, objet_label: null, lot_id: "l1", lot_label: "Bar" }),
      row({ affaire_id: "a2", affaire_numero: "6002", nb_pers: 5 }),
    ]);
    const g = groupCellByAffaire(m.get(chargeKey(1, "2026-06-01")));
    expect(g[0]!.affaire_id).toBe("a2");
    expect(g[1]!.nbPers).toBe(3);
    expect(g[1]!.cibles).toEqual(["Comptoir", "Lot Bar"]);
    expect(g[1]!.nommes).toHaveLength(1);
  });

  it("renvoie [] pour une cellule absente", () => {
    expect(groupCellByAffaire(undefined)).toEqual([]);
  });
});

describe("segmentsParMois", () => {
  it("découpe la fenêtre en segments de mois", () => {
    expect(segmentsParMois(["2026-06-29", "2026-06-30", "2026-07-01"])).toEqual([
      { label: "juin 2026", span: 2 },
      { label: "juil. 2026", span: 1 },
    ]);
  });
});
