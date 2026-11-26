import { describe, expect, it } from "vitest";
import { dimensionsCible } from "../images-pdf";
import { pourSetUp, rappelEntete, sansOrphelin } from "../pdf-client";
import { avertissementsExportPdf } from "../controles-export-pdf";

const l = (id: string, d: string) => ({ id, parent_id: null, type: "objet", ordre: 1, libelle: id, quantite: 1, descriptif_client: d, longueur_mm: null, largeur_mm: null, hauteur_mm: null, finition: null, texte: null, montant: 0, sous_total: 0 });

describe("corrections PDF 9537-R1", () => {
  it("logo 1280×720 réduit à 600 px de large, photo à 1000 px, jamais agrandie", () => {
    expect(dimensionsCible(1280, 720, 600)).toEqual({ w: 600, h: 338 });
    expect(dimensionsCible(3000, 4000, 1000)).toEqual({ w: 750, h: 1000 });
    expect(dimensionsCible(400, 300, 1000)).toEqual({ w: 400, h: 300 });
  });
  it("« 02/12 » ne reste pas seul sur sa ligne", () => {
    expect(sansOrphelin(["9537 Intimissimi – Éléments évent Le Halo", "02/12"])).toEqual(["9537 Intimissimi – Éléments évent Le", "Halo 02/12"]);
    expect(sansOrphelin(["une seule ligne"])).toEqual(["une seule ligne"]);
  });
  it("« Pour SET UP » : signataire, sinon interlocuteur nom + e-mail", () => {
    expect(pourSetUp({ signataire: { nom: "A B", email: null }, interlocuteur: { nom: "C D", email: "c@setup.paris" } })).toEqual(["A B"]);
    expect(pourSetUp({ signataire: null, interlocuteur: { nom: "C D", email: "c@setup.paris" } })).toEqual(["C D", "c@setup.paris"]);
    expect(pourSetUp({ signataire: null, interlocuteur: null })).toEqual([]);
  });
  it("rappel des pages 2+", () => { expect(rappelEntete({ client: { nom: "Calzedonia" } as never }, "9537-R1")).toBe("Devis n° 9537-R1 · Calzedonia"); });
  it("note interne dans la finition détectée (cas 9537 « Surface estimée »)", () => {
    const a = avertissementsExportPdf({ lignes: [{ ...l("f", ""), finition: "Surface estimée 44 m²" }], photos: [], contact: { nom: "X", email: null }, cgv: "cgv", joindre_cgv: true });
    expect(a.map((v) => v.code)).toEqual(["note_interne"]);
  });
  it("avertissements non bloquants", () => {
    const a = avertissementsExportPdf({ lignes: [l("x", "Hauteur à recaler sur la cote exacte du plan"), l("y", "Voir slide 6"), l("z", "Panneau bois")], photos: [{ ligne_id: "y", storage_path: "p", thumb_path: null, legende: null, mime: "image/jpeg" }], contact: null, cgv: null, joindre_cgv: true });
    expect(a.map((v) => `${v.code}:${v.ligneId ?? ""}`)).toEqual(["note_interne:x", "visuel_absent:x", "sans_contact:", "sans_cgv:"]);
  });
});
