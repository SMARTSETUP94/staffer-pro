/**
 * LOT 5 — Helpers purs du planning atelier.
 *
 * Règle des deux temps :
 *  1. `atelier_planning` = effectif prévisionnel ANONYME (nb_pers / métier / jour
 *     / objet ou lot). Suffit à calculer la charge atelier.
 *  2. `assignations` = nommage nominatif, OPTIONNEL et postérieur, relié à la
 *     ligne de planning par `assignations.atelier_planning_id`.
 *
 * Les heures prévues restent portées par `objet_heures_metier` (LOT 3/4).
 */

/** Une journée pleine posée sur une cellule vaut 8 h par personne. */
export const HEURES_PAR_JOUR = 8;

export interface JourInfo {
  /** YYYY-MM-DD */
  date: string;
  weekend: boolean;
  ferie: boolean;
  ferieLabel: string | null;
  /** Numéro de semaine ISO, pour les bandeaux de regroupement. */
  semaine: number;
}

export interface PlanRow {
  id: string;
  objet_id: string | null;
  lot_id: string | null;
  metier_id: number;
  date: string;
  nb_pers: number;
}

export interface NommageRow {
  id: string;
  atelier_planning_id: string | null;
  employe_id: string;
  affaire_id: string;
  date: string;
}

/* ------------------------------------------------------------------ dates */

export function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const j = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

export function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Lundi de la semaine contenant `iso`. */
export function startOfWeekISO(iso: string): string {
  const d = fromISO(iso);
  const dow = d.getUTCDay(); // 0 = dimanche
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(iso, delta);
}

