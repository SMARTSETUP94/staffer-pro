// v0.36 BETA — Lissage post-traitement + ordonnancement BE séquentiel
// Spec : v0.36 PRÉ-PARAMÉTRAGE MÉTIER + LISSAGE AUTO + PIPELINE OBJET
//
// Ces helpers opèrent sur le résultat de calculatePlan (algo.ts) :
//   1. smoothMetierLoad : pour chaque métier avec lissage_active=true, réduit les pics
//      en allongeant le span (backward) des steps qui dépassent capa_max_jour.
//   2. sequenceBeSteps : sérialise les steps BE par objet (1 BE à la fois) sauf override.
//   3. applyLissage : combine les deux + recalcule daily_load et alerts PIC_GLOBAL_DEPASSE.

import type { PlanResult, PlanStep, PlanAlert, MetierKey } from "./types";
import type { MetierConfig, MetierConfigKey } from "./pre-parametrage";
import {
  addWorkingDays,
  workingDateRange,
  holidaysRange,
  fromISO,
} from "./date-utils";
import { PIC_ATELIER } from "./types";

/* ============================================================ */
/* Mapping clé MetierConfig ↔ MetierKey algo                     */
/* ============================================================ */

const CFG_TO_METIER: Record<MetierConfigKey, MetierKey> = {
  BE: "BE",
  Num: "Num",
  Bois: "Bois",
  Peint: "Peint",
  Tap: "Tap",
  Manut: "Manut",
};

/* ============================================================ */
/* 1. Lissage métier — réduit les pics > capa_max_jour            */
/* ============================================================ */

/**
 * Pour chaque step du métier dépassant `capa_max_jour`, on réduit `pers` à
 * la cap et on étend `span_days` proportionnellement (h totales préservées),
 * en reculant `start_date` dans les jours ouvrés. Pure : ne mute pas l'entrée.
 */
export function smoothMetierLoad(
  steps: PlanStep[],
  config: MetierConfig,
  holidays?: Set<string>,
  includeWeekends = false,
): PlanStep[] {
  if (!config.lissage_active) return steps;
  const target = CFG_TO_METIER[config.metier_code];
  const cap = Math.max(1, config.capa_max_jour);

  return steps.map((s) => {
    if (s.metier !== target) return s;
    if (s.start_date === "TBD") return s;
    if (s.pers <= cap) return s;
    const totalH = s.pers * s.span_days * s.h_par_jour;
    const newPers = cap;
    const newSpan = Math.max(1, Math.ceil(totalH / (newPers * s.h_par_jour)));
    if (newSpan === s.span_days) return { ...s, pers: newPers };
    // Recul de (newSpan - s.span_days) jours ouvrés pour conserver la fin
    const delta = newSpan - s.span_days;
    const newStart = addWorkingDays(s.start_date, -delta, holidays, includeWeekends);
    return { ...s, pers: newPers, span_days: newSpan, start_date: newStart };
  });
}

/* ============================================================ */
/* 1.b Désempilement métier — résout le cumul multi-steps > cap   */
/* ============================================================ */

/**
 * Après lissage par step (smoothMetierLoad), il reste des journées où
 * plusieurs steps du même métier se chevauchent et dont la somme dépasse
 * `capa_max_jour`. Cette passe déplace itérativement le step "le plus
 * tardif" du jour saturé vers la gauche (1 jour ouvré) jusqu'à respecter
 * le cap. Mute les copies retournées (pas l'entrée).
 */
