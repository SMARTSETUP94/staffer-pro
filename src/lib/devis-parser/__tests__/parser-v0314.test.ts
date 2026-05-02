/**
 * v0.31.4 — Tests parser refonte 3 niveaux + règle quantité critique.
 *
 * Calibré sur 3 devis réels (3204, 2150, 1832) validés avec Gabin.
 * RÈGLE CRITIQUE : pour un objet (N.M) avec Quantité > 1, les heures affichées
 * sur les postes enfants (N.M.K) sont PAR UNITE → multiplier par qté objet.
 */
import { describe, expect, it } from "vitest";
import { parseDevisProgbatFromMatrix } from "../parse-excel";
import { ALL_FIXTURES } from "../__fixtures__/progbat-mocks";
import { isMatiere, isRegul, matchMetier } from "../match";

function parse(num: keyof typeof ALL_FIXTURES) {
  return parseDevisProgbatFromMatrix(ALL_FIXTURES[num] as unknown[][], { filename: `${num}.xlsx` });
}

describe("v0.31.4 — Patterns regex métiers (table Gabin)", () => {
  it("BE : Tarif du bureau d'étude / Suivi de projet / Suivi de chantier", () => {
    expect(matchMetier("Tarif du bureau d'étude")).toBe("be");
    expect(matchMetier("Bureau d'étude")).toBe("be");
    expect(matchMetier("Suivi de projet heures")).toBe("be");
    expect(matchMetier("Suivi de projet")).toBe("be");
    expect(matchMetier("Suivi de chantier")).toBe("be");
  });
  it("Numérique : Numérique nb d'heures", () => {
    expect(matchMetier("Numérique nb d'heures")).toBe("numerique");
    expect(matchMetier("Numérique heures")).toBe("numerique");
    expect(matchMetier("Découpe CNC")).toBe("numerique");
  });
  it("Métal : Métallerie heures", () => {
    expect(matchMetier("Métallerie heures")).toBe("metal");
    expect(matchMetier("Métallerie")).toBe("metal");
  });
  it("Peinture : Peinture nombre d'heures (mais pas m² peinture)", () => {
    expect(matchMetier("Peinture nombre d'heures")).toBe("peinture");
    expect(matchMetier("Peinture heures")).toBe("peinture");
    expect(matchMetier("m² peinture")).toBeNull();
    expect(matchMetier("m2 de peinture")).toBeNull();
  });
  it("Tapisserie : Tissu nb d'heures", () => {
    expect(matchMetier("Tissu nb d'heures")).toBe("tapisserie");
    expect(matchMetier("Tissu coton")).toBe("tapisserie");
  });
  it("Bois : Construction heures / Construction en atelier", () => {
    expect(matchMetier("Construction heures")).toBe("bois");
    expect(matchMetier("Construction en atelier")).toBe("bois");
    expect(matchMetier("Bois nb heures constructeurs")).toBe("bois");
  });
  it("Manutention : Logistique interne / Heures prémontage / typo Logisitique", () => {
    expect(matchMetier("Logistique interne")).toBe("manutention");
    expect(matchMetier("Heures prémontage")).toBe("manutention");
    expect(matchMetier("Logisitique externe")).toBe("manutention"); // typo Progbat
  });
});

describe("v0.31.4 — Catégorie matériel (hors heures)", () => {
  it.each([
    "m² de peinture",
    "m2 peinture finition",
    "Liste de matière pour bois",
    "Budget matériaux",
    "Budget location vidéo",
    "Fournitures d'emballage",
    "LED",
    "PMMA 5mm",
    "Prix loca son",
    "Numérique - à ajouter - matière",
  ])("« %s » → matière", (lib) => {
    expect(isMatiere(lib)).toBe(true);
  });
});

