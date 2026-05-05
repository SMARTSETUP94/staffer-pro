// Sprint 3b.1 — Helpers autorisations véhicules
// Types CACES + permis enrichis (numéro, dates, expiration, fichier).
// Coexiste avec employes.categories_permis (legacy, conservé pour staffing flotte).

import type { Permis, VehiculeType } from "./permis";
import { permisAcceptesPour } from "./permis";

export type AutorisationType =
  | "PERMIS_B"
  | "PERMIS_C"
  | "PERMIS_CE"
  | "PERMIS_D"
  | "CACES_R489"
  | "CACES_R486"
  | "CACES_R484";

export const AUTORISATION_LABELS: Record<AutorisationType, string> = {
  PERMIS_B: "Permis B (VL ≤ 3.5T)",
  PERMIS_C: "Permis C (PL 3.5–7.5T)",
  PERMIS_CE: "Permis CE (Super lourd >7.5T)",
  PERMIS_D: "Permis D (Transport en commun)",
  CACES_R489: "CACES R489 (Chariot élévateur)",
  CACES_R486: "CACES R486 (PEMP / Nacelle)",
  CACES_R484: "CACES R484 (Transpalette accompagnant)",
};

export const AUTORISATION_SHORT: Record<AutorisationType, string> = {
  PERMIS_B: "B",
  PERMIS_C: "C",
  PERMIS_CE: "CE",
  PERMIS_D: "D",
  CACES_R489: "R489",
  CACES_R486: "R486",
  CACES_R484: "R484",
};

export const ALL_AUTORISATIONS: AutorisationType[] = [
  "PERMIS_B",
  "PERMIS_C",
  "PERMIS_CE",
  "PERMIS_D",
  "CACES_R489",
  "CACES_R486",
  "CACES_R484",
];

export const PERMIS_AUTORISATIONS: AutorisationType[] = [
  "PERMIS_B",
  "PERMIS_C",
  "PERMIS_CE",
  "PERMIS_D",
];

export const CACES_AUTORISATIONS: AutorisationType[] = [
  "CACES_R489",
  "CACES_R486",
  "CACES_R484",
];

export interface AutorisationVehicule {
  id: string;
  employe_id: string;
  type_autorisation: AutorisationType;
  numero: string | null;
  date_obtention: string | null;
  date_expiration: string | null;
  fichier_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StatutValidite = "valide" | "expiration_proche" | "expire" | "manquant";

export function statutFromExpiration(dateExpiration: string | null | undefined): StatutValidite {
  if (!dateExpiration) return "valide";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateExpiration);
  exp.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expire";
  if (diffDays <= 30) return "expiration_proche";
  return "valide";
}

export function joursAvantExpiration(dateExpiration: string | null | undefined): number | null {
  if (!dateExpiration) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateExpiration);
  exp.setHours(0, 0, 0, 0);
  return Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export const STATUT_LABELS: Record<StatutValidite, string> = {
  valide: "Valide",
  expiration_proche: "Expire bientôt",
  expire: "Expirée",
  manquant: "Manquante",
};

export const STATUT_BADGE_CLASS: Record<StatutValidite, string> = {
  valide: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  expiration_proche: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  expire: "bg-destructive/15 text-destructive border-destructive/30",
  manquant: "bg-muted text-muted-foreground border-border",
};

/**
 * Convertit un PERMIS_X de la nouvelle table vers le legacy Permis "B" | "C" | "CE" | "D".
 * Retourne null pour les CACES.
 */
export function autorisationToPermisLegacy(type: AutorisationType): Permis | null {
  switch (type) {
    case "PERMIS_B":
      return "B";
    case "PERMIS_C":
      return "C";
    case "PERMIS_CE":
      return "CE";
    case "PERMIS_D":
      return "D";
    default:
      return null;
  }
}

/**
 * Renvoie les autorisations valides (non expirées) compatibles avec un type de véhicule.
 * Utilisé pour le filtrage chauffeurs sur Planning Flotte.
 */
export function autorisationsCompatiblesVehicule(
  autorisations: AutorisationVehicule[],
  vehiculeType: VehiculeType,
): AutorisationVehicule[] {
  const acceptes = permisAcceptesPour(vehiculeType);
  return autorisations.filter((a) => {
    const permis = autorisationToPermisLegacy(a.type_autorisation);
    if (!permis || !acceptes.includes(permis)) return false;
    return statutFromExpiration(a.date_expiration) !== "expire";
  });
}

export function isPermis(type: AutorisationType): boolean {
  return PERMIS_AUTORISATIONS.includes(type);
}
