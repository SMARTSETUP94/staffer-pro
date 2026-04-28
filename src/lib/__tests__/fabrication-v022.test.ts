import { describe, it, expect } from "vitest";
import {
  etapeForMetier,
  ETAPES_ORDER,
  ETAPE_TO_FLAG,
  FAB_METIERS,
  type FabricationEtapeType,
  type FabricationEtapeStatut,
} from "@/hooks/use-fabrication";
import { getEligibleEtapesForRoles } from "@/hooks/use-objets-affaire-light";

/**
 * Mirror JS du trigger SQL `create_fabrication_etapes_for_objet` v2.
 * Doit créer 5 étapes (BE, Usinage, Respo Fab, Finition, Manutention).
 */
function simulateCreateEtapesForObjet(flags: {
  a_dessiner: boolean;
  a_usiner: boolean;
  a_construire: boolean;
  est_brut: boolean;
  a_emballer: boolean;
}): Array<{ type_etape: FabricationEtapeType; statut: FabricationEtapeStatut }> {
  return [
    { type_etape: "be", statut: flags.a_dessiner ? "a_faire" : "non_applicable" },
    { type_etape: "usinage", statut: flags.a_usiner ? "a_faire" : "non_applicable" },
    { type_etape: "respo_fab", statut: flags.a_construire ? "a_faire" : "non_applicable" },
    { type_etape: "finition", statut: flags.est_brut ? "non_applicable" : "a_faire" },
    { type_etape: "manutention", statut: flags.a_emballer ? "a_faire" : "non_applicable" },
  ];
}

/** Mirror JS du trigger sync_fabrication_etapes_on_flags_change pour usinage */
function simulateSyncUsinage(
  oldStatut: FabricationEtapeStatut,
  newAUsiner: boolean,
): FabricationEtapeStatut {
  if (newAUsiner === false) return "non_applicable";
  if (oldStatut === "non_applicable") return "a_faire";
  return oldStatut;
}

describe("v0.22 — create_fabrication_etapes_for_objet (5 étapes)", () => {
  it("crée exactement 5 étapes (et plus 4)", () => {
    const etapes = simulateCreateEtapesForObjet({
      a_dessiner: true, a_usiner: true, a_construire: true, est_brut: false, a_emballer: true,
    });
    expect(etapes).toHaveLength(5);
  });

  it("inclut systématiquement l'étape 'usinage' dans l'ordre canonique", () => {
    const etapes = simulateCreateEtapesForObjet({
      a_dessiner: true, a_usiner: true, a_construire: true, est_brut: false, a_emballer: true,
    });
    expect(etapes.map(e => e.type_etape)).toEqual(["be", "usinage", "respo_fab", "finition", "manutention"]);
    expect(ETAPES_ORDER).toEqual(["be", "usinage", "respo_fab", "finition", "manutention"]);
  });

  it("statuts dérivés des flags : tout actif → 5 a_faire (sauf finition gérée par est_brut)", () => {
    const etapes = simulateCreateEtapesForObjet({
      a_dessiner: true, a_usiner: true, a_construire: true, est_brut: false, a_emballer: true,
    });
    expect(etapes.every(e => e.statut === "a_faire")).toBe(true);
  });

  it("a_usiner=false → étape usinage en non_applicable", () => {
    const etapes = simulateCreateEtapesForObjet({
      a_dessiner: true, a_usiner: false, a_construire: true, est_brut: false, a_emballer: true,
    });
    const usinage = etapes.find(e => e.type_etape === "usinage")!;
    expect(usinage.statut).toBe("non_applicable");
  });

  it("est_brut=true → finition non_applicable (logique inversée)", () => {
    const etapes = simulateCreateEtapesForObjet({
      a_dessiner: true, a_usiner: true, a_construire: true, est_brut: true, a_emballer: true,
    });
    expect(etapes.find(e => e.type_etape === "finition")!.statut).toBe("non_applicable");
  });

  it("tous flags désactivés → 5 non_applicable", () => {
    const etapes = simulateCreateEtapesForObjet({
      a_dessiner: false, a_usiner: false, a_construire: false, est_brut: true, a_emballer: false,
    });
    expect(etapes.every(e => e.statut === "non_applicable")).toBe(true);
  });
});

describe("v0.22 — etapeForMetier (7 cas)", () => {
  const cases: Array<[Parameters<typeof etapeForMetier>[0], FabricationEtapeType]> = [
    ["be", "be"],
    ["numerique", "usinage"],
    ["bois", "respo_fab"],
    ["metal", "respo_fab"],
    ["peinture", "finition"],
    ["tapisserie", "finition"],
    ["manutention", "manutention"],
  ];

  it.each(cases)("mappe métier %s → étape %s", (metier, etape) => {
    expect(etapeForMetier(metier)).toBe(etape);
  });

  it("FAB_METIERS contient bien les 7 métiers attendus", () => {
    expect(FAB_METIERS).toEqual(["be", "numerique", "bois", "metal", "peinture", "tapisserie", "manutention"]);
  });

  it("chaque métier mappe vers une étape valide de ETAPES_ORDER", () => {
    for (const m of FAB_METIERS) {
      const etape = etapeForMetier(m);
      expect(etape).not.toBeNull();
      expect(ETAPES_ORDER).toContain(etape);
    }
  });
});

describe("v0.22 — sync_fabrication_etapes_on_flags_change (usinage)", () => {
  it("a_usiner true → false : bascule en non_applicable", () => {
    expect(simulateSyncUsinage("a_faire", false)).toBe("non_applicable");
    expect(simulateSyncUsinage("en_cours", false)).toBe("non_applicable");
    expect(simulateSyncUsinage("termine", false)).toBe("non_applicable");
  });

  it("a_usiner false → true : ré-active en a_faire si non_applicable", () => {
    expect(simulateSyncUsinage("non_applicable", true)).toBe("a_faire");
  });

  it("a_usiner true → true sans toucher aux étapes en cours", () => {
    expect(simulateSyncUsinage("en_cours", true)).toBe("en_cours");
    expect(simulateSyncUsinage("termine", true)).toBe("termine");
  });
});

describe("v0.22 — ETAPE_TO_FLAG inclut Usinage Numérique", () => {
  it("usinage → est_usinage_numerique", () => {
    expect(ETAPE_TO_FLAG.usinage).toBe("est_usinage_numerique");
  });

  it("getEligibleEtapesForRoles renvoie usinage si est_usinage_numerique", () => {
    expect(getEligibleEtapesForRoles({
      est_bureau_etude: false,
      est_usinage_numerique: true,
      est_respo_fab: false,
      est_finition: false,
      est_manutention: false,
    })).toEqual(["usinage"]);
  });

  it("renvoie les 5 étapes si tous flags actifs", () => {
    expect(getEligibleEtapesForRoles({
      est_bureau_etude: true,
      est_usinage_numerique: true,
      est_respo_fab: true,
      est_finition: true,
      est_manutention: true,
    })).toEqual(["be", "usinage", "respo_fab", "finition", "manutention"]);
  });
});
