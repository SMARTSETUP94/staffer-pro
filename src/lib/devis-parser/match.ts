/**
 * v0.23 — Helpers de matching (lower-case + sans accents).
 */

import type { FabMetier } from "@/hooks/use-fabrication";
import {
  CHANTIER_KEYWORDS,
  DEMONTAGE_KEYWORDS,
  EXCLUDE_KEYWORDS,
  MATIERE_KEYWORDS,
  METIER_KEYWORDS,
  MONTAGE_KEYWORDS,
} from "./mappings";

import { normalizeForMatch } from "@/lib/string-normalize";

/** Normalise une chaîne : lower-case + suppression des diacritiques + espaces compactés. */
export function normalize(s: string | null | undefined): string {
  return normalizeForMatch(s);
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(normalize(n)));
}

/**
 * Détermine le métier d'une ligne d'après son libellé.
 * Ordre de priorité : métiers spécifiques avant les génériques (bois est large).
 */
export function matchMetier(libelle: string): FabMetier | null {
  const n = normalize(libelle);
  if (!n) return null;

  // Ordre stable : be → numerique → metal → tapisserie → peinture → manutention → bois
  // (bois est testé en dernier car "construction" capture beaucoup).
  const order: FabMetier[] = [
    "be",
    "numerique",
    "metal",
    "tapisserie",
    "peinture",
    "manutention",
    "bois",
  ];
  for (const m of order) {
    if (containsAny(n, METIER_KEYWORDS[m])) return m;
  }
  return null;
}

/** Vrai si la ligne désigne un poste matière (cumulé dans budget_materiaux). */
export function isMatiere(libelle: string): boolean {
  return containsAny(normalize(libelle), MATIERE_KEYWORDS);
}

/** Vrai si la ligne est un lot chantier (Montage/Démontage/Transport/...) — niveau affaire. */
export function isChantierKeyword(libelle: string): boolean {
  return containsAny(normalize(libelle), CHANTIER_KEYWORDS);
}

/** Vrai si la ligne tombe spécifiquement dans Démontage. */
export function isDemontageKeyword(libelle: string): boolean {
  return containsAny(normalize(libelle), DEMONTAGE_KEYWORDS);
}

/** Vrai si la ligne tombe spécifiquement dans Montage (et pas Démontage). */
export function isMontageKeyword(libelle: string): boolean {
  const n = normalize(libelle);
  if (containsAny(n, DEMONTAGE_KEYWORDS)) return false;
  return containsAny(n, MONTAGE_KEYWORDS);
}

/** Vrai si la ligne doit être exclue totalement (régul, achats, sous-totaux, renvois). */
export function isExcludeKeyword(libelle: string): boolean {
  return containsAny(normalize(libelle), EXCLUDE_KEYWORDS);
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
