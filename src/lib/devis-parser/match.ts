/**
 * v0.31.4 — Helpers de matching (regex case-insensitive ordonnées).
 */

import type { FabMetier } from "@/hooks/use-fabrication";
import {
  CHANTIER_REGEX,
  DEMONTAGE_REGEX,
  EXCLUDE_REGEX,
  MATIERE_CONDITIONAL_REGEX,
  MATIERE_REGEX,
  METIER_ORDER,
  METIER_REGEX,
  MONTAGE_REGEX,
  REGUL_REGEX,
} from "./mappings";
import { normalizeForMatch } from "@/lib/string-normalize";

/** Normalise une chaîne pour debug / fallback (pas utilisé pour les regex). */
export function normalize(s: string | null | undefined): string {
  return normalizeForMatch(s);
}

function anyMatch(s: string, regs: RegExp[]): boolean {
  return regs.some((r) => r.test(s));
}

/**
 * Détermine le métier d'une ligne d'après son libellé via regex prioritaires.
 * Renvoie null si aucun match (ou si la ligne est de la matière → ce n'est pas un métier).
 */
export function matchMetier(
  libelle: string | null | undefined,
  tempsPrevu: number | null | undefined = null,
): FabMetier | null {
  const s = String(libelle ?? "");
  if (!s.trim()) return null;
  // v0.31.4c — Bascule conditionnelle : "Budget matériaux" + Temps>0 → manutention
  if (isMatiereBascule(s, tempsPrevu)) return "manutention";
  // La matière n'est jamais un métier (ex: m² peinture).
  if (isMatiere(s, tempsPrevu)) return null;
  for (const m of METIER_ORDER) {
    if (anyMatch(s, METIER_REGEX[m])) return m;
  }
  return null;
}

/**
 * Vrai si la ligne désigne un poste matière (cumulé dans budget_materiaux).
 *
 * v0.31.4c — Pour les patterns "matière conditionnelle"
 * (Budget matériaux, fournitures logistique...) : si tempsPrevu > 0,
 * la ligne bascule en heures Manutention/Logistique → on retourne false.
 */
export function isMatiere(
  libelle: string | null | undefined,
  tempsPrevu: number | null | undefined = null,
): boolean {
  const s = String(libelle ?? "");
  if (!anyMatch(s, MATIERE_REGEX)) return false;
  if ((tempsPrevu ?? 0) > 0 && anyMatch(s, MATIERE_CONDITIONAL_REGEX)) {
    return false;
  }
  return true;
}

/**
 * v0.31.4c — Pour les patterns matière conditionnelle (cf. MATIERE_CONDITIONAL_REGEX),
 * lorsque tempsPrevu > 0, on bascule la ligne en métier Manutention.
 * Renvoie true si le libellé tombe dans ce cas spécial.
 */
export function isMatiereBascule(
  libelle: string | null | undefined,
  tempsPrevu: number | null | undefined,
): boolean {
  if ((tempsPrevu ?? 0) <= 0) return false;
  return anyMatch(String(libelle ?? ""), MATIERE_CONDITIONAL_REGEX);
}

/** Vrai si la ligne est un lot chantier (Montage/Démontage/Transport/...). */
export function isChantierKeyword(libelle: string | null | undefined): boolean {
  return anyMatch(String(libelle ?? ""), CHANTIER_REGEX);
}

/** Vrai si la ligne tombe spécifiquement dans Démontage. */
export function isDemontageKeyword(libelle: string | null | undefined): boolean {
  return anyMatch(String(libelle ?? ""), DEMONTAGE_REGEX);
}

/** Vrai si la ligne tombe spécifiquement dans Montage (et pas Démontage). */
export function isMontageKeyword(libelle: string | null | undefined): boolean {
  const s = String(libelle ?? "");
  if (anyMatch(s, DEMONTAGE_REGEX)) return false;
  return anyMatch(s, MONTAGE_REGEX);
}

/** Vrai si la ligne est une régul (heures ignorées par défaut, HT conservé). */
export function isRegul(libelle: string | null | undefined): boolean {
  return anyMatch(String(libelle ?? ""), REGUL_REGEX);
}

/** Vrai si la ligne doit être exclue totalement. */
export function isExcludeKeyword(libelle: string | null | undefined): boolean {
  return anyMatch(String(libelle ?? ""), EXCLUDE_REGEX);
}

/**
 * Vrai si la ligne est désactivée :
 * - quantité = 0
 * - heures = 0 ET total HT = 0
 */
export function isLineDisabled(opts: {
  quantite?: number | null;
  heures?: number | null;
  totalHt?: number | null;
}): boolean {
  const qte = opts.quantite ?? 1;
  if (qte === 0) return true;
  const h = opts.heures ?? 0;
  const t = opts.totalHt ?? 0;
  return h === 0 && t === 0;
}
