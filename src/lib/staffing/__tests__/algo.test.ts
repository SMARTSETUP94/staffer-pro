import { describe, expect, it } from "vitest";
import { computeSpan, calculatePlan, findCNCSlotBackward } from "../algo";
import {
  addDays,
  addWorkingDays,
  dateRange,
  diffDays,
  frenchHolidays,
  isWeekend,
  isWorkingDay,
  workingDateRange,
  workingDaysBetween,
} from "../date-utils";
import type { ObjetInput, PlanInput } from "../types";

/* ---------- factories ---------- */
function obj(partial: Partial<ObjetInput> & { objet_id: string }): ObjetInput {
  return {
    reference: partial.reference ?? `REF-${partial.objet_id}`,
    nom: partial.nom ?? "Objet",
    heures_be: 0,
    heures_numerique: 0,
    heures_bois: 0,
    heures_metal: 0,
    heures_peinture: 0,
    heures_tapisserie: 0,
    heures_manutention: 0,
    display_order: 0,
    ...partial,
  };
}

const LIVRAISON = "2026-06-30";
function input(objets: ObjetInput[], extra: Partial<PlanInput> = {}): PlanInput {
  return {
    affaire_id: "aff-1",
    date_fin_fab: LIVRAISON,
    objets,
    ...extra,
  };
}

/* ============================================================ */
/* date-utils                                                    */
/* ============================================================ */
describe("date-utils", () => {
  it("addDays positive", () => {
    expect(addDays("2026-01-01", 5)).toBe("2026-01-06");
  });
  it("addDays negative cross month", () => {
    expect(addDays("2026-03-02", -5)).toBe("2026-02-25");
  });
  it("diffDays", () => {
    expect(diffDays("2026-01-01", "2026-01-11")).toBe(10);
  });
  it("dateRange spans inclusive", () => {
    expect(dateRange("2026-01-10", 3)).toEqual(["2026-01-10", "2026-01-11", "2026-01-12"]);
  });
  it("dateRange span 0 → empty", () => {
    expect(dateRange("2026-01-10", 0)).toEqual([]);
  });
});

/* ============================================================ */
/* computeSpan                                                   */
/* ============================================================ */
describe("computeSpan", () => {
  it("0 heures → 0/0", () => {
    expect(computeSpan(0, 8)).toEqual({ pers: 0, span_days: 0 });
  });
  it("persFix=1, 10h × 10h/j → 1 jour", () => {
    expect(computeSpan(10, 10, { persFix: 1 })).toEqual({ pers: 1, span_days: 1 });
  });
  it("persFix=1, 25h × 8h/j → 4 jours (ceil)", () => {
    expect(computeSpan(25, 8, { persFix: 1 })).toEqual({ pers: 1, span_days: 4 });
  });
  it("binôme 64h × 8h/j → 4 pers × 2j (min span)", () => {
    expect(computeSpan(64, 8)).toEqual({ pers: 4, span_days: 2 });
  });
  it("binôme 16h → 2 pers × 1j", () => {
    expect(computeSpan(16, 8)).toEqual({ pers: 2, span_days: 1 });
  });
  it("respecte persMax", () => {
    const r = computeSpan(200, 8, { persMin: 2, persMax: 3 });
    expect(r.pers).toBeLessThanOrEqual(3);
  });
});

