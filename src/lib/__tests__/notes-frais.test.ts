import { describe, it, expect } from "vitest";
import { computeHtTva, filterNotesByStatus } from "@/lib/notes-frais";

describe("notes de frais — filtres de statut", () => {
  const rows = [
    { id: "pending", statut: "en_attente" },
    { id: "approved", statut: "validee" },
    { id: "paid", statut: "remboursee" },
    { id: "rejected", statut: "rejetee" },
  ];
  it("En attente ne conserve que les notes en attente", () => {
    expect(filterNotesByStatus(rows, "en_attente").map((r) => r.id)).toEqual(["pending"]);
  });
  it("Validées ne conserve que les notes validées", () => {
    expect(filterNotesByStatus(rows, "validee").map((r) => r.id)).toEqual(["approved"]);
  });
  it("Remboursées ne conserve que les notes remboursées", () => {
    expect(filterNotesByStatus(rows, "remboursee").map((r) => r.id)).toEqual(["paid"]);
  });
  it("sans filtre, toutes les notes restent accessibles, y compris rejetées", () => {
    expect(filterNotesByStatus(rows, null).map((r) => r.id)).toEqual(["pending", "approved", "paid", "rejected"]);
  });
  it("un statut sans résultat renvoie une liste vide", () => {
    expect(filterNotesByStatus([rows[0]], "remboursee")).toEqual([]);
  });
});

describe("notes de frais — calcul HT/TVA", () => {
  it("TVA 20 % sur 120 € TTC → 100 € HT, 20 € TVA", () => {
    expect(computeHtTva(120, 20)).toEqual({ ht: 100, tva: 20 });
  });
  it("TVA 10 % sur 55 € TTC → 50 € HT, 5 € TVA", () => {
    expect(computeHtTva(55, 10)).toEqual({ ht: 50, tva: 5 });
  });
  it("TVA 0 % → HT = TTC", () => {
    expect(computeHtTva(42.5, 0)).toEqual({ ht: 42.5, tva: 0 });
  });
});
