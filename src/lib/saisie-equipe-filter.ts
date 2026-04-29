/**
 * v0.23.1 FIX 3 — Helpers purs pour le filtrage de la page "Saisie pour équipe".
 * v0.24.1 — fuzzyMatch ré-exporté depuis string-normalize (factorisation).
 */

export { fuzzyMatch } from "./string-normalize";

export type ContratType = "CDI" | "CDD" | "Interim" | "Independant";
export type TypoFilter = "all" | "cdi" | "interim";

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
