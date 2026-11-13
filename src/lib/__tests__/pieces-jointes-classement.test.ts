import { describe, it, expect } from "vitest";
import { estLogoSignature, cleImage, etatBilan, doitRelancer, dimensionsImage, libelleResultat, MOTIF_LOGO } from "../pieces-jointes-classement";

const png = (w: number, h: number) => { const b = new Uint8Array(32); b.set([0x89, 0x50, 0x4e, 0x47], 0); const v = new DataView(b.buffer); v.setUint32(16, w); v.setUint32(20, h); return b; };

describe("classement des pièces jointes", () => {
  it("écarte un logo collé de moins de 15 Ko", () => {
    expect(estLogoSignature({ nom: "photo.png", mime: "image/png", taille: 9000, inline: true })).toBe(true);
  });
  it("écarte une image collée de moins de 200 px", () => {
    expect(estLogoSignature({ nom: "x.png", mime: "image/png", taille: 80000, inline: true, dims: dimensionsImage(png(180, 60)) })).toBe(true);
  });
  it("écarte image001.png de moins de 60 Ko même jointe", () => {
    expect(estLogoSignature({ nom: "image001.png", mime: "image/png", taille: 40000, inline: false })).toBe(true);
  });
  it("garde une vraie photo jointe et un PDF", () => {
    expect(estLogoSignature({ nom: "stand.jpg", mime: "image/jpeg", taille: 900000, inline: false })).toBe(false);
    expect(estLogoSignature({ nom: "logo.pdf", mime: "application/pdf", taille: 9000, inline: true })).toBe(false);
  });
  it("une pièce refusée ne bloque pas les autres : état partiel", () => {
    expect(etatBilan([{ attachment_id: "a", nom: "a", resultat: "classee" }, { attachment_id: "b", nom: "b", resultat: "refusee", motif: "Format" }], false, 1)).toBe("partiel");
  });
  it("doublon compte comme classé", () => {
    expect(etatBilan([{ attachment_id: "a", nom: "a", resultat: "doublon" }], false, 1)).toBe("classe");
  });
  it("Microsoft indisponible : à reprendre, puis échec après 3 tentatives", () => {
    expect(etatBilan([], true, 1)).toBe("a_reprendre");
    expect(etatBilan([], true, 3)).toBe("echec");
  });
  it("la relance ne reprend que l'affaire déjà rattachée et un auteur connu", () => {
    const b = { etat: "a_reprendre" as const, tentatives: 1, affaire_id: "A", rattache_par: "U", pieces: [] };
    expect(doitRelancer({ opportunite_id: "A", classement_pj: b })).toBe(true);
    expect(doitRelancer({ opportunite_id: "B", classement_pj: b })).toBe(false);
    expect(doitRelancer({ opportunite_id: "A", classement_pj: { ...b, rattache_par: null } })).toBe(false);
    expect(doitRelancer({ opportunite_id: "A", classement_pj: null })).toBe(false);
    expect(doitRelancer({ opportunite_id: "A", classement_pj: { ...b, tentatives: 3 } })).toBe(false);
  });
  it("écarte une image collée répétée dans un autre mail du même expéditeur", () => {
    const vues = new Set([cleImage("ATT00001.png", 66277)]);
    expect(estLogoSignature({ nom: "ATT00001.png", mime: "image/png", taille: 66277, inline: true, repetee: vues.has(cleImage("att00001.PNG", 66277)) })).toBe(true);
  });
  it("garde une image collée unique ou une grande image répétée", () => {
    expect(estLogoSignature({ nom: "ATT00001.png", mime: "image/png", taille: 66277, inline: true, repetee: false })).toBe(false);
    expect(estLogoSignature({ nom: "plan.png", mime: "image/png", taille: 400000, inline: true, repetee: true })).toBe(false);
  });
  it("trace lisible d'un logo écarté", () => {
    expect(libelleResultat({ attachment_id: "x", nom: "image001.png", resultat: "ecartee_logo" })).toBe(MOTIF_LOGO);
  });
});
