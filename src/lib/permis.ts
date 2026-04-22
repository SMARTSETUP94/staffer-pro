/**
 * v0.18.1 — Mapping véhicule → catégories de permis acceptées.
 *
 * Convention :
 * - VL                : permis B suffit
 * - M3_20 (≈ 3.5T)    : permis B suffit (utilitaires courants ≤ 3.5T)
 * - poids_lourd       : permis C ou CE obligatoires
 *
 * Le permis D (transport en commun) n'est pas mappé sur un type véhicule actuel
 * mais reste saisissable côté employé (futur : minibus / car).
 */
export type Permis = "B" | "C" | "CE" | "D";
export type VehiculeType = "VL" | "M3_20" | "poids_lourd";

export const PERMIS_LABEL: Record<Permis, string> = {
  B: "B (VL)",
  C: "C (PL)",
  CE: "CE (PL + remorque)",
  D: "D (transport en commun)",
};

export function permisAcceptesPour(type: VehiculeType): Permis[] {
  switch (type) {
    case "VL":
      return ["B", "C", "CE"];
    case "M3_20":
      return ["B", "C", "CE"];
    case "poids_lourd":
      return ["C", "CE"];
  }
}

export function aPermisCompatible(
  vehiculeType: VehiculeType,
  categoriesPermis: Permis[] | null | undefined,
): boolean {
  if (!categoriesPermis || categoriesPermis.length === 0) return false;
  const acceptes = permisAcceptesPour(vehiculeType);
  return categoriesPermis.some((p) => acceptes.includes(p));
}
