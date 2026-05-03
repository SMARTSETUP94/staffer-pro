// v0.36 ALPHA — Pré-paramétrage métier amont (auto-suggest)
// Spec : v0.36 PRÉ-PARAMÉTRAGE MÉTIER + LISSAGE AUTO + PIPELINE OBJET
// Ordre d'implémentation strict — PHASE 1 : autoSuggestMetierConfig + computeMetierWindows

import { workingDaysBetween, holidaysRange, addWorkingDays, fromISO } from "./date-utils";
import type { MetierKey } from "./types";

/* ============================================================ */
/* Constantes v0.36                                              */
/* ============================================================ */

/** Ratios indicatifs de répartition de la fenêtre globale par métier (pass 1). */
export const RATIOS_V036 = {
  BE: 0.19,
  Num: 0.1,
  Bois: 0.33,
  Finition: 0.33, // partagé Peint + Tap au pro-rata des heures
  Manut: 0.05,
} as const;

/** Capacité max simultanée par métier (HARD pour BE/Num, SOFT pour les autres). */
export const CAPS_PERS_V036: Record<MetierConfigKey, number> = {
  BE: 1, // HARD : BE-1 (jamais 2 BE même objet) ; override possible 2 BE/chantier
  Num: 1, // HARD : 1 CNC principale
  Bois: 4,
  Peint: 6,
  Tap: 3,
  Manut: 5,
};

/** Coefficient de chevauchement pipeline (objets ≠ enchaînés en parallèle partiel). */
export const PIPELINE_FACTOR = 0.7;

/** Métiers gérés par le pré-paramétrage v0.36 (Metal exclu — non couvert par la spec). */
export type MetierConfigKey = "BE" | "Num" | "Bois" | "Peint" | "Tap" | "Manut";
export const METIERS_V036: MetierConfigKey[] = ["BE", "Num", "Bois", "Peint", "Tap", "Manut"];

/* ============================================================ */
/* Types                                                         */
/* ============================================================ */

export type TotalHByMetier = Record<MetierConfigKey, number>;

export interface MetierConfig {
  metier_code: MetierConfigKey;
  total_h_calc: number;
  nb_pers_cible: number;
  duree_cible_j: number;
  capa_max_jour: number;
  lissage_active: boolean;
  /** True si la capa max simultanée a été atteinte (besoin théorique > cap). */
  cap_reached: boolean;
}

export type ConflictType =
  | "WINDOW_INFEASIBLE"
  | "OVERRIDE_REASON_REQUIRED"
  | "BE_PARALLEL_FORBIDDEN"
  | "PIC_IRRESOLU";

export type Severity = "HARD" | "WARN";

export interface ConflictLever {
  action: "BE_OVERRIDE" | "INCREASE_RESOURCES" | "POSTPONE_DEADLINE";
  metier?: MetierConfigKey;
  gain_days?: number;
  delta_days?: number;
}

export interface Conflict {
  type: ConflictType;
  severity: Severity;
  message?: string;
  delta_days?: number;
  metier?: MetierConfigKey;
  levers?: ConflictLever[];
}

export interface AutoSuggestResult {
  configs: MetierConfig[];
  conflicts: Conflict[];
  pipeline_duration: number;
  fenetre_dispo: number;
}

/* ============================================================ */
/* Helpers                                                       */
/* ============================================================ */

function emptyTotals(): TotalHByMetier {
  return { BE: 0, Num: 0, Bois: 0, Peint: 0, Tap: 0, Manut: 0 };
}

/** Renvoie un nombre arrondi à 2 décimales (arrondi standard). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ============================================================ */
/* PASS 1 + 2 + 3 — autoSuggestMetierConfig                      */
/* ============================================================ */

/**
 * Auto-suggest la config métier v0.36 (3 passes).
 * @param totals Total heures par métier (déjà agrégé depuis fabrication_objets).
 * @param today  ISO date début fenêtre fabrication (défaut : aujourd'hui).
 * @param deadline ISO date livraison (date_fin_fab).
 * @param holidays Optional set de jours fériés. Si omis, fériés FR métropole.
 */
