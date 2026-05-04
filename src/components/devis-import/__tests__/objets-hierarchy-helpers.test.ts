/**
 * v0.31.4d — Tests Vitest des helpers purs de la modale hiérarchique d'import devis.
 * Couvre : recomputeObjet (sectionQte × quantite), computeCounters (auto vs manuel),
 * movePosteBetweenObjets, removePosteFromObjet, removeObjet, renamePoste.
 */
import { describe, expect, it } from "vitest";
import { emptyHeures } from "@/lib/devis-parser/compute-flags";
import type { PosteCandidat } from "@/lib/devis-parser/types";
import {
  computeCounters,
  movePosteBetweenObjets,
  recomputeObjet,
  mergeObjetsInSection,
  getMergeButtonState,
  removeObjet,
  removePosteFromObjet,
  renamePoste,
  type EditableObjet,
} from "../objets-hierarchy-helpers";

function poste(over: Partial<PosteCandidat> = {}): PosteCandidat {
  return {
    id: "p1",
    numero: "1.1.1",
    rowIndex: 1,
    designation: "poste",
    metierAuto: "bois",
    metier: "bois",
    heuresUnitaires: 1,
    quantite: 1,
    totalHt: null,
    isMatiere: false,
    isMatiereOverride: null,
    isRegul: false,
    autoMapped: true,
    ...over,
  };
}

function objet(over: Partial<EditableObjet> = {}): EditableObjet {
  return {
    selected: true,
    numero: "1.1",
    sectionNumero: "1",
    sectionNom: "Section",
    sectionQuantite: 1,
    nom: "Objet",
    description: null,
    quantite: 1,
    heures: emptyHeures(),
    budgetMateriaux: 0,
    typeFinition: "aucune",
    flags: { a_dessiner: false, a_usiner: false, a_construire: false, est_brut: true, a_emballer: false },
    confidence: "high",
    warnings: [],
    postes: [],
    ...over,
  };
}

describe("recomputeObjet", () => {
  it("multiplie heures par quantite objet et sectionQuantite", () => {
    const o = recomputeObjet(
      objet({
        quantite: 60,
        sectionQuantite: 1,
        postes: [poste({ heuresUnitaires: 0.5, metier: "bois" })],
      }),
    );
    expect(o.heures.bois).toBe(30);
  });

  it("applique sectionQuantite × quantite (devis 2128 case)", () => {
    // Section qte=3, objet qte=1, poste 10h -> 30h
    const o = recomputeObjet(
      objet({
        quantite: 1,
        sectionQuantite: 3,
        postes: [poste({ heuresUnitaires: 10, metier: "bois" })],
      }),
    );
    expect(o.heures.bois).toBe(30);
  });

  it("matériel : budget = totalHt × quantite × sectionQuantite", () => {
    const o = recomputeObjet(
      objet({
        quantite: 5,
        sectionQuantite: 2,
        postes: [poste({ isMatiere: true, totalHt: 100, heuresUnitaires: 0, metier: null })],
      }),
    );
    expect(o.budgetMateriaux).toBe(1000);
    expect(o.heures.bois).toBe(0);
  });

  it("régul : budget += totalHt × sectionQuantite (sans quantite objet)", () => {
    const o = recomputeObjet(
      objet({
        quantite: 10,
        sectionQuantite: 2,
        postes: [poste({ isRegul: true, totalHt: 50, heuresUnitaires: 0 })],
      }),
    );
    expect(o.budgetMateriaux).toBe(100);
  });

  it("override isMatiere bascule un poste heures vers matériel", () => {
    const o = recomputeObjet(
      objet({
        quantite: 1,
        postes: [
          poste({
            metier: "bois",
            heuresUnitaires: 5,
            isMatiere: false,
            isMatiereOverride: true,
            totalHt: 200,
          }),
        ],
      }),
    );
    expect(o.heures.bois).toBe(0);
    expect(o.budgetMateriaux).toBe(200);
  });

  it("recalcule flags et typeFinition", () => {
    const o = recomputeObjet(
      objet({
        quantite: 1,
        postes: [
          poste({ id: "a", metier: "be", heuresUnitaires: 2 }),
          poste({ id: "b", metier: "peinture", heuresUnitaires: 3 }),
        ],
      }),
    );
    expect(o.flags.a_dessiner).toBe(true);
    expect(o.flags.est_brut).toBe(false);
    expect(o.typeFinition).toBe("peinture");
  });
});

