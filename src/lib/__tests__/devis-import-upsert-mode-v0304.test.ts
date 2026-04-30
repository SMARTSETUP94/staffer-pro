/**
 * v0.30.6 — Mode "écraser/mettre à jour" pour l'import devis (option C ter, SOFT).
 *
 * AUCUN garde-fou SQL bloquant côté RPC `import_devis_atomique_v3`.
 * Tous les blocages sont gérés côté client via une modale de confirmation
 * alimentée par la RPC `preflight_import_devis` (lecture seule).
 *
 * Garde-fous SOFT (modale client uniquement, jamais de blocage SQL) :
 *   - autre_affaire        → confirmation explicite
 *   - heures réelles count → warning + heures conservées
 *   - devis_termine        → information seule (autorisé)
 */
import { describe, it, expect } from "vitest";

type RpcResponse =
  | { mode?: "created" | "updated"; heures_preservees?: number }
  | null;

type Preflight = {
  mode: "created" | "updated";
  autre_affaire?: boolean;
  devis_termine?: boolean;
  heures_reelles_count?: number;
};

function pickToastTitle(rpcResponse: RpcResponse, isUpdateExpected: boolean): string {
  const mode = rpcResponse?.mode ?? "created";
  const isUpdate = mode === "updated";
  expect(isUpdate).toBe(isUpdateExpected);
  return isUpdate ? "Devis mis à jour" : "Devis importé";
}

function shouldShowHeuresWarning(rpcResponse: RpcResponse): boolean {
  const isUpdate = rpcResponse?.mode === "updated";
  const heures = rpcResponse?.heures_preservees ?? 0;
  return isUpdate && heures > 0;
}

function shouldOpenConfirmDialog(preflight: Preflight | null): boolean {
  return preflight?.mode === "updated";
}

function classifyError(message: string): string {
  // v0.30.6 : plus AUCUN garde-fou métier côté SQL → toute erreur = technique.
  return "Import impossible";
}

describe("v0.30.6 — Import devis SOFT mode (option C ter, modale client)", () => {
  it("première import → mode 'created' → toast 'Devis importé'", () => {
    expect(pickToastTitle({ mode: "created" }, false)).toBe("Devis importé");
  });

  it("ré-import même hash → mode 'updated' → toast 'Devis mis à jour'", () => {
    expect(pickToastTitle({ mode: "updated" }, true)).toBe("Devis mis à jour");
  });

  it("réponse RPC sans mode (rétrocompat) → fallback 'created'", () => {
    expect(pickToastTitle({}, false)).toBe("Devis importé");
    expect(pickToastTitle(null, false)).toBe("Devis importé");
  });

  it("v0.30.6 : ré-import avec heures préservées → warning affiché", () => {
    expect(shouldShowHeuresWarning({ mode: "updated", heures_preservees: 3 })).toBe(true);
  });

  it("v0.30.6 : ré-import sans heures préservées → pas de warning", () => {
    expect(shouldShowHeuresWarning({ mode: "updated", heures_preservees: 0 })).toBe(false);
    expect(shouldShowHeuresWarning({ mode: "updated" })).toBe(false);
  });

  it("v0.30.6 : création → pas de warning même si champ présent", () => {
    expect(shouldShowHeuresWarning({ mode: "created", heures_preservees: 5 })).toBe(false);
  });

  // --- Modale de confirmation (garde-fous SOFT) ---

  it("preflight 'created' → pas de modale, commit direct", () => {
    expect(shouldOpenConfirmDialog({ mode: "created" })).toBe(false);
    expect(shouldOpenConfirmDialog(null)).toBe(false);
  });

  it("preflight 'updated' simple → modale ouverte (info)", () => {
    expect(shouldOpenConfirmDialog({ mode: "updated" })).toBe(true);
  });

  it("preflight 'updated' + autre_affaire → modale ouverte (warn)", () => {
    expect(shouldOpenConfirmDialog({ mode: "updated", autre_affaire: true })).toBe(true);
  });

  it("preflight 'updated' + heures réelles → modale ouverte (warn)", () => {
    expect(shouldOpenConfirmDialog({ mode: "updated", heures_reelles_count: 7 })).toBe(true);
  });

  it("preflight 'updated' + devis terminé → modale ouverte (info)", () => {
    expect(shouldOpenConfirmDialog({ mode: "updated", devis_termine: true })).toBe(true);
  });

  // --- Plus aucun blocage SQL : toute erreur = technique ---

  it("v0.30.6 : erreur 'autre affaire' (legacy) → fallback générique", () => {
    expect(classifyError("Ce fichier a déjà été importé sur une autre affaire."))
      .toBe("Import impossible");
  });

  it("v0.30.6 : erreur 'heures réelles' (legacy) → fallback générique", () => {
    expect(classifyError("Impossible de ré-importer : 3 saisie(s) d'heures réelles existe(nt) sur ce devis."))
      .toBe("Import impossible");
  });

  it("v0.30.6 : erreur 'devis terminé' (legacy) → fallback générique", () => {
    expect(classifyError("Ce devis est terminé.")).toBe("Import impossible");
  });

  it("v0.30.6 : erreur réseau/RLS → fallback générique", () => {
    expect(classifyError("connection timeout")).toBe("Import impossible");
  });
});
