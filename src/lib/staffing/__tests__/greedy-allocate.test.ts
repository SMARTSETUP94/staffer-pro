import { describe, it, expect } from "vitest";
import {
  greedyAllocate,
  sortByTier,
  summarizeAllocation,
  type Person,
  type Availability,
  type CapacityByDay,
} from "../greedy-allocate";

const days = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"];

function cap(perDay: number): CapacityByDay {
  return { cibleByDay: new Map(days.map((d) => [d, perDay])) };
}
function noAbsence(): Availability {
  return { absentByPerson: new Map() };
}

describe("greedyAllocate", () => {
  it("respecte la capacité quotidienne (ne dépasse jamais cible)", () => {
    const persons: Person[] = [
      { id: "P1" }, { id: "P2" }, { id: "P3" }, { id: "P4" }, { id: "P5" },
    ];
    const r = greedyAllocate(persons, days, cap(2), noAbsence());
    // 5 jours × 2 cible = 10 assignations
    expect(r.assignments).toHaveLength(10);
    // Aucun jour > 2
    const byDay = new Map<string, number>();
    for (const a of r.assignments) byDay.set(a.date, (byDay.get(a.date) ?? 0) + 1);
    for (const [, n] of byDay) expect(n).toBeLessThanOrEqual(2);
    // P1 et P2 utilisés tous les jours, P3-P5 inutilisés
    expect(r.unusedPersonIds.sort()).toEqual(["P3", "P4", "P5"]);
  });

  it("rotation vers P+1 si P courant absent", () => {
    const persons: Person[] = [{ id: "P1" }, { id: "P2" }, { id: "P3" }];
    const av: Availability = {
      absentByPerson: new Map([["P1", new Set(["2026-05-05", "2026-05-06"])]]),
    };
    const r = greedyAllocate(persons, days, cap(1), av);
    expect(r.assignments).toHaveLength(5);
    // 04 → P1, 05 → P2, 06 → P2, 07 → P1, 08 → P1
    const byDate = new Map(r.assignments.map((a) => [a.date, a.personId]));
    expect(byDate.get("2026-05-04")).toBe("P1");
    expect(byDate.get("2026-05-05")).toBe("P2");
    expect(byDate.get("2026-05-06")).toBe("P2");
    expect(byDate.get("2026-05-07")).toBe("P1");
  });

  it("shortfall tracké quand pas assez de personnes dispo", () => {
    const persons: Person[] = [{ id: "P1" }];
    const av: Availability = {
      absentByPerson: new Map([["P1", new Set(["2026-05-05"])]]),
    };
    const r = greedyAllocate(persons, days, cap(2), av);
    // Cible = 2 pers/j, on n'a qu'1 personne → shortfall 1 chaque jour, +2 le 05
    expect(r.shortfallByDay.get("2026-05-04")).toBe(1);
    expect(r.shortfallByDay.get("2026-05-05")).toBe(2);
  });

  it("sortByTier classe P1<P2<P3<P4 stable", () => {
    const ps: Person[] = [
      { id: "a", tier: 3 },
      { id: "b", tier: 1 },
      { id: "c", tier: 2 },
      { id: "d", tier: 1 },
      { id: "e" }, // undefined → 4
    ];
    const sorted = sortByTier(ps);
    expect(sorted.map((p) => p.id)).toEqual(["b", "d", "c", "a", "e"]);
  });

  it("summarizeAllocation renvoie X/Y et pct", () => {
    const persons: Person[] = [{ id: "P1" }, { id: "P2" }];
    const r = greedyAllocate(persons, days, cap(2), noAbsence());
    const s = summarizeAllocation(r, cap(2));
    expect(s.allocated).toBe(10);
    expect(s.target).toBe(10);
    expect(s.pct).toBe(100);
  });
});