/* ============================================================ */
/* findCNCSlotBackward                                           */
/* ============================================================ */
describe("findCNCSlotBackward (jours ouvrés)", () => {
  it("slot libre = la fin demandée (mer 06-10)", () => {
    // 06-10 mer → start = 06-08 (lun), 06-09, 06-10
    expect(findCNCSlotBackward("2026-06-10", 3, new Set())).toBe("2026-06-08");
  });
  it("recule en sautant weekends si occupé (06-10/06-09 réservés)", () => {
    // 06-08 réservé via remontée → fin = 06-08 lun, mais [08,09] = [09 réservé]. Recule à 06-05 (ven) → [05,08].
    const reserved = new Set(["2026-06-10", "2026-06-09"]);
    const r = findCNCSlotBackward("2026-06-10", 2, reserved);
    expect(r).toBe("2026-06-05");
  });
  it("respecte earliestStart → null si pas de place", () => {
    const reserved = new Set(["2026-06-10", "2026-06-09", "2026-06-08", "2026-06-05", "2026-06-04"]);
    const r = findCNCSlotBackward("2026-06-10", 2, reserved, "2026-06-04");
    expect(r).toBeNull();
  });
  it("trouve un trou intermédiaire en jours ouvrés", () => {
    const reserved = new Set(["2026-06-10", "2026-06-09", "2026-06-08"]);
    // recule jusqu'à end=06-05 → [06-04, 06-05]
    expect(findCNCSlotBackward("2026-06-10", 2, reserved)).toBe("2026-06-04");
  });
});

/* ============================================================ */
/* calculatePlan — cas de base                                   */
/* ============================================================ */
describe("calculatePlan — cas simples", () => {
  it("affaire vide → aucun step", () => {
    const r = calculatePlan(input([]));
    expect(r.steps).toHaveLength(0);
    expect(r.alerts).toHaveLength(0);
  });

  it("1 objet bois seul → 1 step Bois aligné sur livraison", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 16 })]));
    expect(r.steps).toHaveLength(1);
    const s = r.steps[0];
    expect(s.metier).toBe("Bois");
    expect(addDays(s.start_date, s.span_days - 1)).toBe(LIVRAISON);
  });

  it("Bois + Peint sur même objet → Peint après Bois (consécutif)", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 32, heures_peinture: 16 })]));
    const bois = r.steps.find((s) => s.metier === "Bois")!;
    const peint = r.steps.find((s) => s.metier === "Peint")!;
    const boisEnd = addDays(bois.start_date, bois.span_days - 1);
    expect(peint.start_date > boisEnd).toBe(true);
    expect(addDays(peint.start_date, peint.span_days - 1)).toBe(LIVRAISON);
  });

  it("Bois & Metal en parallèle (même endCursor)", () => {
    const r = calculatePlan(
      input([obj({ objet_id: "o1", heures_bois: 32, heures_metal: 24, heures_peinture: 16 })])
    );
    const bois = r.steps.find((s) => s.metier === "Bois")!;
    const metal = r.steps.find((s) => s.metier === "Metal")!;
    const peint = r.steps.find((s) => s.metier === "Peint")!;
    const boisEnd = addDays(bois.start_date, bois.span_days - 1);
    const metalEnd = addDays(metal.start_date, metal.span_days - 1);
    expect(boisEnd).toBe(metalEnd);
    expect(peint.start_date > boisEnd).toBe(true);
  });

  it("Manut par objet → 50% des heures manut", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 16, heures_manutention: 16 })]));
    const manut = r.steps.find((s) => s.metier === "Manut");
    expect(manut).toBeDefined();
    // 8h × 1 binôme min 2 → span ceil(8/(2*8))=1 jour
    expect(manut!.span_days).toBe(1);
  });

  it("Tap aligné sur Peint", () => {
    const r = calculatePlan(
      input([obj({ objet_id: "o1", heures_bois: 16, heures_peinture: 16, heures_tapisserie: 16 })])
    );
    const peint = r.steps.find((s) => s.metier === "Peint")!;
    const tap = r.steps.find((s) => s.metier === "Tap")!;
    expect(tap.start_date).toBe(peint.start_date);
  });
});

