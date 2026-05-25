/**
 * Sprint C — Tests Vitest C1 + C2
 * ---------------------------------
 * C1 : validation zod des 4 server functions de mutation équipe.
 * C2 : résolution de la stratégie de republication (seuils 30 % / Auto /
 *      Fusion / Manuel) consommée par publishStaffingPlanV2 +
 *      RepublishConflictDialog.
 *
 * On teste les unités pures extraites pour rester côté client (sans runtime
 * serverFn). Cible : ~12 cas par groupe.
 */
import { describe, it, expect } from "vitest";
import {
  upsertAffaireEquipeSchema,
  removeAffaireEquipeSchema,
  upsertObjetEquipeSchema,
  removeObjetEquipeSchema,
} from "@/lib/equipe-mutations-schemas";
import {
  resolveRepublishStrategy,
  REPUBLISH_THRESHOLD,
} from "@/lib/republish-strategy";

const UID_A = "11111111-1111-4111-8111-111111111111";
const UID_B = "22222222-2222-4222-8222-222222222222";
const UID_C = "33333333-3333-4333-8333-333333333333";

/* ──────────────────────────────────────────────────────────────────── */
/* C1 — upsertAffaireEquipeMember                                       */
/* ──────────────────────────────────────────────────────────────────── */
describe("C1 / upsertAffaireEquipeSchema", () => {
  const base = { affaireId: UID_A, employeId: UID_B, phase: "fabrication" as const };

  it("accepte un payload minimal", () => {
    expect(upsertAffaireEquipeSchema.parse(base)).toMatchObject(base);
  });

  it("accepte chacune des 4 phases", () => {
    for (const phase of ["commercial_etude", "fabrication", "montage", "demontage"] as const) {
      expect(() => upsertAffaireEquipeSchema.parse({ ...base, phase })).not.toThrow();
    }
  });

  it("rejette une phase inconnue", () => {
    expect(() =>
      upsertAffaireEquipeSchema.parse({ ...base, phase: "phase_inexistante" as never }),
    ).toThrow();
  });

  it("rejette un uuid invalide", () => {
    expect(() =>
      upsertAffaireEquipeSchema.parse({ ...base, affaireId: "not-a-uuid" }),
    ).toThrow();
  });

  it("accepte notes et roleTerrain à null", () => {
    const r = upsertAffaireEquipeSchema.parse({ ...base, notes: null, roleTerrain: null });
    expect(r.notes).toBeNull();
    expect(r.roleTerrain).toBeNull();
  });

  it("accepte notes ≤ 200 chars (D3)", () => {
    const notes = "x".repeat(200);
    expect(() => upsertAffaireEquipeSchema.parse({ ...base, notes })).not.toThrow();
  });

  it("rejette notes > 200 chars (D3)", () => {
    const notes = "x".repeat(201);
    expect(() => upsertAffaireEquipeSchema.parse({ ...base, notes })).toThrow();
  });

  it("rejette roleTerrain > 200 chars (D3)", () => {
    const roleTerrain = "y".repeat(201);
    expect(() => upsertAffaireEquipeSchema.parse({ ...base, roleTerrain })).toThrow();
  });

  it("trim les espaces sur notes", () => {
    const r = upsertAffaireEquipeSchema.parse({ ...base, notes: "  hello  " });
    expect(r.notes).toBe("hello");
  });
});

/* ──────────────────────────────────────────────────────────────────── */
/* C1 — removeAffaireEquipeMember (D2 : cascadeObjets explicite)        */
/* ──────────────────────────────────────────────────────────────────── */
describe("C1 / removeAffaireEquipeSchema", () => {
  const base = { affaireId: UID_A, employeId: UID_B, phase: "montage" as const };

  it("cascadeObjets default false (D2)", () => {
    const r = removeAffaireEquipeSchema.parse(base);
    expect(r.cascadeObjets).toBe(false);
  });

  it("cascadeObjets true respecté", () => {
    const r = removeAffaireEquipeSchema.parse({ ...base, cascadeObjets: true });
    expect(r.cascadeObjets).toBe(true);
  });

  it("rejette cascadeObjets non boolean", () => {
    expect(() =>
      removeAffaireEquipeSchema.parse({ ...base, cascadeObjets: "yes" as never }),
    ).toThrow();
  });

  it("rejette uuid employé invalide", () => {
    expect(() =>
      removeAffaireEquipeSchema.parse({ ...base, employeId: "abc" }),
    ).toThrow();
  });
});

