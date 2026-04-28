import { describe, it, expect } from "vitest";
import { buildParChantierPayloads, autoPickDevisLot } from "../parchantier-edit";
import type { Assignation, DevisLot } from "@/hooks/use-planning-data";

const baseAssign = (override: Partial<Assignation>): Assignation => ({
  id: "x",
  date: "2026-04-27",
  demi_journee: "JOURNEE",
  heures: 8,
  affaire_id: "AFF1",
  employe_id: "E1",
  metier_id: 1,
  devis_id: null,
  notes: null,
  statut_confirmation: "non_requise",
  ...override,
});

describe("buildParChantierPayloads", () => {
  it("E2E clic cellule vide : crée 1 assignation pré-remplie", () => {
    const res = buildParChantierPayloads({
      affaireId: "AFF1",
      metierId: 5,
      devisId: "DEV1",
      slot: "JOURNEE",
      employeIds: ["E1"],
      dates: ["2026-04-27"],
      existing: [],
    });
    expect(res.payloads).toHaveLength(1);
    expect(res.skipped).toBe(0);
    expect(res.payloads[0]).toMatchObject({
      employe_id: "E1",
      affaire_id: "AFF1",
      metier_id: 5,
      devis_id: "DEV1",
      date: "2026-04-27",
      demi_journee: "JOURNEE",
      heures: 8,
    });
  });

  it("E2E Ctrl+clic multi : N employés × M jours → N*M payloads", () => {
    const res = buildParChantierPayloads({
      affaireId: "AFF1",
      metierId: 5,
      devisId: null,
      slot: "JOURNEE",
      employeIds: ["E1", "E2", "E3"],
      dates: ["2026-04-27", "2026-04-28"],
      existing: [],
    });
    expect(res.payloads).toHaveLength(6);
    expect(res.skipped).toBe(0);
  });

  it("skip cellules occupées sans bloquer les autres", () => {
    const res = buildParChantierPayloads({
      affaireId: "AFF1",
      metierId: 5,
      devisId: null,
      slot: "JOURNEE",
      employeIds: ["E1", "E2"],
      dates: ["2026-04-27", "2026-04-28"],
      existing: [baseAssign({ employe_id: "E1", date: "2026-04-27", demi_journee: "JOURNEE" })],
    });
    expect(res.payloads).toHaveLength(3);
    expect(res.skipped).toBe(1);
    expect(res.payloads.find((p) => p.employe_id === "E1" && p.date === "2026-04-27")).toBeUndefined();
  });

  it("AM ne crée pas de conflit avec PM existant", () => {
    const res = buildParChantierPayloads({
      affaireId: "AFF1",
      metierId: 5,
      devisId: null,
      slot: "AM",
      employeIds: ["E1"],
      dates: ["2026-04-27"],
      existing: [baseAssign({ employe_id: "E1", demi_journee: "PM", heures: 4 })],
    });
    expect(res.payloads).toHaveLength(1);
    expect(res.skipped).toBe(0);
  });
});

describe("autoPickDevisLot", () => {
  const lot = (id: string, affaire_id: string, statut: DevisLot["statut"] = "signe"): DevisLot => ({
    id, affaire_id, numero: id, libelle: null, statut,
    date_debut_phase: null, date_fin_phase: null, livre_le: null,
  });

  it("retourne le lot quand il n'y en a qu'un seul actif", () => {
    expect(autoPickDevisLot("A1", [lot("L1", "A1")])).toBe("L1");
  });

  it("retourne null si plusieurs lots actifs", () => {
    expect(autoPickDevisLot("A1", [lot("L1", "A1"), lot("L2", "A1")])).toBeNull();
  });

  it("ignore les lots clôturés", () => {
    expect(
      autoPickDevisLot("A1", [lot("L1", "A1", "termine"), lot("L2", "A1")]),
    ).toBe("L2");
  });

  it("retourne null si aucun lot", () => {
    expect(autoPickDevisLot("A1", [])).toBeNull();
  });
});