/** Numéro de semaine ISO 8601. */
export function isoWeekNumber(iso: string): number {
  const d = fromISO(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

export interface JoursFeriesApi {
  isWeekend: (iso: string) => boolean;
  isFerie: (iso: string) => boolean;
  labelFerie: (iso: string) => string | null;
}

/** Fenêtre de `nbJours` jours calendaires à partir de `startISO` (inclus). */
export function buildJourWindow(
  startISO: string,
  nbJours: number,
  api: JoursFeriesApi,
): JourInfo[] {
  const out: JourInfo[] = [];
  for (let i = 0; i < nbJours; i++) {
    const date = addDaysISO(startISO, i);
    out.push({
      date,
      weekend: api.isWeekend(date),
      ferie: api.isFerie(date),
      ferieLabel: api.labelFerie(date),
      semaine: isoWeekNumber(date),
    });
  }
  return out;
}

/**
 * Génère `nbJoursOuvres` dates ouvrées consécutives à partir de `startISO`
 * (inclus si ouvré), en sautant week-ends et jours fériés FR.
 */
export function generatePeriodeJoursOuvres(
  startISO: string,
  nbJoursOuvres: number,
  api: JoursFeriesApi,
  maxScan = 400,
): string[] {
  const out: string[] = [];
  if (nbJoursOuvres <= 0) return out;
  let cursor = startISO;
  let scanned = 0;
  while (out.length < nbJoursOuvres && scanned < maxScan) {
    if (!api.isWeekend(cursor) && !api.isFerie(cursor)) out.push(cursor);
    cursor = addDaysISO(cursor, 1);
    scanned++;
  }
  return out;
}

/* --------------------------------------------------------------- indexation */

/** Clé d'une cellule de planning : ligne (objet ou lot) × métier × jour. */
export function planKey(
  scope: { objetId?: string | null; lotId?: string | null },
  metierId: number,
  date: string,
): string {
  const owner = scope.objetId ? `o:${scope.objetId}` : `l:${scope.lotId ?? ""}`;
  return `${owner}::${metierId}::${date}`;
}

/** Clé de ligne (sans le jour) — utilisée par la sélection de plage. */
export function rowKey(
  scope: { objetId?: string | null; lotId?: string | null },
  metierId: number,
): string {
  const owner = scope.objetId ? `o:${scope.objetId}` : `l:${scope.lotId ?? ""}`;
  return `${owner}::${metierId}`;
}

export function buildPlanIndex(rows: PlanRow[]): Map<string, PlanRow> {
  const map = new Map<string, PlanRow>();
  for (const r of rows) {
    map.set(planKey({ objetId: r.objet_id, lotId: r.lot_id }, r.metier_id, r.date), r);
  }
  return map;
}

/* ------------------------------------------------------------------ charges */

/** Heures planifiées = Σ(nb_pers) × 8 h. */
export function heuresPlanifiees(rows: PlanRow[]): number {
  return rows.reduce((acc, r) => acc + (Number(r.nb_pers) || 0), 0) * HEURES_PAR_JOUR;
}

/** Filtre les lignes d'une ligne de grille (objet OU lot) pour un métier. */
export function rowsOfLine(
  rows: PlanRow[],
  scope: { objetId?: string | null; lotId?: string | null },
  metierId: number,
): PlanRow[] {
  return rows.filter(
    (r) =>
      r.metier_id === metierId &&
      (scope.objetId ? r.objet_id === scope.objetId : r.lot_id === scope.lotId && !r.objet_id),
  );
}

export type LigneStatut = "ok" | "depassement" | "non_planifie" | "sans_heures";

/**
 * Comparaison heures prévues (objet_heures_metier) vs planifiées (nb_pers × 8).
 * Tolérance d'une demi-journée-personne pour éviter le bruit d'arrondi.
 */
export function ligneStatut(prevues: number, planifiees: number): LigneStatut {
  if (prevues <= 0) return planifiees > 0 ? "ok" : "sans_heures";
  if (planifiees <= 0) return "non_planifie";
  if (planifiees > prevues + HEURES_PAR_JOUR / 2) return "depassement";
  return "ok";
}

/* ------------------------------------------------------------------ nommage */

export type NommageEtat = "aucun" | "partiel" | "complet";

export function nommageEtat(nbPers: number, nbNommes: number): NommageEtat {
  if (nbPers <= 0 || nbNommes <= 0) return "aucun";
  if (nbNommes >= nbPers) return "complet";
  return "partiel";
}

/** Compte des personnes nommées par ligne de planning. */
export function countNommesParPlan(nommages: NommageRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of nommages) {
    if (!n.atelier_planning_id) continue;
    out[n.atelier_planning_id] = (out[n.atelier_planning_id] ?? 0) + 1;
  }
  return out;
}

export interface DoubleAffectation {
  employe_id: string;
  affaire_id: string;
  date: string;
}

/**
 * Détecte les employés déjà affectés ce jour-là ailleurs (autre affaire, ou
 * même affaire mais autre ligne de planning).
 */
export function detectDoubleAffectation(
  autres: NommageRow[],
  date: string,
  planningId: string,
): Map<string, DoubleAffectation> {
  const map = new Map<string, DoubleAffectation>();
  for (const a of autres) {
    if (a.date !== date) continue;
    if (a.atelier_planning_id === planningId) continue;
    map.set(a.employe_id, {
      employe_id: a.employe_id,
      affaire_id: a.affaire_id,
      date: a.date,
    });
  }
  return map;
}

export interface AbsenceRow {
  employe_id: string;
  date_debut: string;
  date_fin: string;
  valide: boolean;
}

/** Employés absents (congé validé) couvrant la date donnée. */
export function employesAbsents(absences: AbsenceRow[], date: string): Set<string> {
  const out = new Set<string>();
  for (const a of absences) {
    if (!a.valide) continue;
    if (a.date_debut <= date && date <= a.date_fin) out.add(a.employe_id);
  }
  return out;
}

/* ---------------------------------------------------------------- sélection */

/** Étend une sélection rectangulaire entre deux cellules de la grille. */
export function expandCellRange(
  anchor: { row: string; date: string },
  target: { row: string; date: string },
  rowOrder: string[],
  dateOrder: string[],
): { row: string; date: string }[] {
  const r1 = rowOrder.indexOf(anchor.row);
  const r2 = rowOrder.indexOf(target.row);
  const d1 = dateOrder.indexOf(anchor.date);
  const d2 = dateOrder.indexOf(target.date);
  if (r1 < 0 || r2 < 0 || d1 < 0 || d2 < 0) return [];
  const out: { row: string; date: string }[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let d = Math.min(d1, d2); d <= Math.max(d1, d2); d++) {
      out.push({ row: rowOrder[r]!, date: dateOrder[d]! });
    }
  }
  return out;
}

/** Libellé court « lun. 12 » pour l'en-tête de colonne. */
export function labelJourCourt(iso: string): string {
  const d = fromISO(iso);
  const jours = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  return `${jours[d.getUTCDay()]} ${d.getUTCDate()}`;
}