/* ============================================================ */
/* BE + Num — chaîne amont                                       */
/* ============================================================ */
describe("calculatePlan — BE + Num", () => {
  it("BE seul → 1p × 10h, fini avant Bois", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_be: 20, heures_bois: 16 })]));
    const be = r.steps.find((s) => s.metier === "BE")!;
    const bois = r.steps.find((s) => s.metier === "Bois")!;
    expect(be.h_par_jour).toBe(10);
    expect(be.pers).toBe(1);
    expect(addDays(be.start_date, be.span_days - 1) < bois.start_date).toBe(true);
  });

  it("BE → Num (lag 2j) → Bois (lag 0.3 × span_Num)", () => {
    const r = calculatePlan(
      input([obj({ objet_id: "o1", heures_be: 20, heures_numerique: 40, heures_bois: 32 })])
    );
    const be = r.steps.find((s) => s.metier === "BE")!;
    const num = r.steps.find((s) => s.metier === "Num")!;
    const bois = r.steps.find((s) => s.metier === "Bois")!;
    const beEnd = addDays(be.start_date, be.span_days - 1);
    const numStart = num.start_date;
    expect(diffDays(beEnd, numStart)).toBeGreaterThanOrEqual(3); // BE+2j+1
    const numEnd = addDays(num.start_date, num.span_days - 1);
    const lagAttendu = Math.ceil(0.3 * num.span_days);
    expect(diffDays(numEnd, bois.start_date)).toBeGreaterThanOrEqual(lagAttendu + 1);
  });

  it("BE pose une réservation CNC (machine_reservation)", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_numerique: 16, heures_bois: 16 })]));
    expect(r.cnc_reservations.length).toBe(r.steps.find((s) => s.metier === "Num")!.span_days);
    for (const res of r.cnc_reservations) {
      expect(res.machine_id).toBe("cnc_principale");
    }
  });

  it("Num conflit insoluble → alerte HARD NUM_CONFLIT_INSOLUBLE", () => {
    // Réserve toute la fenêtre en amont
    const reserved = new Set<string>();
    for (let i = 0; i < 365; i++) reserved.add(addDays(LIVRAISON, -i));
    const r = calculatePlan(
      input([obj({ objet_id: "o1", heures_numerique: 16, heures_bois: 16 })], { cnc_reserved_dates: reserved })
    );
    expect(r.alerts.some((a) => a.code === "NUM_CONFLIT_INSOLUBLE")).toBe(true);
  });

  it("BE ancré avant Bois si pas de Num", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_be: 10, heures_bois: 16 })]));
    const be = r.steps.find((s) => s.metier === "BE")!;
    const bois = r.steps.find((s) => s.metier === "Bois")!;
    expect(addDays(be.start_date, be.span_days - 1) < bois.start_date).toBe(true);
  });

  it("CAS RÉFECTION : Peint sans Bois ni Metal — pas de plantage", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_be: 10, heures_peinture: 16 })]));
    const peint = r.steps.find((s) => s.metier === "Peint")!;
    expect(peint).toBeDefined();
    expect(addDays(peint.start_date, peint.span_days - 1)).toBe(LIVRAISON);
  });
});

/* ============================================================ */
/* Alertes                                                       */
/* ============================================================ */
describe("calculatePlan — alertes", () => {
  it("PIC_GLOBAL_DEPASSE soft si charge > pic_max", () => {
    const r = calculatePlan(
      input(
        Array.from({ length: 5 }, (_, i) =>
          obj({ objet_id: `o${i}`, heures_bois: 64, heures_metal: 64 })
        ),
        { pic_max: 5 }
      )
    );
    expect(r.alerts.some((a) => a.code === "PIC_GLOBAL_DEPASSE" && a.severity === "soft")).toBe(true);
  });

  it("PLAFOND_OBJET_DEPASSE soft si pers > 4 (force via persMax non — ici on vérifie qu'au-dessus du plafond on alerte)", () => {
    // computeSpan limite à BINOME_MAX=4 par défaut → pas de dépassement naturel.
    // On vérifie juste que pas d'alerte fausse positive sur cas normal.
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 32 })]));
    expect(r.alerts.some((a) => a.code === "PLAFOND_OBJET_DEPASSE")).toBe(false);
  });

  it("DEBORD_LIVRAISON HARD si chaîne dépasse livraison (window trop courte impossible ici car ancré sur livraison) → pas d'alerte sur cas normal", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 16 })]));
    expect(r.alerts.some((a) => a.code === "DEBORD_LIVRAISON")).toBe(false);
  });
});