describe("computeCounters", () => {
  it("compte total / auto / manuel correctement", () => {
    const objets = [
      objet({
        postes: [
          poste({ id: "1", metier: "bois", heuresUnitaires: 2 }), // auto
          poste({ id: "2", metier: null, heuresUnitaires: 1 }), // manuel
          poste({ id: "3", isMatiere: true, totalHt: 10, metier: null, heuresUnitaires: 0 }), // auto (matière)
        ],
      }),
    ];
    const c = computeCounters(objets);
    expect(c.total).toBe(3);
    expect(c.auto).toBe(2);
    expect(c.manuel).toBe(1);
    expect(c.ratio).toBe(67);
  });

  it("ratio = 100% si liste vide", () => {
    expect(computeCounters([]).ratio).toBe(100);
  });

  it("totalHeures pondère par quantite objet", () => {
    const objets = [
      objet({
        quantite: 4,
        postes: [
          poste({ id: "1", metier: "bois", heuresUnitaires: 2 }), // 8 h auto
          poste({ id: "2", metier: null, heuresUnitaires: 1 }), // 4 h manuel
        ],
      }),
    ];
    const c = computeCounters(objets);
    expect(c.heuresAuto).toBe(8);
    expect(c.heuresManuel).toBe(4);
    expect(c.totalHeures).toBe(12);
  });
});

describe("movePosteBetweenObjets", () => {
  const baseObjets = (): EditableObjet[] => [
    objet({ numero: "1.1", postes: [poste({ id: "a", metier: "bois", heuresUnitaires: 2 })] }),
    objet({ numero: "1.2", postes: [] }),
  ];

  it("déplace un poste et recompute les deux objets", () => {
    const next = movePosteBetweenObjets(baseObjets(), 0, "a", 1);
    expect(next[0].postes).toHaveLength(0);
    expect(next[0].heures.bois).toBe(0);
    expect(next[1].postes).toHaveLength(1);
    expect(next[1].heures.bois).toBe(2);
  });

  it("noop si source = destination", () => {
    const before = baseObjets();
    const next = movePosteBetweenObjets(before, 0, "a", 0);
    expect(next).toBe(before);
  });

  it("noop si poste introuvable", () => {
    const before = baseObjets();
    const next = movePosteBetweenObjets(before, 0, "ghost", 1);
    expect(next[0].postes).toHaveLength(1);
    expect(next[1].postes).toHaveLength(0);
  });
});

describe("removePosteFromObjet / removeObjet / renamePoste", () => {
  it("removePosteFromObjet retire le poste et recompute", () => {
    const o = objet({
      postes: [
        poste({ id: "a", metier: "bois", heuresUnitaires: 5 }),
        poste({ id: "b", metier: "metal", heuresUnitaires: 3 }),
      ],
    });
    const next = removePosteFromObjet([o], 0, "a");
    expect(next[0].postes).toHaveLength(1);
    expect(next[0].heures.bois).toBe(0);
    expect(next[0].heures.metal).toBe(3);
  });

  it("removeObjet retire l'objet entier", () => {
    const list = [objet({ numero: "1.1" }), objet({ numero: "1.2" })];
    const next = removeObjet(list, 0);
    expect(next).toHaveLength(1);
    expect(next[0].numero).toBe("1.2");
  });

  it("renamePoste change la désignation sans toucher heures", () => {
    const o = objet({
      postes: [poste({ id: "a", designation: "ancien", metier: "bois", heuresUnitaires: 2 })],
    });
    const next = renamePoste([o], 0, "a", "nouveau libellé");
    expect(next[0].postes[0].designation).toBe("nouveau libellé");
    expect(next[0].postes[0].heuresUnitaires).toBe(2);
  });
});

