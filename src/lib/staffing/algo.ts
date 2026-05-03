// v0.37 — Algo auto-staffing pipeline par objet (5 étapes déterministes)
// Spec : mem://features/algo-v037-pipeline-objet
//
// 1) Tri objets (4 priorités)
// 2) Calendrier BE séquentiel global (cap=1, ordre étape 1, forward depuis date_debut_fab_min ou backward depuis livraison)
// 3) Split Manutention par objet (35 DEBUT / 15 TRANSFERT / 50 FIN agrégée)
// 4) Pipeline production par objet : ManutDebut concurrent ; Num après BE+LAG_BE_NUM ; Bois après Num+LAG_NUM_BOIS ; ManutTransfert ; Peint après ManutTransfert ; ManutFin agrégée 2 derniers jours
// 5) Restitution : steps + reservations CNC + daily_load + alertes
//
// L'ancien lissage v0.36 (smoothMetierLoad/cascadeMetierOverlaps/sequenceBeSteps) est SUPPRIMÉ.

import {
  BINOME_METIERS,
  CAP_BOIS,
  CAP_MANUT,
  CAP_METAL,
  CAP_PEINT,
  CAP_TAP,
  H_BE,
  H_DEFAULT,
  LAG_BE_NUM,
  LAG_NUM_BOIS,
  MANUT_FIN_DAYS,
  MANUT_PCT_DEBUT,
  MANUT_PCT_FIN,
  MANUT_PCT_TRANSFERT,
  METIER_ID,
  PIC_ATELIER,
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
  diffDays,
  fromISO,
  holidaysRange,
  maxISO,
  previousWorkingDay,
  workingDateRange,
} from "./date-utils";

let _idSeq = 0;
function nextId(prefix: string) {
  _idSeq += 1;
  return `${prefix}_${_idSeq}`;
}

export function __resetIdSeq() {
  _idSeq = 0;
}

/* ------------------------------------------------------------------ */
/* Étape 1 — Tri 4 priorités                                          */
/* ------------------------------------------------------------------ */

/** Compare deux objets selon les 4 priorités v0.37.
 *  P1 : objets sans BE et sans Num → en tête (fab démarre direct)
 *  P2 : ceil(h_be/8) + ceil(h_num/8) ASC (petits objets en premier)
 *  P3 : h_num ASC (libère CNC tôt)
 *  P4 : h_be DESC (égalité)
 */
export function compareObjetsV037(a: ObjetInput, b: ObjetInput): number {
  const aP1 = a.heures_be === 0 && a.heures_numerique === 0 ? 0 : 1;
  const bP1 = b.heures_be === 0 && b.heures_numerique === 0 ? 0 : 1;
  if (aP1 !== bP1) return aP1 - bP1;

  const aP2 = Math.ceil(a.heures_be / 8) + Math.ceil(a.heures_numerique / 8);
  const bP2 = Math.ceil(b.heures_be / 8) + Math.ceil(b.heures_numerique / 8);
  if (aP2 !== bP2) return aP2 - bP2;

  if (a.heures_numerique !== b.heures_numerique) return a.heures_numerique - b.heures_numerique;
  if (a.heures_be !== b.heures_be) return b.heures_be - a.heures_be;
  return a.display_order - b.display_order;
}

export function sortObjetsV037(objets: ObjetInput[]): ObjetInput[] {
  return [...objets].sort(compareObjetsV037);
}

/* ------------------------------------------------------------------ */
/* Helpers binôme + cap                                                */
/* ------------------------------------------------------------------ */

function isBinome(m: MetierKey): boolean {
  return BINOME_METIERS.includes(m);
}

function capForMetier(m: MetierKey): number {
  switch (m) {
    case "Bois": return CAP_BOIS;
    case "Metal": return CAP_METAL;
    case "Peint": return CAP_PEINT;
    case "Tap": return CAP_TAP;
    case "Manut": return CAP_MANUT;
    default: return 1;
  }
}

