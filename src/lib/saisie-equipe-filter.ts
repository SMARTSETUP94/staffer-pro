/**
 * v0.23.1 FIX 3 — Helpers purs pour le filtrage de la page "Saisie pour équipe".
 * Extraits pour testabilité unitaire (lowercase + NFD strip diacritics + includes).
 */

export type ContratType = "CDI" | "CDD" | "Interim" | "Independant";
export type TypoFilter = "all" | "cdi" | "interim";

/** Fuzzy maison : lowercase + strip diacritics + includes. */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return norm(haystack).includes(norm(needle));
}

/** Filtre une liste d'employés selon typologie de contrat. */
export function filterByTypologie<T extends { type_contrat: ContratType }>(
  list: T[],
  typo: TypoFilter,
): T[] {
  if (typo === "cdi") return list.filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD");
  if (typo === "interim")
    return list.filter((e) => e.type_contrat === "Interim" || e.type_contrat === "Independant");
  return list;
}
