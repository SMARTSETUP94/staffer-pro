/**
 * Tests unitaires du parser Excel/CSV opportunités CRM (v0.18, Bloc 5).
 * Cas couverts : ligne valide, ligne sans code, code déjà existant
 * (le test simule juste la sortie parser ; l'UPSERT est testé séparément),
 * colonne manquante, taille invalide.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseOpportunitesFile } from "../opportunites-import";

function makeXlsx(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CRM");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

const HEADER_FULL = ["code", "client", "nom", "taille", "statut", "date", "ca", "commentaires"];

describe("parseOpportunitesFile — ligne valide", () => {
  it("parse une ligne complète sans erreur", () => {
    const buf = makeXlsx([
      HEADER_FULL,
      ["9123", "Hermès", "Vitrines été", "moyen", "envoye", "15/06/2026", "ca@setup.paris", "Urgent"],
    ]);
    const { rows, parseErrors } = parseOpportunitesFile(buf);
    expect(parseErrors).toEqual([]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.errors).toEqual([]);
    expect(r.parsed.numero).toBe("9123");
    expect(r.parsed.client).toBe("Hermès");
    expect(r.parsed.nom).toBe("Vitrines été");
    expect(r.parsed.taille).toBe("moyen");
    expect(r.parsed.statut).toBe("envoye");
    expect(r.parsed.date_opportunite).toBe("2026-06-15");
    expect(r.parsed.charge_affaires_email).toBe("ca@setup.paris");
    expect(r.parsed.commentaires).toBe("Urgent");
  });

  it("accepte un code 9XXX intégré dans une chaîne plus longue", () => {
    const buf = makeXlsx([HEADER_FULL, ["OPP-9456-2026", "LVMH", "", "gros", "a_faire", "", "", ""]]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows[0].parsed.numero).toBe("9456");
  });
});

describe("parseOpportunitesFile — ligne sans code", () => {
  it("renvoie une erreur 'Numéro 9XXX manquant ou invalide'", () => {
    const buf = makeXlsx([HEADER_FULL, ["", "Chanel", "Pop-up Marais", "petit", "a_faire", "", "", ""]]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toContain("Numéro 9XXX manquant ou invalide");
    expect(rows[0].parsed.numero).toBeNull();
  });

  it("renvoie aussi l'erreur si le code est dans la mauvaise plage (ex: 8XXX)", () => {
    const buf = makeXlsx([HEADER_FULL, ["8123", "Chanel", "X", "petit", "a_faire", "", "", ""]]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows[0].errors).toContain("Numéro 9XXX manquant ou invalide");
  });
});

describe("parseOpportunitesFile — code existant (simulation)", () => {
  it("le parser ne sait pas si le code existe déjà, il se contente d'extraire — c'est l'UPSERT qui décide", () => {
    // Le parser est volontairement déconnecté de la base : il extrait, c'est tout.
    // L'existence d'un 9XXX est résolue côté UI via une requête `affaires.in('numero', ...)`.
    const buf = makeXlsx([HEADER_FULL, ["9001", "Dior", "Reprise", "moyen", "gagne", "", "", ""]]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].parsed.numero).toBe("9001");
    expect(rows[0].parsed.statut).toBe("gagne");
  });
});

describe("parseOpportunitesFile — colonne manquante", () => {
  it("signale l'absence de la colonne 'code' au niveau parseErrors", () => {
    const buf = makeXlsx([
      ["client", "nom", "taille"],
      ["Hermès", "Vitrines", "moyen"],
    ]);
    const { parseErrors } = parseOpportunitesFile(buf);
    expect(parseErrors.some((e) => e.includes("'code'"))).toBe(true);
  });

  it("signale l'absence de la colonne 'client'", () => {
    const buf = makeXlsx([
      ["code", "nom"],
      ["9001", "Vitrines"],
    ]);
    const { parseErrors } = parseOpportunitesFile(buf);
    expect(parseErrors.some((e) => e.includes("'client'"))).toBe(true);
  });

  it("la ligne donne quand même 'Client manquant' en erreur de ligne", () => {
    const buf = makeXlsx([
      ["code", "nom"],
      ["9001", "Vitrines"],
    ]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows[0].errors).toContain("Client manquant");
  });
});

describe("parseOpportunitesFile — taille invalide", () => {
  it("renvoie un warning et taille=null si la taille n'est pas reconnue", () => {
    const buf = makeXlsx([HEADER_FULL, ["9001", "Dior", "X", "ENORME", "a_faire", "", "", ""]]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows[0].parsed.taille).toBeNull();
    expect(rows[0].warnings.some((w) => w.includes("Taille non reconnue"))).toBe(true);
    // Pas d'erreur bloquante : la taille reste optionnelle
    expect(rows[0].errors).toEqual([]);
  });

  it("accepte les alias courants (XS, P, M, L, XL)", () => {
    const buf = makeXlsx([
      HEADER_FULL,
      ["9001", "A", "", "XS", "a_faire", "", "", ""],
      ["9002", "B", "", "P", "a_faire", "", "", ""],
      ["9003", "C", "", "M", "a_faire", "", "", ""],
      ["9004", "D", "", "L", "a_faire", "", "", ""],
      ["9005", "E", "", "XL", "a_faire", "", "", ""],
    ]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows.map((r) => r.parsed.taille)).toEqual([
      "tres_petit",
      "petit",
      "moyen",
      "gros",
      "tres_gros",
    ]);
  });
});

describe("parseOpportunitesFile — statut", () => {
  it("default = a_faire si vide ou inconnu", () => {
    const buf = makeXlsx([
      HEADER_FULL,
      ["9001", "A", "", "", "", "", "", ""],
      ["9002", "B", "", "", "WHATEVER", "", "", ""],
    ]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows[0].parsed.statut).toBe("a_faire");
    expect(rows[1].parsed.statut).toBe("a_faire");
  });

  it("reconnaît les alias FR (gagnée, signe, perdue, terminée)", () => {
    const buf = makeXlsx([
      HEADER_FULL,
      ["9001", "A", "", "", "gagnée", "", "", ""],
      ["9002", "B", "", "", "perdue", "", "", ""],
      ["9003", "C", "", "", "terminée", "", "", ""],
    ]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows.map((r) => r.parsed.statut)).toEqual(["gagne", "perdu", "termine"]);
  });
});

describe("parseOpportunitesFile — robustesse", () => {
  it("ignore les lignes complètement vides", () => {
    const buf = makeXlsx([
      HEADER_FULL,
      ["9001", "A", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["9002", "B", "", "", "", "", "", ""],
    ]);
    const { rows } = parseOpportunitesFile(buf);
    expect(rows).toHaveLength(2);
  });

  it("renvoie une erreur claire si fichier vide", () => {
    const buf = makeXlsx([HEADER_FULL]);
    const { parseErrors, rows } = parseOpportunitesFile(buf);
    expect(rows).toHaveLength(0);
    expect(parseErrors[0]).toMatch(/vide/i);
  });
});
