/**
 * v0.24.1 — Helpers de normalisation de chaînes (factorisés depuis 8 fichiers).
 *
 * Toutes les fonctions sont pures et tree-shakable. Centraliser ici évite la
 * dérive de logique (ex : variations de regex, oublis de toLowerCase).
 */

/** Supprime les diacritiques (accents) d'une chaîne. NE met PAS en lowercase. */
export function stripDiacritics(s: string | null | undefined): string {
  if (!s) return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalise un nom : lowercase + strip diacritics + trim.
 * Pour comparaisons insensibles à la casse et aux accents.
 */
export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return stripDiacritics(s).toLowerCase().trim();
}

/**
 * Normalise pour matching tokenisé : lowercase + strip diacritics + espaces compactés + trim.
 * Utilisé par devis-parser/match.ts.
 */
export function normalizeForMatch(s: string | null | undefined): string {
  if (!s) return "";
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Fuzzy match maison : lowercase + strip diacritics + includes.
 * needle vide → toujours true.
 */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return normalizeName(haystack).includes(normalizeName(needle));
}
