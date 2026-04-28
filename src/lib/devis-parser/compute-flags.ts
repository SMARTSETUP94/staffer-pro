/**
 * v0.23 — Calcul des flags d'applicabilité d'un objet à partir des heures par métier.
 * Aligné sur les 5 étapes v0.22 (be / usinage / respo_fab / finition / manutention).
 */

import type { FabMetier } from "@/hooks/use-fabrication";

export type HeuresParMetier = Record<FabMetier, number>;

export interface ApplicabilityFlags {
  a_dessiner: boolean;
  a_usiner: boolean;
  a_construire: boolean;
  est_brut: boolean;
  a_emballer: boolean;
}

export type TypeFinition = "peinture" | "tapisserie" | "autre" | "aucune";

export function emptyHeures(): HeuresParMetier {
  return {
    be: 0,
    numerique: 0,
    bois: 0,
    metal: 0,
    peinture: 0,
    tapisserie: 0,
    manutention: 0,
  };
}

export function computeFlagsFromMetiers(h: HeuresParMetier): ApplicabilityFlags {
  return {
    a_dessiner: h.be > 0,
    a_usiner: h.numerique > 0,
    a_construire: h.bois + h.metal > 0,
    est_brut: h.peinture + h.tapisserie === 0,
    a_emballer: h.manutention > 0,
  };
}

export function detectTypeFinition(h: HeuresParMetier): TypeFinition {
  if (h.peinture > 0 && h.tapisserie > 0) return "autre";
  if (h.peinture > 0) return "peinture";
  if (h.tapisserie > 0) return "tapisserie";
  return "aucune";
}
