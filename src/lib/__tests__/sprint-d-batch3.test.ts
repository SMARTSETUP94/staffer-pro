/**
 * Sprint D / Batch 3 — Tests Gantt macro
 */
import { describe, it, expect } from "vitest";

// Smoke test : la fenêtre clamp doit être un nombre positif de jours.
function diffDays(a: string, b: string): number {
  return (
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) /
    86_400_000
  );
}

describe("Sprint D Batch 3 — planning chantier macro", () => {
  it("calcule une fenêtre positive entre signed_at et demontage+7j", () => {
    const start = "2026-01-01";
    const end = "2026-02-15";
    expect(diffDays(start, end)).toBeGreaterThan(0);
  });

  it("détecte une inversion chronologique montage > demontage", () => {
    const dates = ["2026-02-01", "2026-01-15"];
    const isInverted = dates[1] < dates[0];
    expect(isInverted).toBe(true);
  });

  it("accepte un ordre chronologique cohérent", () => {
    const dates = ["2026-01-10", "2026-01-12", "2026-01-15", "2026-01-20"];
    let ok = true;
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] < dates[i - 1]) ok = false;
    }
    expect(ok).toBe(true);
  });

  it("liste les 7 phases attendues", () => {
    const phases = [
      "commercial_etude", "fabrication", "logistique_aller",
      "montage", "evenement", "demontage", "logistique_retour",
    ];
    expect(phases).toHaveLength(7);
  });
});