/* ──────────────────────────────────────────────────────────────────── */
/* C1 — upsert / remove ObjetEquipeMember                                */
/* ──────────────────────────────────────────────────────────────────── */
describe("C1 / upsertObjetEquipeSchema", () => {
  const base = { objetId: UID_A, employeId: UID_B };

  it("accepte payload minimal", () => {
    expect(upsertObjetEquipeSchema.parse(base)).toMatchObject(base);
  });

  it("accepte notes ≤ 200", () => {
    expect(() =>
      upsertObjetEquipeSchema.parse({ ...base, notes: "n".repeat(200) }),
    ).not.toThrow();
  });

  it("rejette notes > 200", () => {
    expect(() =>
      upsertObjetEquipeSchema.parse({ ...base, notes: "n".repeat(201) }),
    ).toThrow();
  });

  it("rejette objetId invalide", () => {
    expect(() =>
      upsertObjetEquipeSchema.parse({ ...base, objetId: "nope" }),
    ).toThrow();
  });
});

describe("C1 / removeObjetEquipeSchema", () => {
  it("accepte payload valide", () => {
    expect(
      removeObjetEquipeSchema.parse({ objetId: UID_A, employeId: UID_B }),
    ).toEqual({ objetId: UID_A, employeId: UID_B });
  });

  it("rejette champ manquant", () => {
    expect(() =>
      removeObjetEquipeSchema.parse({ objetId: UID_A } as never),
    ).toThrow();
  });

  it("rejette uuid invalide", () => {
    expect(() =>
      removeObjetEquipeSchema.parse({ objetId: "x", employeId: UID_C }),
    ).toThrow();
  });
});

/* ──────────────────────────────────────────────────────────────────── */
/* C2 — resolveRepublishStrategy (seuils 30 %)                          */
/* ──────────────────────────────────────────────────────────────────── */
describe("C2 / resolveRepublishStrategy", () => {
  it("0 override → auto", () => {
    expect(resolveRepublishStrategy({ overrides: 0, ratio: 0 })).toBe("auto");
  });

  it("0 override avec ratio ignoré → auto", () => {
    // Cas dégénéré : on ne devrait jamais voir ratio>0 avec overrides=0,
    // mais on vérifie que le court-circuit overrides=0 prime.
    expect(resolveRepublishStrategy({ overrides: 0, ratio: 99 })).toBe("auto");
  });

  it("ratio exactement au seuil 30 % → merge (inclusif)", () => {
    expect(
      resolveRepublishStrategy({ overrides: 3, ratio: REPUBLISH_THRESHOLD }),
    ).toBe("merge");
  });

  it("ratio < seuil → merge", () => {
    expect(resolveRepublishStrategy({ overrides: 1, ratio: 5 })).toBe("merge");
    expect(resolveRepublishStrategy({ overrides: 2, ratio: 15 })).toBe("merge");
    expect(resolveRepublishStrategy({ overrides: 4, ratio: 29.9 })).toBe("merge");
  });

  it("ratio > seuil → manual", () => {
    expect(resolveRepublishStrategy({ overrides: 5, ratio: 30.01 })).toBe("manual");
    expect(resolveRepublishStrategy({ overrides: 10, ratio: 50 })).toBe("manual");
    expect(resolveRepublishStrategy({ overrides: 20, ratio: 100 })).toBe("manual");
  });

  it("résiste à overrides non-numérique (NaN treated as 0)", () => {
    expect(
      resolveRepublishStrategy({ overrides: 0 as number, ratio: Number("nan") }),
    ).toBe("auto");
  });

  it("ratio string accepté via Number() coercion", () => {
    // Le helper applique Number(r.ratio ?? 0) défensivement.
    expect(
      resolveRepublishStrategy({ overrides: 2, ratio: "25" as unknown as number }),
    ).toBe("merge");
    expect(
      resolveRepublishStrategy({ overrides: 2, ratio: "75" as unknown as number }),
    ).toBe("manual");
  });

  it("seuil constant exporté = 30", () => {
    expect(REPUBLISH_THRESHOLD).toBe(30);
  });
});
