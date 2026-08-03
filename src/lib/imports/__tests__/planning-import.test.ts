import { describe, expect, it } from "vitest";
import {
  HEURES_PAR_PERSONNE_JOUR, classifyLivraisonType, detectSheetKind, extractCode,
  mapMetier, parseOuiNon, parsePlanningWorkbook, type SheetInput,
} from "@/lib/imports/planning-xlsx";
import { buildPlanningPlan } from "@/lib/imports/planning-plan";

/** Fixture représentative : 1 affaire connue, 1 inconnue, sous-traitance, date KO. */
const FIXTURE: SheetInput = {
  Fabrication: [
    ["Projet", "Code", "Date", "Élément", "Tâche", "Métier", "Nb pers.", "Statut", "Équipe 1", "Équipe 2", "Équipe 3", "Lien Teams", "À compléter"],
    ["Drôle de Monsieur", "6020", "2026-08-03", "Cloisons intérieures", "Débit cloisons", "Bois", 2, "À faire", "Felipe", "", "", "", ""],
    ["Drôle de Monsieur", "6020", "2026-08-04", "Cloisons intérieures", "Montage cloisons", "Bois", 1, "À faire", "", "", "", "", "Oui"],
    ["Drôle de Monsieur", "6020", "2026-08-04", "Cloisons intérieures", "Peinture", "PEINTURE", 3, "À faire", "", "", "", "", ""],
    ["Nouveau Chantier", "6099", "2026-09-01", "Praticables", "Découpe", "Numérique", 1, "À faire", "", "", "", "", ""],
    ["Drôle de Monsieur", "6020", "2026-08-05", "Cloisons intérieures", "Pose", "Sous-traitance", 4, "À faire", "", "", "", "", ""],
    ["Drôle de Monsieur", "6020", "date pourrie", "Cloisons intérieures", "Reprise", "Métal", 1, "À faire", "", "", "", "", ""],
    ["Drôle de Monsieur", "6020", "2026-08-06", "Cloisons intérieures", "Inconnu", "Plomberie", 1, "À faire", "", "", "", "", ""],
    [null, null, null, null, null, null, null, null, null, null, null, null, null],
  ],
  "Livraisons & Chantiers": [
    ["Mois", "Projet / Client", "Type", "Statut", "Début", "Fin", "Durée", "Unité", "Nuit ?", "Nb tech", "Semi", "20 m³", "Nature de la prestation", "Notes"],
    ["Août", "Drôle de Monsieur", "Montage", "Confirmé", "2026-08-10", "2026-08-12", 3, "j", "🌙 Oui", 4, 1, 2, "Montage stand", "RAS"],
    ["Août", "Drôle de Monsieur", "Démontage", "Confirmé", "2026-08-20", "2026-08-20", 1, "j", "Non", 3, 1, 0, "Démontage", ""],
  ],
  "Affectations équipes": [
    ["Personne", "Chantier de référence", "2026-08-03", "2026-08-04"],
    ["Felipe", "Drôle de Monsieur", "Drôle de Monsieur", "Drôle de Monsieur"],
  ],
  Listes: [["Métiers"], ["Bois"]],
};

const ctx = () => ({
  affairesByCode: new Map([["6020", { id: "aff-6020", nom: "Drôle de Monsieur" }]]),
  employesByPrenom: new Map([
    ["felipe", [{ id: "emp-1", prenom: "Felipe", nom: "Silva", metier_principal_id: 1 }]],
  ]),
  withAffectations: true,
});

describe("mapMetier", () => {
  it("mappe les libellés fichier vers les ids metiers", () => {
    expect(mapMetier("Bois").metierId).toBe(1);
    expect(mapMetier("MÉTAL").metierId).toBe(2);
    expect(mapMetier("peinture").metierId).toBe(3);
    expect(mapMetier("Numérique").metierId).toBe(4);
    expect(mapMetier("Tapisserie").metierId).toBe(5);
    expect(mapMetier("Logistique").metierId).toBe(7);
    expect(mapMetier("Bureau d'étude").metierId).toBe(8);
  });
  it("traite Sous-traitance comme un marqueur, pas un métier", () => {
    const m = mapMetier("Sous-traitance");
    expect(m.metierId).toBeNull();
    expect(m.sousTraitance).toBe(true);
    expect(m.reconnu).toBe(true);
  });
  it("signale un métier inconnu", () => {
    expect(mapMetier("Plomberie").reconnu).toBe(false);
  });
});

describe("helpers", () => {
  it("reconnaît les onglets malgré les variantes", () => {
    expect(detectSheetKind("Fabrication ")).toBe("fabrication");
    expect(detectSheetKind("Livraisons & Chantiers")).toBe("livraisons");
    expect(detectSheetKind("Affectations équipes")).toBe("affectations");
    expect(detectSheetKind("Listes")).toBe("listes");
  });
  it("interprète Oui / 🌙 Oui", () => {
    expect(parseOuiNon("Oui")).toBe(true);
    expect(parseOuiNon("🌙 Oui")).toBe(true);
    expect(parseOuiNon("Non")).toBe(false);
    expect(parseOuiNon("")).toBe(false);
  });
  it("classe livraison comme montage", () => {
    expect(classifyLivraisonType("Livraison")).toBe("montage");
    expect(classifyLivraisonType("Démontage")).toBe("demontage");
  });
  it("extrait un code affaire d'un libellé", () => {
    expect(extractCode("6020 — Drôle de Monsieur")).toBe("6020");
    expect(extractCode("Drôle de Monsieur")).toBeNull();
  });
});

