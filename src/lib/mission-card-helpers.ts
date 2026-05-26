/**
 * Bloc 9 Lot 9.4 — Helpers carte mission pose.
 *
 *   1. computeHeuresFromEvents — déduit (heure_debut, heure_fin, heures_reelles)
 *      à partir des events arrivee/depart d'une date donnée.
 *   2. autoTagCategoryByMissionState — calcule la catégorie d'une photo
 *      selon la phase (montage/demontage), l'état de la mission et
 *      l'éventuelle ouverture d'un signalement d'incident.
 *
 *   Couverts par src/lib/__tests__/mission-card-helpers.test.ts.
 */
import type { MissionPhase } from "@/server/mission-card.functions";

export interface MissionEventLite {
  type: "arrivee" | "depart" | "probleme" | "photo" | "message";
  occurred_at: string; // ISO timestamp
}

export interface HeuresFromEvents {
  date: string;       // YYYY-MM-DD
  heure_debut: string; // HH:MM (24h)
  heure_fin: string;   // HH:MM
  heures_reelles: number; // arrondi à 0,25 h
}

/**
 * Sélectionne la 1re `arrivee` et la dernière `depart` sur `date` puis dérive
 * les heures. Retourne null si aucun couple cohérent.
 */
export function computeHeuresFromEvents(
  events: MissionEventLite[],
  date: string,
): HeuresFromEvents | null {
  const onDate = events.filter((e) => e.occurred_at.slice(0, 10) === date);
  const arrivees = onDate
    .filter((e) => e.type === "arrivee")
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const departs = onDate
    .filter((e) => e.type === "depart")
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const arrivee = arrivees[0];
  const depart = departs[departs.length - 1];
  if (!arrivee || !depart) return null;
  const tA = new Date(arrivee.occurred_at).getTime();
  const tD = new Date(depart.occurred_at).getTime();
  if (tD <= tA) return null;
  const minutes = Math.round((tD - tA) / 60_000);
  // arrondi à 0,25h = 15 minutes
  const quartersOfHour = Math.round(minutes / 15);
  const heuresReelles = Math.max(0, quartersOfHour / 4);
  return {
    date,
    heure_debut: toHHMM(arrivee.occurred_at),
    heure_fin: toHHMM(depart.occurred_at),
    heures_reelles: heuresReelles,
  };
}

function toHHMM(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export type PhotoCategorie =
  | "avant_montage"
  | "pendant_montage"
  | "apres_montage"
  | "avant_demontage"
  | "pendant_demontage"
  | "apres_demontage"
  | "incident";

export interface MissionStateForTag {
  hasArrivee: boolean;
  hasDepart: boolean;
  problemeOpen: boolean;
}

/**
 * Retourne la catégorie auto à associer à une photo prise depuis la carte
 * mission. Le signalement d'incident a la priorité absolue.
 */
export function autoTagCategoryByMissionState(
  phase: MissionPhase,
  state: MissionStateForTag,
): PhotoCategorie {
  if (state.problemeOpen) return "incident";
  if (!state.hasArrivee) {
    return phase === "montage" ? "avant_montage" : "avant_demontage";
  }
  if (state.hasArrivee && !state.hasDepart) {
    return phase === "montage" ? "pendant_montage" : "pendant_demontage";
  }
  return phase === "montage" ? "apres_montage" : "apres_demontage";
}