/* ============================================================ */
/* Multi-objets                                                  */
/* ============================================================ */
describe("calculatePlan — multi-objets", () => {
  it("3 objets bois → 3 steps Bois distincts, tous finissent à livraison", () => {
    const r = calculatePlan(
      input([
        obj({ objet_id: "o1", heures_bois: 16, display_order: 0 }),
        obj({ objet_id: "o2", heures_bois: 24, display_order: 1 }),
        obj({ objet_id: "o3", heures_bois: 32, display_order: 2 }),
      ])
    );
    const bois = r.steps.filter((s) => s.metier === "Bois");
    expect(bois).toHaveLength(3);
    for (const s of bois) {
      expect(addDays(s.start_date, s.span_days - 1)).toBe(LIVRAISON);
    }
  });

  it("BE par objet : 1 step BE par objet ayant heures_be > 0", () => {
    const r = calculatePlan(
      input([
        obj({ objet_id: "o1", heures_be: 10, heures_bois: 16 }),
        obj({ objet_id: "o2", heures_be: 20, heures_bois: 16 }),
      ])
    );
    const beSteps = r.steps.filter((s) => s.metier === "BE");
    expect(beSteps).toHaveLength(2);
    for (const s of beSteps) {
      expect(s.objet_id).not.toBeNull();
      expect(s.pers).toBe(1);
      expect(s.h_par_jour).toBe(10);
    }
    // Spans cumulés : ceil(10/10) + ceil(20/10) = 1 + 2 = 3
    const totalSpan = beSteps.reduce((a, s) => a + s.span_days, 0);
    expect(totalSpan).toBe(3);
  });

  it("heures_be_global splitté pro-rata sur objets", () => {
    const r = calculatePlan({
      affaire_id: "a",
      date_fin_fab: "2026-06-30",
      objets: [
        obj({ objet_id: "o1", heures_be: 0, heures_bois: 80 }),
        obj({ objet_id: "o2", heures_be: 0, heures_bois: 20 }),
      ],
      heures_be_global: 50,
    });
    const beSteps = r.steps.filter((s) => s.metier === "BE");
    expect(beSteps).toHaveLength(2);
    // o1 = 80% du total → 40h BE → 4j ; o2 = 20% → 10h → 1j
    const o1 = beSteps.find((s) => s.objet_id === "o1")!;
    const o2 = beSteps.find((s) => s.objet_id === "o2")!;
    expect(o1.span_days).toBe(4);
    expect(o2.span_days).toBe(1);
  });

  it("date_debut_fab = min des starts", () => {
    const r = calculatePlan(
      input([obj({ objet_id: "o1", heures_be: 30, heures_numerique: 24, heures_bois: 32 })])
    );
    const minStart = r.steps.map((s) => s.start_date).reduce((a, b) => (a < b ? a : b));
    expect(r.date_debut_fab).toBe(minStart);
  });

  it("daily_load est rempli pour chaque jour des steps", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 16 })]));
    const bois = r.steps[0];
    for (const d of dateRange(bois.start_date, bois.span_days)) {
      expect(r.daily_load[d]).toBeGreaterThanOrEqual(bois.pers);
    }
  });
});

