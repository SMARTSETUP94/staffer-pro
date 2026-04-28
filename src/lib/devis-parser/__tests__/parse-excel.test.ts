/**
 * v0.23 — Tests d'intégration parser Progbat sur 13 fixtures.
 */
import { describe, expect, it } from "vitest";
import { parseDevisProgbatFromMatrix } from "../parse-excel";
import { ALL_FIXTURES } from "../__fixtures__/progbat-mocks";
import type { ParseResult } from "../types";

function parse(num: keyof typeof ALL_FIXTURES): ParseResult {
  return parseDevisProgbatFromMatrix(ALL_FIXTURES[num] as unknown[][], { filename: `${num}.xlsx` });
}

describe("parser Progbat — fixtures fabrication", () => {
  it("D-2153 : 4 objets + heures chantier (montage/démontage)", () => {
    const r = parse("D-2153");
    expect(r.devisType).toBe("mixte");
    expect(r.objetsCandidats).toHaveLength(4);
    expect(r.heuresChantier.montage).toBe(40);
    expect(r.heuresChantier.demontage).toBe(16);
    // Bar central : be=8 + bois=24 + peinture=6 (qté 1)
    const bar = r.objetsCandidats.find((o) => o.nom.includes("Bar central"))!;
    expect(bar.heures.be).toBe(8);
    expect(bar.heures.bois).toBe(24);
    expect(bar.heures.peinture).toBe(6);
    expect(bar.budgetMateriaux).toBe(800);
    // Banquette VIP : qté 2 → heures × 2
    const banq = r.objetsCandidats.find((o) => o.nom.includes("Banquette"))!;
    expect(banq.quantite).toBe(2);
    expect(banq.heures.be).toBe(8); // 4 × 2
    expect(banq.heures.metal).toBe(30); // 15 × 2
    expect(banq.heures.tapisserie).toBe(24); // 12 × 2
    // Totem qté 3
    const totem = r.objetsCandidats.find((o) => o.nom.includes("Totem"))!;
    expect(totem.quantite).toBe(3);
    expect(totem.heures.numerique).toBe(18); // 6 × 3
  });

  it("D-2141 : 3 bars phases sommées + chantier", () => {
    const r = parse("D-2141");
    expect(r.devisType).toBe("mixte");
    expect(r.objetsCandidats).toHaveLength(3);
    expect(r.heuresChantier.montage).toBe(30);
    expect(r.heuresChantier.demontage).toBe(12);
    const barA = r.objetsCandidats.find((o) => o.nom.includes("Bar A"))!;
    expect(barA.heures.be).toBe(6);
    expect(barA.heures.bois).toBe(20);
    expect(barA.heures.peinture).toBe(5);
  });

  it("D-2023 : 2 objets, lot Achat exclu", () => {
    const r = parse("D-2023");
    expect(r.objetsCandidats).toHaveLength(2);
    // L'objet "Achat fournitures spéciales" ne doit pas apparaître
    expect(r.objetsCandidats.find((o) => o.nom.toLowerCase().includes("achat"))).toBeUndefined();
    expect(r.heuresChantier.montage).toBe(12);
  });

  it("D-1973 : 1 prototype avec tous métiers", () => {
    const r = parse("D-1973");
    expect(r.devisType).toBe("fabrication");
    expect(r.objetsCandidats).toHaveLength(1);
    const proto = r.objetsCandidats[0];
    expect(proto.heures.be).toBe(10);
    expect(proto.heures.numerique).toBe(8);
    expect(proto.heures.bois).toBe(10);
    expect(proto.heures.peinture).toBe(3);
    expect(proto.heures.manutention).toBe(2);
    expect(proto.flags.a_dessiner).toBe(true);
    expect(proto.flags.a_usiner).toBe(true);
    expect(proto.flags.a_construire).toBe(true);
    expect(proto.flags.est_brut).toBe(false);
    expect(proto.flags.a_emballer).toBe(true);
  });

  it("D-1816 : 1 objet simple + pose", () => {
    const r = parse("D-1816");
    expect(r.objetsCandidats).toHaveLength(1);
    expect(r.objetsCandidats[0].heures.bois).toBe(16);
    expect(r.objetsCandidats[0].heures.peinture).toBe(6);
    expect(r.heuresChantier.montage).toBe(8); // pose
  });

  it("D-1831 : 3 objets avec quantités 27, 4, 1", () => {
    const r = parse("D-1831");
    expect(r.objetsCandidats).toHaveLength(3);
    const tab = r.objetsCandidats.find((o) => o.nom.includes("Tabouret"))!;
    expect(tab.quantite).toBe(27);
    expect(tab.heures.be).toBe(54); // 2 × 27
    expect(tab.heures.metal).toBe(135); // 5 × 27
    expect(tab.heures.tapisserie).toBe(108); // 4 × 27
    const table = r.objetsCandidats.find((o) => o.nom.includes("Table"))!;
    expect(table.quantite).toBe(4);
    expect(table.heures.bois).toBe(32); // 8 × 4
    expect(r.heuresChantier.montage).toBe(16);
    expect(r.heuresChantier.demontage).toBe(8);
  });

  it("D-1625 : 4 objets, Tissu mappé sur Tapisserie", () => {
    const r = parse("D-1625");
    expect(r.objetsCandidats).toHaveLength(4);
    const banq2 = r.objetsCandidats.find((o) => o.nom.includes("2 places"))!;
    expect(banq2.quantite).toBe(2);
    expect(banq2.heures.tapisserie).toBe(10); // 5 × 2 (tissu)
    const pouf = r.objetsCandidats.find((o) => o.nom.includes("Pouf"))!;
    expect(pouf.quantite).toBe(6);
    expect(pouf.heures.tapisserie).toBe(12); // 2 × 6
  });

  it("D-1665 : 1 objet + renvoi externe Voir devis 1586", () => {
    const r = parse("D-1665");
    expect(r.objetsCandidats).toHaveLength(1);
    expect(r.renvoisExternes).toHaveLength(1);
    expect(r.renvoisExternes[0].numeroDevis).toBe("1586");
  });

  it("D-1707 : 2 objets + permanence (chantier)", () => {
    const r = parse("D-1707");
    expect(r.objetsCandidats).toHaveLength(2);
    const prat = r.objetsCandidats.find((o) => o.nom.includes("Praticable"))!;
    expect(prat.quantite).toBe(4);
    expect(prat.heures.bois).toBe(24); // 6 × 4
    expect(r.heuresChantier.montage).toBe(20); // permanence
  });
});

