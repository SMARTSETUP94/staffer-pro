// v0.40.0b+1 — Récap Manutention pour StatCard du Gantt.
// Réplique 1:1 la règle d'absorption de l'algo (algo.ts) : DEBUT 35 % + TRANSFERT 15 %
// absorbés par Bois/Peint/Tap au prorata, FIN 50 % agrégé chantier.
//
// `fallback_objets` = nombre d'objets ayant des heures Manut mais AUCUN Bois/Peint/Tap
// (cas dégénéré → l'algo retombe sur DEBUT/TRANSFERT par objet pour ne pas perdre les heures).
import { MANUT_PCT_DEBUT, MANUT_PCT_FIN, MANUT_PCT_TRANSFERT, type ObjetInput } from "./types";

export interface ManutSummary {
  is_absorbed: boolean;
  manut_total_h: number;
  fin_total_h: number;
  absorbable_total_h: number;
  absorbed_bois_h: number;
  absorbed_peint_h: number;
  absorbed_tap_h: number;
  fallback_objets: number;
}

const PCT_ABS = MANUT_PCT_DEBUT + MANUT_PCT_TRANSFERT; // 0.50

export function computeManutSummary(
  objets: Pick<
    ObjetInput,
    "heures_manutention" | "heures_bois" | "heures_peinture" | "heures_tapisserie"
  >[],
  isAbsorbed: boolean,
): ManutSummary {
  let manutTotal = 0;
  let absorbedBois = 0;
  let absorbedPeint = 0;
  let absorbedTap = 0;
  let fallbackObjets = 0;

  for (const o of objets) {
    const hM = o.heures_manutention;
    if (hM <= 0) continue;
    manutTotal += hM;
    if (!isAbsorbed) continue;
    const totalAbs = o.heures_bois + o.heures_peinture + o.heures_tapisserie;
    if (totalAbs <= 0) {
      fallbackObjets += 1;
      continue;
    }
    const hAbs = hM * PCT_ABS;
    absorbedBois += hAbs * (o.heures_bois / totalAbs);
    absorbedPeint += hAbs * (o.heures_peinture / totalAbs);
    absorbedTap += hAbs * (o.heures_tapisserie / totalAbs);
  }

  return {
    is_absorbed: isAbsorbed,
    manut_total_h: manutTotal,
    fin_total_h: manutTotal * MANUT_PCT_FIN,
    absorbable_total_h: absorbedBois + absorbedPeint + absorbedTap,
    absorbed_bois_h: absorbedBois,
    absorbed_peint_h: absorbedPeint,
    absorbed_tap_h: absorbedTap,
    fallback_objets: fallbackObjets,
  };
}
