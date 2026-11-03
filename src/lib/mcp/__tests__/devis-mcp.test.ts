import { describe, expect, it } from "vitest";
import { z } from "zod";
import { controlerFichier, DEVIS_WRITE_TOOLS, devisPayload, devisSchemas, sansCouts, tailleLot } from "../devis";

const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4));
const uuid = "11111111-1111-4111-8111-111111111111";

describe("outils devis MCP", () => {
  it("n'expose que les six écritures de brouillon", () => {
    expect([...DEVIS_WRITE_TOOLS].sort()).toEqual(["devis_ajouter_photo", "devis_creer_brouillon", "devis_modifier_entete", "devis_nouvelle_version", "devis_remplir", "devis_soumettre"]);
  });
  it("exige le mode sur chaque écriture", () => {
    expect(z.object(devisSchemas.devis_soumettre).safeParse({ devis_id: uuid, note: "x" }).success).toBe(false);
    expect(z.object(devisSchemas.devis_soumettre).safeParse({ devis_id: uuid, note: "x", mode: "conversation" }).success).toBe(true);
  });
  it("compte les lignes enfants et refuse plus de 300 lignes", () => {
    const objet = { type: "objet" as const, heures: Array.from({ length: 299 }, () => ({ poste: "construction", heures: 1 })) };
    expect(tailleLot([objet])).toBe(300);
    const schema = z.object(devisSchemas.devis_remplir);
    expect(schema.safeParse({ devis_id: uuid, mode: "autonomie", lignes: [objet] }).success).toBe(true);
    expect(schema.safeParse({ devis_id: uuid, mode: "autonomie", lignes: [objet, { type: "commentaire", texte: "x" }] }).success).toBe(false);
  });
  it("accepte une remise de 40 % sans plafond", () => {
    expect(z.object(devisSchemas.devis_modifier_entete).safeParse({ devis_id: uuid, mode: "conversation", champs: { remise: { mode: "pct", valeur: 40 } } }).success).toBe(true);
  });
  it("refuse un champ d'en-tête inconnu", () => {
    expect(z.object(devisSchemas.devis_modifier_entete).safeParse({ devis_id: uuid, mode: "conversation", champs: { statut_redaction: "valide" } }).success).toBe(false);
  });
  it("contrôle le type réel et la taille du fichier", () => {
    expect(controlerFichier(png, "image/png").length).toBe(8);
    expect(() => controlerFichier(png, "application/pdf")).toThrow(/type annoncé/);
    expect(() => controlerFichier(btoa("x".repeat(20)), "image/png", 10)).toThrow(/volumineux/);
  });
  it("ne transmet jamais le contenu du fichier à la base", async () => {
    const { payload, fichier } = await devisPayload("devis_ajouter_photo", { devis_id: uuid, ligne_id: uuid, fichier_base64: png, mime: "image/png", mode: "conversation", source: "mail", confirmation_id: uuid });
    expect(JSON.stringify(payload)).not.toContain(png);
    expect(payload).not.toHaveProperty("confirmation_id");
    expect(payload.storage_path).toMatch(new RegExp(`^${uuid}/mcp/[0-9a-f]{64}\\.png$`));
    expect(fichier?.bytes.length).toBe(8);
  });
  it("masque les prix d'achat sans droit coûts", () => {
    const m = { id: "1", designation: "MDF", prix_vente: 10, prix_achat_net: 5, prix_m2: 8, prix_ml: null };
    expect(sansCouts(m, false)).toEqual({ id: "1", designation: "MDF", prix_vente: 10 });
    expect(sansCouts(m, true)).toEqual(m);
  });
});