export function cascadeMetierOverlaps(
  steps: PlanStep[],
  configs: MetierConfig[],
  holidays?: Set<string>,
  includeWeekends = false,
  /** Borne ISO inférieure de recul (jamais avant cette date). Défaut: 60j ouvrés
   * avant le min start_date des steps. Évite l'explosion d'horizon (BUG v0.36 RC). */
  earliestStart?: string,
): PlanStep[] {
  // Clone des steps actifs (mutables localement)
  const cloned = steps.map((s) => ({ ...s }));
  // Borne inférieure : 60 jours ouvrés avant le start le plus précoce
  const placedStarts = cloned.filter((s) => s.start_date !== "TBD").map((s) => s.start_date);
  const minOriginalStart = placedStarts.length
    ? placedStarts.reduce((a, b) => (a < b ? a : b))
    : null;
  const floorStart =
    earliestStart ??
    (minOriginalStart
      ? addWorkingDays(minOriginalStart, -60, holidays, includeWeekends)
      : null);
  for (const cfg of configs) {
    if (!cfg.lissage_active) continue;
    const target = CFG_TO_METIER[cfg.metier_code];
    const cap = Math.max(1, cfg.capa_max_jour);
    let safety = 0;
    while (safety++ < 500) {
      const metierSteps = cloned.filter(
        (s) => s.metier === target && s.start_date !== "TBD",
      );
      if (metierSteps.length === 0) break;
      // Construit map jour → steps présents
      const dayMap: Record<string, PlanStep[]> = {};
      for (const s of metierSteps) {
        for (const d of workingDateRange(
          s.start_date,
          s.span_days,
          holidays,
          includeWeekends,
        )) {
          (dayMap[d] ??= []).push(s);
        }
      }
      // Cherche le 1er jour (chrono) saturé
      const sortedDays = Object.keys(dayMap).sort();
      let shifted = false;
      for (const d of sortedDays) {
        const load = dayMap[d].reduce((a, s) => a + s.pers, 0);
        if (load > cap) {
          // Décale le step au start le plus tardif (= candidat le plus
          // facile à reculer sans casser la fin)
          const candidate = [...dayMap[d]].sort((a, b) =>
            a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0,
          )[0];
          const newStart = addWorkingDays(
            candidate.start_date,
            -1,
            holidays,
            includeWeekends,
          );
          if (newStart === candidate.start_date) {
            // Impossible de reculer (déjà au début) → stop pour éviter boucle infinie
            break;
          }
          // Borne plancher — empêche l'explosion d'horizon (mai 2024 vs livraison 2026)
          if (floorStart && newStart < floorStart) {
            break;
          }
          candidate.start_date = newStart;
          shifted = true;
          break;
        }
      }
      if (!shifted) break;
    }
  }
  // Réinjecte les clones modifiés dans le tableau d'origine (préservation ordre)
  const byId = new Map(cloned.map((s) => [s.id, s]));
  return steps.map((s) => byId.get(s.id) ?? s);
}

/* ============================================================ */
/* 2. BE séquentiel par objet                                    */
/* ============================================================ */

/**
 * Sérialise les steps BE pour qu'au plus `maxParallel` BE soient actifs en parallèle.
 *
 * Tri par **score criticité aval** (descendant) : le BE dont l'ancrage de fin est
 * le plus précoce = celui dont l'aval (Num/Bois) doit démarrer le plus tôt
 * = priorité maximale. Les BE moins critiques sont reculés.
 *
 * NB : on recule en arrière (backward) — jamais on ne décale en avant pour ne pas
 * pousser au-delà de l'ancrage Num.
 */
export function sequenceBeSteps(
  steps: PlanStep[],
  opts: { maxParallel?: number; holidays?: Set<string>; includeWeekends?: boolean } = {},
): PlanStep[] {
  const maxParallel = opts.maxParallel ?? 1;
  if (maxParallel >= 99) return steps;
  // Score criticité aval = end original (start + span - 1) — plus c'est tôt, plus c'est critique.
  // On traite les plus critiques EN DERNIER pour qu'ils restent à leur place,
  // forçant les moins critiques à reculer.
  const beSteps = steps
    .filter((s) => s.metier === "BE" && s.start_date !== "TBD")
    .map((s) => {
      const endOrig = addWorkingDays(
        s.start_date,
        s.span_days - 1,
        opts.holidays,
        opts.includeWeekends,
      );
      return { step: { ...s }, endOrig };
    })
    // Moins critiques (end tardif) en premier → reculent ; critiques (end tôt) en dernier
    .sort((a, b) => (a.endOrig > b.endOrig ? -1 : a.endOrig < b.endOrig ? 1 : 0))
    .map((x) => x.step);
  if (beSteps.length <= maxParallel) return steps;

  // Pour chaque BE : son end original = anchor à respecter (livraison Num).
  // On garde end_max d'origine, puis on contraint le début pour ne pas chevaucher
  // plus de `maxParallel` autres en activité.
  const ends: string[] = [];
  for (const s of beSteps) {
    const endOrig = addWorkingDays(
      s.start_date,
      s.span_days - 1,
      opts.holidays,
      opts.includeWeekends,
    );
    // Comptage actif : steps déjà placés dont [start..end] chevauche [s.start..endOrig]
    // Si déjà >= maxParallel : reculer s pour qu'il finisse AVANT le start du plus ancien
    // step "actif" qui empêche.
    let curStart = s.start_date;
    let curEnd = endOrig;
    // Boucle jusqu'à respecter maxParallel
    for (let safety = 0; safety < 100; safety++) {
      const overlapping = ends
        .map((e, idx) => ({ start: beSteps[idx].start_date, end: e }))
        .filter((p) => !(p.end < curStart || p.start > curEnd));
      if (overlapping.length < maxParallel) break;
      // Reculer pour finir juste avant le start le plus tardif des overlapping
      const earliestBlocker = overlapping.reduce((a, b) => (a.start < b.start ? a : b));
      curEnd = addWorkingDays(earliestBlocker.start, -1, opts.holidays, opts.includeWeekends);
      curStart = addWorkingDays(curEnd, -(s.span_days - 1), opts.holidays, opts.includeWeekends);
    }
    s.start_date = curStart;
    ends.push(curEnd);
  }

  // Reconstitue le tableau global avec les BE remplacés
  const beById = new Map(beSteps.map((s) => [s.id, s]));
  return steps.map((s) => beById.get(s.id) ?? s);
}

