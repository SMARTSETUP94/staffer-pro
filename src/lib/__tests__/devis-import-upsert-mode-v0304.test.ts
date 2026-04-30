/**
 * v0.30.5 — Mode "écraser/mettre à jour" pour l'import devis (option C bis, assoupli).
 *
 * Garde-fous SQL restants :
 *   - "autre affaire" : bloque si le PDF a été initialement importé sur une autre affaire (sécurité).
 *
 * Garde-fous LEVÉS depuis v0.30.4 :
 *   - "heures réelles saisies" : remplacé par un warning client + heures conservées.
 *   - "devis terminé" : retiré complètement (chef + admin peuvent ré-importer).
 *
 * Tests purs sur la logique de branchement côté client.
 */
import { describe, it, expect } from "vitest";

type RpcResponse =
  | { mode?: "created" | "updated"; heures_preservees?: number }
  | null;

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

function classifyError(message: string): string {
  // v0.30.5 : un seul garde-fou SQL = "autre affaire"
  const isAutreAffaire = /autre affaire/i.test(message);
  return isAutreAffaire ? "Fichier déjà lié à une autre affaire" : "Import impossible";
}

describe("v0.30.5 — Import devis upsert mode (option C bis, assoupli)", () => {
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

  it("v0.30.5 : ré-import avec heures préservées → warning affiché", () => {
    expect(shouldShowHeuresWarning({ mode: "updated", heures_preservees: 3 })).toBe(true);
  });

  it("v0.30.5 : ré-import sans heures préservées → pas de warning", () => {
    expect(shouldShowHeuresWarning({ mode: "updated", heures_preservees: 0 })).toBe(false);
    expect(shouldShowHeuresWarning({ mode: "updated" })).toBe(false);
  });

  it("v0.30.5 : création (pas un ré-import) → pas de warning même si champ présent", () => {
    expect(shouldShowHeuresWarning({ mode: "created", heures_preservees: 5 })).toBe(false);
  });

  it("classification erreur : autre affaire (seul garde-fou restant)", () => {
    expect(classifyError("Ce fichier a déjà été importé sur une autre affaire (uuid-A vs uuid-B)."))
      .toBe("Fichier déjà lié à une autre affaire");
  });

  it("v0.30.5 : message générique → fallback 'Import impossible'", () => {
    expect(classifyError("connection timeout")).toBe("Import impossible");
  });

  it("v0.30.5 : ancien message 'heures réelles' → ne match plus 'autre affaire' → fallback", () => {
    // Les anciens blocages SQL n'arrivent plus (garde-fou retiré) — si une instance
    // legacy renvoyait encore ce message, on tomberait sur le fallback générique
    // au lieu du bloc dédié, ce qui est OK (le client n'affiche plus cette erreur métier).
    expect(classifyError("Impossible de ré-importer : 3 saisie(s) d'heures réelles existe(nt) sur ce devis."))
      .toBe("Import impossible");
  });

  it("v0.30.5 : ancien message 'devis terminé' → fallback (garde-fou retiré côté SQL)", () => {
    expect(classifyError("Ce devis est terminé, seul un admin peut le ré-importer."))
      .toBe("Import impossible");
  });
});
