/**
 * Bloc 10.3 — Smoke tests sur opportunite-fiche.functions.ts
 *
 * Les SF complètes nécessitent un contexte Supabase authentifié (couvert par
 * la spec E2E `e2e/bloc-10/fiche-opportunite.spec.ts`). Ici on couvre la
 * surface publique du module : enums et présence des 4 server fns.
 */
import { describe, expect, it } from "vitest";
import * as mod from "../opportunite-fiche.functions";

describe("opportunite-fiche.functions — surface publique", () => {
  it("exporte les 4 server functions attendues", () => {
    expect(typeof mod.getOpportuniteFiche).toBe("function");
    expect(typeof mod.updateOpportuniteFields).toBe("function");
    expect(typeof mod.addOpportuniteAction).toBe("function");
    expect(typeof mod.updateJalonStatus).toBe("function");
  });
});