/** Retourne (pers, span) minimisant le span sous contrainte cap & binôme. */
export function pickPersAndSpan(
  totalHeures: number,
  metier: MetierKey,
  hParJour = H_DEFAULT,
): { pers: number; span_days: number } {
  if (totalHeures <= 0) return { pers: 0, span_days: 0 };
  const cap = capForMetier(metier);
  const binome = isBinome(metier);
  const min = binome ? 2 : 1;
  const max = Math.max(min, cap);
  let best = { pers: min, span_days: Math.max(1, Math.ceil(totalHeures / (min * hParJour))) };
  for (let p = min; p <= max; p++) {
    if (binome && p % 2 !== 0) continue;
    const span = Math.max(1, Math.ceil(totalHeures / (p * hParJour)));
    if (span < best.span_days) best = { pers: p, span_days: span };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Algo principal v0.37                                                */
/* ------------------------------------------------------------------ */

export function calculatePlanV037(input: PlanInput): PlanResult {
  __resetIdSeq();
  const steps: PlanStep[] = [];
  const alerts: PlanAlert[] = [];
  const cncReservations: Array<{ step_id: string; date: string; machine_id: string }> = [];
  const cncReserved = new Set<string>(input.cnc_reserved_dates ?? []);
  const picMax = input.pic_max ?? PIC_ATELIER;
  const dateLivraison = input.date_fin_fab;
  const includeWeekends = input.include_weekends === true;

  const livYear = fromISO(dateLivraison).getUTCFullYear();
  const holidays = input.holidays ?? holidaysRange(livYear - 2, livYear + 1);

  const wPlus = (iso: string, n: number) => addWorkingDays(iso, n, holidays, includeWeekends);
  const wMinus = (iso: string, n: number) => addWorkingDays(iso, -n, holidays, includeWeekends);
  const stepDates = (start: string, span: number) =>
    workingDateRange(start, span, holidays, includeWeekends);
  const stepEnd = (start: string, span: number) => wPlus(start, span - 1);

  // Pro-rata heures globales (BE/Num) sur poids total objets
  const totalAllH = input.objets.reduce(
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

  // Objets enrichis (BE/Num pro-rata appliqués)
  const enriched = input.objets.map((o) => ({
    ...o,
    heures_be: o.heures_be + (beGlobal > 0 && totalAllH > 0 ? beGlobal * (objWeight(o) / totalAllH) : 0),
    heures_numerique: o.heures_numerique + (numGlobal > 0 && totalAllH > 0 ? numGlobal * (objWeight(o) / totalAllH) : 0),
  }));

  /* ---------- ÉTAPE 1 : tri 4 priorités ---------- */
  const objets = sortObjetsV037(enriched);

  /* ---------- ÉTAPE 2 : BE séquentiel global ---------- */
  // Date de démarrage BE = date_debut_fab_min si fournie, sinon ancrage forward depuis aujourd'hui (caller fixe).
  // À défaut, on calcule un ancrage backward à partir de la livraison.
  // Approche : on schedule BE en FORWARD à partir d'un ancrage = max(today, date_debut_fab_min ?? today).
  const startAnchorRaw = input.date_debut_fab_min ?? null;
  const beStepsByObj = new Map<string, PlanStep>();
  let beCursor: string | null = null;

  if (startAnchorRaw) {
    beCursor = wPlus(startAnchorRaw, 0);
  } else {
    // Backward : calc total span BE et place ce bloc finissant ≤ livraison - LAG_BE_NUM
    const totalBeSpan = objets.reduce(
      (s, o) => s + (o.heures_be > 0 ? Math.max(1, Math.ceil(o.heures_be / H_BE)) : 0),
      0,
    );
    const beEndLatest = wMinus(dateLivraison, LAG_BE_NUM);
    beCursor = totalBeSpan > 0 ? wMinus(beEndLatest, totalBeSpan - 1) : wPlus(dateLivraison, 0);
  }

  for (const o of objets) {
    if (o.heures_be <= 0) continue;
    const span = Math.max(1, Math.ceil(o.heures_be / H_BE));
    const start = beCursor!;
    const step: PlanStep = {
      id: nextId("be"),
      metier_id: METIER_ID.BE,
      metier: "BE",
      objet_id: o.objet_id,
      start_date: start,
      span_days: span,
      pers: 1,
      h_par_jour: H_BE,
      source: "auto",
    };
    steps.push(step);
    beStepsByObj.set(o.objet_id, step);
    beCursor = wPlus(stepEnd(start, span), 1);
  }

  /* ---------- ÉTAPE 3 + 4 : Manut split + pipeline production par objet ---------- */
  // Pour chaque objet on émet les steps Manut DEBUT/TRANSFERT puis Num/Bois/Metal/Peint/Tap.
  // Manut FIN est agrégée chantier après la boucle.

  let manutFinTotalH = 0;
  // Earliest start global pour fab (post-BE)
  let earliestProdStart: string | null = null;

  for (const o of objets) {
    const beStep = beStepsByObj.get(o.objet_id);
    const beEnd = beStep ? stepEnd(beStep.start_date, beStep.span_days) : null;

    // Splits Manut
    const hManut = o.heures_manutention;
    const hManutDebut = hManut * MANUT_PCT_DEBUT;
    const hManutTransfert = hManut * MANUT_PCT_TRANSFERT;
    const hManutFin = hManut * MANUT_PCT_FIN;
    manutFinTotalH += hManutFin;

    // Ancre démarrage objet : si BE → BE_end + LAG_BE_NUM ; sinon date_debut_fab_min ; sinon livraison-large
    const objStart =
      beEnd !== null
        ? wPlus(beEnd, LAG_BE_NUM)
        : input.date_debut_fab_min
          ? wPlus(input.date_debut_fab_min, 0)
          : wPlus(dateLivraison, 0);

    // -- Manut DÉBUT (concurrent avec Num) --
    let cursor = objStart;
    if (hManutDebut > 0) {
      const { pers, span_days } = pickPersAndSpan(hManutDebut, "Manut");
      const step: PlanStep = {
        id: nextId("manut_d"),
        metier_id: METIER_ID.Manut,
        metier: "Manut",
        objet_id: o.objet_id,
        start_date: objStart,
        span_days,
        pers,
        h_par_jour: H_DEFAULT,
        source: "auto",
        phase: "DEBUT",
      };
      steps.push(step);
    }

    // -- Num (mono-CNC) : démarre objStart, place forward, vérifie disponibilité --
    let numEnd: string | null = null;
    if (o.heures_numerique > 0) {
      const span = Math.max(1, Math.ceil(o.heures_numerique / H_DEFAULT));
      // Cherche 1er créneau forward depuis objStart sans collision
      const numStart = findCNCSlotForward(objStart, span, cncReserved, holidays, includeWeekends);
      if (numStart === null) {
        alerts.push({
          code: "NUM_CONFLIT_INSOLUBLE",
          severity: "hard",
          message: `CNC saturée : impossible de placer ${span}j de Num pour « ${o.reference} » à partir de ${objStart}`,
          objet_id: o.objet_id,
          detail: { objet_reference: o.reference, objet_nom: o.nom, machine_id: "cnc_principale", span_days: span, window_start: objStart },
        });
      }
      const placed = numStart ?? objStart;
      const numStep: PlanStep = {
        id: nextId("num"),
        metier_id: METIER_ID.Num,
        metier: "Num",
        objet_id: o.objet_id,
        start_date: placed,
        span_days: span,
        pers: 1,
        h_par_jour: H_DEFAULT,
        source: "auto",
      };
      steps.push(numStep);
      for (const d of stepDates(placed, span)) {
        cncReserved.add(d);
        cncReservations.push({ step_id: numStep.id, date: d, machine_id: "cnc_principale" });
      }
      numEnd = stepEnd(placed, span);
    }

    // -- Bois après Num + LAG_NUM_BOIS, ou objStart si pas de Num --
    let boisEnd: string | null = null;
    if (o.heures_bois > 0) {
      const { pers, span_days } = pickPersAndSpan(o.heures_bois, "Bois");
      const start = numEnd !== null ? wPlus(numEnd, LAG_NUM_BOIS) : objStart;
      const step: PlanStep = {
        id: nextId("bois"),
        metier_id: METIER_ID.Bois,
        metier: "Bois",
        objet_id: o.objet_id,
        start_date: start,
        span_days,
        pers,
        h_par_jour: H_DEFAULT,
        source: "auto",
      };
      steps.push(step);
      boisEnd = stepEnd(start, span_days);
    }

    // -- Metal en parallèle de Bois (objStart ou Num+LAG) --
    let metalEnd: string | null = null;
    if (o.heures_metal > 0) {
      const { pers, span_days } = pickPersAndSpan(o.heures_metal, "Metal");
      const start = numEnd !== null ? wPlus(numEnd, LAG_NUM_BOIS) : objStart;
      const step: PlanStep = {
        id: nextId("metal"),
        metier_id: METIER_ID.Metal,
        metier: "Metal",
        objet_id: o.objet_id,
        start_date: start,
        span_days,
        pers,
        h_par_jour: H_DEFAULT,
        source: "auto",
      };
      steps.push(step);
      metalEnd = stepEnd(start, span_days);
    }

    const productionEnd = [boisEnd, metalEnd, numEnd].filter((x): x is string => x !== null).reduce((a, b) => maxISO(a, b), objStart);

    // -- Manut TRANSFERT : entre fin Bois/Metal et début Peint --
    let transfertEnd = productionEnd;
    if (hManutTransfert > 0) {
      const { pers, span_days } = pickPersAndSpan(hManutTransfert, "Manut");
      const start = wPlus(productionEnd, 1);
      const step: PlanStep = {
        id: nextId("manut_t"),
        metier_id: METIER_ID.Manut,
        metier: "Manut",
        objet_id: o.objet_id,
        start_date: start,
        span_days,
        pers,
        h_par_jour: H_DEFAULT,
        source: "auto",
        phase: "TRANSFERT",
      };
      steps.push(step);
      transfertEnd = stepEnd(start, span_days);
    }

    // -- Peint après transfert (ou productionEnd si pas de transfert) --
    let peintEnd: string | null = null;
    if (o.heures_peinture > 0) {
      const { pers, span_days } = pickPersAndSpan(o.heures_peinture, "Peint");
      const start = wPlus(transfertEnd, hManutTransfert > 0 ? 1 : 1);
      const step: PlanStep = {
        id: nextId("peint"),
        metier_id: METIER_ID.Peint,
        metier: "Peint",
        objet_id: o.objet_id,
        start_date: start,
        span_days,
        pers,
        h_par_jour: H_DEFAULT,
        source: "auto",
      };
      steps.push(step);
      peintEnd = stepEnd(start, span_days);
    }

    // -- Tap en parallèle de Peint --
    if (o.heures_tapisserie > 0) {
      const { pers, span_days } = pickPersAndSpan(o.heures_tapisserie, "Tap");
      const start = peintEnd !== null
        ? steps.find((s) => s.metier === "Peint" && s.objet_id === o.objet_id)!.start_date
        : wPlus(transfertEnd, 1);
      const step: PlanStep = {
        id: nextId("tap"),
        metier_id: METIER_ID.Tap,
        metier: "Tap",
        objet_id: o.objet_id,
        start_date: start,
        span_days,
        pers,
        h_par_jour: H_DEFAULT,
        source: "auto",
      };
      steps.push(step);
    }

    // Track earliest production start (ManutDebut ou Num ou objStart)
    if (earliestProdStart === null || objStart < earliestProdStart) earliestProdStart = objStart;
  }

  /* ---------- Manut FIN agrégée chantier (2 derniers jours ouvrés) ---------- */
  if (manutFinTotalH > 0) {
    const lastWork = previousWorkingDay(dateLivraison, holidays, includeWeekends);
    const finStart = wMinus(lastWork, MANUT_FIN_DAYS - 1);
    const { pers } = pickPersAndSpan(manutFinTotalH, "Manut");
    const step: PlanStep = {
      id: nextId("manut_f"),
      metier_id: METIER_ID.Manut,
      metier: "Manut",
      objet_id: null,
      start_date: finStart,
      span_days: MANUT_FIN_DAYS,
      pers,
      h_par_jour: H_DEFAULT,
      source: "auto",
      phase: "FIN",
    };
    steps.push(step);

    // Alerte si Manut FIN chevauche Peint actif
    const finDates = new Set(stepDates(finStart, MANUT_FIN_DAYS));
    for (const s of steps) {
      if (s.metier !== "Peint") continue;
      const peintDates = stepDates(s.start_date, s.span_days);
      if (peintDates.some((d) => finDates.has(d))) {
        alerts.push({
          code: "PEINT_OVERFLOW_MANUT",
          severity: "soft",
          message: `Manut FIN chevauche Peint actif (${s.objet_id}) sur ${peintDates.filter((d) => finDates.has(d)).join(", ")}`,
          step_id: step.id,
          objet_id: s.objet_id ?? undefined,
        });
        break;
      }
    }
  }

  /* ---------- ÉTAPE 5 : restitution + alertes ---------- */
  const allStarts = steps.map((s) => s.start_date);
  const dateDebutFab = allStarts.length ? allStarts.reduce((a, b) => (a < b ? a : b)) : dateLivraison;

  const dailyLoad: Record<string, number> = {};
  for (const s of steps) {
    for (const d of stepDates(s.start_date, s.span_days)) {
      dailyLoad[d] = (dailyLoad[d] ?? 0) + s.pers;
    }
  }
  for (const [date, load] of Object.entries(dailyLoad)) {
    if (load > picMax) {
      alerts.push({
        code: "PIC_GLOBAL_DEPASSE",
        severity: "soft",
        message: `Pic atelier ${load} pers > seuil ${picMax} le ${date}`,
        date,
      });
    }
  }

  const dateFinCalculee = steps
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

/** Cherche le 1er créneau CNC libre forward (jours ouvrés consécutifs). */
function findCNCSlotForward(
  earliest: string,
  spanDays: number,
  reserved: Set<string>,
  holidays?: Set<string>,
  includeWeekends = false,
  maxLookAheadDays = 365,
): string | null {
  let cur = earliest;
  for (let i = 0; i < maxLookAheadDays; i++) {
    const dates = workingDateRange(cur, spanDays, holidays, includeWeekends);
    if (dates.every((d) => !reserved.has(d))) return cur;
    cur = addWorkingDays(cur, 1, holidays, includeWeekends);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Compat v0.35 — exports legacy                                       */
/* ------------------------------------------------------------------ */

/** Alias pour les consommateurs encore branchés sur v0.35. */
export const calculatePlan = calculatePlanV037;

/** Compat : legacy computeSpan (utilisé par slider-impact/tests). */
export function computeSpan(
  totalHeures: number,
  hParJour: number,
  opts: { persMin?: number; persMax?: number; persFix?: number } = {},
): { pers: number; span_days: number } {
  if (totalHeures <= 0) return { pers: 0, span_days: 0 };
  if (opts.persFix && opts.persFix > 0) {
    const span = Math.max(1, Math.ceil(totalHeures / (opts.persFix * hParJour)));
    return { pers: opts.persFix, span_days: span };
  }
  const persMin = opts.persMin ?? 2;
  const persMax = opts.persMax ?? 4;
  let best = { pers: persMin, span_days: Math.max(1, Math.ceil(totalHeures / (persMin * hParJour))) };
  for (let p = persMin + 1; p <= persMax; p++) {
    const span = Math.max(1, Math.ceil(totalHeures / (p * hParJour)));
    if (span < best.span_days) best = { pers: p, span_days: span };
  }
  return best;
}

/** Compat : legacy CNC backward (utilisé par certains tests). */
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

export const ALERT_CODES: AlertCode[] = [
  "DEBORD_LIVRAISON",
  "PIC_GLOBAL_DEPASSE",
  "NUM_CONFLIT_INSOLUBLE",
  "PLAFOND_OBJET_DEPASSE",
  "MANUT_POOL_DEBORDE",
  "PEINT_OVERFLOW_MANUT",
  "PERS_PEINT_INSUFFISANT",
];

export type { MetierKey, ObjetInput, PlanInput, PlanResult, PlanStep, PlanAlert } from "./types";
