import { describe, expect, it } from "vitest";
import { argumentsHash } from "../write-policy";
import { causeJournal, controlerFichier, fichierComplet, nettoyerBase64, sansSourceFichier } from "../fichiers";
import { cheminOneDriveValide, elementAutorise, PERMISSION_MANQUANTE, telechargerOneDrive } from "../onedrive";
import { devisPayload, resumeDevis } from "../devis";

const jpeg = (n: number) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); b[n - 2] = 0xff; b[n - 1] = 0xd9; for (let i = 4; i < n - 2; i++) b[i] = (i * 7) % 251; return b; };
const b64 = (b: Uint8Array) => btoa(Array.from(b, c => String.fromCharCode(c)).join(""));
const uuid = "11111111-1111-4111-8111-111111111111";

describe("base64 : causes explicites, plus jamais « Écriture indisponible »", () => {
  const j = jpeg(12000), s = b64(j);
  it("accepte data:, retours à la ligne, base64url et l'absence de =", () => {
    expect(controlerFichier(`data:image/jpeg;base64,${s}`).length).toBe(12000);
    expect(controlerFichier(s.replace(/(.{76})/g, "$1\n")).length).toBe(12000);
    expect(controlerFichier(s.replace(/=+$/, "")).length).toBe(12000);
    expect(nettoyerBase64("ab-_")).toBe("ab+/");
  });
  it("texte coupé (longueur reste 1) : message avec la longueur reçue", () => {
    expect(() => controlerFichier(s.slice(0, 4001))).toThrow(/4001/);
  });
  it("texte coupé décodable : fichier incomplet refusé (fin JPEG absente)", () => {
    expect(() => controlerFichier(s.slice(0, 4002))).toThrow(/incomplet|tronqué/i);
  });
  it("= au milieu et caractères étrangers refusés", () => {
    expect(() => controlerFichier(s.slice(0, 100) + "=" + s.slice(101))).toThrow(/base64/i);
    expect(() => controlerFichier(s.slice(0, 100) + "é" + s.slice(101))).toThrow(/base64/i);
  });
  it("fin de fichier : JPEG FFD9, PNG IEND, PDF %%EOF", () => {
    expect(fichierComplet(j, "image/jpeg")).toBe(true);
    expect(fichierComplet(j.slice(0, 5000), "image/jpeg")).toBe(false);
    const pdf = new TextEncoder().encode("%PDF-1.4\n...\n%%EOF\n");
    expect(fichierComplet(pdf, "application/pdf")).toBe(true);
    expect(fichierComplet(pdf.slice(0, 12), "application/pdf")).toBe(false);
  });
  it("journal : cause et étape conservées, jamais le contenu", () => {
    const c = causeJournal("contrôle du fichier", new DOMException("The string did not match", "InvalidCharacterError"), { longueur_base64: 4001 });
    expect(c).toMatchObject({ etape: "contrôle du fichier", longueur_base64: 4001 });
    expect(JSON.stringify(causeJournal("x", new Error(`atob ${s}`)))).not.toContain(s.slice(0, 200));
  });
});

describe("fichier_ref : même empreinte d'arguments qu'avec le fichier", () => {
  it("aperçu base64 et confirmation fichier_ref donnent le même hash et la même charge", async () => {
    const j = jpeg(3000);
    const base = { devis_id: uuid, ligne_id: uuid, mode: "conversation", legende: "entrée" };
    const a = await devisPayload("devis_ajouter_photo", { ...base, fichier_base64: b64(j) });
    const temp = { lire: async () => ({ bytes: j, mime: "image/jpeg" as const, source: null, nom: null }) };
    const b = await devisPayload("devis_ajouter_photo", { ...base, fichier_ref: a.fichier!.sha, confirmation_id: uuid }, { db: null, affaireId: uuid, userId: uuid, temp });
    expect(await argumentsHash(a.hashArgs)).toBe(await argumentsHash(b.hashArgs));
    expect(JSON.stringify(a.payload)).toBe(JSON.stringify(b.payload));
    expect(sansSourceFichier({ x: 1, fichier_base64: "zz" }, "ab")).toEqual({ x: 1, fichier_sha256: "ab" });
  });
  it("envoi groupé : 20 images au plus, erreur nommant l'image fautive", async () => {
    const p = { ligne_id: uuid, fichier_base64: b64(jpeg(500)) };
    await expect(devisPayload("devis_ajouter_photos", { devis_id: uuid, mode: "conversation", photos: Array(21).fill(p) })).rejects.toThrow(/20/);
    await expect(devisPayload("devis_ajouter_photos", { devis_id: uuid, mode: "conversation", photos: [p, { ligne_id: uuid, fichier_base64: b64(jpeg(500)).slice(0, 301) }] })).rejects.toThrow(/Image 2/);
    const ok = await devisPayload("devis_ajouter_photos", { devis_id: uuid, mode: "conversation", photos: [p, p] });
    expect((ok.payload.photos as unknown[]).length).toBe(2);
    expect(JSON.stringify(ok.payload)).not.toContain(p.fichier_base64.slice(0, 50));
  });
});

