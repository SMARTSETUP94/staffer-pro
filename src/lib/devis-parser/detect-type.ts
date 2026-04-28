/**
 * v0.23 — Détection du type d'un devis Progbat.
 *
 * - fabrication : que des sous-prestations atelier
 * - chantier_seul : que des lots chantier (montage/démontage/transport)
 * - mixte : ≥1 atelier + ≥1 chantier
 * - inconnu : aucune sous-prestation reconnue
 */

import { isChantierKeyword, isExcludeKeyword, matchMetier } from "./match";

export type DevisType = "fabrication" | "chantier_seul" | "mixte" | "inconnu";

export interface DetectableRow {
  designation: string | null | undefined;
}

export function detectDevisType(rows: DetectableRow[]): DevisType {
  let atelier = 0;
  let chantier = 0;

  for (const r of rows) {
    const lib = r.designation ?? "";
    if (!lib) continue;
    if (isExcludeKeyword(lib)) continue;
    if (matchMetier(lib)) {
      atelier += 1;
      continue;
    }
    if (isChantierKeyword(lib)) {
      chantier += 1;
    }
  }

  if (atelier === 0 && chantier === 0) return "inconnu";
  if (atelier === 0) return "chantier_seul";
  if (chantier === 0) return "fabrication";
  return "mixte";
}
