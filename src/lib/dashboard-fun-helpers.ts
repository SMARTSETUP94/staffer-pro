/**
 * v0.40.x — Helpers pour les widgets "humanisation" du dashboard.
 */

/** Index de semaine ISO depuis epoch (lundi = début). Stable pour rotation hebdo. */
export function weekIndex(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Décale au lundi
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return Math.floor(d.getTime() / (7 * 24 * 3600 * 1000));
}

/** Index de jour depuis epoch (UTC). Stable pour rotation quotidienne. */
export function dateIndex(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return Math.floor(d.getTime() / (24 * 3600 * 1000));
}

/** Lundi de la semaine courante (00:00 local). */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  return d;
}

/** Premier jour du mois courant (00:00 local). */
export function getFirstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Codes métier "atelier" éligibles au "Top constructeur" (pas BE / pas chef). */
export const ATELIER_METIER_CODES = new Set([
  "construction",
  "metallerie",
  "peinture",
  "tapisserie",
  "logistique", // = manut
  "numerique",
]);

/** Test : un employé fête-t-il son anniversaire à la date `today` ? */
export function isBirthdayToday(date_naissance: string | null | undefined, today: Date): boolean {
  if (!date_naissance) return false;
  const dob = new Date(date_naissance);
  if (Number.isNaN(dob.getTime())) return false;
  return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
}

/** Format ISO (YYYY-MM-DD) en heure locale. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
