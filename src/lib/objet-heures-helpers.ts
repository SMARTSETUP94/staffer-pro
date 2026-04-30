/**
 * v0.27.7 — Helpers pour le calcul d'heures par objet de fabrication.
 *
 * Centralise :
 *  1. Le mapping métier (code) → colonne `heures_prevues_X` d'un objet
 *  2. Le calcul des heures prévues d'un objet pour un set de métiers filtrés
 *     (Fix #1 : Planning par objet → affichage filtré par métier)
 *  3. La répartition au prorata des heures saisies sur N objets sélectionnés
 *     (Fix #2 : staffing multi-objets, formule Option B validée par Gabin)
 */

/** Colonnes heures_prevues_X stockées sur fabrication_objets. */
export type HeuresPrevuesKey =
  | "be"
  | "numerique"
  | "bois"
  | "metal"
  | "peinture"
  | "tapisserie"
  | "manutention";

/** Vue "métier" minimale (code = clé canonique de mapping). */
export interface MetierLite {
  id: number;
  code: string;
}

/** Vue "objet" minimale avec les 7 colonnes prévues. */
export interface ObjetHeuresPrevues {
  heures_prevues_be?: number | null;
  heures_prevues_numerique?: number | null;
  heures_prevues_bois?: number | null;
  heures_prevues_metal?: number | null;
  heures_prevues_peinture?: number | null;
  heures_prevues_tapisserie?: number | null;
  heures_prevues_manutention?: number | null;
  quantite?: number | null;
}

/**
 * Mapping métier.code → colonne `heures_prevues_X`.
 * Cohérent avec le parser ProgBat et l'éditeur d'objet.
 *  - suivi_projet  → be
 *  - numerique     → numerique
 *  - construction  → bois
 *  - metallerie    → metal
 *  - peinture      → peinture
 *  - tapisserie    → tapisserie
 *  - logistique    → manutention
 *  - machiniste    → (aucune colonne dédiée — non staffé sur objets)
 */
export const METIER_CODE_TO_HEURES_KEY: Record<string, HeuresPrevuesKey | null> = {
  suivi_projet: "be",
  numerique: "numerique",
  construction: "bois",
  metallerie: "metal",
  peinture: "peinture",
  tapisserie: "tapisserie",
  logistique: "manutention",
  machiniste: null,
};

/** Convertit un id métier en clé heures_prevues via le code. */
export function metierIdToHeuresKey(
  metierId: number,
  metiers: MetierLite[],
): HeuresPrevuesKey | null {
  const m = metiers.find((x) => x.id === metierId);
  if (!m) return null;
  return METIER_CODE_TO_HEURES_KEY[m.code] ?? null;
}

const ALL_KEYS: HeuresPrevuesKey[] = [
  "be",
  "numerique",
  "bois",
  "metal",
  "peinture",
  "tapisserie",
  "manutention",
];

/** Retourne la valeur d'une colonne heures_prevues_X pour un objet (number safe). */
export function getHeuresPrevuesUnit(
  objet: ObjetHeuresPrevues,
  key: HeuresPrevuesKey,
): number {
  const colName = `heures_prevues_${key}` as keyof ObjetHeuresPrevues;
  return Number(objet[colName] ?? 0) || 0;
}

/**
 * Total heures prévues UNITAIRES (sans quantité) pour un objet, pour un set de
 * métiers filtrés. Si le set est vide ou null → somme totale.
 *
 * @param filteredMetierIds Set d'ids métier actifs ; vide/null = tous métiers
 */
export function getHeuresPrevuesUnitForMetiers(
  objet: ObjetHeuresPrevues,
  filteredMetierIds: Set<number> | null | undefined,
  metiers: MetierLite[],
): number {
  let keys: HeuresPrevuesKey[];
  if (!filteredMetierIds || filteredMetierIds.size === 0) {
    keys = ALL_KEYS;
  } else {
    const set = new Set<HeuresPrevuesKey>();
    for (const mid of filteredMetierIds) {
      const k = metierIdToHeuresKey(mid, metiers);
      if (k) set.add(k);
    }
    keys = Array.from(set);
  }
  return keys.reduce((s, k) => s + getHeuresPrevuesUnit(objet, k), 0);
}

