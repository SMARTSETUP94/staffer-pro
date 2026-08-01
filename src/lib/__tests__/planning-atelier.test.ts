import { describe, expect, it } from "vitest";
import {
  addDaysISO, buildJourWindow, countNommesParPlan, detectDoubleAffectation, employesAbsents,
  expandCellRange, generatePeriodeJoursOuvres, heuresPlanifiees, isoWeekNumber, ligneStatut,
  nommageEtat, planKey, rowsOfLine, startOfWeekISO, type PlanRow,
} from "@/lib/planning-atelier";
import { isJourFerieFR, isWeekend, labelJourFerieFR } from "@/lib/jours-feries";

const api = { isWeekend, isFerie: isJourFerieFR, labelFerie: labelJourFerieFR };

describe("dates", () => {
  it("startOfWeekISO renvoie le lundi", () => {
    expect(startOfWeekISO("2026-08-01")).toBe("2026-07-27"); // samedi → lundi
    expect(startOfWeekISO("2026-07-27")).toBe("2026-07-27");
    expect(startOfWeekISO("2026-08-02")).toBe("2026-07-27"); // dimanche
  });

  it("addDaysISO franchit les mois", () => {
    expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("isoWeekNumber suit la norme ISO 8601", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2026-12-31")).toBe(53);
  });
});

describe("generatePeriodeJoursOuvres", () => {
  it("saute les week-ends", () => {
    // vendredi 2026-07-31 → 5 jours ouvrés
    expect(generatePeriodeJoursOuvres("2026-07-31", 5, api)).toEqual([
      "2026-07-31", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
    ]);
  });

  it("saute les jours fériés FR", () => {
    // 2026-08-15 est un samedi ; on teste le 14 juillet (mardi en 2026)
    const days = generatePeriodeJoursOuvres("2026-07-13", 3, api);
    expect(days).not.toContain("2026-07-14");
    expect(days).toEqual(["2026-07-13", "2026-07-15", "2026-07-16"]);
  });

  it("démarre au jour ouvré suivant si le départ est chômé", () => {
    expect(generatePeriodeJoursOuvres("2026-08-01", 1, api)).toEqual(["2026-08-03"]);
  });

  it("renvoie [] pour 0 ou une valeur négative", () => {
    expect(generatePeriodeJoursOuvres("2026-08-03", 0, api)).toEqual([]);
    expect(generatePeriodeJoursOuvres("2026-08-03", -2, api)).toEqual([]);
  });
});

describe("buildJourWindow", () => {
  it("marque week-ends et fériés", () => {
    const w = buildJourWindow("2026-07-13", 4, api);
    expect(w).toHaveLength(4);
    expect(w[1]?.ferie).toBe(true);
    expect(w[1]?.ferieLabel).toBe("Fête nationale");
    expect(w[0]?.weekend).toBe(false);
    expect(buildJourWindow("2026-08-01", 1, api)[0]?.weekend).toBe(true);
  });
});

describe("charges", () => {
  const rows: PlanRow[] = [
    { id: "1", objet_id: "o1", lot_id: null, metier_id: 1, date: "2026-08-03", nb_pers: 2 },
    { id: "2", objet_id: "o1", lot_id: null, metier_id: 1, date: "2026-08-04", nb_pers: 1 },
    { id: "3", objet_id: null, lot_id: "L1", metier_id: 1, date: "2026-08-03", nb_pers: 3 },
    { id: "4", objet_id: "o1", lot_id: null, metier_id: 2, date: "2026-08-03", nb_pers: 5 },
  ];

  it("heuresPlanifiees = Σ nb_pers × 8", () => {
    expect(heuresPlanifiees(rows)).toBe(88);
    expect(heuresPlanifiees([])).toBe(0);
  });

  it("rowsOfLine isole objet vs lot", () => {
    expect(rowsOfLine(rows, { objetId: "o1" }, 1).map((r) => r.id)).toEqual(["1", "2"]);
    expect(rowsOfLine(rows, { lotId: "L1" }, 1).map((r) => r.id)).toEqual(["3"]);
  });

  it("heures planifiées vs prévues", () => {
    expect(ligneStatut(24, 24)).toBe("ok");
    expect(ligneStatut(24, 40)).toBe("depassement");
    expect(ligneStatut(24, 0)).toBe("non_planifie");
    expect(ligneStatut(0, 0)).toBe("sans_heures");
    expect(ligneStatut(0, 8)).toBe("ok");
    expect(ligneStatut(24, 28)).toBe("ok"); // tolérance ½ journée
  });

  it("planKey distingue objet et lot", () => {
    expect(planKey({ objetId: "o1" }, 1, "2026-08-03")).not.toBe(
      planKey({ lotId: "o1" }, 1, "2026-08-03"),
    );
  });
});

describe("nommage", () => {
  const nommages = [
    { id: "a1", atelier_planning_id: "p1", employe_id: "e1", affaire_id: "A", date: "2026-08-03" },
    { id: "a2", atelier_planning_id: "p1", employe_id: "e2", affaire_id: "A", date: "2026-08-03" },
    { id: "a3", atelier_planning_id: "p2", employe_id: "e3", affaire_id: "B", date: "2026-08-03" },
    { id: "a4", atelier_planning_id: null, employe_id: "e4", affaire_id: "B", date: "2026-08-04" },
  ];

  it("nommageEtat", () => {
    expect(nommageEtat(2, 0)).toBe("aucun");
    expect(nommageEtat(2, 1)).toBe("partiel");
    expect(nommageEtat(2, 2)).toBe("complet");
    expect(nommageEtat(2, 3)).toBe("complet");
    expect(nommageEtat(0, 0)).toBe("aucun");
  });

  it("countNommesParPlan ignore les assignations sans planning", () => {
    expect(countNommesParPlan(nommages)).toEqual({ p1: 2, p2: 1 });
  });

  it("détecte la double affectation hors de la cellule courante", () => {
    const conflits = detectDoubleAffectation(nommages, "2026-08-03", "p1");
    expect([...conflits.keys()]).toEqual(["e3"]);
    expect(conflits.get("e3")?.affaire_id).toBe("B");
  });

  it("ne signale pas les personnes déjà nommées sur la cellule courante", () => {
    expect(detectDoubleAffectation(nommages, "2026-08-03", "p1").has("e1")).toBe(false);
  });

  it("employesAbsents couvre l'intervalle et ignore les congés non validés", () => {
    const abs = [
      { employe_id: "e1", date_debut: "2026-08-01", date_fin: "2026-08-10", valide: true },
      { employe_id: "e2", date_debut: "2026-08-03", date_fin: "2026-08-03", valide: false },
    ];
    expect([...employesAbsents(abs, "2026-08-03")]).toEqual(["e1"]);
    expect(employesAbsents(abs, "2026-08-20").size).toBe(0);
  });
});

describe("expandCellRange", () => {
  const rowsOrder = ["r1", "r2", "r3"];
  const dates = ["d1", "d2", "d3"];

  it("étend un rectangle dans les deux sens", () => {
    expect(expandCellRange({ row: "r3", date: "d3" }, { row: "r2", date: "d2" }, rowsOrder, dates))
      .toHaveLength(4);
  });

  it("renveoie une seule cellule si ancre = cible", () => {
    expect(expandCellRange({ row: "r1", date: "d1" }, { row: "r1", date: "d1" }, rowsOrder, dates))
      .toEqual([{ row: "r1", date: "d1" }]);
  });

  it("renvoie [] si une clé est inconnue", () => {
    expect(expandCellRange({ row: "zz", date: "d1" }, { row: "r1", date: "d1" }, rowsOrder, dates))
      .toEqual([]);
  });
});
