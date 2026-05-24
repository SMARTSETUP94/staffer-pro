/**
 * Lot 8.2c — Tests pour `computeEcart` (helper écart heures réel vs prévu).
 *
 * Règles tranchées (voir docs/lot-8.2c-analyse.md §Correction 2) :
 *   prevu = 0, reel = 0   → "—" / muted
 *   prevu = 0, reel > 0   → "+Xh non prévues" / warning
 *   prevu > 0, reel = 0   → "Non démarré" / muted
 *   prevu > 0, reel > 0   → pct = (reel - prevu) / prevu * 100
 *     |pct| ≤ 5             → success
 *     -25 < pct < -5        → info (sous-conso modérée)
 *     pct ≤ -25             → warning (sous-conso forte = peut-être pas fini)
 *     5  < pct ≤ 15         → warning (léger dépassement)
 *     pct > 15              → destructive
 */
import { describe, it, expect } from "vitest";
import { computeEcart } from "../objet-heures-helpers";

describe("computeEcart — Lot 8.2c", () => {
  it("prevu=0 reel=0 → muted '—'", () => {
    const r = computeEcart(0, 0);
    expect(r).toEqual({ display: "—", tone: "muted" });
  });

  it("prevu=0 reel>0 → warning '+Xh non prévues'", () => {
    expect(computeEcart(0, 3)).toEqual({
      display: "+3.0h non prévues",
      tone: "warning",
    });
    expect(computeEcart(0, 12.5)).toEqual({
      display: "+13h non prévues",
      tone: "warning",
    });
  });

  it("prevu>0 reel=0 → muted 'Non démarré'", () => {
    expect(computeEcart(8, 0)).toEqual({ display: "Non démarré", tone: "muted" });
  });

  it("on-target |pct| ≤ 5 → success", () => {
    // 8.4 / 8 → pct = +5% (inclusif)
    expect(computeEcart(8, 8.4).tone).toBe("success");
    // 7.6 / 8 → pct = -5% (inclusif)
    expect(computeEcart(8, 7.6).tone).toBe("success");
    // 8 / 8 → +0.0%
    expect(computeEcart(8, 8)).toEqual({ display: "+0.0%", tone: "success" });
  });

  it("sous-conso modérée (-25 < pct < -5) → info", () => {
    // 7 / 10 = -30% → warning (pas info)
    // 8 / 10 = -20% → info
    expect(computeEcart(10, 8).tone).toBe("info");
    // 7.5 / 10 = -25% → warning (limite incluse côté warning)
    expect(computeEcart(10, 7.5).tone).toBe("warning");
  });

  it("sous-conso forte pct ≤ -25 → warning", () => {
    expect(computeEcart(10, 5).tone).toBe("warning");
    expect(computeEcart(10, 1).tone).toBe("warning");
  });

  it("dépassement léger (5 < pct ≤ 15) → warning", () => {
    // 9 / 8 → +12.5%
    expect(computeEcart(8, 9).tone).toBe("warning");
    // 9.2 / 8 → +15%
    expect(computeEcart(8, 9.2).tone).toBe("warning");
  });

  it("dépassement fort pct > 15 → destructive", () => {
    // 10 / 8 = +25%
    expect(computeEcart(8, 10).tone).toBe("destructive");
    expect(computeEcart(10, 20).tone).toBe("destructive");
  });

  it("formatage : 1 décimale si |pct| < 10, sinon 0", () => {
    expect(computeEcart(100, 105).display).toBe("+5.0%");
    expect(computeEcart(100, 95).display).toBe("-5.0%");
    expect(computeEcart(100, 120).display).toBe("+20%");
    expect(computeEcart(100, 75).display).toBe("-25%");
  });

  it("nombres invalides (NaN, null cast) traités comme 0", () => {
    expect(computeEcart(NaN as unknown as number, 0)).toEqual({
      display: "—",
      tone: "muted",
    });
  });
});
