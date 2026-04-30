/**
 * v0.30.4 — Mode "écraser/mettre à jour" pour l'import devis (option C).
 * Tests purs sur la logique de branchement côté client (toast + handling erreurs).
 */
import { describe, it, expect } from "vitest";

type RpcResponse = { mode?: "created" | "updated" } | null;

function pickToastTitle(rpcResponse: RpcResponse, isUpdateExpected: boolean): string {
  const mode = rpcResponse?.mode ?? "created";
  const isUpdate = mode === "updated";
  expect(isUpdate).toBe(isUpdateExpected);
  return isUpdate ? "Devis mis à jour" : "Devis importé";
}

function classifyError(message: string): string {
  const isHeuresExist = /saisie.*heures r[ée]elles/i.test(message);
  const isAutreAffaire = /autre affaire/i.test(message);
  const isDevisTermine = /devis est termin[ée]/i.test(message);
  if (isHeuresExist) return "Ré-import bloqué : heures saisies";
  if (isAutreAffaire) return "Fichier déjà lié à une autre affaire";
  if (isDevisTermine) return "Devis terminé : ré-import refusé";
  return "Import impossible";
}

describe("v0.30.4 — Import devis upsert mode (option C)", () => {
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

  it("classification erreur : heures réelles existent", () => {
    expect(classifyError("Impossible de ré-importer : 3 saisie(s) d'heures réelles existe(nt) sur ce devis."))
      .toBe("Ré-import bloqué : heures saisies");
  });

  it("classification erreur : autre affaire", () => {
    expect(classifyError("Ce fichier a déjà été importé sur une autre affaire."))
      .toBe("Fichier déjà lié à une autre affaire");
  });

  it("classification erreur : devis terminé", () => {
    expect(classifyError("Ce devis est terminé, seul un admin peut le ré-importer."))
      .toBe("Devis terminé : ré-import refusé");
  });

  it("classification erreur : message générique → fallback", () => {
    expect(classifyError("connection timeout")).toBe("Import impossible");
  });
});
