// Lot 8.1 — Tests Vitest des helpers purs Fiche Objet
import { describe, it, expect } from "vitest";
import {
  METIER_CODE_TO_PREVU_COL,
  getHeuresPrevuesForMetier,
  computeProgressionPct,
  resolveAssignmentSlots,
  rollingAveragePresence,
  sortObjetTeamPersonnes,
} from "@/lib/objet-fiche-helpers";

describe("METIER_CODE_TO_PREVU_COL", () => {
  it("mappe les 7 codes métier connus vers la bonne colonne fabrication_objets", () => {
    expect(METIER_CODE_TO_PREVU_COL.construction).toBe("heures_prevues_bois");
    expect(METIER_CODE_TO_PREVU_COL.metallerie).toBe("heures_prevues_metal");
    expect(METIER_CODE_TO_PREVU_COL.peinture).toBe("heures_prevues_peinture");
    expect(METIER_CODE_TO_PREVU_COL.numerique).toBe("heures_prevues_numerique");
    expect(METIER_CODE_TO_PREVU_COL.tapisserie).toBe("heures_prevues_tapisserie");
    expect(METIER_CODE_TO_PREVU_COL.logistique).toBe("heures_prevues_manutention");
    expect(METIER_CODE_TO_PREVU_COL.suivi_projet).toBe("heures_prevues_be");
  });
  it("machiniste n'a pas de colonne (null)", () => {
    expect(METIER_CODE_TO_PREVU_COL.machiniste).toBeNull();
  });
});

describe("getHeuresPrevuesForMetier", () => {
  const row = {
    heures_prevues_bois: 20,
    heures_prevues_metal: 8,
    heures_prevues_numerique: 4,
    heures_prevues_be: 12,
    heures_prevues_peinture: 0,
    heures_prevues_tapisserie: null,
    heures_prevues_manutention: 2,
  };
  it("retourne la bonne valeur pour chaque métier", () => {
    expect(getHeuresPrevuesForMetier("construction", row)).toBe(20);
    expect(getHeuresPrevuesForMetier("metallerie", row)).toBe(8);
    expect(getHeuresPrevuesForMetier("numerique", row)).toBe(4);
    expect(getHeuresPrevuesForMetier("suivi_projet", row)).toBe(12);
    expect(getHeuresPrevuesForMetier("logistique", row)).toBe(2);
  });
  it("retourne 0 pour machiniste (pas de colonne)", () => {
    expect(getHeuresPrevuesForMetier("machiniste", row)).toBe(0);
  });
  it("retourne 0 pour valeur null", () => {
    expect(getHeuresPrevuesForMetier("tapisserie", row)).toBe(0);
  });
  it("retourne 0 pour row vide", () => {
    expect(getHeuresPrevuesForMetier("construction", null)).toBe(0);
    expect(getHeuresPrevuesForMetier("construction", undefined)).toBe(0);
  });
});

describe("computeProgressionPct", () => {
  it("calcule le ratio en %", () => {
    expect(computeProgressionPct(10, 20)).toBe(50);
    expect(computeProgressionPct(20, 20)).toBe(100);
    expect(computeProgressionPct(30, 20)).toBe(150); // dépassement
  });
  it("retourne null si prévu = 0 ou négatif", () => {
    expect(computeProgressionPct(5, 0)).toBeNull();
    expect(computeProgressionPct(5, -1)).toBeNull();
  });
});

describe("resolveAssignmentSlots", () => {
  it("insère toutes les dates libres", () => {
    const slots = [
      { date: "2026-05-25", cumulExisting: 0, alreadyOnStep: false },
      { date: "2026-05-26", cumulExisting: 0, alreadyOnStep: false },
    ];
    const r = resolveAssignmentSlots(slots, 100);
    expect(r.toInsert).toEqual(["2026-05-25", "2026-05-26"]);
    expect(r.details.every((d) => d.reason === "ok")).toBe(true);
  });

  it("skip les dates déjà sur le même step", () => {
    const slots = [
      { date: "2026-05-25", cumulExisting: 0, alreadyOnStep: true },
      { date: "2026-05-26", cumulExisting: 0, alreadyOnStep: false },
    ];
    const r = resolveAssignmentSlots(slots, 100);
    expect(r.toInsert).toEqual(["2026-05-26"]);
    expect(r.details[0]).toEqual({ date: "2026-05-25", reason: "existing" });
  });

  it("skip si cumul + nouveau > 100", () => {
    const slots = [
      { date: "2026-05-25", cumulExisting: 50, alreadyOnStep: false }, // 50+60=110 → conflit
      { date: "2026-05-26", cumulExisting: 40, alreadyOnStep: false }, // 40+60=100 → ok
    ];
    const r = resolveAssignmentSlots(slots, 60);
    expect(r.toInsert).toEqual(["2026-05-26"]);
    expect(r.details[0].reason).toBe("conflict");
    expect(r.details[1].reason).toBe("ok");
  });

  it("priorité existing > conflict (skip même si conflit en plus)", () => {
    const slots = [{ date: "2026-05-25", cumulExisting: 100, alreadyOnStep: true }];
    const r = resolveAssignmentSlots(slots, 50);
    expect(r.details[0].reason).toBe("existing");
  });
});

describe("rollingAveragePresence", () => {
  it("démarrage", () => {
    expect(rollingAveragePresence({ presence_pct_moyen: 0, nb_jours: 0 }, 100)).toEqual({
      presence_pct_moyen: 100,
      nb_jours: 1,
    });
  });
  it("moyenne 50% + 100% sur 2 jours = 75%", () => {
    const r1 = rollingAveragePresence({ presence_pct_moyen: 0, nb_jours: 0 }, 50);
    const r2 = rollingAveragePresence(r1, 100);
    expect(r2).toEqual({ presence_pct_moyen: 75, nb_jours: 2 });
  });
});

describe("sortObjetTeamPersonnes", () => {
  it("tri par nb_jours desc puis nom asc", () => {
    const r = sortObjetTeamPersonnes([
      { employe_id: "1", nom: "Bernard", prenom: "", type_contrat: null, presence_pct_moyen: 100, nb_jours: 3, source: "staffing" },
      { employe_id: "2", nom: "Albert", prenom: "", type_contrat: null, presence_pct_moyen: 100, nb_jours: 5, source: "staffing" },
      { employe_id: "3", nom: "Albert", prenom: "", type_contrat: null, presence_pct_moyen: 100, nb_jours: 3, source: "staffing" },
    ]);
    expect(r.map((p) => p.employe_id)).toEqual(["2", "3", "1"]);
  });
});