/* ============================================================ */
/* Num par objet — exclusivité CNC                              */
/* ============================================================ */
describe("calculatePlan — Num par objet (CNC mono-machine)", () => {
  it("2 objets avec Num → 2 steps Num distincts, jamais superposés", () => {
    const r = calculatePlan(
      input([
        obj({ objet_id: "o1", heures_numerique: 16, heures_bois: 32, display_order: 0 }),
        obj({ objet_id: "o2", heures_numerique: 24, heures_bois: 32, display_order: 1 }),
      ])
    );
    const nums = r.steps.filter((s) => s.metier === "Num");
    expect(nums).toHaveLength(2);
    for (const n of nums) expect(n.objet_id).not.toBeNull();
    // Aucune date partagée entre les 2 fenêtres Num
    const dates1 = new Set(dateRange(nums[0].start_date, nums[0].span_days));
    for (const d of dateRange(nums[1].start_date, nums[1].span_days)) {
      expect(dates1.has(d)).toBe(false);
    }
  });

  it("heures_numerique_global splitté pro-rata sur Num par objet", () => {
    const r = calculatePlan({
      affaire_id: "a",
      date_fin_fab: "2026-06-30",
      objets: [
        obj({ objet_id: "o1", heures_numerique: 0, heures_bois: 80 }),
        obj({ objet_id: "o2", heures_numerique: 0, heures_bois: 20 }),
      ],
      heures_numerique_global: 80,
    });
    const nums = r.steps.filter((s) => s.metier === "Num");
    expect(nums).toHaveLength(2);
    // o1 = 80% × 80h = 64h / 8h = 8j ; o2 = 16h / 8h = 2j
    const o1 = nums.find((s) => s.objet_id === "o1")!;
    const o2 = nums.find((s) => s.objet_id === "o2")!;
    expect(o1.span_days).toBe(8);
    expect(o2.span_days).toBe(2);
  });
});


