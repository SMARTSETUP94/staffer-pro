/**
 * v0.25.1 — Tests pour la pré-sélection d'affaire via query string
 * sur la route /devis/import.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

// Schéma identique à celui de src/routes/_app.devis.import.tsx
const importSearchSchema = z.object({
  affaire_id: fallback(z.string().uuid().optional(), undefined),
});

describe("v0.25.1 — validateSearch /devis/import", () => {
  it("accepte un affaire_id UUID valide", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const parsed = importSearchSchema.parse({ affaire_id: uuid });
    expect(parsed.affaire_id).toBe(uuid);
  });

  it("retourne undefined si pas de query string", () => {
    const parsed = importSearchSchema.parse({});
    expect(parsed.affaire_id).toBeUndefined();
  });

  it("fallback sur undefined si affaire_id n'est pas un UUID", () => {
    const parsed = importSearchSchema.parse({ affaire_id: "not-a-uuid" });
    expect(parsed.affaire_id).toBeUndefined();
  });

  it("ignore les query params inconnus sans erreur", () => {
    const parsed = importSearchSchema.parse({ foo: "bar" } as Record<string, unknown>);
    expect(parsed.affaire_id).toBeUndefined();
  });
});

/** Helper extrait : décide l'état de pré-remplissage à partir du fetch Supabase. */
export function decidePrefillState(
  prefilledAffaireId: string | undefined,
  fetched: { id: string } | null,
  error: { code: string } | null,
): "idle" | "valid" | "invalid" {
  if (!prefilledAffaireId) return "idle";
  if (error || !fetched) return "invalid";
  return "valid";
}

describe("v0.25.1 — decidePrefillState", () => {
  it("idle si pas d'affaire_id en query string", () => {
    expect(decidePrefillState(undefined, null, null)).toBe("idle");
  });

  it("valid si affaire trouvée", () => {
    expect(
      decidePrefillState("uuid-1", { id: "uuid-1" }, null),
    ).toBe("valid");
  });

  it("invalid si affaire non trouvée (RLS ou supprimée)", () => {
    expect(decidePrefillState("uuid-1", null, null)).toBe("invalid");
  });

  it("invalid si erreur Supabase (ex: 403 RLS)", () => {
    expect(
      decidePrefillState("uuid-1", null, { code: "PGRST301" }),
    ).toBe("invalid");
  });
});

/** Construit le search object passé au Link "Importer un devis Progbat". */
export function buildImportLinkSearch(affaireId: string): { affaire_id: string } {
  return { affaire_id: affaireId };
}

describe("v0.25.1 — buildImportLinkSearch", () => {
  it("encode l'affaire_id en query string", () => {
    expect(buildImportLinkSearch("abc-123")).toEqual({ affaire_id: "abc-123" });
  });
});
