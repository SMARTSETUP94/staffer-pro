import { describe, it, expect } from "vitest";
import {
  calcAvancementObjet,
  calcAvancementAffaire,
  type FabricationObjet,
  type FabricationEtape,
  type FabricationEtapeType,
  type FabricationEtapeStatut,
} from "@/hooks/use-fabrication";
import { getEligibleEtapesForRoles } from "@/hooks/use-objets-affaire-light";

function makeEtape(type: FabricationEtapeType, statut: FabricationEtapeStatut): FabricationEtape {
  return {
    id: `${type}-${statut}`,
    objet_id: "obj1",
    type_etape: type,
    statut,
    assignee_id: null,
    assignee_name: null,
    validateur_id: null,
    date_debut: null,
    date_fin: null,
    commentaire: null,
  };
}

function makeObjet(etapes: FabricationEtape[], archive = false): FabricationObjet {
  return {
    id: "obj1",
    affaire_id: "aff1",
    devis_id: null,
    reference: "FAB-2026-00001",
    nom: "Objet test",
    quantite: 1,
    respo_fab_id: null,
    respo_fab_name: null,
    type_finition: "aucune",
    commentaire: null,
    ordre: 0,
    archive,
    created_at: new Date().toISOString(),
    a_dessiner: true,
    a_usiner: true,
    a_construire: true,
    est_brut: false,
    a_emballer: true,
    heures_prevues_be: 0,
    heures_prevues_numerique: 0,
    heures_prevues_bois: 0,
    heures_prevues_metal: 0,
    heures_prevues_peinture: 0,
    heures_prevues_tapisserie: 0,
    heures_prevues_manutention: 0,
    budget_materiaux: 0,
    etapes,
  };
}

describe("calcAvancementObjet — ignore non_applicable correctement", () => {
  it("renvoie 100% quand toutes les étapes sont termine", () => {
    const o = makeObjet([
      makeEtape("be", "termine"),
      makeEtape("respo_fab", "termine"),
      makeEtape("finition", "termine"),
      makeEtape("manutention", "termine"),
    ]);
    expect(calcAvancementObjet(o)).toBe(100);
  });

  it("compte non_applicable comme done (4/4 = 100%)", () => {
    const o = makeObjet([
      makeEtape("be", "non_applicable"),
      makeEtape("respo_fab", "termine"),
      makeEtape("finition", "non_applicable"),
      makeEtape("manutention", "termine"),
    ]);
    expect(calcAvancementObjet(o)).toBe(100);
  });

  it("partiel : 1 termine + 1 non_applicable + 2 a_faire = 50%", () => {
    const o = makeObjet([
      makeEtape("be", "termine"),
      makeEtape("respo_fab", "non_applicable"),
      makeEtape("finition", "a_faire"),
      makeEtape("manutention", "a_faire"),
    ]);
    expect(calcAvancementObjet(o)).toBe(50);
  });

  it("renvoie 0 si aucune étape", () => {
    const o = makeObjet([]);
    expect(calcAvancementObjet(o)).toBe(0);
  });

  it("avancement affaire global ignore aussi non_applicable", () => {
    const o1 = makeObjet([
      makeEtape("be", "termine"),
      makeEtape("respo_fab", "non_applicable"),
    ]);
    const o2 = makeObjet([
      makeEtape("finition", "a_faire"),
      makeEtape("manutention", "termine"),
    ]);
    // 3/4 = 75%
    expect(calcAvancementAffaire([o1, o2])).toBe(75);
  });
});

describe("Détection 'affaire prête à livrer' — Manutention seulement", () => {
  // Réimplémente la même logique que la fiche fabrication pour la tester en isolation
  function isPretALivrer(objets: FabricationObjet[]): boolean {
    const objetsActifs = objets.filter((o) => !o.archive);
    const manut = objetsActifs.flatMap((o) =>
      o.etapes.filter((e) => e.type_etape === "manutention"),
    );
    return (
      objetsActifs.length > 0 &&
      manut.length > 0 &&
      manut.every((e) => e.statut === "termine" || e.statut === "non_applicable")
    );
  }

  it("vrai quand toutes manutention sont termine", () => {
    const o = makeObjet([
      makeEtape("be", "a_faire"), // ignoré
      makeEtape("manutention", "termine"),
    ]);
    expect(isPretALivrer([o])).toBe(true);
  });

  it("vrai avec mix termine + non_applicable", () => {
    const o1 = makeObjet([makeEtape("manutention", "termine")]);
    const o2 = makeObjet([makeEtape("manutention", "non_applicable")]);
    expect(isPretALivrer([o1, o2])).toBe(true);
  });

  it("faux si une manutention est en_cours", () => {
    const o1 = makeObjet([makeEtape("manutention", "termine")]);
    const o2 = makeObjet([makeEtape("manutention", "en_cours")]);
    expect(isPretALivrer([o1, o2])).toBe(false);
  });

  it("faux s'il n'y a aucun objet actif", () => {
    expect(isPretALivrer([])).toBe(false);
  });

  it("ignore les objets archivés", () => {
    const archived = makeObjet([makeEtape("manutention", "a_faire")], true);
    const active = makeObjet([makeEtape("manutention", "termine")]);
    expect(isPretALivrer([archived, active])).toBe(true);
  });

  it("faux si aucune étape Manutention applicable et présente", () => {
    const o = makeObjet([makeEtape("be", "termine")]);
    expect(isPretALivrer([o])).toBe(false);
  });
});

describe("getEligibleEtapesForRoles — Bloc 5", () => {
  it("renvoie [] si aucun flag", () => {
    expect(
      getEligibleEtapesForRoles({
        est_bureau_etude: false,
        est_respo_fab: false,
        est_finition: false,
        est_manutention: false,
      }),
    ).toEqual([]);
  });

  it("filtre selon les flags actifs (BE + Manutention)", () => {
    expect(
      getEligibleEtapesForRoles({
        est_bureau_etude: true,
        est_respo_fab: false,
        est_finition: false,
        est_manutention: true,
      }),
    ).toEqual(["be", "manutention"]);
  });

  it("renvoie les 4 si tous les flags sont actifs", () => {
    expect(
      getEligibleEtapesForRoles({
        est_bureau_etude: true,
        est_respo_fab: true,
        est_finition: true,
        est_manutention: true,
      }),
    ).toEqual(["be", "respo_fab", "finition", "manutention"]);
  });
});
