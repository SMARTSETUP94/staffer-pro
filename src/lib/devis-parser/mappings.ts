/**
 * v0.23 — Mappings parser devis Progbat.
 *
 * Issu de l'analyse de 14 devis Progbat réels (5 familles structurelles).
 * 8 métiers atelier (BE / Numérique / Bois / Métal / Peinture / Tapisserie / Manutention)
 * + 2 catégories chantier (Montage / Démontage) qui restent au niveau affaire.
 */

import type { FabMetier } from "@/hooks/use-fabrication";

/** Étape de gestion (5 étapes v0.22) liée à un métier atelier. */
export type FabricationEtapeType = "be" | "usinage" | "respo_fab" | "finition" | "manutention";

/** Mapping métier atelier → étape de gestion (5 étapes v0.22). */
export const METIER_TO_ETAPE: Record<FabMetier, FabricationEtapeType> = {
  be: "be",
  numerique: "usinage",
  bois: "respo_fab",
  metal: "respo_fab",
  peinture: "finition",
  tapisserie: "finition",
  manutention: "manutention",
};

/**
 * Mots-clés sous-prestation → métier atelier.
 * Matching fuzzy en lower-case, sans accents (voir match.ts).
 * Inspiré de 30+ libellés observés sur les 14 devis.
 */
export const METIER_KEYWORDS: Record<FabMetier, string[]> = {
  be: [
    "bureau d'etude",
    "bureau d etude",
    "tarif du bureau d'etude",
    "plans techniques",
    "suivi de projet",
    "visite technique",
    "suivi de chantier",
    "be ",
    "etude technique",
  ],
  numerique: [
    "numerique",
    "decoupe cnc",
    "cnc",
    "decoupe laser",
    "laser",
    "imprimante",
    "impression 3d",
    "3d",
    "fraisage numerique",
  ],
  bois: ["construction", "bois", "constructeurs", "menuiserie", "atelier bois"],
  metal: ["metallerie", "metal", "serrurerie", "soudure", "ferronnerie"],
  peinture: ["peinture", "m2 peinture", "m² peinture", "vernis", "laque"],
  tapisserie: ["tapisserie", "tissu", "rembourrage", "garnissage"],
  manutention: [
    "logistique",
    "conditionnement",
    "emballage",
    "premontage",
    "manutention",
    "preparation atelier",
  ],
};

/**
 * Mots-clés "lot chantier" — ces lots restent au niveau affaire,
 * pas comme objets de fabrication (heures Montage/Démontage).
 */
export const CHANTIER_KEYWORDS = [
  "montage",
  "pose",
  "installation",
  "permanence",
  "tracage",
  "demontage",
  "depose",
  "transport",
  "livraison",
  "day 1",
  "day 2",
  "day 3",
  "day 4",
  "conditionnement et transport",
  "suivi de chantier",
  "visite technique",
];

/** Mots-clés Démontage (sous-ensemble de CHANTIER_KEYWORDS). */
export const DEMONTAGE_KEYWORDS = ["demontage", "depose"];

/** Mots-clés Montage (sous-ensemble de CHANTIER_KEYWORDS). */
export const MONTAGE_KEYWORDS = [
  "montage",
  "pose",
  "installation",
  "permanence",
  "tracage",
  "day 1",
  "day 2",
  "day 3",
  "day 4",
];

/** Lignes à exclure totalement (parasites, régularisations, renvois). */
export const EXCLUDE_KEYWORDS = [
  "regul",
  "cadrage",
  "remise",
  "benne",
  "leurre",
  "prix itw",
  "voir devis",
  "achat ",
  "sous-total",
  "sous total",
  "total ht",
  "total ttc",
];

/** Catégorie matière (cumulé dans budget_materiaux de l'objet). */
export const MATIERE_KEYWORDS = [
  "liste de matiere pour bois",
  "materiaux",
  "budget materiaux",
  "liste des elements en metal matiere",
  "metal matiere",
  "liste des tissus matiere courant",
  "pmma",
  "sunclear",
  "pvc",
  "plexi",
  "linno imprime",
  "adhesif",
  "fournitures d'emballage",
  "fournitures logistique",
  "quincaillerie",
  "budget accessoires",
  "matiere premiere",
];

/** Renvois externes "Voir devis XXXX" — pattern à détecter. */
export const RENVOI_REGEX = /voir\s+devis\s+([A-Z0-9-]+)/gi;
