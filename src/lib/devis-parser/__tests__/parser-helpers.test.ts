/**
 * v0.23 — Tests unitaires des helpers parser devis Progbat.
 */
import { describe, expect, it } from "vitest";
import {
  isChantierKeyword,
  isDemontageKeyword,
  isExcludeKeyword,
  isLineDisabled,
  isMatiere,
  isMontageKeyword,
  matchMetier,
  normalize,
} from "../match";
import { detectDevisType } from "../detect-type";
import {
  computeFlagsFromMetiers,
  detectTypeFinition,
  emptyHeures,
} from "../compute-flags";
import { METIER_TO_ETAPE } from "../mappings";

describe("normalize", () => {
  it("supprime accents et compacte les espaces", () => {
    expect(normalize("  Métallerie   Bureau d'Étude ")).toBe("metallerie bureau d'etude");
  });
  it("gère null/undefined/vide", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
    expect(normalize("")).toBe("");
  });
});

describe("matchMetier — 30+ libellés réels", () => {
  const cases: Array<[string, string | null]> = [
    // BE
    ["Bureau d'étude", "be"],
    ["Tarif du bureau d'étude", "be"],
    ["Plans techniques", "be"],
    ["Suivi de projet", "be"],
    ["Visite technique", "be"],
    // Numérique
    ["Numérique", "numerique"],
    ["Découpe CNC", "numerique"],
    ["Découpe laser", "numerique"],
    ["Impression 3D", "numerique"],
    ["Fraisage numérique 5 axes", "numerique"],
    // Bois / Construction
    ["Construction", "bois"],
    ["Atelier bois", "bois"],
    ["Constructeurs", "bois"],
    ["Menuiserie sur mesure", "bois"],
    // Métal / Serrurerie
    ["Métallerie", "metal"],
    ["Serrurerie", "metal"],
    ["Soudure TIG", "metal"],
    ["Ferronnerie d'art", "metal"],
    // Peinture
    ["Peinture", "peinture"],
    // m² peinture est désormais MATERIEL (v0.31.4 spec Gabin) → null
    ["m² peinture finition mate", null],
    ["Vernis", "peinture"],
    ["Laque polyuréthane", "peinture"],
    // Tapisserie / Tissu
    ["Tapisserie", "tapisserie"],
    ["Tissu coton", "tapisserie"],
    ["Rembourrage assise", "tapisserie"],
    ["Garnissage", "tapisserie"],
    // Manutention
    ["Logistique", "manutention"],
    ["Conditionnement", "manutention"],
    ["Emballage", "manutention"],
    ["Prémontage atelier", "manutention"],
    // Aucun match
    ["Lorem ipsum sit amet", null],
    ["", null],
  ];
  for (const [lib, expected] of cases) {
    it(`"${lib}" → ${expected}`, () => {
      expect(matchMetier(lib)).toBe(expected);
    });
  }
});

describe("isMatiere — 15 libellés", () => {
  const yes = [
    "Liste de matière pour bois",
    "Budget matériaux",
    "Liste des éléments en métal matière",
    "Liste des tissus matière courant",
    "PMMA 5mm",
    "Sunclear plaque",
    "PVC blanc",
    "Plexi transparent",
    "Linno imprimé",
    "Adhésif vinyle",
    "Fournitures d'emballage",
    "Fournitures logistique",
    "Quincaillerie",
    "Budget accessoires",
    "Matière première bois massif",
  ];
  for (const l of yes) {
    it(`"${l}" est une matière`, () => expect(isMatiere(l)).toBe(true));
  }
  it("ne matche pas un libellé métier", () => {
    expect(isMatiere("Bureau d'étude")).toBe(false);
  });
});

describe("isChantierKeyword / Montage / Démontage", () => {
  it("détecte montage / pose / installation / permanence / day", () => {
    expect(isChantierKeyword("Montage sur site")).toBe(true);
    expect(isChantierKeyword("Pose Day 1")).toBe(true);
    expect(isChantierKeyword("Installation finale")).toBe(true);
    expect(isChantierKeyword("Permanence")).toBe(true);
    expect(isChantierKeyword("Day 3")).toBe(true);
  });
  it("détecte démontage / dépose / transport", () => {
    expect(isChantierKeyword("Démontage")).toBe(true);
    expect(isChantierKeyword("Dépose")).toBe(true);
    expect(isChantierKeyword("Transport retour")).toBe(true);
  });
  it("Montage uniquement (pas Démontage)", () => {
    expect(isMontageKeyword("Montage")).toBe(true);
    expect(isMontageKeyword("Démontage")).toBe(false);
    expect(isDemontageKeyword("Démontage")).toBe(true);
    expect(isDemontageKeyword("Montage")).toBe(false);
  });
  it("ne matche pas un objet fab", () => {
    expect(isChantierKeyword("Bar central")).toBe(false);
  });
});

