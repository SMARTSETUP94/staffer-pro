import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { writeSchemas } from "../write-schemas";
import { WRITE_CAPS } from "../write-policy";

const schema = z.object(writeSchemas.traiter_demande as z.ZodRawShape);
const id = "00000000-0000-4000-8000-000000000001";

describe("traiter_demande", () => {
  it("accepte 1 à 20 demandes, refuse 0 et 21", () => {
    expect(schema.safeParse({ email_ids: [id], action: "ecarter", motif: "Pub" }).success).toBe(true);
    expect(schema.safeParse({ email_ids: [], action: "ecarter", motif: "Pub" }).success).toBe(false);
    expect(schema.safeParse({ email_ids: Array(21).fill(id), action: "ecarter", motif: "Pub" }).success).toBe(false);
  });
  it("motif limité à 500 caractères", () => {
    expect(schema.safeParse({ email_ids: [id], action: "ecarter", motif: "x".repeat(501) }).success).toBe(false);
  });
  it("inclure_fil vaut false par défaut", () => {
    expect((schema.parse({ email_ids: [id], action: "rattacher", opportunite_id: id }) as any).inclure_fil).toBe(false);
  });
  it("capability action.edit_opportunite", () => { expect(WRITE_CAPS.traiter_demande).toBe("action.edit_opportunite"); });
  it("pré-autorisable comme les outils opportunité", () => {
    const s = readFileSync("src/lib/mcp/index.ts", "utf8");
    expect(s).toContain("ajouter_action_opportunite et traiter_demande, la confirmation peut être donnée sans attendre");
    expect(s).toContain("laisser la demande en attente et le signaler");
  });
  it("creer_opportunite accepte email_ids (max 20)", () => {
    const c = z.object(writeSchemas.creer_opportunite as z.ZodRawShape);
    expect(c.safeParse({ client_nom: "X", intitule: "Y", email_ids: [id] }).success).toBe(true);
    expect(c.safeParse({ client_nom: "X", intitule: "Y", email_ids: Array(21).fill(id) }).success).toBe(false);
  });
});