describe("parsePlanningWorkbook", () => {
  const parsed = parsePlanningWorkbook(FIXTURE);

  it("lit les lignes de fabrication en ignorant les lignes vides", () => {
    expect(parsed.fabrication).toHaveLength(7);
    expect(parsed.fabrication[0]).toMatchObject({
      code: "6020", element: "Cloisons intérieures", metierId: 1, nbPers: 2, date: "2026-08-03",
    });
    expect(parsed.fabrication[0]!.equipe).toEqual(["Felipe"]);
    expect(parsed.fabrication[1]!.aCompleter).toBe(true);
  });

  it("lit les livraisons et les affectations", () => {
    expect(parsed.livraisons).toHaveLength(2);
    expect(parsed.livraisons[0]).toMatchObject({ nbTech: 4, semi: 1, m3_20: 2, nuit: true });
    expect(parsed.affectations).toHaveLength(1);
    expect(parsed.affectations[0]!.parDate["2026-08-03"]).toBe("Drôle de Monsieur");
  });

  it("respecte la désactivation d'onglets", () => {
    const only = parsePlanningWorkbook(FIXTURE, { livraisons: false, affectations: false });
    expect(only.livraisons).toHaveLength(0);
    expect(only.affectations).toHaveLength(0);
  });
});

describe("buildPlanningPlan", () => {
  const plan = buildPlanningPlan(parsePlanningWorkbook(FIXTURE), ctx());

  it("convertit les jours-hommes en heures (8 h par personne-jour)", () => {
    expect(HEURES_PAR_PERSONNE_JOUR).toBe(8);
    const bois = plan.heures.find((h) => h.metierId === 1 && h.code === "6020");
    expect(bois?.heures).toBe(24); // 2 j·h + 1 j·h = 3 × 8
    expect(bois?.note).toContain("Débit cloisons");
    const peinture = plan.heures.find((h) => h.metierId === 3);
    expect(peinture?.heures).toBe(24);
  });

  it("dédoublonne les objets et signale l'affaire à créer", () => {
    expect(plan.objets).toHaveLength(2);
    expect(plan.totals.affairesACreer).toBe(1);
    expect(plan.affaires.find((a) => a.code === "6099")?.existingId).toBeNull();
  });

  it("génère une ligne de planning par élément × métier × date", () => {
    const keys = plan.planning.map((p) => `${p.code}|${p.metierId}|${p.date}|${p.nbPers}`);
    expect(keys).toContain("6020|1|2026-08-03|2");
    expect(keys).toContain("6020|3|2026-08-04|3");
    expect(plan.planning.some((p) => p.date === "date pourrie")).toBe(false);
  });

  it("exclut la sous-traitance de la charge mais garde l'objet", () => {
    expect(plan.planning.some((p) => p.nbPers === 4)).toBe(false);
    expect(plan.heures.some((h) => h.sousTraitance)).toBe(false);
  });

  it("émet les bonnes sévérités", () => {
    const codes = plan.issues.map((i) => `${i.severity}:${i.code}`);
    expect(codes).toContain("error:UNKNOWN_REFERENCE"); // métier inconnu
    expect(codes).toContain("warning:INVALID_DATE");
    expect(codes).toContain("info:INVALID_TEXT"); // ligne « à compléter »
  });

  it("reporte les champs de montage depuis les livraisons", () => {
    const a = plan.affaires.find((x) => x.code === "6020");
    expect(a?.montage).toMatchObject({
      date_montage: "2026-08-10",
      date_demontage: "2026-08-20",
      montage_nb_techniciens: 4,
      montage_travail_nuit: true,
      montage_nb_semi: 1,
      montage_nb_20m3: 2,
    });
  });

  it("résout les prénoms d'équipe sans jamais créer d'employé", () => {
    expect(plan.affectations).toHaveLength(1);
    expect(plan.affectations[0]).toMatchObject({ employeId: "emp-1", date: "2026-08-03" });
    expect(plan.prenomsNonResolus).toHaveLength(0);
  });

  it("ignore les affectations quand l'option est décochée", () => {
    const p = buildPlanningPlan(parsePlanningWorkbook(FIXTURE), { ...ctx(), withAffectations: false });
    expect(p.affectations).toHaveLength(0);
  });

  it("est déterministe : deux constructions donnent le même plan", () => {
    const a = buildPlanningPlan(parsePlanningWorkbook(FIXTURE), ctx());
    const b = buildPlanningPlan(parsePlanningWorkbook(FIXTURE), ctx());
    expect(JSON.stringify(a.totals)).toBe(JSON.stringify(b.totals));
    expect(JSON.stringify(a.planning)).toBe(JSON.stringify(b.planning));
  });
});
