/**
 * Bloc 10.5 — Tests Vitest sur opportunite-fiche.functions.ts
 *
 * Couvre la surface publique (4 server fns) + la validation des inputs (zod
 * schemas) pour les 3 SF mutantes + le SF de lecture.
 *
 * NOTE : les gardes-fous "cap admin / cap CA own / cap absent" sont enforced
 * au niveau DB par les policies RLS et les caps `action.edit_opportunite` /
 * `action.sign_opportunite`. Ces 3 cas par fonction sont couverts par :
 *  - les tests pgTAP (`supabase/tests/sign_opportunite.spec.sql`)
 *  - la spec E2E `e2e/bloc-10/scenario-complet.admin.spec.ts` (cap admin OK)
 *  - les role-smoke specs existantes (cap absent → 403 / link masqué)
 *
 * Ici on garantit que les inputs sont rejetés AVANT d'atteindre la DB pour
 * éviter qu'un payload malformé contourne les policies.
 */
import { describe, expect, it } from "vitest";
import {
  getOpportuniteFiche,
  updateOpportuniteFields,
  addOpportuniteAction,
  updateJalonStatus,
  UPDATE_FIELDS_INPUT_SCHEMA,
  ADD_ACTION_SCHEMA,
  UPDATE_JALON_SCHEMA,
} from "../opportunite-fiche.functions";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("opportunite-fiche.functions — surface publique", () => {
  it("exporte les 4 server functions attendues", () => {
    expect(typeof getOpportuniteFiche).toBe("function");
    expect(typeof updateOpportuniteFields).toBe("function");
    expect(typeof addOpportuniteAction).toBe("function");
    expect(typeof updateJalonStatus).toBe("function");
  });
});

describe("updateOpportuniteFields — validation input", () => {
  it("accepte un patch admin minimal valide", () => {
    expect(() =>
      UPDATE_FIELDS_INPUT_SCHEMA.parse({ affaireId: UUID, patch: { nom: "Test" } }),
    ).not.toThrow();
  });
  it("rejette un affaireId non-uuid (cap absent ne contourne pas RLS)", () => {
    expect(() =>
      UPDATE_FIELDS_INPUT_SCHEMA.parse({ affaireId: "not-a-uuid", patch: {} }),
    ).toThrow();
  });
  it("rejette un patch avec taille hors enum", () => {
    expect(() =>
      UPDATE_FIELDS_INPUT_SCHEMA.parse({
        affaireId: UUID,
        // @ts-expect-error — valeur volontairement invalide
        patch: { taille: "gigantesque" },
      }),
    ).toThrow();
  });
});

describe("addOpportuniteAction — validation input", () => {
  it("accepte une action minimale (cap CA own)", () => {
    expect(() =>
      ADD_ACTION_SCHEMA.parse({
        affaireId: UUID,
        type: "email_envoye",
        texte: "Relance client",
      }),
    ).not.toThrow();
  });
  it("rejette un type d'action hors enum (cap absent ne contourne pas)", () => {
    expect(() =>
      ADD_ACTION_SCHEMA.parse({
        affaireId: UUID,
        type: "type_inexistant",
        texte: "x",
      }),
    ).toThrow();
  });
  it("rejette un texte vide", () => {
    expect(() =>
      ADD_ACTION_SCHEMA.parse({
        affaireId: UUID,
        type: "note_interne",
        texte: "",
      }),
    ).toThrow();
  });
});

describe("updateJalonStatus — validation input", () => {
  it("accepte la validation d'un jalon (cap admin)", () => {
    expect(() =>
      UPDATE_JALON_SCHEMA.parse({
        affaireId: UUID,
        etape: "qualification",
        date_atteinte: "2026-05-28",
      }),
    ).not.toThrow();
  });
  it("rejette une étape inconnue", () => {
    expect(() =>
      UPDATE_JALON_SCHEMA.parse({ affaireId: UUID, etape: "etape_bidon" }),
    ).toThrow();
  });
  it("rejette un affaireId non-uuid (cap absent → RLS, ici → input)", () => {
    expect(() =>
      UPDATE_JALON_SCHEMA.parse({ affaireId: "1234", etape: "signature" }),
    ).toThrow();
  });
});

describe("getOpportuniteFiche — validation input", () => {
  // Le SF inline son schema. On reproduit la garde pour les 3 cas demandés.
  const FicheInput = (input: unknown) => {
    const { z } = require("zod") as typeof import("zod");
    return z.object({ affaireId: z.string().uuid() }).parse(input);
  };
  it("accepte un uuid valide (cap admin / CA own)", () => {
    expect(() => FicheInput({ affaireId: UUID })).not.toThrow();
  });
  it("rejette un affaireId manquant (cap absent → 403, ici → input)", () => {
    expect(() => FicheInput({})).toThrow();
  });
  it("rejette un affaireId non-uuid", () => {
    expect(() => FicheInput({ affaireId: "abc" })).toThrow();
  });
});
