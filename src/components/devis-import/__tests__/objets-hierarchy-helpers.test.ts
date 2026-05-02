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