describe("OneDrive Staffing de smart@ : garde-fous", () => {
  it("chemins", () => {
    expect(cheminOneDriveValide("9539/02_entree.jpg")).toBe("9539/02_entree.jpg");
    expect(cheminOneDriveValide("Staffing/9539/plan 1.pdf")).toBe("9539/plan%201.pdf");
    for (const c of ["../x.jpg", "9539/../../x.jpg", "/9539/x.jpg", "9539//x.jpg", "C:\\x.jpg", "9539/lien.url", "./x.jpg"]) expect(() => cheminOneDriveValide(c)).toThrow();
  });
  const ok = { id: "ITEM1", name: "a.jpg", size: 10, file: {}, parentReference: { driveId: "D1", path: "/drive/root:/Staffing/9539" } };
  it("élément : drive, dossier, raccourci, partage, dossier", () => {
    expect(elementAutorise(ok, "D1")).toBe("Staffing/9539/a.jpg");
    expect(() => elementAutorise({ ...ok, parentReference: { driveId: "D2", path: ok.parentReference.path } }, "D1")).toThrow(/hors du OneDrive/);
    expect(() => elementAutorise({ ...ok, parentReference: { driveId: "D1", path: "/drive/root:/Documents" } }, "D1")).toThrow(/hors du dossier/);
    expect(() => elementAutorise({ ...ok, parentReference: { driveId: "D1", path: "/drive/root:/StaffingX" } }, "D1")).toThrow(/hors du dossier/);
    expect(() => elementAutorise({ ...ok, remoteItem: {} }, "D1")).toThrow(/partagé/);
    expect(() => elementAutorise({ ...ok, file: undefined, folder: {} }, "D1")).toThrow(/pas un fichier/);
  });
  it("permission absente : message explicite ; fichier tronqué refusé", async () => {
    process.env.MS_GRAPH_TENANT_ID = "t"; process.env.MS_GRAPH_CLIENT_ID = "c"; process.env.MS_GRAPH_CLIENT_SECRET = "s";
    const tok = () => new Response(JSON.stringify({ access_token: "x" }));
    const refus = (async (u: string) => u.includes("login") ? tok() : new Response("", { status: 403 })) as typeof fetch;
    await expect(telechargerOneDrive({ chemin: "9539/a.jpg" }, undefined, refus)).rejects.toThrow(PERMISSION_MANQUANTE);
    const tronque = jpeg(4000).slice(0, 3000);
    const f = (async (u: string) => u.includes("login") ? tok() : u.endsWith("drive?$select=id") ? new Response(JSON.stringify({ id: "D1" }))
      : u.includes("/content") ? new Response(tronque) : new Response(JSON.stringify(ok))) as typeof fetch;
    await expect(telechargerOneDrive({ chemin: "9539/a.jpg" }, undefined, f)).rejects.toThrow(/incomplet|tronqué/i);
    const f2 = (async (u: string) => u.includes("/content") ? new Response(jpeg(4000)) : f(u)) as typeof fetch;
    expect((await telechargerOneDrive({ chemin: "9539/a.jpg" }, undefined, f2)).source).toBe("OneDrive Staffing/9539/a.jpg");
  });
});

describe("devis_lire résumé", () => {
  it("garde l'arbre et n'inclut le détail que pour ligne_ids", () => {
    const lu = { devis: { id: "d", numero: "9539", note_mcp: null, totaux_snapshot: {} }, lignes: [{ id: "L1", type: "zone", libelle: "Zone" }, { id: "L2", parent_id: "L1", type: "objet", libelle: "Comptoir", quantite: 2 }],
      heures: [{ ligne_id: "L2", heures: 4 }], materiaux: [{ ligne_id: "L2", designation: "OSB" }], libres: [], photos: [], calcul: { lignes: { L2: 500 } } };
    const r = resumeDevis(lu);
    expect(r.lignes[1]).toMatchObject({ id: "L2", total_ht: 500, nb_heures: 1, nb_materiaux: 1 });
    expect(r).not.toHaveProperty("detail");
    expect(r.entete).not.toHaveProperty("totaux_snapshot");
    expect(resumeDevis(lu, ["L2"]).detail?.materiaux).toHaveLength(1);
  });
});
