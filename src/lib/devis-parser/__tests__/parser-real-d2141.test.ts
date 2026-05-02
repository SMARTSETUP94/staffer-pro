/**
 * v0.31.5 — Test de régression sur le VRAI fichier Excel Progbat D-202604-2141
 * remonté par Gabin en prod (BAR A COCKTAIL DOUBLE).
 *
 * Bug initial : la section 1.1 "Remise en peinture du bar existant" était
 * exclue à tort par /^remise\b/i (EXCLUDE_REGEX), faisant disparaître ses
 * postes 1.1.2 (75h peinture) et 1.1.3 (18.75h logistique) → écart -93.75h
 * sur la section 1.
 *
 * Ce test charge le binaire .xlsx réel pour garantir qu'aucune régression
 * future sur le parser ne ré-introduise le bug.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDevisProgbatFromArrayBuffer, parseDevisProgbatFromMatrix } from "../parse-excel";

function loadFixture(): ArrayBuffer {
  const path = resolve(__dirname, "../__fixtures__/D-202604-2141.xlsx");
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("v0.31.5 — Devis réel D-202604-2141 (BAR A COCKTAIL DOUBLE, prod Gabin)", () => {
  const r = parseDevisProgbatFromArrayBuffer(loadFixture(), {
    filename: "D-202604-2141.xlsx",
  });

  it("Parse sans erreur", () => {
    expect(r.errors).toEqual([]);
  });

  it("Type de devis = fabrication", () => {
    expect(r.devisType).toBe("fabrication");
  });

  it("Métadonnées : numero détecté D-202604 ou D-2141", () => {
    expect(r.meta.numeroDevis).toMatch(/^D-(202604|2141)/);
  });

  it("7 objets détectés (1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4)", () => {
    const numeros = r.objetsCandidats.map((o) => o.numero).sort();
    expect(r.objetsCandidats).toHaveLength(7);
    expect(numeros).toEqual(["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4"]);
  });

  /* ====================================================================== */
  /* RÉGRESSION CŒUR DU BUG : Section 1.1 doit exister et porter 93.75h    */
  /* ====================================================================== */
  describe("Section 1.1 'Remise en peinture du bar existant' (cœur du hotfix)", () => {
    it("Objet 1.1 présent (anti-régression EXCLUDE_REGEX /^remise\\b/)", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1");
      expect(
        obj,
        "Objet 1.1 absent : la regex /^remise\\b/ a probablement été ré-élargie",
      ).toBeDefined();
    });

    it("Nom = 'Remise en peinture du bar existant'", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
      expect(obj.nom).toBe("Remise en peinture du bar existant");
    });

    it("Quantité objet = 1, sectionQuantite = 1", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
      expect(obj.quantite).toBe(1);
      expect(obj.sectionQuantite).toBe(1);
    });

    it("Heures par métier exactes : peinture=75h, manutention=18.75h", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
      expect(obj.heures.peinture).toBe(75);
      expect(obj.heures.manutention).toBe(18.75);
      expect(obj.heures.bois).toBe(0);
      expect(obj.heures.metal).toBe(0);
      expect(obj.heures.numerique).toBe(0);
      expect(obj.heures.tapisserie).toBe(0);
      expect(obj.heures.be).toBe(0);
    });

    it("Total heures = 93.75h (= 75 + 18.75)", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
      expect(obj.totalHeures).toBeCloseTo(93.75, 2);
    });

    it("Postes utilisés : 1.1.2 peinture + 1.1.3 manutention détectés AUTO", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
      const p112 = obj.postes.find((p) => p.numero === "1.1.2");
      const p113 = obj.postes.find((p) => p.numero === "1.1.3");
      expect(p112).toBeDefined();
      expect(p112!.metier).toBe("peinture");
      expect(p112!.heuresUnitaires).toBe(75);
      expect(p113).toBeDefined();
      expect(p113!.metier).toBe("manutention");
      expect(p113!.heuresUnitaires).toBe(18.75);
    });

    it("Postes vides 1.1.1, 1.1.4, 1.1.6 (qty=0,total=0,temps=0) NON listés (Bug B)", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
      const numerosVides = ["1.1.1", "1.1.4", "1.1.6"];
      for (const num of numerosVides) {
        const exists = obj.postes.some((p) => p.numero === num);
        expect(exists, `Poste vide ${num} ne devrait pas être exposé`).toBe(false);
      }
    });

    it("Poste matière 1.1.5 'm² de peinture' présent et marqué isMatiere", () => {
      const obj = r.objetsCandidats.find((o) => o.numero === "1.1")!;
      const p115 = obj.postes.find((p) => p.numero === "1.1.5");
      expect(p115).toBeDefined();
      expect(p115!.isMatiere).toBe(true);
    });

    it("Sécurité UI : même si le parent 1.1 est marqué exclu, ses enfants horaires recréent l'objet", () => {
      const rows = [
        ["N°", "Désignation", "Qté", "Unité", "P.U. HT", "Total HT", "Temps prévu"],
        ["1", "I2 - BAR A COCKTAIL DOUBLE - Mise en peinture uniquement de l'existant", 1, "u", 0, 0, 93.75],
        ["1.1", "Remise commerciale peinture du bar existant", 1, "u", 0, 0, 93.75],
        ["1.1.2", "Peinture - nombre d'heures", 1, "h", 0, 0, 75],
        ["1.1.3", "Logistique - heures", 1, "h", 0, 0, 18.75],
      ];
      const forced = parseDevisProgbatFromMatrix(rows, { filename: "D-202604-2141-ui-regression.xlsx" });
      const obj = forced.objetsCandidats.find((o) => o.numero === "1.1");

      expect(obj).toBeDefined();
      expect(obj!.heures.peinture).toBe(75);
      expect(obj!.heures.manutention).toBe(18.75);
      expect(obj!.totalHeures).toBeCloseTo(93.75, 2);
    });
  });

  /* ====================================================================== */
  /* Cross-check intégrité 4 sections                                       */
  /* ====================================================================== */
  it("Cross-check Section 1 OK : déclaré=148.5h, calculé=148.5h", () => {
    const sec1 = r.integrityChecks.find((c) => c.sectionNumero === "1")!;
    expect(sec1.heuresDeclarees).toBe(148.5);
    expect(sec1.heuresCalculees).toBeCloseTo(148.5, 2);
    expect(sec1.severite).toBe("ok");
  });

  it("Cross-check toutes sections OK (1, 2, 3, 4)", () => {
    expect(r.integrityChecks).toHaveLength(4);
    for (const c of r.integrityChecks) {
      expect(c.severite, `Section ${c.sectionNumero}`).toBe("ok");
    }
  });

  it("Total cumulé sections = 579.26h (cible Gabin) à 0.05h près", () => {
    const total = r.integrityChecks.reduce((acc, c) => acc + c.heuresCalculees, 0);
    expect(total).toBeCloseTo(579.26, 1);
  });

  /* ====================================================================== */
  /* Mapping 100% auto : aucun poste orphelin "à mapper manuellement"      */
  /* ====================================================================== */
  it("100% mapping auto : aucun poste orphelin sur les 7 objets", () => {
    const orphans: string[] = [];
    for (const o of r.objetsCandidats) {
      for (const p of o.postes) {
        const isMat = p.isMatiereOverride ?? p.isMatiere;
        const mapped = p.isRegul || isMat || (p.metier != null && p.heuresUnitaires > 0);
        if (!mapped) orphans.push(`${o.numero}/${p.numero} : ${p.designation.slice(0, 50)}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it("Aucun warning bloquant", () => {
    expect(r.warnings).toEqual([]);
  });

  it("Régul 4.2 (0.97€) : 0h en heures, total HT préservé", () => {
    const obj4 = r.objetsCandidats.find((o) => o.numero === "4")!;
    const regul = obj4.postes.find((p) => p.numero === "4.2");
    expect(regul).toBeDefined();
    expect(regul!.isRegul).toBe(true);
    expect(regul!.totalHt).toBeCloseTo(0.97, 2);
  });
});