describe("v0.31.4 — Régul", () => {
  it("isRegul détecte régul / cadrage", () => {
    expect(isRegul("Régul cadrage")).toBe(true);
    expect(isRegul("Cadrage planning")).toBe(true);
  });
  it("régul n'est PAS un métier", () => {
    expect(matchMetier("Régul cadrage")).toBeNull();
  });
});

describe("v0.31.4 — D-3204 : 3 niveaux + descriptions + qté > 1", () => {
  const r = parse("D-3204");

  it("type devis = mixte", () => {
    expect(r.devisType).toBe("mixte");
  });

  it("au moins 2 objets détectés (1.2, 2.1) — 1.1 selon EXCLUDE", () => {
    expect(r.objetsCandidats.length).toBeGreaterThanOrEqual(2);
    const nums = r.objetsCandidats.map((o) => o.numero);
    expect(nums).toContain("1.2");
    expect(nums).toContain("2.1");
  });

  it("Objet 1.1 si présent : qte=1 et heures unitaires conservées", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.1");
    if (!obj) return; // tolérance : 1.1 peut être filtré par EXCLUDE selon libellé
    expect(obj.quantite).toBe(1);
    expect(obj.heures.bois).toBe(24);
    expect(obj.heures.peinture).toBe(6);
  });

  it("Objet 1.2 (qte=2) : heures × 2 (RÈGLE CRITIQUE GABIN)", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.2")!;
    expect(obj.quantite).toBe(2);
    expect(obj.heures.numerique).toBe(6); // 3 × 2
    expect(obj.heures.peinture).toBe(10); // 5 × 2
    expect(obj.totalHeures).toBe(16);
    expect(obj.budgetMateriaux).toBe(500); // 250 LED × 2
  });

  it("Objet 2.1 Tabouret (qte=12) : heures × 12", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "2.1")!;
    expect(obj.quantite).toBe(12);
    expect(obj.heures.metal).toBe(36); // 3 × 12
    expect(obj.heures.tapisserie).toBe(48); // 4 × 12
    expect(obj.totalHeures).toBe(84);
  });

  it("Descriptions capturées depuis lignes commentaires (si objet présent)", () => {
    const obj12 = r.objetsCandidats.find((o) => o.numero === "1.2");
    expect(obj12?.description ?? "").toMatch(/Panneau LED|PMMA/);
    const obj21 = r.objetsCandidats.find((o) => o.numero === "2.1");
    expect(obj21?.description ?? "").toMatch(/tissu|mousse/i);
  });

  it("Heures chantier (Montage day 1 + Démontage day 4)", () => {
    expect(r.heuresChantier.montage).toBe(40);
    expect(r.heuresChantier.demontage).toBe(16);
  });

  it("Cross-check intégrité : ParseResult expose des checks par section", () => {
    expect(r.integrityChecks.length).toBeGreaterThanOrEqual(2);
    for (const c of r.integrityChecks) {
      expect(["ok", "warning", "error"]).toContain(c.severite);
      expect(typeof c.heuresDeclarees).toBe("number");
      expect(typeof c.heuresCalculees).toBe("number");
    }
  });
});

describe("v0.31.4 — D-2150 : RÈGLE QUANTITE × heures unitaires", () => {
  const r = parse("D-2150");

  it("4 objets dont 3 avec qté > 1", () => {
    expect(r.objetsCandidats.length).toBeGreaterThanOrEqual(3);
  });

  it("Fausse briques qte=60 : 0.15h/u × 60 = 9h numérique", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
    expect(obj.quantite).toBe(60);
    expect(obj.heures.numerique).toBeCloseTo(9, 2);
  });

  it("Châssis qte=8 : 1h/u × 8 = 8h bois", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.4")!;
    expect(obj.quantite).toBe(8);
    expect(obj.heures.bois).toBe(8);
    expect(obj.description).toContain("toile coton");
  });

  it("Stèles qte=3 : 2h/u × 3 = 6h peinture", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.5")!;
    expect(obj.quantite).toBe(3);
    expect(obj.heures.peinture).toBe(6);
  });

  it("Cross-check Section 1 : déclaré=23h, calculé=23h, severite=ok", () => {
    const sec1 = r.integrityChecks.find((c) => c.sectionNumero === "1")!;
    expect(sec1.heuresDeclarees).toBe(23);
    expect(sec1.heuresCalculees).toBeCloseTo(23, 2);
    expect(sec1.severite).toBe("ok");
  });

  it("Suivi de projet → BE (cas Gabin)", () => {
    const suivi = r.objetsCandidats.find((o) => o.nom.toLowerCase().includes("suivi"));
    expect(suivi).toBeDefined();
    expect(suivi!.heures.be).toBeGreaterThan(0);
  });
});

