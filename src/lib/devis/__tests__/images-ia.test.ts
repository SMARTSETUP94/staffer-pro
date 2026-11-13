import { describe, expect, it } from "vitest";
import { categorieParRegle, controlerAvantAppel, estimerCout, filtrerPropositions, lireImage, nettoyerLegende, validerRendu, visibleClientParDefaut } from "../images-ia";
import { encoderPng } from "../images-ia.server";

const L1 = "11111111-1111-1111-1111-111111111111", L2 = "22222222-2222-2222-2222-222222222222";
const D1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", D2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", DS = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ctx = () => ({ lignes: new Set([L1, L2]), documents: new Map([[D1, { categorie: "visuel" }], [D2, { categorie: "plan" }], [DS, { categorie: "devis_setup" }]]), dejaAuDevis: new Set<string>() });

describe("images des devis par l'IA", () => {
  it("reconnaît notre propre devis renvoyé dans un fil", () => {
    expect(categorieParRegle("Devis 9516-R1.pdf")).toBe("devis_setup");
    expect(categorieParRegle("CHIFFRAGE_MIROIR_09_11_2026.pdf")).toBeNull();
  });
  it("visible client : oui pour visuels/moodboards, non pour plans et repérage", () => {
    expect(visibleClientParDefaut("visuel")).toBe(true);
    expect(visibleClientParDefaut("moodboard")).toBe(true);
    expect(visibleClientParDefaut("plan")).toBe(false);
    expect(visibleClientParDefaut("reperage")).toBe(false);
  });
  it("écarte ids inconnus, doublons, devis Set Up et plus de 3 images par objet", () => {
    const brut = [
      { ligne_id: L1, document_id: D1, confiance: 90, justification: "ok", legende: "Miroir" },
      { ligne_id: L1, document_id: D1, confiance: 80, justification: "doublon", legende: "" },
      { ligne_id: L1, document_id: DS, confiance: 99, justification: "devis", legende: "" },
      { ligne_id: "inconnu", document_id: D2, confiance: 99, justification: "", legende: "" },
      { ligne_id: L2, document_id: "inconnu", confiance: 99, justification: "", legende: "" },
      { ligne_id: L2, document_id: D2, confiance: 150, justification: "plan", legende: "Plan" },
    ];
    const r = filtrerPropositions(brut, ctx());
    expect(r.map((p) => `${p.ligne_id}:${p.document_id}`)).toEqual([`${L2}:${D2}`, `${L1}:${D1}`]);
    expect(r[0].confiance).toBe(100);
    expect(r[0].visible_client).toBe(false);
    expect(r[1].visible_client).toBe(true);
  });
  it("ne repropose pas une image déjà dans le devis sur le même objet", () => {
    const c = ctx(); c.dejaAuDevis.add(`${L1}:${D1}`);
    expect(filtrerPropositions([{ ligne_id: L1, document_id: D1, confiance: 90 }], c)).toEqual([]);
  });
  it("légende sans prix ni mot interne", () => {
    expect(nettoyerLegende("Miroir 1 200,00 € HT prix interne")).toBe("Miroir");
  });
  it("limite de 5 par heure et plafond de 0,10 € vérifiés avant l'appel", () => {
    expect(controlerAvantAppel(5, { appels: 1, cout: 0.01 })).toMatch(/5 propositions/);
    expect(controlerAvantAppel(0, { appels: 1, cout: 0.11 })).toMatch(/plafond/);
    expect(controlerAvantAppel(0, { appels: 5, cout: 0.05 })).toMatch(/4 appels/);
    expect(controlerAvantAppel(4, estimerCout(36, 2000))).toBeNull();
    expect(estimerCout(31, 0).appels).toBe(2);
  });
  it("rendu de page : type réel et dimensions revérifiés", () => {
    const px = new Uint8Array(200 * 150 * 3).fill(128);
    const { png, width, height } = encoderPng(px, 200, 150);
    expect(lireImage(png)).toEqual({ mime: "image/png", width: 200, height: 150 });
    expect(width).toBe(200); expect(height).toBe(150);
    expect(validerRendu(png).mime).toBe("image/png");
    expect(() => validerRendu(new TextEncoder().encode("%PDF-1.7 pas une image"))).toThrow(/PNG ou JPEG/);
    const petit = encoderPng(new Uint8Array(50 * 50 * 3), 50, 50).png;
    expect(() => validerRendu(petit)).toThrow(/dimensions/);
  });
  it("réduit les grandes images extraites à 1024 px", () => {
    const r = encoderPng(new Uint8Array(3000 * 1500 * 4), 3000, 1500);
    expect([r.width, r.height]).toEqual([1024, 512]);
  });
});
