// v0.35.1 — Algorithme backward-planning Fabrication 5XXX (déterministe, pas d'IA)
// Spec : mem://features/auto-staffing-v035-spec
//
// Principe : à partir de la date de livraison HARD (date_fin_fab) on remonte
// la chaîne BE → Num → Bois/Metal (binôme par objet) → Peint → Manut.
// Chaque étape produit un PlanStep {start_date, span_days, pers, h_par_jour}.
//
// Heuristique pour réduire le span (durée) : on choisit pers ∈ [BINOME_MIN..BINOME_MAX]
// tel que ⌈heures / (pers × h_par_jour)⌉ soit minimal sans dépasser PLAFOND_OBJET (soft).

import {
  BINOME_MAX,
  BINOME_MIN,
  H_BE,
  H_DEFAULT,
  LAG_BE_NUM,
  LAG_NUM_BOIS_RATIO,
  METIER_ID,
  PIC_ATELIER,
  PLAFOND_OBJET,
  RATIO_MANUT_OBJET,
  type AlertCode,
  type MetierKey,
  type ObjetInput,
  type PlanAlert,
  type PlanInput,
  type PlanResult,
  type PlanStep,
} from "./types";
import {
  addDays,
  addWorkingDays,
  dateRange,
  diffDays,
  fromISO,
  holidaysRange,
  isWorkingDay,
  maxISO,
  nextWorkingDay,
  previousWorkingDay,
  workingDateRange,
} from "./date-utils";

/* ------------------------------------------------------------------ */
/* helpers internes                                                    */
/* ------------------------------------------------------------------ */

let _idSeq = 0;
function nextId(prefix: string) {
  _idSeq += 1;
  return `${prefix}_${_idSeq}`;
}

/** Reset compteur (utile pour les tests déterministes) */
export function __resetIdSeq() {
  _idSeq = 0;
}

/** Calcule (pers, span) optimal pour heures données — minimise span sans dépasser PLAFOND_OBJET. */
export function computeSpan(
  totalHeures: number,
  hParJour: number,
  opts: { persMin?: number; persMax?: number; persFix?: number } = {}
): { pers: number; span_days: number } {
  if (totalHeures <= 0) return { pers: 0, span_days: 0 };
  if (opts.persFix && opts.persFix > 0) {
    const span = Math.max(1, Math.ceil(totalHeures / (opts.persFix * hParJour)));
    return { pers: opts.persFix, span_days: span };
  }
  const persMin = opts.persMin ?? BINOME_MIN;
  const persMax = opts.persMax ?? BINOME_MAX;
  let best = { pers: persMin, span_days: Math.max(1, Math.ceil(totalHeures / (persMin * hParJour))) };
  for (let p = persMin + 1; p <= persMax; p++) {
    const span = Math.max(1, Math.ceil(totalHeures / (p * hParJour)));
    if (span < best.span_days) best = { pers: p, span_days: span };
  }
  return best;
}

interface StepDraft extends Omit<PlanStep, "id"> {
  id?: string;
}

function pushStep(steps: PlanStep[], draft: StepDraft, prefix: string): PlanStep {
  const step: PlanStep = { ...(draft as PlanStep), id: draft.id ?? nextId(prefix) };
  steps.push(step);
  return step;
}

/** Retourne la 1ère date OUVRÉE telle que les `spanDays` jours ouvrés consécutifs depuis cette date
 *  (inclus) ne sont pas dans `reserved`, en backward depuis `latestEnd` (inclus, ramené à un ouvré).
 *  `holidays` fait partie des jours non-ouvrés (donc skip). Si rien trouvé, retourne null. */
