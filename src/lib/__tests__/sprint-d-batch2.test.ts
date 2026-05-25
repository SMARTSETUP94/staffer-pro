/**
 * Sprint D / Batch 2 — Tests Vitest.
 * Vérifie : enum PHASE_ENUM accepte 'logistique' / FAB_SOUS_ETAPES couvre
 * les 7 métiers fab / helpers opt-in alertes.
 */
import { describe, expect, it } from "vitest";
import {
  FAB_SOUS_ETAPES,
  getSousEtapeKey,
  getSousEtapeForMetier,
} from "@/lib/fab-sous-etapes";
import {
  ALERTE_CODES,
  toOptinMap,
  type AlerteOptinRow,
} from "@/lib/affaire-alertes-optin";
import { PHASE_ENUM } from "@/lib/equipe-mutations-schemas";

describe("Sprint D Batch 2 — phases & sous-étapes", () => {
  it("PHASE_ENUM accepte les 5 phases dont logistique", () => {
    for (const p of [
      "commercial_etude",
      "fabrication",
      "logistique",
      "montage",
      "demontage",
    ]) {
      expect(PHASE_ENUM.safeParse(p).success).toBe(true);
    }
    expect(PHASE_ENUM.safeParse("inconnu").success).toBe(false);
  });

  it("FAB_SOUS_ETAPES couvre 3 sous-étapes avec métiers uniques", () => {
    expect(FAB_SOUS_ETAPES.map((s) => s.key)).toEqual([
      "numerique",
      "construction",
      "finition",
    ]);
    const all = FAB_SOUS_ETAPES.flatMap((s) => s.metierIds);
    // Aucun doublon
    expect(new Set(all).size).toBe(all.length);
  });

  it("getSousEtapeForMetier mappe correctement", () => {
    expect(getSousEtapeKey(4)).toBe("numerique"); // numérique
    expect(getSousEtapeKey(1)).toBe("construction"); // bois
    expect(getSousEtapeKey(2)).toBe("construction"); // métal
    expect(getSousEtapeKey(3)).toBe("finition"); // peinture
    expect(getSousEtapeKey(8)).toBe("numerique"); // BE
    expect(getSousEtapeForMetier(999)).toBeUndefined();
  });
});

describe("Sprint D Batch 2 — opt-in alertes", () => {
  it("ALERTE_CODES contient les 4 codes attendus", () => {
    expect(ALERTE_CODES).toEqual(["sous_dim", "depassement", "cumul_100", "hors_equipe"]);
  });

  it("toOptinMap retombe par défaut sur false", () => {
    const map = toOptinMap([]);
    for (const c of ALERTE_CODES) expect(map[c]).toBe(false);
  });

  it("toOptinMap applique active=true depuis rows", () => {
    const rows: AlerteOptinRow[] = [
      { id: "1", affaire_id: "a", alerte_code: "sous_dim", active: true },
      { id: "2", affaire_id: "a", alerte_code: "depassement", active: false },
    ];
    const map = toOptinMap(rows);
    expect(map.sous_dim).toBe(true);
    expect(map.depassement).toBe(false);
    expect(map.cumul_100).toBe(false);
    expect(map.hors_equipe).toBe(false);
  });
});
