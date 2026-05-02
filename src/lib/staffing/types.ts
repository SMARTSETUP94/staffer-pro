// v0.35.1 — Auto-staffing Fabrication 5XXX — types
// Spec figée : mem://features/auto-staffing-v035-spec

export type MetierKey = "BE" | "Num" | "Bois" | "Metal" | "Peint" | "Tap" | "Manut";

export const METIER_ID: Record<MetierKey, number> = {
  BE: 8,
  Num: 4,
  Bois: 1,
  Metal: 2,
  Peint: 3,
  Tap: 5,
  Manut: 7,
};

export const METIER_KEY_BY_ID: Record<number, MetierKey> = Object.fromEntries(
  Object.entries(METIER_ID).map(([k, v]) => [v, k as MetierKey])
) as Record<number, MetierKey>;

/** Constantes algo — figées spec v0.35 */
export const H_BE = 10;
export const H_DEFAULT = 8;
export const PLAFOND_OBJET = 4; // SOFT
export const PIC_ATELIER = 12; // SOFT (alerte rouge mais plan généré)
export const LAG_BE_NUM = 2; // jours, HARD
export const LAG_NUM_BOIS_RATIO = 0.3; // × span_days_Num, en jours
export const RATIO_MANUT_OBJET = 0.5;
export const RATIO_MANUT_POOL = 0.5;
export const BINOME_MIN = 2;
export const BINOME_MAX = 4;

/** Heures prévues d'un objet par métier */
export interface ObjetInput {
  objet_id: string;
  reference: string;
  nom: string;
  /** Si renseignées, prennent priorité sur les ratios */
  heures_be: number;
  heures_numerique: number;
  heures_bois: number;
  heures_metal: number;
  heures_peinture: number;
  heures_tapisserie: number;
  heures_manutention: number;
  display_order: number;
}

export interface PlanInput {
  affaire_id: string;
  date_fin_fab: string; // ISO date — HARD (livraison)
  /** Bornes de fenêtre fabrication (informatif pour le caller) */
  date_debut_fab_min?: string;
  objets: ObjetInput[];
  /** Réservations CNC déjà occupées par d'autres affaires (cross-chantiers) */
  cnc_reserved_dates?: Set<string>;
  /** Capacité atelier max (défaut PIC_ATELIER) */
  pic_max?: number;
}

export interface PlanStep {
  id: string;
  metier_id: number;
  metier: MetierKey;
  objet_id: string | null;
  start_date: string; // ISO
  span_days: number;
  pers: number;
  h_par_jour: number;
  source: "auto" | "manual";
}

export type AlertCode =
  | "DEBORD_LIVRAISON"
  | "PIC_GLOBAL_DEPASSE"
  | "NUM_CONFLIT_INSOLUBLE"
  | "PLAFOND_OBJET_DEPASSE"
  | "MANUT_POOL_DEBORDE";

export interface PlanAlert {
  code: AlertCode;
  severity: "hard" | "soft";
  message: string;
  step_id?: string;
  objet_id?: string;
  date?: string;
}

export interface PlanResult {
  date_debut_fab: string;
  date_fin_fab: string;
  steps: PlanStep[];
  /** Réservations CNC à insérer (machine_id='cnc_principale', step_id, date) */
  cnc_reservations: Array<{ step_id: string; date: string; machine_id: string }>;
  alerts: PlanAlert[];
  /** Pic atelier journalier toutes étapes confondues */
  daily_load: Record<string, number>;
}