describe("mergeObjetsInSection (v0.39.1)", () => {
  it("fusionne 2 objets de la même Section : somme heures + nouvelle ref + nom", () => {
    const o1 = objet({
      numero: "1.1",
      sectionNumero: "1",
      nom: "Bar fab",
      postes: [poste({ id: "a", metier: "bois", heuresUnitaires: 3 })],
    });
    const o2 = objet({
      numero: "1.2",
      sectionNumero: "1",
      nom: "Linteau",
      postes: [poste({ id: "b", metier: "bois", heuresUnitaires: 2 })],
    });
    const next = mergeObjetsInSection([o1, o2], [0, 1], "BAR", "Bar complet");
    expect(next).toHaveLength(1);
    expect(next[0].numero).toBe("BAR");
    expect(next[0].nom).toBe("Bar complet");
    expect(next[0].heures.bois).toBe(5);
    expect(next[0].postes).toHaveLength(2);
    expect(next[0].description).toContain("Fusion de : 1.1, 1.2");
  });

  it("agrège heures par métier distinct", () => {
    const o1 = objet({
      numero: "1.1",
      sectionNumero: "1",
      postes: [poste({ id: "a", metier: "bois", heuresUnitaires: 4 })],
    });
    const o2 = objet({
      numero: "1.2",
      sectionNumero: "1",
      postes: [poste({ id: "b", metier: "metal", heuresUnitaires: 6 })],
    });
    const next = mergeObjetsInSection([o1, o2], [0, 1], "M1", "Mix");
    expect(next[0].heures.bois).toBe(4);
    expect(next[0].heures.metal).toBe(6);
  });

  it("NO-OP si objets de sections différentes", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1" });
    const o2 = objet({ numero: "2.1", sectionNumero: "2" });
    const next = mergeObjetsInSection([o1, o2], [0, 1], "X", "X");
    expect(next).toEqual([o1, o2]);
  });

  it("NO-OP si moins de 2 indexes", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1" });
    const next = mergeObjetsInSection([o1], [0], "X", "X");
    expect(next).toEqual([o1]);
  });

  it("insère le merged à la position du premier index et conserve les autres objets", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1" });
    const o2 = objet({ numero: "1.2", sectionNumero: "1" });
    const o3 = objet({ numero: "1.3", sectionNumero: "1" });
    const o4 = objet({ numero: "2.1", sectionNumero: "2" });
    const next = mergeObjetsInSection([o1, o2, o3, o4], [0, 2], "MRG", "Merged");
    expect(next).toHaveLength(3);
    expect(next[0].numero).toBe("MRG");
    expect(next[1].numero).toBe("1.2");
    expect(next[2].numero).toBe("2.1");
  });

  it("fallback si newNumero ou newNom vides : reprend ceux du premier objet", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1", nom: "Premier" });
    const o2 = objet({ numero: "1.2", sectionNumero: "1", nom: "Second" });
    const next = mergeObjetsInSection([o1, o2], [0, 1], "", "");
    expect(next[0].numero).toBe("1.1");
    expect(next[0].nom).toBe("Premier");
  });

  it("respecte sectionQuantite × quantite dans le total heures fusionné", () => {
    const o1 = objet({
      numero: "1.1",
      sectionNumero: "1",
      sectionQuantite: 2,
      quantite: 3,
      postes: [poste({ id: "a", metier: "bois", heuresUnitaires: 1 })],
    });
    const o2 = objet({
      numero: "1.2",
      sectionNumero: "1",
      sectionQuantite: 2,
      quantite: 3,
      postes: [poste({ id: "b", metier: "bois", heuresUnitaires: 4 })],
    });
    const next = mergeObjetsInSection([o1, o2], [0, 1], "X", "X");
    // (1+4) heuresUnitaires × quantite(3) × sectionQte(2) = 30
    expect(next[0].heures.bois).toBe(30);
  });
});

