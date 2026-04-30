/**
 * Test E2E (scénario simulé) — v0.26
 *
 * Scénario complet :
 *   1. Création de 3 objets de fabrication sur une affaire (1 archivé).
 *   2. Affectation depuis le planning par objet :
 *      - 2 assignations rattachées à l'objet OBJ-1 (table assignation_objets)
 *      - 1 assignation rattachée à OBJ-2
 *      - 1 assignation libre (sans objet)
 *      - tentative d'affectation à l'objet archivé → refus
 *   3. Saisie d'heures sur les objets :
 *      - heures validées sur OBJ-1
 *      - heures soumises (en attente) sur OBJ-2
 *      - 1 saisie rejetée → ne doit pas compter
 *   4. Récap heures de l'onglet Affaires :
 *      - heures planifiées = somme des assignations (par devis × métier)
 *      - heures réalisées  = validées + soumises
 *      - tone = warn si ≥85%, danger si >100%
 */

import { describe, it, expect } from "vitest";
import {
  aggregateConsommation,
  canStaffObjet,
  heuresRealiseesParObjet,
  heuresStaffeesParObjet,
  objetsForAssignation,
  type AffaireFixture,
} from "../objet-staffing-impact";
import { computeTotals, enrichLines } from "../affaire-recap-heures";

const AFFAIRE_ID = "AFF-5001";
const DEVIS_ID = "DEV-1";
const METIER_BOIS = 1;
const METIER_METAL = 2;

function buildFixture(): AffaireFixture {
  return {
    affaire_id: AFFAIRE_ID,
    postes: [
      {
        devis_id: DEVIS_ID,
        devis_numero: "D-001",
        metier_id: METIER_BOIS,
        metier: "Construction bois",
        couleur: "#a3e635",
        heures_prevues: 40,
      },
      {
        devis_id: DEVIS_ID,
        devis_numero: "D-001",
        metier_id: METIER_METAL,
        metier: "Métallerie",
        couleur: "#94a3b8",
        heures_prevues: 20,
      },
    ],
    objets: [
      { id: "OBJ-1", affaire_id: AFFAIRE_ID, reference: "M01", nom: "Comptoir" },
      { id: "OBJ-2", affaire_id: AFFAIRE_ID, reference: "M02", nom: "Vitrine" },
      {
        id: "OBJ-3",
        affaire_id: AFFAIRE_ID,
        reference: "M03",
        nom: "Ancien (archivé)",
        archive: true,
      },
    ],
    assignations: [],
    assignation_objets: [],
    heures_saisies: [],
  };
}

