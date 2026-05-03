// v0.36 ALPHA — tests unitaires pré-paramétrage métier
// Couvre les cas critiques 1, 2, 9, 10, 11, 14 du plan d'acceptance v0.36.

import { describe, it, expect } from "vitest";
import {
  autoSuggestMetierConfig,
  computeMetierWindows,
  validateBeOverride,
  bottleneckMetier,
  PIPELINE_FACTOR,
} from "../pre-parametrage";
import { holidaysRange } from "../date-utils";

const TODAY = "2026-05-04"; // lundi
const DEADLINE_HERMES = "2026-05-22"; // vendredi (fenêtre Hermès D-202604-2141)

describe("autoSuggestMetierConfig — Hermès D-202604-2141", () => {
  const totals = { BE: 32.1, Num: 16.2, Bois: 86.1, Peint: 371.7, Tap: 0, Manut: 65.1 };
  const result = autoSuggestMetierConfig(totals, TODAY, DEADLINE_HERMES);

  it("[1] BE 32h → 1 pers, 4j, cap_reached=true", () => {
    const be = result.configs.find((c) => c.metier_code === "BE")!;
    expect(be.nb_pers_cible).toBe(1);
    expect(be.duree_cible_j).toBe(4);
    expect(be.cap_reached).toBe(true);
  });

  it("Num 16h → 1 pers, 2j, cap_reached=true", () => {
    const num = result.configs.find((c) => c.metier_code === "Num")!;
    expect(num.nb_pers_cible).toBe(1);
    expect(num.duree_cible_j).toBe(2);
    expect(num.cap_reached).toBe(true);
  });

  it("Bois 86h → 3 pers, ~3.6j", () => {
    const bois = result.configs.find((c) => c.metier_code === "Bois")!;
    expect(bois.nb_pers_cible).toBe(3);
    expect(bois.duree_cible_j).toBeCloseTo(3.6, 1);
  });

  it("[2] Peint 372h → 6 pers, 7.75j, cap_reached=true", () => {
    const peint = result.configs.find((c) => c.metier_code === "Peint")!;
    expect(peint.nb_pers_cible).toBe(6);
    expect(peint.duree_cible_j).toBeCloseTo(7.75, 2);
    expect(peint.cap_reached).toBe(true);
  });

  it("Manut 65h → 5 pers, cap_reached=true", () => {
    const manut = result.configs.find((c) => c.metier_code === "Manut")!;
    expect(manut.nb_pers_cible).toBe(5);
    expect(manut.cap_reached).toBe(true);
    expect(manut.duree_cible_j).toBeLessThanOrEqual(2);
  });

  it("Tap 0h → pas de config", () => {
    expect(result.configs.find((c) => c.metier_code === "Tap")).toBeUndefined();
  });

  it("[14] Jours fériés FR exclus de la fenêtre (8/05 + Ascension 14/05)", () => {
    // 4 mai → 22 mai : 19 jours calendaires, 15 lun-ven, fériés 8/5 et 14/5 exclus → 13
    expect(result.fenetre_dispo).toBe(13);
  });

  it("Pipeline duration = sum durées × PIPELINE_FACTOR", () => {
    const sum = result.configs.reduce((s, c) => s + c.duree_cible_j, 0);
    expect(result.pipeline_duration).toBeCloseTo(sum * PIPELINE_FACTOR, 5);
  });

  it("WINDOW_INFEASIBLE détecté avec leviers (BE_OVERRIDE, INCREASE_RESOURCES, POSTPONE_DEADLINE)", () => {
    const conflict = result.conflicts.find((c) => c.type === "WINDOW_INFEASIBLE");
    if (result.pipeline_duration > result.fenetre_dispo) {
      expect(conflict).toBeDefined();
      expect(conflict!.severity).toBe("HARD");
      expect(conflict!.levers?.map((l) => l.action)).toEqual(
        expect.arrayContaining(["BE_OVERRIDE", "INCREASE_RESOURCES", "POSTPONE_DEADLINE"]),
      );
    }
  });
});

