/**
 * Tests d'intégration end-to-end du parser devis sur les 6 vrais fichiers Excel
 * fournis par Setup Paris (avril 2026).
 *
 * Objectifs :
 * 1. Garantir qu'aucune régression du parser ne change silencieusement le total
 *    d'heures importées d'un devis réel (les valeurs sont figées en baseline).
 * 2. S'assurer qu'aucun fichier ne génère d'erreurs de parsing.
 * 3. S'assurer que toutes les lignes non exclues ont un métier mappé
 *    (heuristique 100 % couvrante sur ces 6 devis).
 *
 * Pour mettre à jour la baseline après une amélioration volontaire du parser :
 *   1. Lancer `npx tsx /tmp/measure-fixtures.mjs` (script de mesure).
 *   2. Reporter les valeurs ici.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDevisFromArrayBuffer } from "../devis-import";
import type { MetierCode } from "../employes-import";

const FIXTURES_DIR = resolve(__dirname, "fixtures");

function loadFixture(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(FIXTURES_DIR, `${name}.xlsx`));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

interface Baseline {
  numeroDevis: string;
  totalLines: number;
  importedLines: number;
  totalTempsPrevu: number;
  totalMontantHt: number;
  byMetier: Partial<Record<MetierCode, number>>;
}

const BASELINES: Record<string, Baseline> = {
  "D-202604-2121": {
    numeroDevis: "D-202604-2121",
    totalLines: 49,
    importedLines: 20,
    totalTempsPrevu: 460,
    totalMontantHt: 27037,
    byMetier: {
      construction: 112,
      numerique: 18,
      metallerie: 66,
      peinture: 34,
      suivi_projet: 114,
      logistique: 20,
      machiniste: 96,
    },
  },
  "D-202604-2125": {
    numeroDevis: "D-202604-2125",
    totalLines: 22,
    importedLines: 8,
    totalTempsPrevu: 220,
    totalMontantHt: 11765,
    byMetier: {
      construction: 56,
      metallerie: 8,
      peinture: 72,
      numerique: 4,
      suivi_projet: 24,
      machiniste: 56,
    },
  },
  // Devis "global" sans ventilation détaillée (cas particulier mentionné lors de l'audit).
  "D-202604-2132": {
    numeroDevis: "D-202604-2132",
    totalLines: 13,
    importedLines: 4,
    totalTempsPrevu: 204,
    totalMontantHt: 15057.64,
    byMetier: {
      machiniste: 24,
      logistique: 180,
    },
  },
  "D-202604-2135": {
    numeroDevis: "D-202604-2135",
    totalLines: 26,
    importedLines: 13,
    totalTempsPrevu: 307,
    totalMontantHt: 20108,
    byMetier: {
      suivi_projet: 53,
      construction: 104,
      metallerie: 16,
      peinture: 76,
      numerique: 26,
      machiniste: 32,
    },
  },
  // Petit devis : seulement 1 poste importable.
  "D-202604-2136": {
    numeroDevis: "D-202604-2136",
    totalLines: 19,
    importedLines: 1,
    totalTempsPrevu: 14,
    totalMontantHt: 642.25,
    byMetier: { metallerie: 14 },
  },
  // Plus gros devis (~1819h, structure 1.1.1 avec exclusion de parents).
  "D-202604-2137": {
    numeroDevis: "D-202604-2137",
    totalLines: 42,
    importedLines: 24,
    totalTempsPrevu: 1819,
    totalMontantHt: 100314.5,
    byMetier: {
      suivi_projet: 308,
      construction: 338,
      metallerie: 160,
      peinture: 600,
      numerique: 85,
      logistique: 108,
      machiniste: 220,
    },
  },
};

describe("devis-import — fixtures réelles Setup Paris (6 devis)", () => {
  for (const [filename, baseline] of Object.entries(BASELINES)) {
    describe(filename, () => {
      const ab = loadFixture(filename);
      const result = parseDevisFromArrayBuffer(ab, { filename: `${filename}.xlsx` });

      it("ne génère aucune erreur de parsing", () => {
        expect(result.errors).toEqual([]);
      });

      it("détecte le numéro de devis", () => {
        expect(result.meta.numeroDevis).toBe(baseline.numeroDevis);
      });

      it("trouve le bon nombre total de lignes", () => {
        expect(result.lines.length).toBe(baseline.totalLines);
      });

      it("a le bon nombre de lignes importables (non exclues)", () => {
        const imported = result.lines.filter((l) => !l.excluded).length;
        expect(imported).toBe(baseline.importedLines);
      });

      it("totalise le bon nombre d'heures prévues", () => {
        expect(result.totalTempsPrevu).toBe(baseline.totalTempsPrevu);
      });

      it("totalise le bon montant HT (à 0,01 € près)", () => {
        expect(result.totalMontantHt).toBeCloseTo(baseline.totalMontantHt, 2);
      });

      it("ventile correctement les heures par métier", () => {
        const actual: Partial<Record<MetierCode, number>> = {};
        for (const l of result.lines) {
          if (l.excluded || !l.tempsPrevu || !l.metierFinalCode) continue;
          actual[l.metierFinalCode] = (actual[l.metierFinalCode] ?? 0) + l.tempsPrevu;
        }
        expect(actual).toEqual(baseline.byMetier);
      });

      it("mappe un métier sur 100 % des lignes importables", () => {
        const unmapped = result.lines.filter((l) => !l.excluded && !l.metierFinalCode);
        expect(unmapped).toEqual([]);
      });

      it("ne contient aucune ligne d'exclusion (Budget/Régul/Sous-total) parmi les importables", () => {
        const importedLibelles = result.lines
          .filter((l) => !l.excluded)
          .map((l) => l.designation.toLowerCase());
        for (const banned of ["budget matériaux", "régul", "sous-total", "total ht"]) {
          expect(importedLibelles.some((d) => d.includes(banned))).toBe(false);
        }
      });
    });
  }

  it("la somme cumulée des 6 devis correspond à la somme des baselines", () => {
    let actualTotal = 0;
    let baselineTotal = 0;
    for (const [filename, baseline] of Object.entries(BASELINES)) {
      const ab = loadFixture(filename);
      const r = parseDevisFromArrayBuffer(ab, { filename: `${filename}.xlsx` });
      actualTotal += r.totalTempsPrevu;
      baselineTotal += baseline.totalTempsPrevu;
    }
    expect(actualTotal).toBe(baselineTotal);
    expect(actualTotal).toBe(3024); // 460+220+204+307+14+1819
  });
});