export function findCNCSlotBackward(
  latestEnd: string,
  spanDays: number,
  reserved: Set<string>,
  earliestStart?: string,
  maxLookbackDays = 365,
  holidays?: Set<string>,
  includeWeekends = false,
): string | null {
  let end = previousWorkingDay(latestEnd, holidays, includeWeekends);
  for (let i = 0; i < maxLookbackDays; i++) {
    const start = addWorkingDays(end, -(spanDays - 1), holidays, includeWeekends);
    if (earliestStart && start < earliestStart) return null;
    const dates = workingDateRange(start, spanDays, holidays, includeWeekends);
    if (dates.every((d) => !reserved.has(d))) return start;
    end = addWorkingDays(end, -1, holidays, includeWeekends);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Algo principal                                                      */
/* ------------------------------------------------------------------ */

export function calculatePlan(input: PlanInput): PlanResult {
  __resetIdSeq();
  const steps: PlanStep[] = [];
  const alerts: PlanAlert[] = [];
  const cncReservations: Array<{ step_id: string; date: string; machine_id: string }> = [];
  const cncReserved = new Set<string>(input.cnc_reserved_dates ?? []);
  const picMax = input.pic_max ?? PIC_ATELIER;
  const dateLivraison = input.date_fin_fab;
  const includeWeekends = input.include_weekends === true;

  // Jours fériés FR sur fenêtre [livraison-2 ans .. livraison] (large pour backward 180j + amont)
  const livYear = fromISO(dateLivraison).getUTCFullYear();
  const holidays =
    input.holidays ?? holidaysRange(livYear - 2, livYear + 1);

  // helpers locaux jours ouvrés
  const dayMinus = (iso: string, n: number) => addWorkingDays(iso, -n, holidays, includeWeekends);
  const stepEnd = (start: string, span: number) => addWorkingDays(start, span - 1, holidays, includeWeekends);
  const stepDates = (start: string, span: number) => workingDateRange(start, span, holidays, includeWeekends);

  // Tri objets : ordre d'affichage donné par le caller (display_order)
  const objets = [...input.objets].sort((a, b) => a.display_order - b.display_order);

  // -------- 1) BE — un step PAR OBJET (1 pers × 10h), sériels ordre = display_order.
  // Heures BE par objet = heures_be + pro-rata de heures_be_global (suivi de projet).
  const totalAllH = objets.reduce(
    (s, o) =>
      s +
      o.heures_be +
      o.heures_numerique +
      o.heures_bois +
      o.heures_metal +
      o.heures_peinture +
      o.heures_tapisserie +
      o.heures_manutention,
    0,
  );
  const objWeight = (o: ObjetInput) =>
    o.heures_be +
    o.heures_numerique +
    o.heures_bois +
    o.heures_metal +
    o.heures_peinture +
    o.heures_tapisserie +
    o.heures_manutention;
  const beGlobal = Math.max(0, input.heures_be_global ?? 0);
  const numGlobal = Math.max(0, input.heures_numerique_global ?? 0);

  const beSteps: PlanStep[] = [];
  for (const o of objets) {
    const proRata = beGlobal > 0 && totalAllH > 0 ? beGlobal * (objWeight(o) / totalAllH) : 0;
    const heuresBeObj = o.heures_be + proRata;
    if (heuresBeObj <= 0) continue;
    const { pers, span_days } = computeSpan(heuresBeObj, H_BE, { persFix: 1 });
    const step = pushStep(
      steps,
      {
        metier_id: METIER_ID.BE,
        metier: "BE",
        objet_id: o.objet_id,
        start_date: "TBD",
        span_days,
        pers,
        h_par_jour: H_BE,
        source: "auto",
      },
      "be",
    );
    beSteps.push(step);
  }

  // -------- 2) Num — un step PAR OBJET (1 pers × 8h), CNC mono-machine (exclusivité cross-objet).
  const numStepsByObj = new Map<string, PlanStep>();
  for (const o of objets) {
    const proRata = numGlobal > 0 && totalAllH > 0 ? numGlobal * (objWeight(o) / totalAllH) : 0;
    const heuresNumObj = o.heures_numerique + proRata;
    if (heuresNumObj <= 0) continue;
    const { pers, span_days } = computeSpan(heuresNumObj, H_DEFAULT, { persFix: 1 });
    const step = pushStep(
      steps,
      {
        metier_id: METIER_ID.Num,
        metier: "Num",
        objet_id: o.objet_id,
        start_date: "TBD",
        span_days,
        pers,
        h_par_jour: H_DEFAULT,
        source: "auto",
      },
      "num",
    );
    numStepsByObj.set(o.objet_id, step);
  }

  // -------- 3-6) Bois/Metal/Peint/Tap/Manut par objet
  interface ObjChain {
    objet_id: string;
    bois?: PlanStep;
    metal?: PlanStep;
    peint?: PlanStep;
    tap?: PlanStep;
    manut?: PlanStep;
  }
  const chains: ObjChain[] = [];
  for (const o of objets) {
    const chain: ObjChain = { objet_id: o.objet_id };
    if (o.heures_bois > 0) {
      const { pers, span_days } = computeSpan(o.heures_bois, H_DEFAULT);
      chain.bois = pushStep(
        steps,
        { metier_id: METIER_ID.Bois, metier: "Bois", objet_id: o.objet_id, start_date: "TBD", span_days, pers, h_par_jour: H_DEFAULT, source: "auto" },
        "bois"
      );
      if (pers > PLAFOND_OBJET) {
        alerts.push({ code: "PLAFOND_OBJET_DEPASSE", severity: "soft", message: `Bois ${o.reference}: ${pers} pers > plafond ${PLAFOND_OBJET}`, step_id: chain.bois.id, objet_id: o.objet_id });
      }
    }
    if (o.heures_metal > 0) {
      const { pers, span_days } = computeSpan(o.heures_metal, H_DEFAULT);
      chain.metal = pushStep(
        steps,
        { metier_id: METIER_ID.Metal, metier: "Metal", objet_id: o.objet_id, start_date: "TBD", span_days, pers, h_par_jour: H_DEFAULT, source: "auto" },
        "metal"
      );
      if (pers > PLAFOND_OBJET) {
        alerts.push({ code: "PLAFOND_OBJET_DEPASSE", severity: "soft", message: `Metal ${o.reference}: ${pers} pers > plafond ${PLAFOND_OBJET}`, step_id: chain.metal.id, objet_id: o.objet_id });
      }
    }
    if (o.heures_peinture > 0) {
      const { pers, span_days } = computeSpan(o.heures_peinture, H_DEFAULT);
      chain.peint = pushStep(
        steps,
        { metier_id: METIER_ID.Peint, metier: "Peint", objet_id: o.objet_id, start_date: "TBD", span_days, pers, h_par_jour: H_DEFAULT, source: "auto" },
        "peint"
      );
    }
    if (o.heures_tapisserie > 0) {
      const { pers, span_days } = computeSpan(o.heures_tapisserie, H_DEFAULT);
      chain.tap = pushStep(
        steps,
        { metier_id: METIER_ID.Tap, metier: "Tap", objet_id: o.objet_id, start_date: "TBD", span_days, pers, h_par_jour: H_DEFAULT, source: "auto" },
        "tap"
      );
    }
    if (o.heures_manutention > 0) {
      const manutObjet = o.heures_manutention * RATIO_MANUT_OBJET;
      if (manutObjet > 0) {
        const { pers, span_days } = computeSpan(manutObjet, H_DEFAULT);
        chain.manut = pushStep(
          steps,
          { metier_id: METIER_ID.Manut, metier: "Manut", objet_id: o.objet_id, start_date: "TBD", span_days, pers, h_par_jour: H_DEFAULT, source: "auto" },
          "manut"
        );
      }
    }
    chains.push(chain);
  }

  /* ----- Backward scheduling — JOURS OUVRÉS (exclut weekends + fériés FR) ----- */
  // Ancre dernière fin = dernier jour ouvré ≤ date_fin_fab
  const lastWorkBeforeLiv = previousWorkingDay(dateLivraison, holidays);

  for (const chain of chains) {
    let endCursor = lastWorkBeforeLiv;
    if (chain.manut) {
      chain.manut.start_date = dayMinus(endCursor, chain.manut.span_days - 1);
      endCursor = dayMinus(chain.manut.start_date, 1);
    }
    if (chain.peint) {
      chain.peint.start_date = dayMinus(endCursor, chain.peint.span_days - 1);
      endCursor = dayMinus(chain.peint.start_date, 1);
    }
    if (chain.tap) {
      chain.tap.start_date = chain.peint
        ? chain.peint.start_date
        : dayMinus(endCursor, chain.tap.span_days - 1);
    }
    if (chain.bois) chain.bois.start_date = dayMinus(endCursor, chain.bois.span_days - 1);
    if (chain.metal) chain.metal.start_date = dayMinus(endCursor, chain.metal.span_days - 1);
  }

  // Earliest Bois/Metal start PAR OBJET — sert d'ancre pour Num
  const earliestBoisMetalByObj = new Map<string, string>();
  for (const c of chains) {
    const candidates = [c.bois?.start_date, c.metal?.start_date].filter(
      (d): d is string => !!d,
    );
    if (candidates.length === 0) continue;
    earliestBoisMetalByObj.set(c.objet_id, candidates.reduce((a, b) => (a < b ? a : b)));
  }

  // -------- Num PAR OBJET : doit finir AVANT (earliestBoisMetal_obj - lag jours OUVRÉS).
  const numEntries: Array<{ objet_id: string; step: PlanStep; latestEnd: string }> = [];
  for (const [objet_id, step] of numStepsByObj) {
    const lag = Math.ceil(LAG_NUM_BOIS_RATIO * step.span_days);
    const ebm = earliestBoisMetalByObj.get(objet_id);
    const latestEnd = ebm
      ? dayMinus(ebm, 1 + lag)
      : dayMinus(lastWorkBeforeLiv, 0);
    numEntries.push({ objet_id, step, latestEnd });
  }
  numEntries.sort((a, b) => (a.latestEnd < b.latestEnd ? 1 : a.latestEnd > b.latestEnd ? -1 : 0));
  for (const { step, latestEnd, objet_id } of numEntries) {
    const earliestStart = dayMinus(latestEnd, 180);
    const slot = findCNCSlotBackward(latestEnd, step.span_days, cncReserved, earliestStart, 180, holidays);
    if (slot === null) {
      const o = objets.find((x) => x.objet_id === objet_id);
      alerts.push({
        code: "NUM_CONFLIT_INSOLUBLE",
        severity: "hard",
        message: `CNC saturée : impossible de placer ${step.span_days}j de Numérique pour « ${o?.reference ?? objet_id} » entre ${earliestStart} et ${latestEnd}`,
        step_id: step.id,
        objet_id,
        detail: {
          objet_reference: o?.reference,
          objet_nom: o?.nom,
          machine_id: "cnc_principale",
          span_days: step.span_days,
          window_start: earliestStart,
          window_end: latestEnd,
        },
      });
      step.start_date = dayMinus(latestEnd, step.span_days - 1);
    } else {
      step.start_date = slot;
      for (const d of stepDates(slot, step.span_days)) {
        cncReserved.add(d);
        cncReservations.push({ step_id: step.id, date: d, machine_id: "cnc_principale" });
      }
    }
  }

  // -------- BE PAR OBJET : ancre = Num.start - LAG_BE_NUM (ouvrés)
  for (const beStep of beSteps) {
    const objet_id = beStep.objet_id!;
    const numStep = numStepsByObj.get(objet_id);
    const ebm = earliestBoisMetalByObj.get(objet_id);
    const anchorEnd = numStep
      ? dayMinus(numStep.start_date, 1 + LAG_BE_NUM)
      : ebm
      ? dayMinus(ebm, 2)
      : dayMinus(lastWorkBeforeLiv, 0);
    beStep.start_date = dayMinus(anchorEnd, beStep.span_days - 1);
  }

  /* ----- Bornes globales ----- */
  const allStarts = steps.map((s) => s.start_date).filter((d) => d !== "TBD");
  const dateDebutFab = allStarts.length ? allStarts.reduce((a, b) => (a < b ? a : b)) : dateLivraison;

  /* ----- Pic atelier journalier (jours ouvrés effectifs des steps) ----- */
  const dailyLoad: Record<string, number> = {};
  for (const s of steps) {
    if (s.start_date === "TBD") continue;
    for (const d of stepDates(s.start_date, s.span_days)) {
      dailyLoad[d] = (dailyLoad[d] ?? 0) + s.pers;
    }
  }
  for (const [date, load] of Object.entries(dailyLoad)) {
    if (load > picMax) {
      alerts.push({ code: "PIC_GLOBAL_DEPASSE", severity: "soft", message: `Pic atelier ${load} pers > seuil ${picMax} le ${date}`, date });
    }
  }

  /* ----- Débord livraison (HARD) — fin = stepEnd jours ouvrés ----- */
  const dateFinCalculee = steps
    .filter((s) => s.start_date !== "TBD")
    .map((s) => stepEnd(s.start_date, s.span_days))
    .reduce((a, b) => maxISO(a, b), dateDebutFab);
  if (dateFinCalculee > dateLivraison) {
    alerts.push({
      code: "DEBORD_LIVRAISON",
      severity: "hard",
      message: `Date fin calculée ${dateFinCalculee} > livraison ${dateLivraison} (débord ${diffDays(dateLivraison, dateFinCalculee)}j)`,
    });
  }

  return {
    date_debut_fab: dateDebutFab,
    date_fin_fab: dateLivraison,
    steps,
    cnc_reservations: cncReservations,
    alerts,
    daily_load: dailyLoad,
  };
}

/** Ré-export pratique des codes d'alerte */
export const ALERT_CODES: AlertCode[] = [
  "DEBORD_LIVRAISON",
  "PIC_GLOBAL_DEPASSE",
  "NUM_CONFLIT_INSOLUBLE",
  "PLAFOND_OBJET_DEPASSE",
  "MANUT_POOL_DEBORDE",
];

export type { MetierKey, ObjetInput, PlanInput, PlanResult, PlanStep, PlanAlert } from "./types";
