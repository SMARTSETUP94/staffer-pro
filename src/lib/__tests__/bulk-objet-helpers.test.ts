/**
 * v0.29.0 — Tests des helpers AssignationBulkObjetDialog.
 *
 * Couvre :
 *  - métiers disponibles selon heures_prevues_X
 *  - filtrage employés par métier (principal + flag rôle)
 *  - auto-suggestion métier si 1 seul
 *  - calcul total heures
 *  - heures déjà staffées sur objet via liens
 *  - status budget (ok/warn/danger/no-budget)
 *  - heures par jour selon créneau
 */
import { describe, expect, it } from "vitest";
import {
  autoSuggestMetier,
  budgetStatus,
  computeTotalHeures,
  employesForMetier,
  heuresDejaStaffeesForObjet,
  heuresForSlot,
  heuresPrevuesForMetier,
  metiersDisponiblesForObjet,
  type EmployeForBulk,
} from "@/lib/bulk-objet-helpers";

const METIERS = [
  { id: 1, code: "construction", libelle: "Menuiserie", couleur: "#000" },
  { id: 2, code: "metallerie", libelle: "Métallerie", couleur: "#000" },
  { id: 3, code: "peinture", libelle: "Peinture", couleur: "#000" },
  { id: 4, code: "numerique", libelle: "Numérique", couleur: "#000" },
  { id: 5, code: "tapisserie", libelle: "Tapisserie", couleur: "#000" },
  { id: 7, code: "logistique", libelle: "Logistique", couleur: "#000" },
  { id: 8, code: "suivi_projet", libelle: "BE", couleur: "#000" },
];

function emp(over: Partial<EmployeForBulk>): EmployeForBulk {
  return {
    id: over.id ?? "e1",
    prenom: over.prenom ?? "P",
    nom: over.nom ?? "N",
    actif: over.actif ?? true,
    metier_principal_id: over.metier_principal_id ?? 1,
    est_bureau_etude: over.est_bureau_etude ?? false,
    est_usinage_numerique: over.est_usinage_numerique ?? false,
    est_finition: over.est_finition ?? false,
    est_manutention: over.est_manutention ?? false,
    est_respo_fab: over.est_respo_fab ?? false,
  };
}

describe("metiersDisponiblesForObjet", () => {
  it("retourne uniquement les métiers où heures_prevues > 0", () => {
    const objet = {
      heures_prevues_bois: 10,
      heures_prevues_peinture: 0,
      heures_prevues_metal: 5,
    };
    const dispo = metiersDisponiblesForObjet(objet, METIERS);
    expect(dispo.map((m) => m.code).sort()).toEqual(["construction", "metallerie"]);
  });

  it("retourne vide si aucune heure", () => {
    const objet = {};
    expect(metiersDisponiblesForObjet(objet, METIERS)).toEqual([]);
  });

  it("préserve les propriétés étendues (libelle/couleur)", () => {
    const objet = { heures_prevues_bois: 1 };
    const dispo = metiersDisponiblesForObjet(objet, METIERS);
    expect(dispo[0].libelle).toBe("Menuiserie");
    expect(dispo[0].couleur).toBe("#000");
  });
});

describe("autoSuggestMetier", () => {
  it("renvoie l'unique métier dispo", () => {
    const objet = { heures_prevues_bois: 10 };
    const d = metiersDisponiblesForObjet(objet, METIERS);
    expect(autoSuggestMetier(d)).toBe(1);
  });
  it("renvoie null si plusieurs métiers", () => {
    const objet = { heures_prevues_bois: 10, heures_prevues_metal: 5 };
    const d = metiersDisponiblesForObjet(objet, METIERS);
    expect(autoSuggestMetier(d)).toBeNull();
  });
  it("renvoie null si aucun", () => {
    expect(autoSuggestMetier([])).toBeNull();
  });
});

describe("employesForMetier", () => {
  it("filtre par metier_principal_id", () => {
    const employes = [
      emp({ id: "1", metier_principal_id: 1 }),
      emp({ id: "2", metier_principal_id: 2 }),
      emp({ id: "3", metier_principal_id: 1 }),
    ];
    const res = employesForMetier(employes, 1, METIERS);
    expect(res.map((e) => e.id).sort()).toEqual(["1", "3"]);
  });

  it("inclut les employés flagués est_bureau_etude pour BE", () => {
    const employes = [
      emp({ id: "1", metier_principal_id: 2 }),
      emp({ id: "2", metier_principal_id: 2, est_bureau_etude: true }),
      emp({ id: "3", metier_principal_id: 8 }),
    ];
    const res = employesForMetier(employes, 8, METIERS);
    expect(res.map((e) => e.id).sort()).toEqual(["2", "3"]);
  });

  it("inclut les employés flagués est_usinage_numerique pour numérique", () => {
    const employes = [
      emp({ id: "1", metier_principal_id: 1, est_usinage_numerique: true }),
      emp({ id: "2", metier_principal_id: 4 }),
    ];
    const res = employesForMetier(employes, 4, METIERS);
    expect(res.map((e) => e.id).sort()).toEqual(["1", "2"]);
  });

  it("inclut les flagués est_manutention pour logistique", () => {
    const employes = [
      emp({ id: "1", metier_principal_id: 1, est_manutention: true }),
      emp({ id: "2", metier_principal_id: 7 }),
    ];
    expect(employesForMetier(employes, 7, METIERS).map((e) => e.id).sort()).toEqual(
      ["1", "2"],
    );
  });

  it("trie actifs en haut puis alpha", () => {
    const employes = [
      emp({ id: "1", prenom: "Zoé", nom: "Z", actif: true, metier_principal_id: 1 }),
      emp({ id: "2", prenom: "Anne", nom: "A", actif: false, metier_principal_id: 1 }),
      emp({ id: "3", prenom: "Bob", nom: "B", actif: true, metier_principal_id: 1 }),
    ];
    const res = employesForMetier(employes, 1, METIERS);
    expect(res.map((e) => e.id)).toEqual(["3", "1", "2"]);
  });
});

