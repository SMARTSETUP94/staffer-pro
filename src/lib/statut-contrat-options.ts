/** Choix juridiques : la valeur historique Intermittent reste en base, jamais proposée. */
export const STATUT_CONTRAT_OPTIONS = ["CDI", "CDDU intermittent", "CDD chantier", "Intérim", "Apprenti", "Auto-entrepreneur"] as const;
export type StatutContratChoix = (typeof STATUT_CONTRAT_OPTIONS)[number];