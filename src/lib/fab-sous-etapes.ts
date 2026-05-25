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

/**
 * Sprint D / Batch 2 finition — Décomposition Casting UI par 6 métiers fab
 * individuels (et non 3 sous-étapes regroupées).
 *
 * Ordre d'affichage = ordre canonique du flux fab :
 *   Numérique → Bois → Métal → Peinture → Tapisserie → Impression UV
 *
 * Tout employé casté en fab dont metier_principal_id n'est pas dans cette
 * liste tombe dans un bucket "Autre" affiché en dessous.
 */
export interface FabMetier {
  metierId: number;
  /** Code métier DB (`metiers.code`). */
  code: string;
  /** Libellé affiché en UI. */
  label: string;
}

export const FAB_METIERS: readonly FabMetier[] = [
  { metierId: 4, code: "numerique",     label: "Numérique" },
  { metierId: 1, code: "construction",  label: "Bois" },
  { metierId: 2, code: "metallerie",    label: "Métal" },
  { metierId: 3, code: "peinture",      label: "Peinture" },
  { metierId: 5, code: "tapisserie",    label: "Tapisserie" },
  { metierId: 9, code: "impression_uv", label: "Impression UV" },
] as const;

export const FAB_METIER_IDS = FAB_METIERS.map((m) => m.metierId);

export function isFabMetier(metierId: number | null | undefined): boolean {
  return metierId != null && FAB_METIER_IDS.includes(metierId);
}
