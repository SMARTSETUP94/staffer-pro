/**
 * Bloc 9 Lot 9.4 — tests helpers carte mission pose.
 */
import { describe, expect, it } from "vitest";
import {
  autoTagCategoryByMissionState,
  computeHeuresFromEvents,
  type MissionEventLite,
} from "@/lib/mission-card-helpers";

describe("computeHeuresFromEvents", () => {
  it("déduit 8h00 → 17h00 = 9h sur le bon jour", () => {
    const events: MissionEventLite[] = [
      { type: "arrivee", occurred_at: "2026-06-01T08:00:00.000Z" },
      { type: "depart", occurred_at: "2026-06-01T17:00:00.000Z" },
      { type: "photo", occurred_at: "2026-06-01T10:00:00.000Z" },
    ];
    const res = computeHeuresFromEvents(events, "2026-06-01");
    expect(res).not.toBeNull();
    expect(res!.heures_reelles).toBe(9);
    expect(res!.heure_debut).toMatch(/^\d{2}:00$/);
    expect(res!.heure_fin).toMatch(/^\d{2}:00$/);
  });

  it("retourne null si pas d'arrivée ou si départ avant arrivée", () => {
    expect(computeHeuresFromEvents([], "2026-06-01")).toBeNull();
    expect(
      computeHeuresFromEvents(
        [
          { type: "arrivee", occurred_at: "2026-06-01T17:00:00.000Z" },
          { type: "depart", occurred_at: "2026-06-01T08:00:00.000Z" },
        ],
        "2026-06-01",
      ),
    ).toBeNull();
  });
});

describe("autoTagCategoryByMissionState", () => {
  it("priorité absolue à incident si problème ouvert", () => {
    expect(
      autoTagCategoryByMissionState("montage", {
        hasArrivee: true,
        hasDepart: false,
        problemeOpen: true,
      }),
    ).toBe("incident");
  });

  it("tague selon l'état (avant / pendant / après) et la phase", () => {
    expect(
      autoTagCategoryByMissionState("montage", {
        hasArrivee: false,
        hasDepart: false,
        problemeOpen: false,
      }),
    ).toBe("avant_montage");
    expect(
      autoTagCategoryByMissionState("montage", {
        hasArrivee: true,
        hasDepart: false,
        problemeOpen: false,
      }),
    ).toBe("pendant_montage");
    expect(
      autoTagCategoryByMissionState("demontage", {
        hasArrivee: true,
        hasDepart: true,
        problemeOpen: false,
      }),
    ).toBe("apres_demontage");
  });
});