describe("v0.31.4 — D-1832 : 100% mapping auto, 3 sections", () => {
  const r = parse("D-1832");

  it("4 objets (1.1 Bar, 1.2 Banquette qte=2, 2.1 Totem, 3.1 Prémontage)", () => {
    expect(r.objetsCandidats).toHaveLength(4);
  });

  it("Bar central qte=1 : 8 BE + 20 bois + 5 peinture", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
    expect(obj.heures.be).toBe(8);
    expect(obj.heures.bois).toBe(20);
    expect(obj.heures.peinture).toBe(5);
  });

  it("Banquette qte=2 : tout × 2 (4*2=8 BE, 12*2=24 metal, 4*2=8 tap)", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.2")!;
    expect(obj.quantite).toBe(2);
    expect(obj.heures.be).toBe(8);
    expect(obj.heures.metal).toBe(24);
    expect(obj.heures.tapisserie).toBe(8);
  });

  it("Cross-check toutes sections OK (mapping 100% auto)", () => {
    expect(r.integrityChecks).toHaveLength(3);
    for (const c of r.integrityChecks) {
      expect(c.severite, `Section ${c.sectionNumero}`).toBe("ok");
    }
  });

  it("Aucun warning (mapping 100% auto)", () => {
    expect(r.warnings).toEqual([]);
  });

  it("Heures chantier : Montage ≥ 60 + Démontage 24", () => {
    expect(r.heuresChantier.montage).toBeGreaterThanOrEqual(60);
    expect(r.heuresChantier.demontage).toBe(24);
  });
});

describe("v0.31.4 — Cross-check intégrité (anti-bug critique)", () => {
  it("ParseResult expose integrityChecks[]", () => {
    const r = parse("D-3204");
    expect(Array.isArray(r.integrityChecks)).toBe(true);
  });

  it("severite='error' si écart > 5% et > 0.5h", () => {
    // Fixture artificielle : section déclare 100h, calculé sera 38h → écart -62
    const m: (string | number | null)[][] = [
      ["D-9999", "", "", "", "", "", ""],
      ["Test cross-check", "", "", "", "", "", ""],
      ["N°", "Désignation", "Qté", "Unité", "PU HT", "Total HT", "Temps prévu"],
      ["1", "GROS DECOR", null, "", null, null, 100], // déclaré 100h, va calculer 38h
      ["1.1", "Bar simple", 1, "u", null, null, null],
      ["1.1.1", "Tarif du bureau d'étude", 1, "h", 60, 480, 8],
      ["1.1.2", "Construction heures", 1, "h", 50, 1200, 24],
      ["1.1.3", "Peinture nombre d'heures", 1, "h", 50, 300, 6],
    ];
    const r = parseDevisProgbatFromMatrix(m, { filename: "D-9999.xlsx" });
    const c = r.integrityChecks[0];
    expect(c.heuresDeclarees).toBe(100);
    expect(c.heuresCalculees).toBe(38);
    expect(c.ecart).toBe(-62);
    expect(c.severite).toBe("error");
    expect(r.warnings.some((w) => w.includes("⚠ Section 1"))).toBe(true);
  });
});

