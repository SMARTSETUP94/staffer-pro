// Lot 8.1 — Helpers purs pour la fiche objet (testables sans Supabase)
// Extraits depuis objet-fiche.functions.ts pour permettre des tests unitaires.

import type { ObjetTeamPersonne } from "@/server/objet-fiche.functions";

/** Mapping codes métier (DB) → colonnes heures_prevues_* de fabrication_objets */
export const METIER_CODE_TO_PREVU_COL: Record<string, string | null> = {
  construction: "heures_prevues_bois",
  metallerie: "heures_prevues_metal",
  peinture: "heures_prevues_peinture",
  numerique: "heures_prevues_numerique",
  tapisserie: "heures_prevues_tapisserie",
  logistique: "heures_prevues_manutention",
  suivi_projet: "heures_prevues_be",
  machiniste: null,
};

/** Récupère la valeur de prévu pour un métier donné depuis une ligne fabrication_objets */
export function getHeuresPrevuesForMetier(
  metierCode: string,
  row: Record<string, number | null | undefined> | null | undefined,
): number {
  const col = METIER_CODE_TO_PREVU_COL[metierCode];
  if (!col || !row) return 0;
  return Number(row[col] ?? 0);
}

/** Calcule la progression réel/prévu en % (null si pas de prévu) */
export function computeProgressionPct(reel: number, prevu: number): number | null {
  if (prevu <= 0) return null;
  return Math.round((reel / prevu) * 100);
}

export interface AssignmentSlot {
  date: string;
  /** Cumul presence_pct déjà engagé sur cette date pour cet employé (tous plans) */
  cumulExisting: number;
  /** True si déjà une assignation sur CE step pour cet employé à cette date */
  alreadyOnStep: boolean;
}

export interface AssignmentResolution {
  toInsert: string[];
  details: Array<{ date: string; reason: "ok" | "conflict" | "existing" }>;
}

/**
 * Résout quelles dates peuvent être affectées et lesquelles doivent être skip
 * pour cause de doublon (step) ou de cumul > 100% (toutes assignations).
 */
export function resolveAssignmentSlots(
  slots: AssignmentSlot[],
  presence: number,
): AssignmentResolution {
  const toInsert: string[] = [];
  const details: AssignmentResolution["details"] = [];
  for (const s of slots) {
    if (s.alreadyOnStep) {
      details.push({ date: s.date, reason: "existing" });
      continue;
    }
    if (s.cumulExisting + presence > 100) {
      details.push({ date: s.date, reason: "conflict" });
      continue;
    }
    toInsert.push(s.date);
    details.push({ date: s.date, reason: "ok" });
  }
  return { toInsert, details };
}

/** Moyenne mobile presence_pct lors de l'agrégation par (métier, employé) */
export function rollingAveragePresence(
  current: { presence_pct_moyen: number; nb_jours: number },
  newPresence: number,
): { presence_pct_moyen: number; nb_jours: number } {
  const nb = current.nb_jours + 1;
  const avg = Math.round(
    (current.presence_pct_moyen * current.nb_jours + newPresence) / nb,
  );
  return { presence_pct_moyen: avg, nb_jours: nb };
}

/** Tri stable des personnes : nb_jours desc, puis nom asc */
export function sortObjetTeamPersonnes(personnes: ObjetTeamPersonne[]): ObjetTeamPersonne[] {
  return [...personnes].sort((a, b) => {
    if (b.nb_jours !== a.nb_jours) return b.nb_jours - a.nb_jours;
    return a.nom.localeCompare(b.nom);
  });
}
