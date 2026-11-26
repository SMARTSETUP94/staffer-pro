import { describe, expect, it } from "vitest";
import { construireExportEquipe, cellulesInterdites, nomFichierEquipe, COLONNES_MATERIAUX, type DonneesEquipe } from "../export-equipe";

/** Devis fictif : une zone, un objet de 18 unités, une option non incluse, un chapitre suivi, une ligne libre à heures. */
const d: DonneesEquipe = {
  numero: "9999", version: 1, libelle: "Test", client: "Client", affaire: "9999 · Test",
  date_devis: "2026-11-26", date_validite: "2026-12-26", total_ht: 1000, net_ht: 900,
  lignes: [
    { id: "z1", parent_id: null, type: "zone", ordre: 1, libelle: "Stand", quantite: 1 },
    { id: "o1", parent_id: "z1", type: "objet", ordre: 1, libelle: "Lame", quantite: 18 },
    { id: "op1", parent_id: "z1", type: "option", ordre: 2, libelle: "Éclairage", quantite: 1, option_incluse: false },
    { id: "o2", parent_id: "op1", type: "objet", ordre: 1, libelle: "Lampe", quantite: 1 },
    { id: "c1", parent_id: null, type: "chapitre_suivi", ordre: 9, libelle: null, quantite: 1 },
  ],
  heures: [
    { ligne_id: "o1", heures: 2, par_unite: true, metier_id: 1, poste_libelle: "Menuisier", niveau: "P" },
    { ligne_id: "o1", heures: 1, par_unite: false, metier_id: 2, poste_libelle: "Peintre", niveau: "S" },
    { ligne_id: "op1", heures: 5, par_unite: false, metier_id: 2, poste_libelle: "Électricien", niveau: "P" },
    { ligne_id: "o2", heures: 2, par_unite: false, metier_id: 2, poste_libelle: "Monteur", niveau: "P" },
    { ligne_id: "c1", heures: 10, par_unite: false, metier_id: 3, poste_libelle: "Chef", niveau: "X" },
    // Ligne mise à la corbeille : le lecteur renvoie encore cette heure, elle ne doit pas sortir.
    { ligne_id: "z9", heures: 7, par_unite: false, metier_id: 1, poste_libelle: "Corbeille", niveau: "P" },
  ],
  materiaux: [
    { ligne_id: "o1", designation: "Contreplaqué 18 mm", fournisseur: "X", ref: "CP18", unite: "plaque", quantite: 4 },
    { ligne_id: "z9", designation: "Vis à l'unité", fournisseur: null, ref: null, unite: "sac", quantite: 1 },
  ],
  libres: [{ ligne_id: "o1", designation: "Forfait divers", unite: "ens", quantite: 1, par_unite: false, heures_info: 3, metier_id: null }],
  metiers: [{ id: 1, libelle: "Construction" }, { id: 2, libelle: "Métallerie" }, { id: 3, libelle: "Suivi projet" }],
};

const res = construireExportEquipe(d);
const ligneDe = (n: string) => res.objets.find((l) => l[0] === n) ?? [];

