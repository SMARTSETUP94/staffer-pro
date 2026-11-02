import { describe, expect, it } from "vitest";
import { calculerDevis, sousArbre, texteCoutsManquants, type CalcLigne } from "../calcul";
import { ordreArbre } from "../arbre";

// Décor 2 exemplaires : construction 8 h, peinture 300 € au montant (6 h), plans BEM 4 h,
// MDF 19 CIF 17,39 m², tasseau 30 ml, régularisation −50 commune.
const lignes: CalcLigne[] = [
  { id: "z", parent_id: null, type: "zone", quantite: 1 },
  { id: "o", parent_id: "z", type: "objet", quantite: 2 },
];
const heures = [
  { ligne_id: "o", heures: 8, taux_vente: 50, cout_revient: 32, par_unite: true, metier_id: 1, poste_libelle: "Construction" },
  { ligne_id: "o", heures: 6, taux_vente: 46, cout_revient: 30, par_unite: true, metier_id: 3, montant_force: 300, poste_libelle: "Peinture" },
  { ligne_id: "o", heures: 4, taux_vente: 75, cout_revient: 50, par_unite: true, metier_id: 8, poste_libelle: "Plans BEM" },
];
const mats = [
  { ligne_id: "o", quantite: 17.39, prix_achat: 8.8, coefficient: 1.45 },
  { ligne_id: "o", quantite: 30, prix_achat: 5.8024, coefficient: 1.45 },
];
const libres = [{ ligne_id: "o", quantite: 1, prix_forfait: -50, prix_achat: null, coefficient: 1, par_unite: false, designation: "Régularisation" }];

describe("coûts de revient et marge", () => {
  it("décor : total 2 898,60 € inchangé, marge décomposée", () => {
    const r = calculerDevis(lignes, heures, mats, libres);
    expect(r.total_ht).toBe(2898.6);
    expect(r.decomposition.main_oeuvre).toEqual({ cout: 1272, vente: 2000 });
    expect(r.decomposition.materiaux).toEqual({ cout: 654.21, vente: 948.6 });
    expect(r.decomposition.autres.vente).toBe(-50);
    expect(r.cout_total).toBe(1926.21);
    expect(r.marge).toBe(972.39);
    expect(r.marge_pct).toBe(33.5);
    expect(r.cout_complet).toBe(true);
    expect(sousArbre(lignes, r.detail, "z").materiaux.cout).toBe(654.21);
  });
  it("coursier : son coût est compté", () => {
    const r = calculerDevis(lignes, heures, mats, [...libres, { ligne_id: "z", quantite: 3, prix_forfait: 110, prix_achat: 50, coefficient: 1, par_unite: false, designation: "Coursier 22 m³" }]);
    expect(r.decomposition.autres.cout).toBe(150);
    expect(r.cout_total).toBe(2076.21);
  });
  it("métallerie sans coût : marge partielle et alerte", () => {
    const r = calculerDevis(lignes, [...heures, { ligne_id: "z", heures: 4, taux_vente: 55, cout_revient: null, par_unite: true, metier_id: 2, poste_libelle: "Métallerie" }], mats, libres);
    expect(r.cout_complet).toBe(false);
    expect(r.cout_total).toBe(1926.21);
    expect(r.marge).toBeCloseTo(r.net_ht - 1926.21, 2);
    expect(texteCoutsManquants(r.couts_manquants)).toBe("coût manquant : métallerie (4 h)");
  });
  it("ligne libre vendue sans coût : signalée, pas comptée à 100 % de marge silencieusement", () => {
    const r = calculerDevis(lignes, heures, mats, [{ ligne_id: "z", quantite: 1, prix_forfait: 750, prix_achat: null, coefficient: 1, par_unite: false, designation: "Semi-remorque" }]);
    expect(r.couts_manquants).toEqual([{ type: "libre", libelle: "Semi-remorque", heures: null }]);
  });
});

describe("vue client : ordre de l'arbre", () => {
  it("zones, objets, chapitres et commentaires à leur place", () => {
    const l = [
      { id: "c2", parent_id: null, ordre: 3, n: "Chapitre Pose" },
      { id: "o2", parent_id: "z1", ordre: 2, n: "Objet 2" },
      { id: "com", parent_id: null, ordre: 0, n: "Commentaire de tête" },
      { id: "z1", parent_id: null, ordre: 1, n: "Zone Fabrication" },
      { id: "o1", parent_id: "z1", ordre: 1, n: "Objet 1" },
      { id: "k", parent_id: "o1", ordre: 1, n: "Commentaire objet 1" },
      { id: "c1", parent_id: null, ordre: 2, n: "Chapitre Suivi" },
    ];
    expect(ordreArbre(l).map((x) => x.n)).toEqual([
      "Commentaire de tête", "Zone Fabrication", "Objet 1", "Commentaire objet 1", "Objet 2", "Chapitre Suivi", "Chapitre Pose",
    ]);
  });
});
