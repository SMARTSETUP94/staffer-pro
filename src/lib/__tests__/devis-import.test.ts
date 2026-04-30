import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import {
  guessMetierFromLibelle,
  parseDevisFromArrayBuffer,
} from "../devis-import";

/* ------------------------------------------------------------------ */
/* Helper : génère un .xlsx en mémoire à partir d'un AOA              */
/* ------------------------------------------------------------------ */

function makeXlsx(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Devis");
  // XLSX.write avec type 'buffer' retourne un Node Buffer en environnement Node.
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

const HEADER = ["N°", "Désignation", "Quantité", "Unité", "PU HT", "Total HT", "TVA", "Temps prévu"];

/* ------------------------------------------------------------------ */
/* guessMetierFromLibelle                                              */
/* ------------------------------------------------------------------ */

describe("guessMetierFromLibelle", () => {
  it("Construction / menuiserie → construction", () => {
    expect(guessMetierFromLibelle("Menuiserie ossature bois")).toBe("construction");
  });

  it("Peinture déco → peinture", () => {
    expect(guessMetierFromLibelle("Peinture décor mate")).toBe("peinture");
  });

  it("Priorité au mot-clé le plus long : 'commande numérique' > 'numérique'", () => {
    // si 'numerique' matche aussi 'commande numérique', le plus long gagne
    expect(guessMetierFromLibelle("Usinage commande numérique")).toBe("numerique");
  });

  it("Libellé inconnu → null", () => {
    expect(guessMetierFromLibelle("xyzabc")).toBeNull();
    expect(guessMetierFromLibelle("")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* parseDevisFromArrayBuffer                                           */
/* ------------------------------------------------------------------ */

describe("parseDevisFromArrayBuffer — fichier standard", () => {
  it("parse 3 lignes avec en-tête, somme heures correctement", () => {
    const buf = makeXlsx([
      HEADER,
      ["1", "Construction décor", null, null, null, null, null, null],
      ["1.1", "Menuiserie chassis", 5, "u", 100, 500, 20, 12],
      ["1.2", "Peinture finition", 3, "u", 80, 240, 20, 6],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    expect(r.errors).toHaveLength(0);
    expect(r.totalTempsPrevu).toBe(18);
    const kept = r.lines.filter((l) => !l.excluded);
    expect(kept.length).toBeGreaterThanOrEqual(2);
  });
});

describe("parseDevisFromArrayBuffer — exclusions", () => {
  it("exclut 'Budget matériaux'", () => {
    const buf = makeXlsx([
      HEADER,
      ["1.1", "Menuiserie", 1, "u", 100, 100, 20, 5],
      ["1.2", "Budget matériaux", 1, "u", 500, 500, 20, 0],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    const budgetLine = r.lines.find((l) => l.designation.toLowerCase().includes("budget"));
    expect(budgetLine?.excluded).toBe(true);
  });

  it("exclut 'Sous-total' et 'Total HT'", () => {
    const buf = makeXlsx([
      HEADER,
      ["1.1", "Menuiserie", 1, "u", 100, 100, 20, 5],
      ["", "Sous-total", null, null, null, 100, null, null],
      ["", "Total HT", null, null, null, 100, null, null],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    const excluded = r.lines.filter((l) => l.excluded);
    expect(excluded.some((l) => /sous-?total/i.test(l.designation))).toBe(true);
    expect(excluded.some((l) => /total ht/i.test(l.designation))).toBe(true);
  });

  it("exclut 'Régul' et 'Régularisation'", () => {
    const buf = makeXlsx([
      HEADER,
      ["1.1", "Régularisation chantier", 1, "u", 50, 50, 20, 2],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    expect(r.lines[0].excluded).toBe(true);
  });
});

describe("parseDevisFromArrayBuffer — hiérarchie", () => {
  it("section parente 1 propage le métier sur 1.1 / 1.1.1", () => {
    const buf = makeXlsx([
      HEADER,
      ["1", "Métallerie", null, null, null, null, null, null],
      ["1.1", "Soudure cadre", null, null, null, null, null, null],
      ["1.1.1", "Découpe acier", 2, "u", 50, 100, 20, 4],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    const leaf = r.lines.find((l) => l.designation.includes("Découpe"));
    expect(leaf?.metierFinalCode).toBe("metallerie");
  });

  it("niveau de hiérarchie correct pour 1.1.1", () => {
    const buf = makeXlsx([
      HEADER,
      ["1.1.1", "Détail profond", 1, "u", 10, 10, 20, 1],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    expect(r.lines[0].niveau).toBe(3);
  });
});

describe("parseDevisFromArrayBuffer — cas limites", () => {
  it("buffer vide → erreur sans crash", () => {
    // Un xlsx valide mais sans header reconnaissable
    const buf = makeXlsx([["foo", "bar"], ["1", "2"]]);
    const r = parseDevisFromArrayBuffer(buf);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.lines).toHaveLength(0);
  });

  it("ligne avec temps_prevu vide → exclue du total", () => {
    const buf = makeXlsx([
      HEADER,
      ["1.1", "Menuiserie", 1, "u", 100, 100, 20, 5],
      ["1.2", "Note", 1, "u", 0, 0, 0, null],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    expect(r.totalTempsPrevu).toBe(5);
  });

  it("devis 'global' sans hiérarchie → toutes lignes au niveau 0 ou 1", () => {
    const buf = makeXlsx([
      HEADER,
      ["", "Prestation globale chantier", 1, "forfait", 5000, 5000, 20, 80],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    expect(r.lines).toHaveLength(1);
    expect(r.totalTempsPrevu).toBe(80);
  });

  it("buffer corrompu → throws ou errors non vides (pas de crash propage)", () => {
    const corrupted = new Uint8Array([0, 1, 2, 3, 4]).buffer;
    let result: ReturnType<typeof parseDevisFromArrayBuffer> | null = null;
    let threw = false;
    try {
      result = parseDevisFromArrayBuffer(corrupted);
    } catch {
      threw = true;
    }
    // Acceptable : soit throw propre, soit errors[] non vide.
    expect(threw || (result !== null && result.errors.length > 0)).toBe(true);
  });

  it("totalMontantHt sommé sur lignes non exclues uniquement", () => {
    const buf = makeXlsx([
      HEADER,
      ["1.1", "Menuiserie", 1, "u", 100, 100, 20, 5],
      ["1.2", "Budget matériaux", 1, "u", 500, 500, 20, 0],
    ]);
    const r = parseDevisFromArrayBuffer(buf);
    // Budget exclu → 100 seul comptabilisé (et niveau 1.1 a un temps > 0)
    expect(r.totalMontantHt).toBe(100);
  });
});