describe("Version équipe : heures par objet", () => {
  it("les heures d'un objet sont ses heures propres, multipliées par la quantité si par unité", () => {
    expect(res.objets[0]).toEqual(["N°", "Désignation", "Type", "Qté", "Inclus", "Construction", "Métallerie", "Suivi projet", "Sans métier", "Total h", "Total avec enfants"]);
    // 2 h × 18 unités = 36 h de construction, 1 h de métallerie, 3 h de ligne libre sans métier.
    expect(ligneDe("1.1")).toEqual(["1.1", "Lame", "Objet", 18, "oui", 36, 1, null, 3, 40, 40]);
  });

  it("une zone cumule les heures de ses enfants mais pas celles d'une option non incluse", () => {
    expect(ligneDe("1")).toEqual(["1", "Stand", "Zone", 1, "oui", null, null, null, null, null, 40]);
  });

  it("l'option non incluse reste affichée, marquée hors total, et ses heures sont isolées", () => {
    expect(ligneDe("1.2")).toEqual(["1.2", "Éclairage", "Option", 1, "non (option)", null, 5, null, null, 5, 7]);
    // Le récapitulatif ne liste que l'option elle-même, pas chacun de ses objets.
    expect(res.fiche.options_hors_total).toEqual([{ libelle: "1.2 Éclairage", heures: 7 }]);
    expect(ligneDe("1.2.1")).toEqual(["1.2.1", "Lampe", "Objet", 1, "non (option)", null, 2, null, null, 2, 2]);
  });

  it("les éléments rattachés à une ligne mise à la corbeille sont écartés et annoncés", () => {
    expect(res.fiche.nb_ignores).toBe(2); // 1 heure + 1 matériau sur une ligne absente des lignes du devis
    expect(res.detail.some((l) => l.includes("Corbeille"))).toBe(false);
    expect(res.materiaux.some((l) => l.includes("Vis à l'unité"))).toBe(false);
    expect(res.synthese.some((l) => String(l[0]) === "Éléments ignorés")).toBe(true);
  });

  it("le total d'heures exclut les options non incluses (même règle que le KPI de l'éditeur)", () => {
    expect(res.fiche.total_heures).toBe(50); // 36 + 1 + 3 + 10, les 7 h de l'option sont hors total
    expect(res.fiche.heures_par_metier).toEqual([
      { metier: "Construction", heures: 36 }, { metier: "Métallerie", heures: 1 },
      { metier: "Suivi projet", heures: 10 }, { metier: "Sans métier", heures: 3 },
    ]);
  });

  it("le chapitre suivi est numéroté après les zones", () => {
    expect(ligneDe("2")).toEqual(["2", "Suivi et plans", "Suivi et plans", 1, "oui", null, null, 10, null, 10, 10]);
  });
});

describe("Version équipe : détail et matériaux", () => {
  it("une ligne par saisie d'heure, plus les lignes libres qui portent des heures", () => {
    expect(res.detail[0]).toEqual(["N°", "Objet", "Poste", "Niveau", "Heures", "Par unité", "Total h"]);
    expect(res.detail).toHaveLength(7); // 5 saisies valables + 1 ligne libre + l'en-tête ; la saisie de la ligne à la corbeille est écartée
    expect(res.detail.find((l) => l[2] === "Forfait divers")).toEqual(["1.1", "1.1 Lame", "Forfait divers", "Forfait", 3, "non", 3]);
  });

  it("les matériaux sortent avec désignation, fournisseur, réf, unité, quantité — jamais de prix", () => {
    expect(res.materiaux[0]).toEqual([...COLONNES_MATERIAUX]);
    expect(res.materiaux[1]).toEqual(["1.1", "1.1 Lame", "Contreplaqué 18 mm", "X", "CP18", "plaque", 4]);
    expect(res.materiaux.flat().some((c) => typeof c === "number" && c > 100)).toBe(false);
  });
});

describe("Version équipe : aucune donnée de coût", () => {
  it("aucune cellule ne mentionne prix, coût, taux, coefficient, marge, achat ou vente", () => {
    expect(cellulesInterdites(res)).toEqual([]);
  });

  it("la synthèse rappelle le total HT et la composition du fichier", () => {
    const synthese = res.synthese.map((l) => l.join(" | ")).join("\n");
    expect(synthese).toContain("Total heures | 50");
    expect(synthese).toContain("Total HT | 1000");
    expect(synthese).toContain("Ne contient pas");
  });
});

describe("Version équipe : nom de fichier", () => {
  it("ajoute la révision quand le numéro ne la porte pas déjà", () => {
    expect(nomFichierEquipe({ numero: "9524", version: 1 })).toBe("Équipe 9524-R1.xlsx");
    expect(nomFichierEquipe({ numero: "9524-R2", version: 2 })).toBe("Équipe 9524-R2.xlsx");
  });
});
