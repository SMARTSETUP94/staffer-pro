import { describe, it, expect } from "vitest";
import {
  isAffaireActiveForCount,
  countActiveAffairesByTypologie,
  type AffaireForTypoCount,
} from "@/lib/typologie-active-counts";

const NOW = new Date("2026-04-30T10:00:00Z");

describe("isAffaireActiveForCount", () => {
  it("statut en_cours sans démontage = actif", () => {
    expect(isAffaireActiveForCount({ numero: "5042", statut: "en_cours" }, NOW)).toBe(true);
  });

  it("statut prospect = actif", () => {
    expect(isAffaireActiveForCount({ numero: "5042", statut: "prospect" }, NOW)).toBe(true);
  });

  it("statut termine = inactif", () => {
    expect(isAffaireActiveForCount({ numero: "5042", statut: "termine" }, NOW)).toBe(false);
  });

  it("statut annule = inactif", () => {
    expect(isAffaireActiveForCount({ numero: "5042", statut: "annule" }, NOW)).toBe(false);
  });

  it("date_demontage future = actif", () => {
    expect(
      isAffaireActiveForCount(
        { numero: "5042", statut: "en_cours", date_demontage: "2026-05-15" },
        NOW,
      ),
    ).toBe(true);
  });

  it("date_demontage = aujourd'hui = actif", () => {
    expect(
      isAffaireActiveForCount(
        { numero: "5042", statut: "en_cours", date_demontage: "2026-04-30" },
        NOW,
      ),
    ).toBe(true);
  });

  it("date_demontage passée = inactif", () => {
    expect(
      isAffaireActiveForCount(
        { numero: "5042", statut: "en_cours", date_demontage: "2026-04-29" },
        NOW,
      ),
    ).toBe(false);
  });

  it("date_demontage null = actif (chantier sans démontage planifié)", () => {
    expect(
      isAffaireActiveForCount(
        { numero: "5042", statut: "en_cours", date_demontage: null },
        NOW,
      ),
    ).toBe(true);
  });
});

describe("countActiveAffairesByTypologie", () => {
  const affaires: AffaireForTypoCount[] = [
    { numero: "5042", statut: "en_cours", date_demontage: null }, // fabrication actif
    { numero: "5043", statut: "en_cours", date_demontage: "2026-05-10" }, // fabrication actif (futur)
    { numero: "5099", statut: "termine", date_demontage: null }, // exclu
    { numero: "4001", statut: "en_cours", date_demontage: "2026-04-29" }, // exclu (passé)
    { numero: "4002", statut: "en_cours", date_demontage: "2026-05-01" }, // M/D actif
    { numero: "1001", statut: "prospect", date_demontage: null }, // non_op actif
    { numero: "20005", statut: "en_cours", date_demontage: null }, // stockage actif
    { numero: "9001", statut: "en_cours", date_demontage: null }, // prototype actif
    { numero: "9002", statut: "annule", date_demontage: null }, // exclu
  ];

  it("compte uniquement les affaires actives par typologie", () => {
    const counts = countActiveAffairesByTypologie(affaires, NOW);
    expect(counts.fabrication).toBe(2);
    expect(counts.montage_demontage).toBe(1);
    expect(counts.non_operationnel).toBe(1);
    expect(counts.stockage).toBe(1);
    expect(counts.prototype).toBe(1);
  });

  it("liste vide → counts vides", () => {
    expect(countActiveAffairesByTypologie([], NOW)).toEqual({});
  });

  it("toutes terminées → counts vides", () => {
    const all: AffaireForTypoCount[] = [
      { numero: "5042", statut: "termine" },
      { numero: "4001", statut: "annule" },
    ];
    expect(countActiveAffairesByTypologie(all, NOW)).toEqual({});
  });
});
