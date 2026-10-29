/**
 * Colonne « À faire » du Kanban opportunités — tri chronologique et repères
 * visuels (« Nouvelle » / « En retard »).
 *
 * Règles (lot UI « À faire », oct. 2026) :
 * - Date de référence : affaires.statut_opportunite_depuis, à défaut created_at.
 * - Tri : plus ancienne → plus récente (date de référence ascendante).
 * - « Nouvelle » : créée il y a moins de A_FAIRE_SEUILS.NOUVELLE_HEURES heures.
 * - « En retard » : en « À faire » depuis A_FAIRE_SEUILS.RETARD_JOURS jours
 *   calendaires ou plus (fuseau Europe/Paris).
 * - Entre les deux : pas de badge.
 *
 * Helpers purs, sans effet de bord : testables sans UI.
 */

/** Seuils regroupés pour ajustement rapide. */
export const A_FAIRE_SEUILS = {
  /** Âge max (en heures) pour le badge « Nouvelle ». */
  NOUVELLE_HEURES: 24,
  /** Ancienneté (en jours calendaires Europe/Paris) à partir de laquelle une carte est « En retard ». */
  RETARD_JOURS: 3,
} as const;

export interface AFaireDatable {
  statut_opportunite_depuis?: string | null;
  created_at?: string | null;
}

export type AFaireBadge =
  | { kind: "nouvelle" }
  | { kind: "retard"; jours: number }
  | null;

/** Date de référence : entrée dans le statut, à défaut création. */
export function aFaireReferenceDate(opp: AFaireDatable): Date | null {
  const raw = opp.statut_opportunite_depuis ?? opp.created_at ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const parisDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Numéro de jour calendaire (Europe/Paris) pour comparer des dates sans l'heure. */
function parisDayNumber(d: Date): number {
  const [y, m, day] = parisDayFmt.format(d).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
}

/** Jours calendaires écoulés entre ref et now (fuseau Europe/Paris). */
export function joursCalendairesDepuis(ref: Date, now: Date): number {
  return parisDayNumber(now) - parisDayNumber(ref);
}

/**
 * Badge à afficher sur une carte « À faire ».
 * « En retard » prime sur « Nouvelle » (une carte ne peut pas avoir les deux :
 * les seuils sont disjoints, mais on garde l'ordre explicite).
 */
export function aFaireBadge(opp: AFaireDatable, now: Date = new Date()): AFaireBadge {
  const ref = aFaireReferenceDate(opp);
  if (!ref) return null;
  const jours = joursCalendairesDepuis(ref, now);
  if (jours >= A_FAIRE_SEUILS.RETARD_JOURS) return { kind: "retard", jours };
  const createdRaw = opp.created_at ?? null;
  if (createdRaw) {
    const created = new Date(createdRaw);
    if (
      !Number.isNaN(created.getTime()) &&
      now.getTime() - created.getTime() < A_FAIRE_SEUILS.NOUVELLE_HEURES * 3_600_000
    ) {
      return { kind: "nouvelle" };
    }
  }
  return null;
}

/** Tri chronologique : plus ancienne (date de référence) en premier. */
export function sortAFaire<T extends AFaireDatable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = aFaireReferenceDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const db = aFaireReferenceDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

/** Nombre de cartes « En retard » dans une liste (compteur d'en-tête). */
export function countEnRetard<T extends AFaireDatable>(items: T[], now: Date = new Date()): number {
  return items.reduce(
    (n, o) => (aFaireBadge(o, now)?.kind === "retard" ? n + 1 : n),
    0,
  );
}