/**
 * Total heures prévues d'un objet × quantité, filtré par métiers.
 * Fix #1 : utilisé par PlanningParObjet pour l'affichage "0h / Xh".
 */
export function getHeuresPrevuesTotalForMetiers(
  objet: ObjetHeuresPrevues,
  filteredMetierIds: Set<number> | null | undefined,
  metiers: MetierLite[],
): number {
  const unit = getHeuresPrevuesUnitForMetiers(objet, filteredMetierIds, metiers);
  const qte = Number(objet.quantite ?? 1) || 1;
  return unit * qte;
}

/**
 * Fix #2 — Répartition au prorata (Option B).
 *
 * Répartit `totalHeures` entre N objets selon la part de chaque objet dans le
 * total des heures prévues pour le métier sélectionné. Si la somme des heures
 * prévues est 0 (aucun budget), on bascule sur une répartition équitable 1/N.
 *
 * Garantie : la somme des parts arrondies à 2 décimales = `totalHeures`
 * (le dernier objet absorbe l'arrondi pour éviter les pertes de centièmes).
 *
 * Exemple Gabin : 8h saisies sur 3 objets (540h, 16h, 9h en peinture)
 *   → total prévu = 565h
 *   → 1.1 : 8 × 540/565 = 7.65h
 *   → 1.2 : 8 × 16/565  = 0.23h
 *   → 1.3 : 8 × 9/565   = 0.12h (arrondi pour totaliser 8.00h)
 */
export interface ProRataInput {
  objetId: string;
  heuresPrevuesUnit: number;
  quantite: number;
}

export interface ProRataResult {
  objetId: string;
  heuresAttribuees: number;
  /** Part 0..1 (équitable si fallback). */
  part: number;
  /** True si fallback équitable (toutes prévues = 0). */
  fallback: boolean;
}

export function repartirHeuresProRata(
  totalHeures: number,
  objets: ProRataInput[],
): ProRataResult[] {
  if (objets.length === 0) return [];
  const totalPrevu = objets.reduce(
    (s, o) => s + o.heuresPrevuesUnit * (o.quantite || 1),
    0,
  );
  const fallback = totalPrevu <= 0;

  // Répartition brute
  const raw = objets.map((o) => {
    const part = fallback
      ? 1 / objets.length
      : (o.heuresPrevuesUnit * (o.quantite || 1)) / totalPrevu;
    return {
      objetId: o.objetId,
      part,
      heuresAttribuees: totalHeures * part,
      fallback,
    };
  });

  // Arrondi 2 décimales avec correction sur le dernier pour somme exacte
  const rounded = raw.map((r) => ({
    ...r,
    heuresAttribuees: Math.round(r.heuresAttribuees * 100) / 100,
  }));
  const sumRounded = rounded.reduce((s, r) => s + r.heuresAttribuees, 0);
  const drift = Math.round((totalHeures - sumRounded) * 100) / 100;
  if (drift !== 0 && rounded.length > 0) {
    rounded[rounded.length - 1].heuresAttribuees =
      Math.round((rounded[rounded.length - 1].heuresAttribuees + drift) * 100) / 100;
  }

  return rounded;
}

/**
 * Aide pour préparer les inputs prorata depuis un set d'objets BDD + un métier.
 * Si aucun métier choisi (null) → utilise le total tous métiers.
 */
export function buildProRataInputsForMetier(
  objets: (ObjetHeuresPrevues & { id: string })[],
  metierId: number | null,
  metiers: MetierLite[],
): ProRataInput[] {
  const filterSet =
    metierId != null ? new Set<number>([metierId]) : null;
  return objets.map((o) => ({
    objetId: o.id,
    heuresPrevuesUnit: getHeuresPrevuesUnitForMetiers(o, filterSet, metiers),
    quantite: Number(o.quantite ?? 1) || 1,
  }));
}