describe("getMergeButtonState (UI guard du bouton Fusionner)", () => {
  it("canMerge=false si aucun objet sélectionné", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1", selected: false });
    const o2 = objet({ numero: "1.2", sectionNumero: "1", selected: false });
    const state = getMergeButtonState([o1, o2], [0, 1]);
    expect(state.canMerge).toBe(false);
    expect(state.count).toBe(0);
    expect(state.selectedIdxs).toEqual([]);
  });

  it("canMerge=false si un seul objet sélectionné", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1", selected: true });
    const o2 = objet({ numero: "1.2", sectionNumero: "1", selected: false });
    const state = getMergeButtonState([o1, o2], [0, 1]);
    expect(state.canMerge).toBe(false);
    expect(state.count).toBe(1);
  });

  it("canMerge=true si ≥2 objets sélectionnés dans la même Section", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1", selected: true });
    const o2 = objet({ numero: "1.2", sectionNumero: "1", selected: true });
    const state = getMergeButtonState([o1, o2], [0, 1]);
    expect(state.canMerge).toBe(true);
    expect(state.count).toBe(2);
    expect(state.selectedIdxs).toEqual([0, 1]);
  });

  it("ne compte que les objets de la Section demandée (cross-section ignoré)", () => {
    // 2 objets cochés mais dans des sections différentes : la Section "1" n'en
    // voit qu'un seul → bouton masqué.
    const o1 = objet({ numero: "1.1", sectionNumero: "1", selected: true });
    const o2 = objet({ numero: "2.1", sectionNumero: "2", selected: true });
    const stateSec1 = getMergeButtonState([o1, o2], [0]); // seulement idx 0 dans Section 1
    expect(stateSec1.canMerge).toBe(false);
    expect(stateSec1.count).toBe(1);
  });

  it("canMerge=true sur un sous-ensemble de la Section (3 objets, 2 cochés)", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1", selected: true });
    const o2 = objet({ numero: "1.2", sectionNumero: "1", selected: false });
    const o3 = objet({ numero: "1.3", sectionNumero: "1", selected: true });
    const state = getMergeButtonState([o1, o2, o3], [0, 1, 2]);
    expect(state.canMerge).toBe(true);
    expect(state.selectedIdxs).toEqual([0, 2]);
  });

  it("ignore les indexes invalides ou objets manquants", () => {
    const o1 = objet({ numero: "1.1", sectionNumero: "1", selected: true });
    const state = getMergeButtonState([o1], [0, 99]);
    expect(state.canMerge).toBe(false);
    expect(state.selectedIdxs).toEqual([0]);
  });

  it("compatible avec mergeObjetsInSection : pré-sélection prête à fusionner", () => {
    const o1 = objet({
      numero: "1.1",
      sectionNumero: "1",
      selected: true,
      postes: [poste({ id: "a", metier: "bois", heuresUnitaires: 2 })],
    });
    const o2 = objet({
      numero: "1.2",
      sectionNumero: "1",
      selected: true,
      postes: [poste({ id: "b", metier: "bois", heuresUnitaires: 3 })],
    });
    const o3 = objet({ numero: "1.3", sectionNumero: "1", selected: false });
    const state = getMergeButtonState([o1, o2, o3], [0, 1, 2]);
    expect(state.canMerge).toBe(true);
    const merged = mergeObjetsInSection([o1, o2, o3], state.selectedIdxs, "MRG", "Merged");
    expect(merged).toHaveLength(2); // 1.1+1.2 fusionnés, 1.3 préservé
    expect(merged[0].heures.bois).toBe(5);
    expect(merged[1].numero).toBe("1.3");
  });
});
