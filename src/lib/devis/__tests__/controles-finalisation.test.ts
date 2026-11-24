import { describe, expect, it } from "vitest";
import { controlesFinalisation, peutFinaliser, type EntreeControles } from "../controles-finalisation";

const complet: EntreeControles = {
  totalHt: 6563.05, aujourdhui: "2026-11-24", dateValidite: "2026-12-24",
  client: { email: "achat@client.fr", adresse: "1 rue A", code_postal: "75001", ville: "Paris" }, contactId: "c1",
  signataire: { prenom: "Ana", nom: "Roy", email: "ana@client.fr", telephone: "0600000000" },
  lignes: [{ id: "z", parent_id: null, type: "zone", libelle: "Zone", descriptif_client: "Accueil", option_incluse: false },
    { id: "o", parent_id: "z", type: "objet", libelle: "Comptoir", descriptif_client: "Bois", option_incluse: false }],
  montants: { o: 6563.05 }, materiaux: [], libres: [],
};
const codes = (e: EntreeControles) => controlesFinalisation(e).points.map((p) => `${p.niveau}:${p.code}`);

describe("Avant de valider", () => {
  it("un devis complet passe sans point", () => expect(controlesFinalisation(complet)).toMatchObject({ bloquants: 0, avertissements: 0 }));
  it("bloque un total HT à 0 €", () => expect(codes({ ...complet, totalHt: 0 })).toContain("bloquant:TOTAL_NON_POSITIF"));
  it("bloque sans client facturé", () => expect(codes({ ...complet, client: null })).toContain("bloquant:CLIENT_ABSENT"));
  it("bloque une validité d'hier mais accepte celle d'aujourd'hui", () => {
    expect(codes({ ...complet, dateValidite: "2026-11-23" })).toContain("bloquant:VALIDITE_PASSEE");
    expect(codes({ ...complet, dateValidite: "2026-11-24" })).not.toContain("bloquant:VALIDITE_PASSEE");
  });
  it("avertit pour un objet à 0 € comme le photobooth de 9485", () => {
    const e = { ...complet, lignes: [...complet.lignes, { id: "p", parent_id: "z", type: "objet", libelle: "Photobooth", descriptif_client: "Animation" }] };
    expect(controlesFinalisation(e).points).toContainEqual(expect.objectContaining({ code: "LIGNE_ZERO", niveau: "avertissement", ligneId: "p", message: "Photobooth : 0 € HT" }));
  });
  it("une option chiffrée par ses enfants n'est pas à 0 €", () => {
    const e = { ...complet, lignes: [...complet.lignes, { id: "op", parent_id: "z", type: "option", libelle: "P1", descriptif_client: "x" }, { id: "k", parent_id: "op", type: "objet", libelle: "Chaise", descriptif_client: "x" }], montants: { ...complet.montants, k: 4801.16 } };
    expect(codes(e)).toEqual([]);
  });
  it("une option sans objet ni prix est signalée une fois", () => {
    const e = { ...complet, lignes: [...complet.lignes, { id: "op", parent_id: null, type: "option", libelle: "Calligraphe", descriptif_client: "x" }] };
    expect(codes(e)).toEqual(["avertissement:OPTION_VIDE"]);
  });
  it("avertit matière ou article sans prix, descriptif, e-mail, adresse, contact et signataire", () => {
    const e = { ...complet, client: { email: "", adresse: "1 rue A", code_postal: "", ville: "Paris" }, contactId: null, signataire: { prenom: "Ana", nom: "Roy", email: "", telephone: "" },
      lignes: [complet.lignes[0]!, { ...complet.lignes[1]!, descriptif_client: " " }],
      materiaux: [{ ligne_id: "o", designation: "Médium", venteUnitaire: 0 }], libres: [{ ligne_id: "o", designation: "Coursier", venteUnitaire: 0, forfaitSansPrix: true }] };
    expect(codes(e)).toEqual(["avertissement:CLIENT_EMAIL", "avertissement:CLIENT_ADRESSE", "avertissement:CONTACT_ABSENT", "avertissement:SIGNATAIRE_INCOMPLET",
      "avertissement:DESCRIPTIF_ABSENT", "avertissement:MATIERE_SANS_PRIX", "avertissement:ARTICLE_SANS_PRIX"]);
  });
  it("finaliser malgré les avertissements exige « je confirme », jamais avec un bloquant", () => {
    expect(peutFinaliser({ bloquants: 0, avertissements: 3 }, false)).toBe(false);
    expect(peutFinaliser({ bloquants: 0, avertissements: 3 }, true)).toBe(true);
    expect(peutFinaliser({ bloquants: 1, avertissements: 0 }, true)).toBe(false);
  });
});