describe("parser Progbat — fixtures chantier seul", () => {
  it("D-2022 : chantier seul (0 objet, montage+démontage)", () => {
    const r = parse("D-2022");
    expect(r.devisType).toBe("chantier_seul");
    expect(r.objetsCandidats).toHaveLength(0);
    expect(r.heuresChantier.montage).toBe(48);
    expect(r.heuresChantier.demontage).toBe(12);
  });

  it("D-1650 : chantier seul permanence (0 objet)", () => {
    const r = parse("D-1650");
    expect(r.devisType).toBe("chantier_seul");
    expect(r.objetsCandidats).toHaveLength(0);
    expect(r.heuresChantier.montage).toBe(32);
    expect(r.heuresChantier.demontage).toBe(8);
  });

  it("D-2133 : chantier seul transport+pose+dépose (0 objet)", () => {
    const r = parse("D-2133");
    expect(r.devisType).toBe("chantier_seul");
    expect(r.objetsCandidats).toHaveLength(0);
    expect(r.heuresChantier.montage).toBe(24);
    expect(r.heuresChantier.demontage).toBe(12);
  });
});

describe("parser Progbat — fixture mixte avec budget matériaux", () => {
  it("D-2028 : 1 objet + budget accessoires + matières bois", () => {
    const r = parse("D-2028");
    expect(r.objetsCandidats).toHaveLength(1);
    const obj = r.objetsCandidats[0];
    expect(obj.heures.be).toBe(8);
    expect(obj.heures.bois).toBe(30);
    expect(obj.heures.metal).toBe(12);
    expect(obj.heures.peinture).toBe(6);
    // Budget cumulé : 450 (accessoires) + 950 (matière bois) = 1400
    expect(obj.budgetMateriaux).toBe(1400);
    expect(r.heuresChantier.montage).toBe(12);
  });
});

describe("parser Progbat — métadonnées et confidence", () => {
  it("extrait le numéro de devis depuis le fichier", () => {
    const r = parse("D-2153");
    expect(r.meta.numeroDevis).toMatch(/^D-2153/);
    expect(r.meta.nbLignes).toBeGreaterThan(0);
    expect(r.meta.totalHt).toBeGreaterThan(0);
  });

  it("confidence 'high' pour objet sans warnings", () => {
    const r = parse("D-1973");
    expect(r.objetsCandidats[0].confidence).toBe("high");
  });

  it("aucune erreur sur les 13 fixtures", () => {
    for (const num of Object.keys(ALL_FIXTURES) as (keyof typeof ALL_FIXTURES)[]) {
      const r = parse(num);
      expect(r.errors, `${num} ne doit pas avoir d'erreur`).toEqual([]);
    }
  });
});
