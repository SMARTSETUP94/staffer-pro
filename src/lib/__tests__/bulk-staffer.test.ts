import { describe, it, expect } from "vitest";
import {
  computeBulkPreview,
  plannedToCreate,
  slotConflict,
  type ExistingAssignation,
} from "../bulk-staffer";

describe("slotConflict", () => {
  it("aucun existant → pas de conflit", () => {
    expect(slotConflict(new Set(), "JOURNEE")).toBe(false);
    expect(slotConflict(new Set(), "AM")).toBe(false);
  });

  it("JOURNEE existante bloque tout", () => {
    expect(slotConflict(new Set(["JOURNEE"]), "AM")).toBe(true);
    expect(slotConflict(new Set(["JOURNEE"]), "PM")).toBe(true);
    expect(slotConflict(new Set(["JOURNEE"]), "JOURNEE")).toBe(true);
  });

  it("JOURNEE entrante bloquée par n'importe quoi", () => {
    expect(slotConflict(new Set(["AM"]), "JOURNEE")).toBe(true);
    expect(slotConflict(new Set(["PM"]), "JOURNEE")).toBe(true);
  });

  it("AM ne bloque pas PM et inversement", () => {
    expect(slotConflict(new Set(["AM"]), "PM")).toBe(false);
    expect(slotConflict(new Set(["PM"]), "AM")).toBe(false);
  });

  it("même demi-journée → conflit", () => {
    expect(slotConflict(new Set(["AM"]), "AM")).toBe(true);
    expect(slotConflict(new Set(["PM"]), "PM")).toBe(true);
  });
});

describe("computeBulkPreview", () => {
  const e1 = "emp-1";
  const e2 = "emp-2";
  const lundi = "2026-04-27";
  const mardi = "2026-04-28";
  const mercredi = "2026-04-29";

  it("aucun existant : toutes les cellules à créer", () => {
    const items = computeBulkPreview({
      employeIds: [e1, e2],
      dates: [lundi, mardi],
      slot: "JOURNEE",
      existing: [],
    });
    expect(items).toHaveLength(4);
    expect(items.every((i) => !i.skipped)).toBe(true);
  });

  it("skip cellule où JOURNEE déjà prise", () => {
    const existing: ExistingAssignation[] = [
      { employe_id: e1, date: lundi, demi_journee: "JOURNEE" },
    ];
    const items = computeBulkPreview({
      employeIds: [e1, e2],
      dates: [lundi, mardi],
      slot: "JOURNEE",
      existing,
    });
    const e1lundi = items.find((i) => i.employe_id === e1 && i.date === lundi)!;
    expect(e1lundi.skipped).toBe(true);
    expect(e1lundi.skipReason).toContain("Journée");
    expect(items.filter((i) => !i.skipped)).toHaveLength(3);
  });

  it("AM existant + nouveau AM → skip ; nouveau PM → OK", () => {
    const existing: ExistingAssignation[] = [
      { employe_id: e1, date: lundi, demi_journee: "AM" },
    ];
    const skipAm = computeBulkPreview({
      employeIds: [e1],
      dates: [lundi],
      slot: "AM",
      existing,
    });
    expect(skipAm[0].skipped).toBe(true);

    const okPm = computeBulkPreview({
      employeIds: [e1],
      dates: [lundi],
      slot: "PM",
      existing,
    });
    expect(okPm[0].skipped).toBe(false);
  });

  it("AM existant + nouveau JOURNEE → skip", () => {
    const items = computeBulkPreview({
      employeIds: [e1],
      dates: [lundi],
      slot: "JOURNEE",
      existing: [{ employe_id: e1, date: lundi, demi_journee: "AM" }],
    });
    expect(items[0].skipped).toBe(true);
  });

  it("dédupe les cellules (employé × date) — pas de double", () => {
    const items = computeBulkPreview({
      employeIds: [e1, e1],
      dates: [lundi, lundi],
      slot: "JOURNEE",
      existing: [],
    });
    expect(items).toHaveLength(1);
  });

  it("scénario réel : 3 menuisiers, lundi-mardi-mercredi, journée, 1 collision", () => {
    const m1 = "menu-1";
    const m2 = "menu-2";
    const m3 = "menu-3";
    const existing: ExistingAssignation[] = [
      { employe_id: m2, date: mardi, demi_journee: "JOURNEE" },
    ];
    const items = computeBulkPreview({
      employeIds: [m1, m2, m3],
      dates: [lundi, mardi, mercredi],
      slot: "JOURNEE",
      existing,
    });
    expect(items).toHaveLength(9);
    expect(items.filter((i) => i.skipped)).toHaveLength(1);
    expect(plannedToCreate(items)).toHaveLength(8);
  });

  it("plannedToCreate ne contient que les non-skippés et garde la forme attendue", () => {
    const items = computeBulkPreview({
      employeIds: [e1],
      dates: [lundi, mardi],
      slot: "AM",
      existing: [{ employe_id: e1, date: lundi, demi_journee: "AM" }],
    });
    const planned = plannedToCreate(items);
    expect(planned).toEqual([
      { employe_id: e1, date: mardi, demi_journee: "AM" },
    ]);
  });
});