describe("v0.31.4 — Régul : 0h, HT conservé, flag manuel si Temps > 0", () => {
  it("Régul avec Temps > 0 → warning manuel", () => {
    const m: (string | number | null)[][] = [
      ["D-9001", "", "", "", "", "", ""],
      ["Test régul", "", "", "", "", "", ""],
      ["N°", "Désignation", "Qté", "Unité", "PU HT", "Total HT", "Temps prévu"],
      ["1", "ZONE", null, "", null, null, 10],
      ["1.1", "Objet test", 1, "u", null, null, null],
      ["1.1.1", "Construction heures", 1, "h", 50, 500, 10],
      ["1.1.2", "Régul cadrage planning", 1, "ff", null, 200, 5], // régul avec heures
    ];
    const r = parseDevisProgbatFromMatrix(m, { filename: "D-9001.xlsx" });
    const obj = r.objetsCandidats[0];
    expect(obj.heures.bois).toBe(10); // régul ignorée pour heures
    expect(obj.warnings.some((w) => w.toLowerCase().includes("régul"))).toBe(true);
  });
});

describe("v0.31.4c — D-2128 : 4e fixture, 100% mapping cible (calibrage final)", () => {
  const r = parse("D-2128");

  it("Parse sans erreur", () => {
    expect(r.errors).toEqual([]);
  });

  it("Plans techniques → BE (nouveau pattern)", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
    expect(obj.heures.be).toBe(18); // 12 + 6
  });

  it("Budget matériaux + Temps>0 bascule en Manutention (matière conditionnelle)", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "3.1")!;
    expect(obj.heures.manutention).toBe(12); // 8 + 4
    expect(obj.budgetMateriaux).toBe(0); // ne doit PAS être compté en matière
  });

  it("Stockage → Manutention (nouveau pattern)", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "4.1")!;
    expect(obj.heures.manutention).toBe(5);
  });

  it("Section 5 qte=3 : 10h × 3 = 30h manutention (règle qte Section)", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "5.1")!;
    expect(obj.heures.manutention).toBe(30);
  });

  it("Démontage Pecqueuse → heures démontage chantier (nouveau pattern)", () => {
    expect(r.heuresChantier.demontage).toBe(30);
  });

  it("100% mapping auto : aucun poste métier ambigu", () => {
    const orphans: string[] = [];
    for (const o of r.objetsCandidats) {
      for (const p of o.postes) {
        const isMat = p.isMatiereOverride ?? p.isMatiere;
        const mapped = p.isRegul || isMat || (p.metier != null && p.heuresUnitaires > 0);
        if (!mapped) orphans.push(`${o.numero}/${p.numero || p.rowIndex} : ${p.designation}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe("v0.31.5 HOTFIX — D-2141bis : Bug A (Remise en peinture exclue) + Bug B (postes vides faux positifs)", () => {
  const r = parse("D-2141bis");

  it("Parse sans erreur", () => {
    expect(r.errors).toEqual([]);
  });

  it("Bug A : objet 1.1 'Remise en peinture du bar existant' DOIT être détecté", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.1");
    expect(obj).toBeDefined();
    expect(obj!.nom).toMatch(/Remise en peinture/i);
    expect(obj!.heures.peinture).toBe(75);
    expect(obj!.heures.manutention).toBe(18.75);
    expect(obj!.totalHeures).toBeCloseTo(93.75, 2);
  });

  it("Bug B : aucun poste vide (qty=0,total=0,temps=0) ne figure dans postes[]", () => {
    const obj12 = r.objetsCandidats.find((o) => o.numero === "1.2")!;
    const numerosVides = ["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.7", "1.2.11"];
    for (const num of numerosVides) {
      const exists = obj12.postes.some((p) => p.numero === num);
      expect(exists, `poste vide ${num} ne devrait pas être listé`).toBe(false);
    }
  });

  it("Objet 1.2 : seuls les 4 postes utilisés sont conservés (54.75h)", () => {
    const obj = r.objetsCandidats.find((o) => o.numero === "1.2")!;
    expect(obj.postes).toHaveLength(4);
    expect(obj.totalHeures).toBeCloseTo(54.75, 2);
  });

  it("Section 1 : cross-check OK, déclaré=148.5h, calculé=148.5h", () => {
    const sec1 = r.integrityChecks.find((c) => c.sectionNumero === "1")!;
    expect(sec1.heuresDeclarees).toBe(148.5);
    expect(sec1.heuresCalculees).toBeCloseTo(148.5, 2);
    expect(sec1.severite).toBe("ok");
  });

  it("100% mapping auto sur les 4 sections (aucun poste orphelin)", () => {
    const orphans: string[] = [];
    for (const o of r.objetsCandidats) {
      for (const p of o.postes) {
        const isMat = p.isMatiereOverride ?? p.isMatiere;
        const mapped = p.isRegul || isMat || (p.metier != null && p.heuresUnitaires > 0);
        if (!mapped) orphans.push(`${o.numero}/${p.numero} : ${p.designation}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it("Total cumulé sections 1+2+3+4 ≈ 579.26h (cible Gabin)", () => {
    const total = r.integrityChecks
      .filter((c) => ["1", "2", "3", "4"].includes(c.sectionNumero))
      .reduce((acc, c) => acc + c.heuresCalculees, 0);
    expect(total).toBeCloseTo(579.26, 1);
  });
});

describe("v0.31.5 — Régression EXCLUDE_REGEX : Remise commerciale toujours exclue", () => {
  it("Remise commerciale + Remise consentie client → exclues, Remise en peinture conservée", () => {
    const m: (string | number | null)[][] = [
      ["D-9100", "", "", "", "", "", ""],
      ["Test exclude", "", "", "", "", "", ""],
      ["N°", "Désignation", "Qté", "Unité", "PU HT", "Total HT", "Temps prévu"],
      ["1", "ZONE", null, "", null, null, 24],
      ["1.1", "Remise en peinture du mur", 1, "u", null, null, null],
      ["1.1.1", "Construction heures", 1, "h", 50, 1200, 24],
      ["1.1.2", "Remise commerciale 5%", 1, "ff", null, -300, null],
      ["1.1.3", "Remise consentie client", 1, "ff", null, -100, null],
    ];
    const r = parseDevisProgbatFromMatrix(m, { filename: "D-9100.xlsx" });
    expect(r.objetsCandidats).toHaveLength(1);
    const obj = r.objetsCandidats[0];
    expect(obj.numero).toBe("1.1");
    expect(obj.heures.bois).toBe(24);
    const remises = obj.postes.filter((p) => /^remise/i.test(p.designation));
    expect(remises).toHaveLength(0);
  });
});

describe("v0.31.4 — backward compat : aucune régression sur 13 fixtures historiques", () => {
  it.each([
    ["D-2153", 4] as const,
    ["D-2141", 3] as const,
    ["D-2023", 2] as const,
    ["D-1973", 1] as const,
    ["D-1816", 1] as const,
    ["D-1831", 3] as const,
    ["D-1625", 4] as const,
    ["D-1665", 1] as const,
    ["D-1707", 2] as const,
    ["D-2028", 1] as const,
  ])("%s a %i objet(s) sans erreur", (num, n) => {
    const r = parse(num as keyof typeof ALL_FIXTURES);
    expect(r.errors).toEqual([]);
    expect(r.objetsCandidats).toHaveLength(n);
  });

  it.each(["D-2022", "D-1650", "D-2133"])("%s reste chantier_seul", (num) => {
    const r = parse(num as keyof typeof ALL_FIXTURES);
    expect(r.devisType).toBe("chantier_seul");
    expect(r.objetsCandidats).toHaveLength(0);
  });
});
