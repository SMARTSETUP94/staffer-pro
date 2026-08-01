import { describe, it, expect } from "vitest";
import {
  buildCellIndex,
  cellKey,
  computePrefillLines,
  ecartVsDevis,
  formatHeures,
  groupObjetsByLot,
  metiersVisibles,
  objetOrigine,
  objetSousTraitance,
  objetsACompleter,
  parseHeures,
  totalGeneral,
  totalHorsDevis,
  totalObjet,
  totauxParMetier,
  type GrilleCell,
  type GrilleLot,
  type GrilleMetier,
  type GrilleObjet,
} from "../grille-fabrication";

const metiers: GrilleMetier[] = [
  { id: 1, code: "construction", libelle: "Menuiserie", ordre: 1, couleur: null },
  { id: 3, code: "peinture", libelle: "Peinture", ordre: 3, couleur: null },
  { id: 6, code: "machiniste", libelle: "Machiniste", ordre: 6, couleur: null },
];

const objets: GrilleObjet[] = [
  { id: "o1", reference: "1.1", nom: "Cloison A", ordre: 1, lot_id: "L1" },
  { id: "o2", reference: "1.2", nom: "Cloison B", ordre: 2, lot_id: null },
  { id: "o3", reference: "1.3", nom: "Praticable", ordre: 3, lot_id: null },
];

const cell = (p: Partial<GrilleCell> & Pick<GrilleCell, "objet_id" | "metier_id">): GrilleCell => ({
  id: `${p.objet_id}-${p.metier_id}`,
  heures_prevues: 0,
  origine: "devis",
  note: null,
  sous_traitance: false,
  ...p,
});

const cells: GrilleCell[] = [
  cell({ objet_id: "o1", metier_id: 1, heures_prevues: 10 }),
  cell({ objet_id: "o1", metier_id: 3, heures_prevues: 4.5, origine: "ajout", note: "Placage galva" }),
  cell({ objet_id: "o2", metier_id: 1, heures_prevues: 6, sous_traitance: true }),
  cell({ objet_id: "o3", metier_id: 1, heures_prevues: 0 }),
];

describe("grille-fabrication — totaux", () => {
  it("indexe les cellules par (objet, métier)", () => {
    const idx = buildCellIndex(cells);
    expect(idx.get(cellKey("o1", 3))?.heures_prevues).toBe(4.5);
    expect(idx.has(cellKey("o2", 3))).toBe(false);
  });

  it("totalObjet somme tous les métiers de l'objet", () => {
    expect(totalObjet(cells, "o1")).toBe(14.5);
    expect(totalObjet(cells, "o3")).toBe(0);
  });

  it("totauxParMetier agrège par colonne", () => {
    expect(totauxParMetier(cells)).toEqual({ 1: 16, 3: 4.5 });
  });

  it("totalGeneral somme la grille entière", () => {
    expect(totalGeneral(cells)).toBe(20.5);
  });

  it("totalHorsDevis ne compte que les lignes 'ajout'", () => {
    expect(totalHorsDevis(cells)).toBe(4.5);
  });
});

describe("grille-fabrication — écart devis", () => {
  it("positif quand le prévu dépasse le devis", () => {
    expect(ecartVsDevis({ 1: 16 }, { 1: 12 })).toEqual({ 1: 4 });
  });

  it("négatif quand on est sous le devis", () => {
    expect(ecartVsDevis({ 1: 8 }, { 1: 12 })).toEqual({ 1: -4 });
  });

  it("couvre les métiers présents d'un seul côté", () => {
    expect(ecartVsDevis({ 1: 5 }, { 3: 2 })).toEqual({ 1: 5, 3: -2 });
  });
});

describe("grille-fabrication — complétude & origine", () => {
  it("détecte les objets sans aucune heure", () => {
    expect(objetsACompleter(objets, cells)).toEqual(["o3"]);
  });

  it("objetOrigine = 'ajout' dès qu'une cellule est un ajout", () => {
    expect(objetOrigine(cells, "o1")).toBe("ajout");
    expect(objetOrigine(cells, "o2")).toBe("devis");
    expect(objetOrigine([], "o9")).toBeNull();
  });

  it("objetSousTraitance vrai si une cellule est sous-traitée", () => {
    expect(objetSousTraitance(cells, "o2")).toBe(true);
    expect(objetSousTraitance(cells, "o1")).toBe(false);
  });
});

describe("grille-fabrication — colonnes & lots", () => {
  it("masque les métiers sans heures par défaut", () => {
    expect(metiersVisibles(metiers, cells).map((m) => m.id)).toEqual([1, 3]);
  });

  it("affiche tous les métiers triés par ordre en mode showAll", () => {
    expect(metiersVisibles(metiers, cells, true).map((m) => m.id)).toEqual([1, 3, 6]);
  });

  it("groupe les objets par lot puis les orphelins", () => {
    const lots: GrilleLot[] = [{ id: "L1", nom: "Lot scène", ordre: 1, couleur: null }];
    const groups = groupObjetsByLot(objets, lots);
    expect(groups[0]?.lot?.id).toBe("L1");
    expect(groups[0]?.objets.map((o) => o.id)).toEqual(["o1"]);
    expect(groups[1]?.lot).toBeNull();
    expect(groups[1]?.objets.map((o) => o.id)).toEqual(["o2", "o3"]);
  });
});

describe("grille-fabrication — pré-remplissage devis", () => {
  it("ne crée que les lignes manquantes (non destructif)", () => {
    const lines = computePrefillLines(objets, cells, { 1: 30, 3: 9 });
    // métier 1 : o1/o2/o3 déjà présents → rien ; métier 3 : o2 et o3 manquants
    expect(lines).toEqual([
      { objet_id: "o2", metier_id: 3, heures_prevues: 3 },
      { objet_id: "o3", metier_id: 3, heures_prevues: 3 },
    ]);
  });

  it("ignore les métiers sans heures au devis", () => {
    expect(computePrefillLines(objets, [], { 1: 0 })).toEqual([]);
  });
});

describe("grille-fabrication — formats", () => {
  it("affiche un point discret pour 0", () => {
    expect(formatHeures(0)).toBe("·");
    expect(formatHeures(null)).toBe("·");
    expect(formatHeures(12)).toBe("12 h");
    expect(formatHeures(12.5)).toBe("12,5 h");
  });

  it("parse les saisies avec virgule et rejette l'invalide", () => {
    expect(parseHeures("12,5")).toBe(12.5);
    expect(parseHeures(" 8 ")).toBe(8);
    expect(parseHeures("")).toBe(0);
    expect(parseHeures("abc")).toBeNull();
    expect(parseHeures("-3")).toBeNull();
  });
});
