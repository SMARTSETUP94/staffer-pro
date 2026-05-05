// v0.37 — Refonte algo auto-staffing pipeline par objet (5 étapes)
// Spec figée : mem://features/algo-v037-pipeline-objet
// Prédécesseur : v0.35 backward-planning + v0.36 lissage (supprimés)

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

/** Constantes algo v0.37 / v0.38 */
export const H_BE = 8;          // 8h/j ouvré (alignement v0.37, plus 10h)
export const H_DEFAULT = 8;
export const PIC_ATELIER = 12;  // SOFT (alerte mais plan généré)

// v0.38 — Granularité demi-journée
export const H_HALF = 4;            // 4h par demi-journée
export const DEMI_PER_DAY = 2;      // 2 demi-journées par jour ouvré
export type HalfDay = "AM" | "PM";

// Lags (jours ouvrés entiers)
export const LAG_BE_NUM = 2;
export const LAG_NUM_BOIS = 1;

// Splits Manutention par objet (sum = 1.0)
export const MANUT_PCT_DEBUT = 0.35;
export const MANUT_PCT_TRANSFERT = 0.15;
export const MANUT_PCT_FIN = 0.50;
export const MANUT_FIN_DAYS = 2; // 2 derniers jours ouvrés avant date_fin_fab

// Caps métier (pers max simultanés / objet ou chantier)
export const CAP_BE = 1;        // global chantier
export const CAP_NUM = 1;       // global chantier (mono-CNC)
export const CAP_BOIS = 4;      // par objet
export const CAP_PEINT = 6;     // par objet
export const CAP_MANUT = 4;     // par phase
export const CAP_METAL = 4;
export const CAP_TAP = 6;

// Métiers binôme (pers ∈ multiples de 2)
export const BINOME_METIERS: MetierKey[] = ["Bois", "Peint", "Tap", "Manut"];

// Compat v0.35 (encore référencé par quelques helpers — valeurs neutralisées)
export const PLAFOND_OBJET = 4;
export const BINOME_MIN = 2;
export const BINOME_MAX = 4;
export const LAG_NUM_BOIS_RATIO = 0; // déprécié, gardé pour rétro-import
export const RATIO_MANUT_OBJET = MANUT_PCT_DEBUT + MANUT_PCT_TRANSFERT;
export const RATIO_MANUT_POOL = MANUT_PCT_FIN;

/** Heures prévues d'un objet par métier */
export interface ObjetInput {
  objet_id: string;
  reference: string;
  nom: string;
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
  date_fin_fab: string; // ISO date — HARD livraison
  date_debut_fab_min?: string;
  objets: ObjetInput[];
  cnc_reserved_dates?: Set<string>;
  pic_max?: number;
  heures_be_global?: number;
  heures_numerique_global?: number;
  holidays?: Set<string>;
  include_weekends?: boolean;
  /** v0.40 — Si true (défaut), Manut DEBUT (35%) + TRANSFERT (15%) sont absorbés
   *  par Bois/Peint/Tap au prorata des heures de chaque métier sur l'objet.
   *  Manut FIN (50%) reste agrégée chantier. Si false, comportement v0.37 legacy. */
  is_manut_absorbed?: boolean;
}

/** Phase Manutention (uniquement métier Manut) */
export type ManutPhase = "DEBUT" | "TRANSFERT" | "FIN";

export interface PlanStep {
  id: string;
  metier_id: number;
  metier: MetierKey;
  objet_id: string | null;
  start_date: string; // ISO
  span_days: number;          // v0.38 : dérivé = ceil(span_demi_jours/2), conservé pour grille jour
  /** v0.38 — granularité demi-journée. Si absent, fallback = span_days * 2. */
  span_demi_jours?: number;
  /** v0.38 — AM (matin) ou PM (après-midi). Défaut AM. */
  start_half_day?: HalfDay;
  pers: number;
  h_par_jour: number;
  source: "auto" | "manual";
  /** v0.37 : phase Manutention. Undefined pour autres métiers. */
  phase?: ManutPhase;
}

export type AlertCode =
  | "DEBORD_LIVRAISON"
  | "PIC_GLOBAL_DEPASSE"
  | "NUM_CONFLIT_INSOLUBLE"
  | "PLAFOND_OBJET_DEPASSE"
  | "MANUT_POOL_DEBORDE"
  | "PEINT_OVERFLOW_MANUT"     // v0.37
  | "PERS_PEINT_INSUFFISANT"   // v0.37
  | "VOLUME_ECART_DEVIS";      // v0.39.0c — écart heures staffées vs devis

export interface PlanAlert {
  code: AlertCode;
  severity: "hard" | "soft";
  message: string;
  step_id?: string;
  objet_id?: string;
  date?: string;
  detail?: {
    objet_reference?: string;
    objet_nom?: string;
    machine_id?: string;
    span_days?: number;
    window_start?: string;
    window_end?: string;
  };
}

export interface PlanResult {
  date_debut_fab: string;
  date_fin_fab: string;
  steps: PlanStep[];
  cnc_reservations: Array<{ step_id: string; date: string; machine_id: string }>;
  alerts: PlanAlert[];
  daily_load: Record<string, number>;
}
