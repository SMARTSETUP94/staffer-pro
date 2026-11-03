import { describe, expect, it } from "vitest";
import { z } from "zod";
import { controlerFichier, DEVIS_WRITE_TOOLS, devisPayload, devisSchemas, elementsVises, hoteAutorise, margeFiable, resumeTotaux, sansCouts, tailleLot, telechargerFichier } from "../devis";

const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4));
const uuid = "11111111-1111-4111-8111-111111111111";

describe("outils devis MCP", () => {
  it("n'expose que les six écritures de brouillon et l'enregistrement du transfert ProGBat", () => {
    expect([...DEVIS_WRITE_TOOLS].sort()).toEqual(["devis_ajouter_photo", "devis_creer_brouillon", "devis_enregistrer_transfert", "devis_modifier_entete", "devis_nouvelle_version", "devis_remplir", "devis_soumettre"]);
  });
  it("transfert ProGBat : numéro S provisoire ou D définitif, mode obligatoire", () => {
    const t = z.object(devisSchemas.devis_enregistrer_transfert);
    const base = { devis_id: uuid, total_progbat: 9510.99, mode: "conversation" };
    expect(t.safeParse({ ...base, numero_progbat: "S003800" }).success).toBe(true);
    expect(t.safeParse({ ...base, numero_progbat: "D-202611-0012" }).success).toBe(true);
    for (const n of ["S03800", "D-20261-0012", "X003800", "D-202611-12"]) expect(t.safeParse({ ...base, numero_progbat: n }).success).toBe(false);
    expect(t.safeParse({ devis_id: uuid, total_progbat: 1, numero_progbat: "S003800" }).success).toBe(false);
    expect(t.safeParse({ ...base, numero_progbat: "S003800", total_progbat: -1 }).success).toBe(false);
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

describe("lot 4 — corrections après recette", () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const rep = (status: number, body: Uint8Array | null, headers: Record<string, string> = {}) =>
    new Response(body as BodyInit | null, { status, headers });
  it("modifier / supprimer : schéma strict par cible", () => {
    const s = z.object(devisSchemas.devis_remplir);
    expect(s.safeParse({ devis_id: uuid, mode: "conversation", modifications: [{ cible: "heure", id: uuid, champs: { heures: 6 } }], suppressions: [{ cible: "materiau", id: uuid }] }).success).toBe(true);
    expect(s.safeParse({ devis_id: uuid, mode: "conversation", modifications: [{ cible: "heure", id: uuid, champs: { prix_achat: 3 } }] }).success).toBe(false);
    expect(s.safeParse({ devis_id: uuid, mode: "conversation", modifications: [{ cible: "ligne", id: uuid, champs: {} }] }).success).toBe(false);
    expect(s.safeParse({ devis_id: uuid, mode: "conversation", suppressions: [{ cible: "devis", id: uuid }] }).success).toBe(false);
  });
  it("compte modifications et suppressions dans la limite de 300", async () => {
    expect(tailleLot([{ type: "objet" }], 299)).toBe(300);
    await expect(devisPayload("devis_remplir", { devis_id: uuid, mode: "conversation" })).rejects.toThrow(/Lot vide/);
    await expect(devisPayload("devis_remplir", { devis_id: uuid, mode: "conversation", suppressions: Array.from({ length: 301 }, () => ({ cible: "heure", id: uuid })) })).rejects.toThrow(/300/);
  });
  it("avant / après des éléments visés", () => {
    const lu = { lignes: [{ id: "L", type: "objet", libelle: "Objet 1", quantite: 1 }], heures: [{ id: "H", ligne_id: "L", poste_libelle: "Construction", niveau: "standard", heures: 0, taux_vente: 45 }], materiaux: [], libres: [] };
    const v = elementsVises(lu, { modifications: [{ cible: "heure", id: "H", champs: { heures: 8 } }], lignes: [{ ligne_id: "L", libelle: "Totem", heures: [{ poste: "peinture", heures: 6 }] }] });
    expect(v[0]).toMatchObject({ action: "modifier", avant: { heures: 0 }, apres: { heures: 8 } });
    expect(v[1]).toMatchObject({ action: "completer", avant: { libelle: "Objet 1" }, apres: { libelle: "Totem" }, ajouts: { heures: 1 } });
  });
  it("marge_fiable = false dès qu'un coût manque", () => {
    expect(margeFiable({ couts_manquants: [] })).toEqual({ marge_fiable: true });
    expect(margeFiable({ couts_manquants: [{ type: "heures", libelle: "Métallerie", heures: 4 }, { type: "libre", libelle: "Semi-remorque", heures: null }] }))
      .toEqual({ marge_fiable: false, alerte_marge: "marge incomplète : coûts manquants sur métallerie (4 h), semi-remorque" });
    expect(resumeTotaux({ marge: 100, couts_manquants: [{ libelle: "Impression UV", heures: 2 }] })).toMatchObject({ marge: 100, marge_fiable: false });
  });
  it("photo par URL : hôtes autorisés seulement, IP refusées", () => {
    for (const ok of ["https://setup.sharepoint.com/x.jpg", "https://1drv.ms/i/abc", "https://onedrive.live.com/x", "https://staffing.setup.paris/a.png", "https://znwffztmdgsshuvvzsvq.supabase.co/storage/v1/object/x"])
      expect(hoteAutorise(new URL(ok))).toBe(true);
    for (const ko of ["http://setup.sharepoint.com/x", "https://evil.com/x.jpg", "https://sharepoint.com.evil.com/x", "https://10.0.0.1/x", "https://[::1]/x", "https://169.254.169.254/x", "https://u:p@staffing.setup.paris/x", "https://staffing.setup.paris:8443/x"])
      expect(hoteAutorise(new URL(ko))).toBe(false);
  });
  it("photo par URL : suit les redirections de la liste, refuse les autres, détecte le type", async () => {
    const f1 = (async (u: string) => u.startsWith("https://1drv.ms") ? rep(302, null, { location: "https://onedrive.live.com/download?id=1" }) : rep(200, pngBytes)) as typeof fetch;
    const t = await telechargerFichier("https://1drv.ms/i/abc", undefined, 100, f1);
    expect(t.mime).toBe("image/png"); expect(t.hote).toBe("onedrive.live.com");
    const f2 = (async () => rep(302, null, { location: "https://192.168.1.10/p.png" })) as typeof fetch;
    await expect(telechargerFichier("https://1drv.ms/i/abc", undefined, 100, f2)).rejects.toThrow(/non autorisé/);
    const f3 = (async () => rep(200, new Uint8Array(200).fill(0x89))) as typeof fetch;
    await expect(telechargerFichier("https://staffing.setup.paris/x", undefined, 100, f3)).rejects.toThrow(/volumineux/);
    const f4 = (async () => rep(200, new TextEncoder().encode("<html>login</html>"))) as typeof fetch;
    await expect(telechargerFichier("https://staffing.setup.paris/x", undefined, 100, f4)).rejects.toThrow(/Type de fichier refusé/);
    let vu = ""; const f5 = (async (u: string) => { vu = u; return rep(200, pngBytes); }) as typeof fetch;
    await telechargerFichier("https://setup.sharepoint.com/:i:/s/x", undefined, 100, f5);
    expect(vu).toContain("download=1");
  });
  it("photo : une seule source, jamais le contenu dans les arguments transmis", async () => {
    await expect(devisPayload("devis_ajouter_photo", { devis_id: uuid, ligne_id: uuid, mode: "conversation" })).rejects.toThrow(/soit url/);
    const { payload } = await devisPayload("devis_ajouter_photo", { devis_id: uuid, ligne_id: uuid, fichier_base64: png, mode: "conversation" });
    expect(payload.mime).toBe("image/png");
  });
});
