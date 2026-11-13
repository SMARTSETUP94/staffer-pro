import { describe, it, expect } from "vitest";
import { devisPayload } from "../devis";

const uuid = "11111111-1111-4111-8111-111111111111", aff = "22222222-2222-4222-8222-222222222222", doc = "33333333-3333-4333-8333-333333333333";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(0)]);
const fakeDb = (row: any, bytes: Uint8Array = png) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  storage: { from: () => ({ download: async () => ({ data: new Blob([bytes]), error: null }) }) },
});
const row = { id: doc, affaire_id: aff, storage_path: `${aff}/x.png`, filename: "stand.png", mime_type: "image/png", taille_bytes: 48, deleted_at: null };
const args = { devis_id: uuid, ligne_id: uuid, document_id: doc, mode: "conversation" };

describe("devis_ajouter_photo depuis la boîte de documents", () => {
  it("copie l'image et transmet source_document_id", async () => {
    const { payload, fichier } = await devisPayload("devis_ajouter_photo", args, { db: fakeDb(row), affaireId: aff });
    expect(payload.source_document_id).toBe(doc);
    expect(String(payload.storage_path).startsWith(`${uuid}/mcp/`)).toBe(true);
    expect(fichier?.mime).toBe("image/png");
  });
  it("refuse un document d'une autre affaire", async () => {
    await expect(devisPayload("devis_ajouter_photo", args, { db: fakeDb({ ...row, affaire_id: uuid }), affaireId: aff })).rejects.toThrow(/introuvable/);
  });
  it("refuse un document retiré de la boîte", async () => {
    await expect(devisPayload("devis_ajouter_photo", args, { db: fakeDb({ ...row, deleted_at: "2026-11-13" }), affaireId: aff })).rejects.toThrow(/introuvable/);
  });
  it("refuse un PDF", async () => {
    await expect(devisPayload("devis_ajouter_photo", args, { db: fakeDb(row, new TextEncoder().encode("%PDF-1.4 xxxxxxxx")), affaireId: aff })).rejects.toThrow(/JPG ou PNG/);
  });
  it("une seule source à la fois", async () => {
    await expect(devisPayload("devis_ajouter_photo", { ...args, url: "https://staffing.setup.paris/x.png" }, { db: fakeDb(row), affaireId: aff })).rejects.toThrow(/soit url/);
  });
});