describe("isExcludeKeyword", () => {
  it("exclut régul, leurre, sous-totaux, renvois, achats", () => {
    expect(isExcludeKeyword("Régul de cadrage")).toBe(true);
    expect(isExcludeKeyword("Leurre")).toBe(true);
    expect(isExcludeKeyword("Sous-total HT")).toBe(true);
    expect(isExcludeKeyword("Voir devis 1586")).toBe(true);
    expect(isExcludeKeyword("Achat matériel")).toBe(true);
    expect(isExcludeKeyword("Total HT")).toBe(true);
    expect(isExcludeKeyword("Benne 12m³")).toBe(true);
  });
  it("ne matche pas un objet normal", () => {
    expect(isExcludeKeyword("Bar 1")).toBe(false);
  });
});

describe("isLineDisabled", () => {
  it("désactivée si Qté=0", () => {
    expect(isLineDisabled({ quantite: 0, heures: 5, totalHt: 100 })).toBe(true);
  });
  it("désactivée si heures=0 ET total=0", () => {
    expect(isLineDisabled({ quantite: 1, heures: 0, totalHt: 0 })).toBe(true);
  });
  it("active si heures>0", () => {
    expect(isLineDisabled({ quantite: 1, heures: 4, totalHt: 0 })).toBe(false);
  });
  it("active si total>0 (location pure)", () => {
    expect(isLineDisabled({ quantite: 1, heures: 0, totalHt: 200 })).toBe(false);
  });
});

describe("detectDevisType — 5 cas", () => {
  it("fabrication pure", () => {
    expect(
      detectDevisType([
        { designation: "Bureau d'étude" },
        { designation: "Construction" },
        { designation: "Peinture" },
      ]),
    ).toBe("fabrication");
  });
  it("chantier seul", () => {
    expect(
      detectDevisType([
        { designation: "Montage" },
        { designation: "Démontage" },
        { designation: "Transport" },
      ]),
    ).toBe("chantier_seul");
  });
  it("mixte", () => {
    expect(
      detectDevisType([
        { designation: "Métallerie" },
        { designation: "Montage sur site" },
      ]),
    ).toBe("mixte");
  });
  it("inconnu", () => {
    expect(detectDevisType([{ designation: "Lorem" }, { designation: "" }])).toBe("inconnu");
  });
  it("ignore les exclude", () => {
    expect(
      detectDevisType([
        { designation: "Voir devis 1586" },
        { designation: "Régul" },
        { designation: "Construction" },
      ]),
    ).toBe("fabrication");
  });
});

describe("computeFlagsFromMetiers — 5 cas", () => {
  it("objet complet (BE + CNC + bois + peinture + manut)", () => {
    const h = { ...emptyHeures(), be: 4, numerique: 2, bois: 10, peinture: 5, manutention: 1 };
    expect(computeFlagsFromMetiers(h)).toEqual({
      a_dessiner: true,
      a_usiner: true,
      a_construire: true,
      est_brut: false,
      a_emballer: true,
    });
  });
  it("objet brut (pas de finition)", () => {
    const h = { ...emptyHeures(), bois: 10 };
    expect(computeFlagsFromMetiers(h).est_brut).toBe(true);
  });
  it("objet uniquement métal", () => {
    const h = { ...emptyHeures(), metal: 8 };
    const f = computeFlagsFromMetiers(h);
    expect(f.a_construire).toBe(true);
    expect(f.a_dessiner).toBe(false);
    expect(f.a_usiner).toBe(false);
  });
  it("objet à tapisser uniquement", () => {
    const h = { ...emptyHeures(), tapisserie: 6 };
    expect(computeFlagsFromMetiers(h).est_brut).toBe(false);
  });
  it("vide", () => {
    expect(computeFlagsFromMetiers(emptyHeures())).toEqual({
      a_dessiner: false,
      a_usiner: false,
      a_construire: false,
      est_brut: true,
      a_emballer: false,
    });
  });
});

describe("detectTypeFinition — 4 cas", () => {
  it("aucune si vide", () => {
    expect(detectTypeFinition(emptyHeures())).toBe("aucune");
  });
  it("peinture si que peinture", () => {
    expect(detectTypeFinition({ ...emptyHeures(), peinture: 5 })).toBe("peinture");
  });
  it("tapisserie si que tapisserie", () => {
    expect(detectTypeFinition({ ...emptyHeures(), tapisserie: 5 })).toBe("tapisserie");
  });
  it("autre si peinture + tapisserie", () => {
    expect(detectTypeFinition({ ...emptyHeures(), peinture: 5, tapisserie: 5 })).toBe("autre");
  });
});

describe("METIER_TO_ETAPE — mapping 7 métiers → 5 étapes", () => {
  it("mappe correctement", () => {
    expect(METIER_TO_ETAPE.be).toBe("be");
    expect(METIER_TO_ETAPE.numerique).toBe("usinage");
    expect(METIER_TO_ETAPE.bois).toBe("respo_fab");
    expect(METIER_TO_ETAPE.metal).toBe("respo_fab");
    expect(METIER_TO_ETAPE.peinture).toBe("finition");
    expect(METIER_TO_ETAPE.tapisserie).toBe("finition");
    expect(METIER_TO_ETAPE.manutention).toBe("manutention");
  });
});