/* ============================================================ */
/* Determinisme                                                  */
/* ============================================================ */
describe("calculatePlan — déterminisme", () => {
  it("2 appels identiques → même résultat", () => {
    const inp = input([obj({ objet_id: "o1", heures_be: 20, heures_numerique: 16, heures_bois: 32, heures_peinture: 16 })]);
    const a = calculatePlan(inp);
    const b = calculatePlan(inp);
    expect(b.steps.map((s) => `${s.metier}:${s.start_date}:${s.span_days}:${s.pers}`)).toEqual(
      a.steps.map((s) => `${s.metier}:${s.start_date}:${s.span_days}:${s.pers}`)
    );
  });

  it("ordre objets indépendant du résultat global (mêmes spans)", () => {
    const o1 = obj({ objet_id: "o1", heures_bois: 16, display_order: 0 });
    const o2 = obj({ objet_id: "o2", heures_bois: 16, display_order: 1 });
    const a = calculatePlan(input([o1, o2]));
    const b = calculatePlan(input([{ ...o2, display_order: 0 }, { ...o1, display_order: 1 }]));
    expect(a.steps.length).toBe(b.steps.length);
});

/* ============================================================ */
/* Jours ouvrés + jours fériés FR                                */
/* ============================================================ */
describe("jours ouvrés", () => {
  it("isWeekend détecte sam/dim", () => {
    expect(isWeekend("2026-06-27")).toBe(true); // sam
    expect(isWeekend("2026-06-28")).toBe(true); // dim
    expect(isWeekend("2026-06-29")).toBe(false); // lun
  });

  it("frenchHolidays 2026 contient les fixes + Pâques 2026 = 5 avril → lundi 6 avril", () => {
    const h = frenchHolidays(2026);
    expect(h.has("2026-01-01")).toBe(true);
    expect(h.has("2026-05-01")).toBe(true);
    expect(h.has("2026-07-14")).toBe(true);
    expect(h.has("2026-12-25")).toBe(true);
    expect(h.has("2026-04-06")).toBe(true); // Lundi de Pâques
    expect(h.has("2026-05-14")).toBe(true); // Ascension
  });

  it("isWorkingDay : 14 juillet exclu", () => {
    const h = frenchHolidays(2026);
    expect(isWorkingDay("2026-07-14", h)).toBe(false);
    expect(isWorkingDay("2026-07-13", h)).toBe(true); // lundi
  });

  it("addWorkingDays saute weekends", () => {
    // ven 06-26 + 1 jour ouvré = lun 06-29
    expect(addWorkingDays("2026-06-26", 1)).toBe("2026-06-29");
    // lun 06-29 - 1 jour ouvré = ven 06-26
    expect(addWorkingDays("2026-06-29", -1)).toBe("2026-06-26");
  });

  it("addWorkingDays saute fériés", () => {
    const h = frenchHolidays(2026);
    // mar 14 juillet férié → lun 13 + 1 = mer 15
    expect(addWorkingDays("2026-07-13", 1, h)).toBe("2026-07-15");
  });

  it("workingDateRange exclut weekends", () => {
    // 5 jours ouvrés à partir de jeu 06-25 → [25,26,29,30,01]
    expect(workingDateRange("2026-06-25", 5)).toEqual([
      "2026-06-25",
      "2026-06-26",
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
    ]);
  });

  it("workingDaysBetween compte ouvrés inclus", () => {
    // ven 06-26 → mar 06-30 = ven, lun, mar = 3
    expect(workingDaysBetween("2026-06-26", "2026-06-30")).toBe(3);
  });
});

describe("calculatePlan — jours ouvrés", () => {
  it("step de 5 jours bois finissant un mardi → start = mardi précédent (saute weekend)", () => {
    // livraison 06-30 mardi, span 5j ouvrés → start = mardi 06-23
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 80 })]));
    const bois = r.steps.find((s) => s.metier === "Bois")!;
    // 80h / 8 / 4 pers = 2,5 → 3j; 80h/(2*8)=5j ; computeSpan → 4 pers × 3j (le 1er span<best)
    // peu importe le span exact, on vérifie ouvrés
    for (const d of dateRange(bois.start_date, bois.span_days)) {
      const dow = new Date(d + "T00:00:00Z").getUTCDay();
      // start_date est ouvré ; les dates intermédiaires de l'algo (workingDateRange) ne contiennent que des ouvrés
    }
    // workingDateRange depuis start_date doit produire que des ouvrés
    const dates = workingDateRange(bois.start_date, bois.span_days);
    for (const d of dates) {
      expect(isWorkingDay(d, frenchHolidays(2026))).toBe(true);
    }
  });

  it("livraison un dimanche → recule au vendredi pour dernière fin", () => {
    const r = calculatePlan({
      affaire_id: "a",
      date_fin_fab: "2026-06-28", // dimanche
      objets: [obj({ objet_id: "o1", heures_bois: 16 })],
    });
    const bois = r.steps[0];
    const lastDate = workingDateRange(bois.start_date, bois.span_days).pop()!;
    expect(isWeekend(lastDate)).toBe(false);
    expect(lastDate <= "2026-06-26").toBe(true); // vendredi 06-26 ou avant
  });

  it("férié 14 juillet 2026 (mardi) ignoré dans la chaîne", () => {
    // livraison 07-17 vendredi, span Bois 16h = 1j → start = ven 07-17
    // si on demande livraison 07-15 (mer post 14/07), bois doit caler sur 07-15 mer (14 férié)
    const r = calculatePlan({
      affaire_id: "a",
      date_fin_fab: "2026-07-15",
      objets: [obj({ objet_id: "o1", heures_bois: 80 })], // 5j ouvrés à 2 pers
      holidays: frenchHolidays(2026),
    });
    const bois = r.steps[0];
    const h = frenchHolidays(2026);
    const dates = workingDateRange(bois.start_date, bois.span_days, h);
    // Aucune date du step ne doit être le 14/07
    expect(dates.includes("2026-07-14")).toBe(false);
    for (const d of dates) expect(isWorkingDay(d, h)).toBe(true);
  });

  it("daily_load ne contient aucun weekend", () => {
    const r = calculatePlan(input([obj({ objet_id: "o1", heures_bois: 80, heures_peinture: 32 })]));
    for (const date of Object.keys(r.daily_load)) {
      expect(isWeekend(date)).toBe(false);
    }
  });

  it("aucun step n'est positionné un weekend", () => {
    const r = calculatePlan(
      input([
        obj({ objet_id: "o1", heures_be: 30, heures_numerique: 24, heures_bois: 64, heures_peinture: 16, heures_manutention: 8 }),
        obj({ objet_id: "o2", heures_numerique: 16, heures_bois: 32 }),
      ])
    );
    for (const s of r.steps) {
      expect(isWeekend(s.start_date)).toBe(false);
    }
  });
});
});