/* ============================================================ */
/* 3. Recompute daily_load + alerts PIC_GLOBAL_DEPASSE            */
/* ============================================================ */

export function recomputeDailyLoad(
  steps: PlanStep[],
  holidays?: Set<string>,
  includeWeekends = false,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of steps) {
    if (s.start_date === "TBD") continue;
    for (const d of workingDateRange(s.start_date, s.span_days, holidays, includeWeekends)) {
      out[d] = (out[d] ?? 0) + s.pers;
    }
  }
  return out;
}

/* ============================================================ */
/* 4. applyLissage — pipeline orchestrateur                       */
/* ============================================================ */

export interface ApplyLissageOptions {
  configs: MetierConfig[];
  beOverride?: boolean;
  picMax?: number;
  holidays?: Set<string>;
  includeWeekends?: boolean;
}

export function applyLissage(plan: PlanResult, opts: ApplyLissageOptions): PlanResult {
  const picMax = opts.picMax ?? PIC_ATELIER;
  const livYear = fromISO(plan.date_fin_fab).getUTCFullYear();
  const holidays = opts.holidays ?? holidaysRange(livYear - 2, livYear + 1);
  const includeWeekends = opts.includeWeekends === true;

  // 1. Lissage par métier (réduit pers par step)
  let steps = plan.steps;
  for (const cfg of opts.configs) {
    steps = smoothMetierLoad(steps, cfg, holidays, includeWeekends);
  }

  // 1.b Désempilement métier (résout cumul multi-steps > cap)
  // Borne plancher = date_debut_fab d'origine (avant lissage) — empêche
  // l'explosion d'horizon (BUG v0.36 RC : steps reculés de 2 ans).
  steps = cascadeMetierOverlaps(
    steps,
    opts.configs,
    holidays,
    includeWeekends,
    plan.date_debut_fab,
  );

  // 2. BE séquentiel (sauf override)
  steps = sequenceBeSteps(steps, {
    maxParallel: opts.beOverride ? 2 : 1,
    holidays,
    includeWeekends,
  });

  // 3. Recompute daily_load + alerts PIC
  const dailyLoad = recomputeDailyLoad(steps, holidays, includeWeekends);
  const alertsKept = plan.alerts.filter((a) => a.code !== "PIC_GLOBAL_DEPASSE");
  const newAlerts: PlanAlert[] = [];
  for (const [date, load] of Object.entries(dailyLoad)) {
    if (load > picMax) {
      newAlerts.push({
        code: "PIC_GLOBAL_DEPASSE",
        severity: "soft",
        message: `Pic atelier ${load} pers > seuil ${picMax} le ${date} (post-lissage)`,
        date,
      });
    }
  }

  // Recompute date_debut_fab (peut avoir reculé après lissage / BE seq)
  const allStarts = steps.map((s) => s.start_date).filter((d) => d !== "TBD");
  const dateDebutFab = allStarts.length
    ? allStarts.reduce((a, b) => (a < b ? a : b))
    : plan.date_debut_fab;

  return {
    ...plan,
    date_debut_fab: dateDebutFab,
    steps,
    daily_load: dailyLoad,
    alerts: [...alertsKept, ...newAlerts],
  };
}
