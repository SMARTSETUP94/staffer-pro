import { describe, expect, it } from "vitest";
import { construireDevisPdf, reglementDevis, eurPdf, lignesTableau, avecFiligrane, totalAffiche, titreCourt, nomPropreChantier, descriptifClientChapitre, descriptifChapitre, detailObjet, champsClientManquants, type DevisClient } from "../pdf-client";

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
  it("acompte officiel de 50 % sur les 4 084,01 € TTC de 9500", () => {
    expect(reglementDevis({ ttc: 4084.01, reglement: { acompte_pct: 50 } }).acompte).toBe(2042.01);
  });
  it("délai officiel de 30 jours", () => {
    expect(reglementDevis({ ttc: 4084.01, reglement: { delai_jours: 30 } }).delai).toBe(30);
  });
  it("mode de règlement officiel virement", () => {
    expect(reglementDevis({ ttc: 4084.01, reglement: { mode: "virement" } }).mode).toBe("virement");
  });
  it("reprend les paramètres fournis, sans les écraser par les défauts", () => {
    expect(reglementDevis({ ttc: 1000, reglement: { acompte_pct: 25, mode: "chèque", delai_jours: 15 } })).toEqual({ pct: 25, acompte: 250, mode: "chèque", delai: 15 });
  });
  it("montants au format français", () => {
    expect(eurPdf(19600)).toBe("19 600,00 €");
    expect(eurPdf(-50.5)).toBe("-50,50 €");
  });
  it("détaillé : prix unitaire = total / quantité, dimensions et descriptif", () => {
    const r = lignesTableau(base, base.lignes[0], "detaille");
    expect(r[0]).toMatchObject({ qte: "2", pu: "600,00 €", total: "1 200,00 €" });
    expect(r[0].detail).toContain("1200 × 400 × 2000 mm");
  });
  it("synthétique : totaux par zone/chapitre seulement, aucun prix par objet", () => {
    const r = lignesTableau(base, base.lignes[0], "synthetique");
    expect(r[0]).toMatchObject({ pu: "", total: "", detail: "" });
  });
  it("nom propre du chantier sans préfixe interne", () => {
    expect(nomPropreChantier("9500_Inauguration_Hopital")).toBe("Inauguration Hopital");
    expect(nomPropreChantier("Stand FIJI")).toBe("Stand FIJI");
  });
  it("chapitres : descriptif client court (moyens lus dans le libellé), jamais le libellé interne", () => {
    const lib = "Livraison et mise en place – hôpital, veille ou matin du 02/12/2026 (1 chef + 1 monteur, camion 20 m³)";
    const d = descriptifClientChapitre({ dates: {}, chantier: null }, { type: "chapitre_pose", libelle: lib, descriptif_client: null });
    expect(d).toContain("Moyens : 1 chef + 1 monteur, camion 20 m³");
    expect(d).toContain("Veille ou matin du 02/12/2026");
    expect(d).not.toContain(lib);
  });
  it("numérotation N.k et unité u sur les objets", () => {
    expect(lignesTableau(base, base.lignes[0], "detaille", "1")[0]).toMatchObject({ n: "1.1", unite: "u" });
  });
  it("option non incluse exclue du sous-total de la zone (cas 9477)", () => {
    const vc: DevisClient = { ...base, lignes: [
      { ...base.lignes[0], sous_total: 5601.47 },
      { ...base.lignes[1], montant: 3319.47 },
      { ...base.lignes[2], id: "o2", parent_id: "z", ordre: 2, option_incluse: false, sous_total: 2282 },
    ] };
    expect(totalAffiche(vc, vc.lignes[0])).toBe(3319.47);
    expect(totalAffiche(vc, { ...vc.lignes[0] })).not.toBe(5601.47);
  });
  it("chapitre : titre court, libellé complet en descriptif", () => {
    const c = { type: "chapitre_pose", libelle: "Livraison et mise en place – hôpital, veille ou matin du 02/12/2026 (1 chef + 1 monteur, camion 20 m³)" };
    expect(titreCourt(c)).toBe("Livraison et mise en place");
    expect(descriptifChapitre(c)).toBe(c.libelle);
    expect(titreCourt({ type: "chapitre_depose", libelle: "Dépose" })).toBe("Dépose");
    expect(titreCourt({ type: "chapitre_depose", libelle: "" })).toBe("Reprise");
    expect(titreCourt({ type: "chapitre_suivi", libelle: "Suivi et plans" })).toBe("Suivi et plans");
  });
  it("dimensions une seule fois quand le descriptif les contient", () => {
    const o = { ...base.lignes[1], descriptif_client: "Dimensions : Longueur 1200\nFinition : laqué" };
    expect(detailObjet(o)).not.toContain("×");
    expect(detailObjet(o).match(/laqué/g)).toHaveLength(1);
  });
  it("fiche client incomplète : adresse, CP, SIRET et TVA manquants", () => {
    expect(champsClientManquants(base.client)).toEqual(["adresse", "code postal", "SIRET", "TVA intracommunautaire"]);
    expect(champsClientManquants({ nom: "X", adresse: "1 rue", code_postal: "75001", ville: "Paris", siret: "1", tva_intracom: "FR1" })).toEqual([]);
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
    expect(t).toContain("non comprises dans le total");
    expect(t).toContain("Signature du client");
    expect(t).toContain("Pour SET UP");
    expect(t).toMatch(/page 1 \/ \d/);
    expect(t).toContain("Options \\(non comprises dans le total\\)");
  });
});
