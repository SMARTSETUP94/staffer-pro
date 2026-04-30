import { describe, it, expect } from "vitest";
import {
  prefixForTypologie,
  codeLengthForTypologie,
  codeRegexForTypologie,
  placeholderForTypologie,
  isValidCodeForTypologie,
  isSignableTypologie,
  codePrefixMismatch,
} from "@/lib/typologie-future";

describe("typologie-future helpers", () => {
  describe("prefixForTypologie", () => {
    it("non_operationnel → 1", () => expect(prefixForTypologie("non_operationnel")).toBe(1));
    it("montage_demontage → 4", () => expect(prefixForTypologie("montage_demontage")).toBe(4));
    it("fabrication → 5", () => expect(prefixForTypologie("fabrication")).toBe(5));
    it("stockage → 2", () => expect(prefixForTypologie("stockage")).toBe(2));
    it("prototype → 9", () => expect(prefixForTypologie("prototype")).toBe(9));
    it("null → 5 (default fabrication)", () => expect(prefixForTypologie(null)).toBe(5));
    it("undefined → 5 (default fabrication)", () => expect(prefixForTypologie(undefined)).toBe(5));
  });

  describe("codeLengthForTypologie", () => {
    it("stockage = 5 chiffres", () => expect(codeLengthForTypologie("stockage")).toBe(5));
    it("fabrication = 4 chiffres", () => expect(codeLengthForTypologie("fabrication")).toBe(4));
    it("non_operationnel = 4 chiffres", () => expect(codeLengthForTypologie("non_operationnel")).toBe(4));
    it("null = 4 chiffres (default)", () => expect(codeLengthForTypologie(null)).toBe(4));
  });

  describe("codeRegexForTypologie", () => {
    it("fabrication match 5XXX", () => {
      const r = codeRegexForTypologie("fabrication");
      expect(r.test("5000")).toBe(true);
      expect(r.test("5999")).toBe(true);
      expect(r.test("4000")).toBe(false);
      expect(r.test("50000")).toBe(false);
    });
    it("stockage match 2XXXX (5 chiffres)", () => {
      const r = codeRegexForTypologie("stockage");
      expect(r.test("20000")).toBe(true);
      expect(r.test("29999")).toBe(true);
      expect(r.test("2000")).toBe(false);
      expect(r.test("3000")).toBe(false);
    });
    it("montage_demontage match 4XXX", () => {
      const r = codeRegexForTypologie("montage_demontage");
      expect(r.test("4042")).toBe(true);
      expect(r.test("5042")).toBe(false);
    });
  });

  describe("placeholderForTypologie", () => {
    it("fabrication → 5XXX", () => expect(placeholderForTypologie("fabrication")).toBe("5XXX"));
    it("stockage → 2XXXX", () => expect(placeholderForTypologie("stockage")).toBe("2XXXX"));
    it("non_operationnel → 1XXX", () => expect(placeholderForTypologie("non_operationnel")).toBe("1XXX"));
    it("null → 5XXX (default)", () => expect(placeholderForTypologie(null)).toBe("5XXX"));
  });

  describe("isValidCodeForTypologie", () => {
    it("5042 valide pour fabrication", () => expect(isValidCodeForTypologie("5042", "fabrication")).toBe(true));
    it("4042 invalide pour fabrication", () => expect(isValidCodeForTypologie("4042", "fabrication")).toBe(false));
    it("trim leading/trailing spaces", () => expect(isValidCodeForTypologie("  5042 ", "fabrication")).toBe(true));
    it("vide invalide", () => expect(isValidCodeForTypologie("", "fabrication")).toBe(false));
    it("20001 valide pour stockage", () => expect(isValidCodeForTypologie("20001", "stockage")).toBe(true));
  });

  describe("isSignableTypologie", () => {
    it("prototype non signable", () => expect(isSignableTypologie("prototype")).toBe(false));
    it("fabrication signable", () => expect(isSignableTypologie("fabrication")).toBe(true));
    it("null signable (default)", () => expect(isSignableTypologie(null)).toBe(true));
  });

  describe("codePrefixMismatch", () => {
    it("4042 + fabrication = mismatch", () => expect(codePrefixMismatch("4042", "fabrication")).toBe(true));
    it("5042 + fabrication = OK", () => expect(codePrefixMismatch("5042", "fabrication")).toBe(false));
    it("vide = pas de mismatch (rien à comparer)", () => expect(codePrefixMismatch("", "fabrication")).toBe(false));
    it("typo null = pas de mismatch (pas de référence)", () => expect(codePrefixMismatch("4042", null)).toBe(false));
    it("20001 + stockage = OK (préfixe 2)", () => expect(codePrefixMismatch("20001", "stockage")).toBe(false));
  });
});