describe("heuresForSlot", () => {
  it("JOURNEE → 8 par défaut", () => {
    expect(heuresForSlot("JOURNEE")).toBe(8);
  });
  it("AM/PM → 4 par défaut", () => {
    expect(heuresForSlot("AM")).toBe(4);
    expect(heuresForSlot("PM")).toBe(4);
  });
  it("respecte une valeur custom", () => {
    expect(heuresForSlot("JOURNEE", 10)).toBe(10);
    expect(heuresForSlot("AM", 3)).toBe(3);
  });
});

describe("computeTotalHeures", () => {
  it("3 emp × 5 jours × 8h = 120", () => {
    expect(computeTotalHeures(3, 5, 8)).toBe(120);
  });
  it("0 emp → 0", () => {
    expect(computeTotalHeures(0, 5, 8)).toBe(0);
  });
  it("0 jours → 0", () => {
    expect(computeTotalHeures(3, 0, 8)).toBe(0);
  });
  it("0 heures → 0", () => {
    expect(computeTotalHeures(3, 5, 0)).toBe(0);
  });
  it("arrondi 2 décimales", () => {
    // 2 × 3 × 4.333 = 25.998 → arrondi à 26
    expect(computeTotalHeures(2, 3, 4.333)).toBe(26);
  });
});

describe("heuresPrevuesForMetier", () => {
  it("multiplie par la quantité", () => {
    const objet = { heures_prevues_bois: 10, quantite: 3 };
    expect(heuresPrevuesForMetier(objet, 1, METIERS)).toBe(30);
  });
  it("0 si métier sans colonne", () => {
    const objet = { heures_prevues_bois: 10 };
    // metier id 6 inexistant
    expect(heuresPrevuesForMetier(objet, 6, METIERS)).toBe(0);
  });
});

describe("heuresDejaStaffeesForObjet", () => {
  it("somme les assignations liées à l'objet pour le métier", () => {
    const result = heuresDejaStaffeesForObjet({
      objetId: "obj1",
      metierId: 1,
      links: [
        { assignation_id: "a1", objet_id: "obj1" },
        { assignation_id: "a2", objet_id: "obj1" },
        { assignation_id: "a3", objet_id: "obj2" },
      ],
      assignations: [
        { id: "a1", metier_id: 1, heures: 8 },
        { id: "a2", metier_id: 1, heures: 4 },
        { id: "a3", metier_id: 1, heures: 100 },
      ],
    });
    expect(result).toBe(12);
  });

  it("ignore les assignations d'un autre métier", () => {
    const result = heuresDejaStaffeesForObjet({
      objetId: "obj1",
      metierId: 1,
      links: [{ assignation_id: "a1", objet_id: "obj1" }],
      assignations: [{ id: "a1", metier_id: 2, heures: 8 }],
    });
    expect(result).toBe(0);
  });
});

describe("budgetStatus", () => {
  it("ok si total <= prévues", () => {
    expect(
      budgetStatus({ totalHeuresAjout: 10, heuresDejaStaffees: 50, heuresPrevues: 100 }),
    ).toBe("ok");
  });
  it("warn si dépassement <= 20%", () => {
    // 50 + 60 = 110 vs 100 → +10%
    expect(
      budgetStatus({ totalHeuresAjout: 60, heuresDejaStaffees: 50, heuresPrevues: 100 }),
    ).toBe("warn");
  });
  it("danger si dépassement > 20%", () => {
    // 50 + 100 = 150 vs 100 → +50%
    expect(
      budgetStatus({ totalHeuresAjout: 100, heuresDejaStaffees: 50, heuresPrevues: 100 }),
    ).toBe("danger");
  });
  it("no-budget si prévues = 0", () => {
    expect(
      budgetStatus({ totalHeuresAjout: 10, heuresDejaStaffees: 0, heuresPrevues: 0 }),
    ).toBe("no-budget");
  });
  it("limite exacte 20% = warn", () => {
    // 0 + 120 vs 100 → +20% → warn
    expect(
      budgetStatus({ totalHeuresAjout: 120, heuresDejaStaffees: 0, heuresPrevues: 100 }),
    ).toBe("warn");
  });
});

describe("Edge cases — combinés", () => {
  it("aucun employé sélectionné → total = 0", () => {
    expect(computeTotalHeures(0, 3, 8)).toBe(0);
  });

  it("aucun jour sélectionné → total = 0", () => {
    expect(computeTotalHeures(2, 0, 8)).toBe(0);
  });

  it("objet sans heures par métier → metiersDisponibles vide → autoSuggest null", () => {
    const objet = {};
    const dispo = metiersDisponiblesForObjet(objet, METIERS);
    expect(dispo).toEqual([]);
    expect(autoSuggestMetier(dispo)).toBeNull();
  });

  it("scénario complet : 2 emp × 3 jours × 8h sur objet 540h → ok", () => {
    const objet = { heures_prevues_peinture: 540, quantite: 1 };
    const total = computeTotalHeures(2, 3, 8); // 48h
    const prev = heuresPrevuesForMetier(objet, 3, METIERS); // 540
    const status = budgetStatus({
      totalHeuresAjout: total,
      heuresDejaStaffees: 0,
      heuresPrevues: prev,
    });
    expect(total).toBe(48);
    expect(prev).toBe(540);
    expect(status).toBe("ok");
  });
});