describe("autoSuggestMetierConfig — cas limites", () => {
  it("Totaux vides → aucune config, pas de conflit", () => {
    const r = autoSuggestMetierConfig({}, TODAY, DEADLINE_HERMES);
    expect(r.configs).toEqual([]);
    expect(r.conflicts).toEqual([]);
  });

  it("Fenêtre très large → pas de WINDOW_INFEASIBLE", () => {
    const r = autoSuggestMetierConfig(
      { BE: 32, Num: 16, Bois: 86, Peint: 372, Tap: 0, Manut: 65 },
      "2026-01-05",
      "2026-12-31",
    );
    expect(r.conflicts.find((c) => c.type === "WINDOW_INFEASIBLE")).toBeUndefined();
  });

  it("Fenêtre trop étroite → conflit HARD avec delta_days > 0", () => {
    const r = autoSuggestMetierConfig({ BE: 200, Bois: 200, Peint: 400 }, TODAY, "2026-05-08");
    const c = r.conflicts.find((c) => c.type === "WINDOW_INFEASIBLE");
    expect(c).toBeDefined();
    expect(c!.delta_days).toBeGreaterThan(0);
  });

  it("bottleneckMetier identifie le métier le plus contraint cap_reached", () => {
    const r = autoSuggestMetierConfig({ BE: 32, Peint: 372, Manut: 65 }, TODAY, DEADLINE_HERMES);
    const b = bottleneckMetier(r.configs);
    // Peint 6 pers × 7.75j = 46.5 — devrait être bottleneck
    expect(b).toBe("Peint");
  });
});

describe("validateBeOverride", () => {
  it("[10] Override OK avec raison ≥10 chars", () => {
    expect(
      validateBeOverride({ be_override: true, override_reason: "Pic projet, 2 BE en parallèle requis" }),
    ).toBeNull();
  });

  it("[11] Override sans raison → OVERRIDE_REASON_REQUIRED", () => {
    const err = validateBeOverride({ be_override: true, override_reason: "" });
    expect(err?.type).toBe("OVERRIDE_REASON_REQUIRED");
    expect(err?.severity).toBe("HARD");
  });

  it("Override avec raison < 10 chars → erreur", () => {
    const err = validateBeOverride({ be_override: true, override_reason: "court" });
    expect(err?.type).toBe("OVERRIDE_REASON_REQUIRED");
  });

  it("Pas d'override → pas d'erreur", () => {
    expect(validateBeOverride({ be_override: false })).toBeNull();
  });
});

describe("computeMetierWindows — pipeline objet", () => {
  it("[3] Fenêtres dans l'ordre BE→Num→Bois→Peint→Tap→Manut, fin = deadline", () => {
    const r = autoSuggestMetierConfig(
      { BE: 32, Num: 16, Bois: 86, Peint: 372, Manut: 65 },
      TODAY,
      DEADLINE_HERMES,
    );
    const { windows } = computeMetierWindows(r.configs, TODAY, DEADLINE_HERMES);
    const codes = windows.map((w) => w.metier_code);
    expect(codes).toEqual(["BE", "Num", "Bois", "Peint", "Manut"]);
    // Le dernier métier finit à la deadline
    expect(windows[windows.length - 1].fenetre_end).toBe(DEADLINE_HERMES);
    // Chaque fenêtre amont commence avant la fin de la suivante (chevauchement pipeline)
    for (let i = 0; i < windows.length - 1; i++) {
      expect(windows[i].fenetre_start <= windows[i + 1].fenetre_end).toBe(true);
    }
  });

  it("[4] Conflit fenêtre détecté si start < today", () => {
    const r = autoSuggestMetierConfig(
      { BE: 200, Num: 200, Bois: 200, Peint: 800, Manut: 200 },
      TODAY,
      "2026-05-06", // 2 jours
    );
    const { conflicts } = computeMetierWindows(r.configs, TODAY, "2026-05-06");
    expect(conflicts.find((c) => c.type === "WINDOW_INFEASIBLE")).toBeDefined();
  });
});

describe("Jours fériés FR 2026 (sanity check)", () => {
  it("8 mai (V1945), 14 mai (Ascension), 25 mai (Pentecôte) sont fériés", () => {
    const h = holidaysRange(2026, 2026);
    expect(h.has("2026-05-08")).toBe(true);
    expect(h.has("2026-05-14")).toBe(true);
    expect(h.has("2026-05-25")).toBe(true);
  });
});
