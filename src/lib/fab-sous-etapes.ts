/**
 * Sprint D / Batch 2 — Constante FAB_SOUS_ETAPES.
 *
 * Regroupe les métiers fabrication en 3 sous-étapes opérationnelles utilisées
 * dans le Casting du chantier (Section Fabrication) et l'alerte
 * `alerte_sous_dim` (granularité sous-étape, à venir).
 *
 * Source métiers (cf. mem://features/auto-staffing-v035-spec) :
 *   1 menuiserie/bois · 2 métallerie · 3 peinture · 4 numérique
 *   5 tapisserie · 6 machiniste · 7 logistique · 8 BE/suivi_projet · 9 impression_uv
 */

export type FabSousEtapeKey = "numerique" | "construction" | "finition";

export interface FabSousEtape {
  key: FabSousEtapeKey;
  label: string;
  /** Métier ids (table `metiers.id`) regroupés sous cette sous-étape. */
  metierIds: number[];
  /** Colonnes heures_prevues_* dans `fabrication_objets`. */
  heuresColonnes: string[];
}

export const FAB_SOUS_ETAPES: readonly FabSousEtape[] = [
  {
    key: "numerique",
    label: "Numérique",
    // Numérique + impression UV + BE (les 3 métiers "amont" de la fab)
    metierIds: [4, 9, 8],
    heuresColonnes: ["heures_prevues_numerique", "heures_prevues_be"],
  },
  {
    key: "construction",
    label: "Construction",
    // Menuiserie / Métallerie (le cœur usinage / assemblage)
    metierIds: [1, 2],
    heuresColonnes: ["heures_prevues_bois", "heures_prevues_metal"],
  },
  {
    key: "finition",
    label: "Finition",
    // Peinture / Tapisserie / Manutention (machiniste)
    metierIds: [3, 5, 6, 7],
    heuresColonnes: [
      "heures_prevues_peinture",
      "heures_prevues_tapisserie",
      "heures_prevues_manutention",
    ],
  },
] as const;

/**
 * Map inverse : metier_id → sous-étape (ou undefined si métier hors fab).
 */
export function getSousEtapeForMetier(metierId: number): FabSousEtape | undefined {
  return FAB_SOUS_ETAPES.find((se) => se.metierIds.includes(metierId));
}

export function getSousEtapeKey(metierId: number): FabSousEtapeKey | undefined {
  return getSousEtapeForMetier(metierId)?.key;
}