describe("E2E — création d'objets + planning par objet + récap heures", () => {
  it("étape 1 : objets créés, archivé non staffable", () => {
    const fx = buildFixture();
    expect(fx.objets).toHaveLength(3);
    expect(canStaffObjet(fx, "OBJ-1").ok).toBe(true);
    expect(canStaffObjet(fx, "OBJ-2").ok).toBe(true);
    const arch = canStaffObjet(fx, "OBJ-3");
    expect(arch.ok).toBe(false);
    expect(arch.reason).toBe("Objet archivé");
    expect(canStaffObjet(fx, "OBJ-INCONNU").ok).toBe(false);
    // Objet d'une autre affaire
    const fxAutre: AffaireFixture = {
      ...fx,
      affaire_id: "AUTRE",
    };
    expect(canStaffObjet(fxAutre, "OBJ-1").ok).toBe(false);
  });

  it("étape 2 : affectation depuis le planning par objet (assignation_objets)", () => {
    const fx = buildFixture();

    // 2 assignations bois sur OBJ-1
    fx.assignations.push(
      { id: "A1", affaire_id: AFFAIRE_ID, devis_id: DEVIS_ID, metier_id: METIER_BOIS, heures: 8 },
      { id: "A2", affaire_id: AFFAIRE_ID, devis_id: DEVIS_ID, metier_id: METIER_BOIS, heures: 4 },
    );
    fx.assignation_objets.push(
      { assignation_id: "A1", objet_id: "OBJ-1" },
      { assignation_id: "A2", objet_id: "OBJ-1" },
    );

    // 1 assignation métal sur OBJ-2
    fx.assignations.push({
      id: "A3",
      affaire_id: AFFAIRE_ID,
      devis_id: DEVIS_ID,
      metier_id: METIER_METAL,
      heures: 8,
    });
    fx.assignation_objets.push({ assignation_id: "A3", objet_id: "OBJ-2" });

    // 1 assignation libre (sans objet) — doit compter dans le récap métier
    fx.assignations.push({
      id: "A4",
      affaire_id: AFFAIRE_ID,
      devis_id: DEVIS_ID,
      metier_id: METIER_BOIS,
      heures: 6,
    });

    // Tentative sur OBJ-3 (archivé) → refus côté UI : on n'insère pas
    expect(canStaffObjet(fx, "OBJ-3").ok).toBe(false);

    // Liens corrects
    expect(objetsForAssignation(fx, "A1").map((o) => o.id)).toEqual(["OBJ-1"]);
    expect(objetsForAssignation(fx, "A4")).toEqual([]); // pas de lien

    // Heures planifiées par objet (vue par objet)
    expect(heuresStaffeesParObjet(fx, "OBJ-1")).toBe(12); // 8 + 4
    expect(heuresStaffeesParObjet(fx, "OBJ-2")).toBe(8);
    expect(heuresStaffeesParObjet(fx, "OBJ-3")).toBe(0);
  });

  it("étape 3 : saisie d'heures sur objets (validée, soumise, rejetée)", () => {
    const fx = buildFixture();
    fx.assignations.push({
      id: "A1",
      affaire_id: AFFAIRE_ID,
      devis_id: DEVIS_ID,
      metier_id: METIER_BOIS,
      heures: 8,
    });
    fx.assignation_objets.push({ assignation_id: "A1", objet_id: "OBJ-1" });

    fx.heures_saisies.push(
      // validée — compte
      {
        id: "H1",
        affaire_id: AFFAIRE_ID,
        devis_id: DEVIS_ID,
        fabrication_objet_id: "OBJ-1",
        metier_id: METIER_BOIS,
        heures_reelles: 7.5,
        statut: "valide",
      },
      // soumise — compte (en attente)
      {
        id: "H2",
        affaire_id: AFFAIRE_ID,
        devis_id: DEVIS_ID,
        fabrication_objet_id: "OBJ-2",
        metier_id: METIER_METAL,
        heures_reelles: 4,
        statut: "soumis",
      },
      // rejetée — NE compte pas
      {
        id: "H3",
        affaire_id: AFFAIRE_ID,
        devis_id: DEVIS_ID,
        fabrication_objet_id: "OBJ-1",
        metier_id: METIER_BOIS,
        heures_reelles: 99,
        statut: "rejete",
      },
    );

    const obj1 = heuresRealiseesParObjet(fx, "OBJ-1");
    expect(obj1).toEqual({ validees: 7.5, soumises: 0, total: 7.5 });

    const obj2 = heuresRealiseesParObjet(fx, "OBJ-2");
    expect(obj2).toEqual({ validees: 0, soumises: 4, total: 4 });

    const obj3 = heuresRealiseesParObjet(fx, "OBJ-3");
    expect(obj3.total).toBe(0);
  });

  it("étape 4 : récap heures de l'onglet Affaires reflète tout le scénario", () => {
    const fx = buildFixture();

    // Setup planning : 18h bois (dont 12h sur objets, 6h libres) + 8h métal sur OBJ-2
    fx.assignations.push(
      { id: "A1", affaire_id: AFFAIRE_ID, devis_id: DEVIS_ID, metier_id: METIER_BOIS, heures: 8 },
      { id: "A2", affaire_id: AFFAIRE_ID, devis_id: DEVIS_ID, metier_id: METIER_BOIS, heures: 4 },
      { id: "A3", affaire_id: AFFAIRE_ID, devis_id: DEVIS_ID, metier_id: METIER_METAL, heures: 8 },
      { id: "A4", affaire_id: AFFAIRE_ID, devis_id: DEVIS_ID, metier_id: METIER_BOIS, heures: 6 },
    );
    fx.assignation_objets.push(
      { assignation_id: "A1", objet_id: "OBJ-1" },
      { assignation_id: "A2", objet_id: "OBJ-1" },
      { assignation_id: "A3", objet_id: "OBJ-2" },
    );

    // Saisies : 7.5h validées sur OBJ-1 (bois) + 4h soumises sur OBJ-2 (métal)
    // + 1 saisie rejetée qui ne doit pas polluer le récap.
    fx.heures_saisies.push(
      {
        id: "H1",
        affaire_id: AFFAIRE_ID,
        devis_id: DEVIS_ID,
        fabrication_objet_id: "OBJ-1",
        metier_id: METIER_BOIS,
        heures_reelles: 7.5,
        statut: "valide",
      },
      {
        id: "H2",
        affaire_id: AFFAIRE_ID,
        devis_id: DEVIS_ID,
        fabrication_objet_id: "OBJ-2",
        metier_id: METIER_METAL,
        heures_reelles: 4,
        statut: "soumis",
      },
      {
        id: "H3",
        affaire_id: AFFAIRE_ID,
        devis_id: DEVIS_ID,
        fabrication_objet_id: "OBJ-1",
        metier_id: METIER_BOIS,
        heures_reelles: 50,
        statut: "rejete",
      },
    );

    const lines = aggregateConsommation(fx);
    const enriched = enrichLines(lines);

    const bois = enriched.find((l) => l.metier_id === METIER_BOIS)!;
    const metal = enriched.find((l) => l.metier_id === METIER_METAL)!;
    expect(bois).toBeDefined();
    expect(metal).toBeDefined();

    // BOIS — prévu 40h, staffé 18h (8+4+6), réalisé 7.5h (validé), 0 soumis
    expect(bois.prevues).toBe(40);
    expect(bois.staffees).toBe(18);
    expect(bois.validees).toBe(7.5);
    expect(bois.soumises).toBe(0);
    expect(bois.realisees).toBe(7.5);
    expect(bois.pctStaff).toBeCloseTo((18 / 40) * 100, 5);
    expect(bois.tone).toBe("ok"); // 45 % max

    // MÉTAL — prévu 20h, staffé 8h, réalisé 4h soumis
    expect(metal.prevues).toBe(20);
    expect(metal.staffees).toBe(8);
    expect(metal.validees).toBe(0);
    expect(metal.soumises).toBe(4);
    expect(metal.realisees).toBe(4);

    // Vérifie que la ligne rejetée n'a pas été comptée
    expect(bois.validees + bois.soumises).toBe(7.5);

    // Totaux
    const totals = computeTotals(enriched);
    expect(totals.prevues).toBe(60);
    expect(totals.staffees).toBe(26);
    expect(totals.validees).toBe(7.5);
    expect(totals.soumises).toBe(4);
    expect(totals.realisees).toBe(11.5);
    expect(totals.ecart).toBe(60 - 7.5);
  });

  it("dépassement budget → tone = danger ; ≥85 % → warn", () => {
    const fx = buildFixture();
    // Bois : prévu 40h, on staffe 45h → pctStaff = 112.5 → danger
    fx.assignations.push({
      id: "A1",
      affaire_id: AFFAIRE_ID,
      devis_id: DEVIS_ID,
      metier_id: METIER_BOIS,
      heures: 45,
    });
    // Métal : prévu 20h, on staffe 18h → pctStaff = 90 → warn
    fx.assignations.push({
      id: "A2",
      affaire_id: AFFAIRE_ID,
      devis_id: DEVIS_ID,
      metier_id: METIER_METAL,
      heures: 18,
    });

    const enriched = enrichLines(aggregateConsommation(fx));
    const bois = enriched.find((l) => l.metier_id === METIER_BOIS)!;
    const metal = enriched.find((l) => l.metier_id === METIER_METAL)!;
    expect(bois.tone).toBe("danger");
    expect(metal.tone).toBe("warn");
  });

  it("affectation sur objet d'une autre affaire est refusée (isolation)", () => {
    const fx = buildFixture();
    // OBJ-Z appartient à une autre affaire
    fx.objets.push({
      id: "OBJ-Z",
      affaire_id: "AFF-9999",
      reference: "ZZ",
      nom: "Hors périmètre",
    });
    expect(canStaffObjet(fx, "OBJ-Z").ok).toBe(false);
    expect(canStaffObjet(fx, "OBJ-Z").reason).toBe("Objet d'une autre affaire");
  });

  it("assignation sans objet contribue toujours au récap métier", () => {
    const fx = buildFixture();
    // Aucun lien assignation_objets : juste une assignation libre
    fx.assignations.push({
      id: "A-libre",
      affaire_id: AFFAIRE_ID,
      devis_id: DEVIS_ID,
      metier_id: METIER_BOIS,
      heures: 10,
    });
    const enriched = enrichLines(aggregateConsommation(fx));
    const bois = enriched.find((l) => l.metier_id === METIER_BOIS)!;
    expect(bois.staffees).toBe(10);
    // Aucun objet ne capture cette assignation
    expect(heuresStaffeesParObjet(fx, "OBJ-1")).toBe(0);
  });
});
