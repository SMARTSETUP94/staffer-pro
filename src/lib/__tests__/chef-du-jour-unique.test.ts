/**
 * v0.21.1 Phase 3 — Tests logique unicité chef du jour
 *
 * Tests purs qui décrivent l'invariant : 1 seul est_chef_jour=true par
 * (affaire_id, date, demi_journee). Renforcé en DB par le UNIQUE INDEX
 * partiel `assignations_chef_jour_unique` + le trigger
 * `enforce_unique_chef_jour`.
 */
import { describe, expect, it } from "vitest";

interface Assignation {
  affaire_id: string;
  date: string;
  demi_journee: "AM" | "PM";
  est_chef_jour: boolean;
  id: string;
}

/**
 * Simule le comportement attendu côté DB : si on insère une nouvelle ligne
 * avec est_chef_jour=true, le précédent chef du même slot perd son flag
 * (trigger), puis le UNIQUE INDEX garantit qu'un seul actif subsiste.
 */
function applyChefJourInvariant(
  rows: Assignation[],
  newRow: Assignation,
): Assignation[] {
  if (!newRow.est_chef_jour) {
    return [...rows.filter((r) => r.id !== newRow.id), newRow];
  }
  const downgraded = rows.map((r) =>
    r.affaire_id === newRow.affaire_id &&
    r.date === newRow.date &&
    r.demi_journee === newRow.demi_journee &&
    r.id !== newRow.id &&
    r.est_chef_jour
      ? { ...r, est_chef_jour: false }
      : r,
  );
  return [...downgraded.filter((r) => r.id !== newRow.id), newRow];
}

function activeChefsForSlot(
  rows: Assignation[],
  affaire_id: string,
  date: string,
  demi_journee: "AM" | "PM",
): Assignation[] {
  return rows.filter(
    (r) =>
      r.affaire_id === affaire_id &&
      r.date === date &&
      r.demi_journee === demi_journee &&
      r.est_chef_jour,
  );
}

describe("Chef du jour — invariant unicité", () => {
  const base = { affaire_id: "A1", date: "2026-05-10", demi_journee: "AM" as const };

  it("première désignation : 1 chef actif", () => {
    const rows: Assignation[] = [];
    const next = applyChefJourInvariant(rows, {
      ...base,
      est_chef_jour: true,
      id: "x1",
    });
    expect(activeChefsForSlot(next, base.affaire_id, base.date, base.demi_journee)).toHaveLength(1);
  });

  it("seconde désignation concurrente : ancien démissionne, 1 seul reste", () => {
    let rows: Assignation[] = [];
    rows = applyChefJourInvariant(rows, { ...base, est_chef_jour: true, id: "x1" });
    rows = applyChefJourInvariant(rows, { ...base, est_chef_jour: true, id: "x2" });
    const actifs = activeChefsForSlot(rows, base.affaire_id, base.date, base.demi_journee);
    expect(actifs).toHaveLength(1);
    expect(actifs[0].id).toBe("x2");
  });

  it("désignations sur slots différents (AM/PM) coexistent", () => {
    let rows: Assignation[] = [];
    rows = applyChefJourInvariant(rows, { ...base, demi_journee: "AM", est_chef_jour: true, id: "x1" });
    rows = applyChefJourInvariant(rows, { ...base, demi_journee: "PM", est_chef_jour: true, id: "x2" });
    expect(activeChefsForSlot(rows, base.affaire_id, base.date, "AM")).toHaveLength(1);
    expect(activeChefsForSlot(rows, base.affaire_id, base.date, "PM")).toHaveLength(1);
  });

  it("désignations sur dates différentes coexistent", () => {
    let rows: Assignation[] = [];
    rows = applyChefJourInvariant(rows, { ...base, date: "2026-05-10", est_chef_jour: true, id: "x1" });
    rows = applyChefJourInvariant(rows, { ...base, date: "2026-05-11", est_chef_jour: true, id: "x2" });
    expect(activeChefsForSlot(rows, base.affaire_id, "2026-05-10", "AM")).toHaveLength(1);
    expect(activeChefsForSlot(rows, base.affaire_id, "2026-05-11", "AM")).toHaveLength(1);
  });

  it("retrait du flag : 0 chef actif", () => {
    let rows: Assignation[] = [];
    rows = applyChefJourInvariant(rows, { ...base, est_chef_jour: true, id: "x1" });
    rows = applyChefJourInvariant(rows, { ...base, est_chef_jour: false, id: "x1" });
    expect(activeChefsForSlot(rows, base.affaire_id, base.date, base.demi_journee)).toHaveLength(0);
  });
});
