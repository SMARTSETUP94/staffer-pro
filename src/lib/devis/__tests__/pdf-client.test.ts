import { describe, expect, it } from "vitest";
import { construireDevisPdf, eurPdf, lignesTableau, avecFiligrane, type DevisClient } from "../pdf-client";

const base: DevisClient = {
  numero: "D-TEST", version: 2, statut_redaction: "brouillon", libelle: "Totem FIJI", date_devis: "2026-11-03", validite_jours: 30, date_validite: "2026-12-03",
  client: { nom: "FIJI Water", adresse: null, code_postal: null, ville: "Paris" }, client_final: null, contact: { nom: "Anne Martin", email: "a@x.fr" },
  dates: { date_montage: "2026-12-01" }, photos: [],
  lignes: [
    { id: "z", parent_id: null, type: "zone", ordre: 1, libelle: "Fabrication", quantite: 1, descriptif_client: null, longueur_mm: null, largeur_mm: null, hauteur_mm: null, finition: null, texte: null, montant: null, sous_total: 1200 },
    { id: "o", parent_id: "z", type: "objet", ordre: 1, libelle: "Totem", quantite: 2, descriptif_client: "Bois peint", longueur_mm: 1200, largeur_mm: 400, hauteur_mm: 2000, finition: "laqué", texte: null, montant: 1200, sous_total: null },
    { id: "op", parent_id: null, type: "option", ordre: 2, libelle: "Éclairage", quantite: 1, descriptif_client: null, longueur_mm: null, largeur_mm: null, hauteur_mm: null, finition: null, texte: null, option_incluse: false, montant: null, sous_total: 300 },
  ],
  total_ht: 1200, remise: 0, net_ht: 1200, tva: 240, tva_pct: 20, ttc: 1440, options_ht: 300,
};
const texte = (buf: ArrayBuffer) => new TextDecoder("latin1").decode(new Uint8Array(buf));

describe("PDF client devis", () => {
  it("montants au format français", () => {
    expect(eurPdf(19600)).toBe("19 600,00 €");
    expect(eurPdf(-50.5)).toBe("-50,50 €");
  });
  it("détaillé : prix unitaire = total / quantité, dimensions et descriptif", () => {
    const r = lignesTableau(base, base.lignes[0], "detaille");
    expect(r[0]).toMatchObject({ qte: "2", pu: "600,00 €", total: "1 200,00 €" });
    expect(r[0].detail).toContain("1200 × 400 × 2000 mm");
  });
  it("synthétique : aucun prix par objet", () => {
    const r = lignesTableau(base, base.lignes[0], "synthetique");
    expect(r[0]).toMatchObject({ pu: "", total: "" });
  });
  it("filigrane PROJET seulement avant validation", () => {
    expect(avecFiligrane("brouillon")).toBe(true);
    expect(avecFiligrane("a_valider")).toBe(true);
    expect(avecFiligrane("valide")).toBe(false);
    expect(texte(construireDevisPdf(base, "detaille"))).toContain("(PROJET)");
    expect(texte(construireDevisPdf({ ...base, statut_redaction: "valide" }, "detaille"))).not.toContain("(PROJET)");
  });
  it("option affichée à part avec sa mention, bon pour accord présent", () => {
    const t = texte(construireDevisPdf(base, "detaille"));
    expect(t).toContain("Non incluse");
    expect(t).toContain("Bon pour accord");
  });
});
