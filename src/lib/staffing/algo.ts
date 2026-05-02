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
import { addDays, dateRange, diffDays, maxISO } from "./date-utils";

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

/** Retourne la 1ère date de span_days consécutifs où aucune date n'est dans `reserved`,
 *  en backward depuis `latestEnd` (inclus). Si aucun créneau trouvé, retourne null. */
export function findCNCSlotBackward(
  latestEnd: string,
  spanDays: number,
  reserved: Set<string>,
  earliestStart?: string,
  maxLookbackDays = 365
): string | null {
  let end = latestEnd;
  for (let i = 0; i < maxLookbackDays; i++) {
    const start = addDays(end, -(spanDays - 1));
    if (earliestStart && start < earliestStart) return null;
    const dates = dateRange(start, spanDays);
    if (dates.every((d) => !reserved.has(d))) return start;
    end = addDays(end, -1);
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

  // Tri objets : ordre d'affichage donné par le caller (display_order)
  const objets = [...input.objets].sort((a, b) => a.display_order - b.display_order);

  // -------- 1) BE — un step PAR OBJET (1 pers × 10h), sériels ordre = display_order.
  // Les heures BE sont déjà par objet (heures_be). Si l'affaire a des heures BE
  // "globales / suivi de projet" elles peuvent être splittées au pro-rata via
  // input.heures_be_global (optionnel). Si non fourni, seules heures_be par objet sont utilisées.
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
  const beGlobal = Math.max(0, input.heures_be_global ?? 0);
  const beSteps: PlanStep[] = [];
  // Itère dans l'ordre display_order (== ordre déjà trié plus haut)
  for (const o of objets) {
    const proRata =
      beGlobal > 0 && totalAllH > 0
        ? beGlobal *
          ((o.heures_be +
            o.heures_numerique +
            o.heures_bois +
            o.heures_metal +
            o.heures_peinture +
            o.heures_tapisserie +
            o.heures_manutention) /
            totalAllH)
        : 0;
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

  // -------- 2) Num — série 1 pers × 8h, démarre BE+2j, créneau CNC libre
  const totalNum = objets.reduce((s, o) => s + o.heures_numerique, 0);
  let numStep: PlanStep | null = null;
  if (totalNum > 0) {
    const { span_days, pers } = computeSpan(totalNum, H_DEFAULT, { persFix: 1 });
    numStep = pushStep(
      steps,
      { metier_id: METIER_ID.Num, metier: "Num", objet_id: null, start_date: "TBD", span_days, pers, h_par_jour: H_DEFAULT, source: "auto" },
      "num"
    );
  }

  // -------- 3) Bois & Metal par objet (binôme [2..4])
  // -------- 4) Peint après Bois ET Metal du même objet (réfection : après BE)
  // -------- 5) Tap par objet si heures_tapisserie
  // -------- 6) Manut par objet (50%) après Peint
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

  /* ----- Backward scheduling : on ancre tout sur date_fin_fab et on remonte ----- */

  // Pour chaque chaîne objet : Manut → fin = livraison ; Peint → fin = Manut.start - 0 (consécutif) sinon livraison ;
  // Bois & Metal → fin = Peint.start (parallèle entre eux) sinon livraison.
  for (const chain of chains) {
    let endCursor = dateLivraison;
    if (chain.manut) {
      chain.manut.start_date = addDays(endCursor, -(chain.manut.span_days - 1));
      endCursor = addDays(chain.manut.start_date, -1);
    }
    if (chain.peint) {
      chain.peint.start_date = addDays(endCursor, -(chain.peint.span_days - 1));
      endCursor = addDays(chain.peint.start_date, -1);
    }
    if (chain.tap) {
      // Tap en parallèle de Peint (post Bois/Metal) — on l'aligne sur la même fenêtre
      chain.tap.start_date = chain.peint
        ? chain.peint.start_date
        : addDays(endCursor, -(chain.tap.span_days - 1));
    }
    // Bois & Metal en parallèle, fin = endCursor
    if (chain.bois) chain.bois.start_date = addDays(endCursor, -(chain.bois.span_days - 1));
    if (chain.metal) chain.metal.start_date = addDays(endCursor, -(chain.metal.span_days - 1));
  }

  // Earliest Bois/Metal start cross-objets — sert d'ancre pour Num
  const earliestBoisMetalStart = chains
    .flatMap((c) => [c.bois?.start_date, c.metal?.start_date])
    .filter((d): d is string => !!d)
    .reduce<string | null>((acc, d) => (acc === null || d < acc ? d : acc), null);

  // -------- Num : doit finir AVANT (earliestBoisMetalStart - lag_num_bois)
  if (numStep) {
    const lagNumBois = Math.ceil(LAG_NUM_BOIS_RATIO * numStep.span_days);
    const numLatestEnd = earliestBoisMetalStart
      ? addDays(earliestBoisMetalStart, -1 - lagNumBois)
      : addDays(dateLivraison, -1);
    const numEarliestStart = addDays(numLatestEnd, -90); // fenêtre raisonnable cross-affaires
    const numSlot = findCNCSlotBackward(numLatestEnd, numStep.span_days, cncReserved, numEarliestStart, 90);
    if (numSlot === null) {
      alerts.push({
        code: "NUM_CONFLIT_INSOLUBLE",
        severity: "hard",
        message: `Aucun créneau CNC libre de ${numStep.span_days}j avant le ${numLatestEnd}`,
        step_id: numStep.id,
      });
      // fallback : on pose quand même au numLatestEnd reculé du span
      numStep.start_date = addDays(numLatestEnd, -(numStep.span_days - 1));
    } else {
      numStep.start_date = numSlot;
      for (const d of dateRange(numSlot, numStep.span_days)) {
        cncReserved.add(d);
        cncReservations.push({ step_id: numStep.id, date: d, machine_id: "cnc_principale" });
      }
    }
  }

  // -------- BE : doit finir avant Num.start - LAG_BE_NUM (sinon avant Bois/Metal - 1j si pas de Num)
  if (beStep) {
    const beLatestEnd = numStep
      ? addDays(numStep.start_date, -1 - LAG_BE_NUM)
      : earliestBoisMetalStart
      ? addDays(earliestBoisMetalStart, -2)
      : addDays(dateLivraison, -1);
    beStep.start_date = addDays(beLatestEnd, -(beStep.span_days - 1));
  }

  /* ----- Bornes globales ----- */
  const allStarts = steps.map((s) => s.start_date).filter((d) => d !== "TBD");
  const dateDebutFab = allStarts.length ? allStarts.reduce((a, b) => (a < b ? a : b)) : dateLivraison;

  /* ----- Pic atelier journalier ----- */
  const dailyLoad: Record<string, number> = {};
  for (const s of steps) {
    if (s.start_date === "TBD") continue;
    for (const d of dateRange(s.start_date, s.span_days)) {
      dailyLoad[d] = (dailyLoad[d] ?? 0) + s.pers;
    }
  }
  for (const [date, load] of Object.entries(dailyLoad)) {
    if (load > picMax) {
      alerts.push({ code: "PIC_GLOBAL_DEPASSE", severity: "soft", message: `Pic atelier ${load} pers > seuil ${picMax} le ${date}`, date });
    }
  }

  /* ----- Débord livraison (HARD) ----- */
  const dateFinCalculee = steps
    .filter((s) => s.start_date !== "TBD")
    .map((s) => addDays(s.start_date, s.span_days - 1))
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
