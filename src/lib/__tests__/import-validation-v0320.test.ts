/**
 * v0.32.0 — Tests de la lib partagée import-validation.
 */
import { describe, expect, it } from "vitest";
import {
  countIssues,
  exceptionToIssue,
  findDuplicates,
  hasBlocking,
  indexIssuesByCell,
  issuesToCsv,
  legacyStringsToIssues,
  makeIssue,
  parseExcelDate,
  parseExcelNumber,
  validateDate,
  validateDateRange,
  validateHeaders,
  validateNumber,
  validateTotalsMatch,
} from "@/lib/import-validation";

describe("parseExcelNumber", () => {
  it("parse number, FR string, EN string, espaces insécables", () => {
    expect(parseExcelNumber(42)).toBe(42);
    expect(parseExcelNumber("1234.56")).toBe(1234.56);
    expect(parseExcelNumber("1 234,56")).toBe(1234.56);
    expect(parseExcelNumber("1\u00a0234")).toBe(1234);
  });
  it("retourne null sur vide / invalide", () => {
    expect(parseExcelNumber("")).toBeNull();
    expect(parseExcelNumber(null)).toBeNull();
    expect(parseExcelNumber("abc")).toBeNull();
    expect(parseExcelNumber(NaN)).toBeNull();
  });
});

describe("validateNumber", () => {
  const ctx = { rowIndex: 5, column: "D", field: "Quantité" };
  it("passe si valide", () => {
    expect(validateNumber(42, ctx).issue).toBeUndefined();
  });
  it("INVALID_NUMBER si parse échoue", () => {
    const r = validateNumber("abc", ctx);
    expect(r.issue?.code).toBe("INVALID_NUMBER");
    expect(r.issue?.rowIndex).toBe(5);
  });
  it("REQUIRED_FIELD_MISSING si vide + required", () => {
    expect(validateNumber("", { ...ctx, required: true }).issue?.code).toBe("REQUIRED_FIELD_MISSING");
  });
  it("OUT_OF_BOUNDS si min/max dépassé", () => {
    expect(validateNumber(-1, { ...ctx, min: 0 }).issue?.code).toBe("OUT_OF_BOUNDS");
    expect(validateNumber(200, { ...ctx, max: 100 }).issue?.code).toBe("OUT_OF_BOUNDS");
  });
});

describe("parseExcelDate / validateDate", () => {
  it("parse formats variés", () => {
    expect(parseExcelDate("2026-04-30")).toBe("2026-04-30");
    expect(parseExcelDate("30/04/2026")).toBe("2026-04-30");
    expect(parseExcelDate(new Date(2026, 3, 30))).toBe("2026-04-30");
    expect(parseExcelDate(45777)).toMatch(/^2025-/);
  });
  it("retourne null sur invalide", () => {
    expect(parseExcelDate("pas une date")).toBeNull();
    expect(parseExcelDate("32/13/2026")).toBeNull();
  });
  it("validateDate produit INVALID_DATE", () => {
    const r = validateDate("plouf", { rowIndex: 3, column: "G", field: "Date" });
    expect(r.issue?.code).toBe("INVALID_DATE");
  });
});

describe("validateDateRange", () => {
  it("warning si fin < debut", () => {
    const r = validateDateRange("2026-05-01", "2026-04-01", {
      rowIndex: 2,
      fieldDebut: "Début",
      fieldFin: "Fin",
    });
    expect(r?.severity).toBe("warning");
    expect(r?.code).toBe("DATE_RANGE_INCOHERENT");
  });
  it("OK si cohérent", () => {
    expect(
      validateDateRange("2026-04-01", "2026-05-01", {
        rowIndex: 2,
        fieldDebut: "D",
        fieldFin: "F",
      }),
    ).toBeNull();
  });
});

describe("validateHeaders", () => {
  it("détecte colonnes manquantes (insensible casse/accents)", () => {
    const issues = validateHeaders(["Numero", "Désignation"], ["Numéro", "Désignation", "Quantité"]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.column).toBe("Quantité");
    expect(issues[0]!.code).toBe("MISSING_HEADER");
  });
});

describe("validateTotalsMatch", () => {
  it("warning si écart > tolérance", () => {
    const r = validateTotalsMatch(100, 105, { field: "HT", tolerance: 1 });
    expect(r?.code).toBe("TOTAL_MISMATCH");
  });
  it("null si dans tolérance", () => {
    expect(validateTotalsMatch(100, 100.5, { field: "HT" })).toBeNull();
  });
});

describe("findDuplicates", () => {
  it("trouve les clés dupliquées", () => {
    const rows = [{ ref: "A" }, { ref: "B" }, { ref: "A" }, { ref: "C" }, { ref: "B" }];
    const issues = findDuplicates(rows, (r) => r.ref, { field: "Référence" });
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.code === "DUPLICATE_KEY")).toBe(true);
  });
});

describe("countIssues / hasBlocking / indexIssuesByCell", () => {
  const issues = [
    makeIssue({ code: "INVALID_NUMBER", message: "x", rowIndex: 1, column: "A" }),
    makeIssue({ code: "TOTAL_MISMATCH", severity: "warning", message: "y" }),
    makeIssue({ code: "INVALID_NUMBER", message: "z", rowIndex: 1, column: "A" }),
  ];
  it("compte par sévérité", () => {
    const c = countIssues(issues);
    expect(c).toEqual({ errors: 2, warnings: 1, infos: 0, total: 3 });
  });
  it("hasBlocking true si error présente", () => {
    expect(hasBlocking(issues)).toBe(true);
    expect(hasBlocking([issues[1]!])).toBe(false);
  });
  it("indexe par cellule", () => {
    const idx = indexIssuesByCell(issues);
    expect(idx.get("1|A")).toHaveLength(2);
  });
});

describe("issuesToCsv", () => {
  it("génère un CSV avec BOM, échappement et en-tête", () => {
    const csv = issuesToCsv([
      makeIssue({ code: "INVALID_NUMBER", message: "msg avec ; séparateur", rowIndex: 2, column: "D", value: "abc" }),
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Severite;Code;Ligne;Colonne;Valeur lue;Message");
    expect(csv).toContain('"msg avec ; séparateur"');
  });
});

describe("exceptionToIssue / legacyStringsToIssues", () => {
  it("exception → PARSE_FAILED lisible", () => {
    const i = exceptionToIssue(new Error("boom"));
    expect(i.code).toBe("PARSE_FAILED");
    expect(i.message).toContain("boom");
  });
  it("strings legacy → warnings par défaut", () => {
    const arr = legacyStringsToIssues(["a", "b"]);
    expect(arr).toHaveLength(2);
    expect(arr.every((i) => i.severity === "warning")).toBe(true);
  });
});