export function autoSuggestMetierConfig(
  totals: Partial<TotalHByMetier>,
  today: string,
  deadline: string,
  holidays?: Set<string>,
): AutoSuggestResult {
  const T: TotalHByMetier = { ...emptyTotals(), ...totals };

  // Fenêtre dispo en jours OUVRÉS (FR, fériés exclus)
  const yearFrom = fromISO(today).getUTCFullYear();
  const yearTo = fromISO(deadline).getUTCFullYear();
  const hol = holidays ?? holidaysRange(yearFrom, yearTo);
  const J = Math.max(1, workingDaysBetween(today, deadline, hol, false));

  // PASS 1 — durées théoriques
  const finitTotal = T.Peint + T.Tap;
  const dureeTh: Record<MetierConfigKey, number> = {
    BE: RATIOS_V036.BE * J,
    Num: RATIOS_V036.Num * J,
    Bois: RATIOS_V036.Bois * J,
    Peint: finitTotal > 0 ? RATIOS_V036.Finition * J * (T.Peint / finitTotal) : 0,
    Tap: finitTotal > 0 ? RATIOS_V036.Finition * J * (T.Tap / finitTotal) : 0,
    Manut: RATIOS_V036.Manut * J,
  };

  // PASS 2 — application caps + calcul durée réelle
  const configs: MetierConfig[] = [];
  for (const m of METIERS_V036) {
    if (T[m] <= 0) continue;
    const dTh = Math.max(0.1, dureeTh[m]);
    const persTh = Math.max(1, Math.ceil(T[m] / (dTh * 8)));
    const cap = CAPS_PERS_V036[m];
    const nbPers = Math.min(persTh, cap);
    const duree = round2(T[m] / (nbPers * 8));
    configs.push({
      metier_code: m,
      total_h_calc: T[m],
      nb_pers_cible: nbPers,
      duree_cible_j: duree,
      capa_max_jour: nbPers,
      lissage_active: true,
      cap_reached: persTh > cap,
    });
  }

  // PASS 3 — validation pipeline globale
  const sumDurees = configs.reduce((s, c) => s + c.duree_cible_j, 0);
  const pipelineDuration = sumDurees * PIPELINE_FACTOR;
  const conflicts: Conflict[] = [];

  if (pipelineDuration > J + 1e-9) {
    const beCfg = configs.find((c) => c.metier_code === "BE");
    const bottleneck = bottleneckMetier(configs);
    const delta = Math.ceil(pipelineDuration - J);
    const levers: ConflictLever[] = [];
    if (beCfg) {
      levers.push({ action: "BE_OVERRIDE", gain_days: round2(beCfg.duree_cible_j / 2) });
    }
    if (bottleneck) {
      levers.push({ action: "INCREASE_RESOURCES", metier: bottleneck });
    }
    levers.push({ action: "POSTPONE_DEADLINE", delta_days: delta });
    conflicts.push({
      type: "WINDOW_INFEASIBLE",
      severity: "HARD",
      delta_days: delta,
      message: `Pipeline ${pipelineDuration.toFixed(2)}j > fenêtre ${J}j ouvrés`,
      levers,
    });
  }

  return {
    configs,
    conflicts,
    pipeline_duration: pipelineDuration,
    fenetre_dispo: J,
  };
}

/** Métier le plus contraint = celui dont (durée × pers) est max et cap_reached. */
export function bottleneckMetier(configs: MetierConfig[]): MetierConfigKey | undefined {
  let best: MetierConfig | undefined;
  for (const c of configs) {
    if (!c.cap_reached) continue;
    if (!best || c.duree_cible_j * c.nb_pers_cible > best.duree_cible_j * best.nb_pers_cible) {
      best = c;
    }
  }
  return best?.metier_code;
}

/* ============================================================ */
/* computeMetierWindows                                          */
/* ============================================================ */

export interface MetierWindow {
  metier_code: MetierConfigKey;
  fenetre_start: string;
  fenetre_end: string;
  duree_cible_j: number;
}

/**
 * Calcule les fenêtres métier dans l'ordre du pipeline objet :
 * BE → Num → Bois → Peint → Tap → Manut, avec chevauchement contrôlé via PIPELINE_FACTOR.
 * Les fenêtres sont calculées en jours ouvrés à reculons depuis `deadline`.
 *
 * Retourne aussi un éventuel conflit `WINDOW_INFEASIBLE` si la 1re fenêtre démarre avant `today`.
 */
export function computeMetierWindows(
  configs: MetierConfig[],
  today: string,
  deadline: string,
  holidays?: Set<string>,
): { windows: MetierWindow[]; conflicts: Conflict[] } {
  const yearFrom = fromISO(today).getUTCFullYear();
  const yearTo = fromISO(deadline).getUTCFullYear();
  const hol = holidays ?? holidaysRange(yearFrom, yearTo);

  // Ordre pipeline figé
  const ORDER: MetierConfigKey[] = ["BE", "Num", "Bois", "Peint", "Tap", "Manut"];
  const ordered = ORDER.map((k) => configs.find((c) => c.metier_code === k)).filter(
    (c): c is MetierConfig => Boolean(c),
  );

  // Backward : on place les fenêtres en partant de `deadline`, chaque métier en amont
  // démarre au plus tard (durée_metier × PIPELINE_FACTOR) avant la fin du suivant.
  const windows: MetierWindow[] = [];
  let cursorEnd = deadline;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const cfg = ordered[i];
    const span = Math.max(1, Math.ceil(cfg.duree_cible_j));
    // start = end - (span - 1) jours ouvrés
    const start = addWorkingDays(cursorEnd, -(span - 1), hol, false);
    windows.unshift({
      metier_code: cfg.metier_code,
      fenetre_start: start,
      fenetre_end: cursorEnd,
      duree_cible_j: cfg.duree_cible_j,
    });
    // Métier amont peut chevaucher partiellement : recule de span × PIPELINE_FACTOR
    const overlapDays = Math.max(1, Math.floor(span * PIPELINE_FACTOR));
    cursorEnd = addWorkingDays(start, overlapDays - 1, hol, false);
    // mais jamais après cursorEnd précédent
    if (cursorEnd > windows[0].fenetre_end) cursorEnd = windows[0].fenetre_end;
  }

  const conflicts: Conflict[] = [];
  if (windows.length > 0 && windows[0].fenetre_start < today) {
    conflicts.push({
      type: "WINDOW_INFEASIBLE",
      severity: "HARD",
      message: `Fenêtre métier ${windows[0].metier_code} démarre ${windows[0].fenetre_start} < aujourd'hui ${today}`,
      metier: windows[0].metier_code,
    });
  }

  return { windows, conflicts };
}

/* ============================================================ */
/* Validation override BE                                        */
/* ============================================================ */

export interface BeOverrideInput {
  be_override: boolean;
  override_reason?: string | null;
}

export function validateBeOverride(input: BeOverrideInput): Conflict | null {
  if (!input.be_override) return null;
  const reason = (input.override_reason ?? "").trim();
  if (reason.length < 10) {
    return {
      type: "OVERRIDE_REASON_REQUIRED",
      severity: "HARD",
      message: "Override BE 2 personnes en parallèle : raison ≥ 10 caractères requise.",
    };
  }
  return null;
}
