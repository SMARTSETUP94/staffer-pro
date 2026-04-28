/**
 * v0.23 — Types ParseResult (parser devis Progbat).
 */
import type { FabMetier } from "@/hooks/use-fabrication";
import type { ApplicabilityFlags, HeuresParMetier, TypeFinition } from "./compute-flags";

export type DevisType = "fabrication" | "chantier_seul" | "mixte" | "inconnu";
export type Confidence = "high" | "medium" | "low";

export interface DevisMetadata {
  numeroDevis: string | null;
  libelle: string | null;
  client: string | null;
  /** Total HT global du devis. */
  totalHt: number;
  /** Nombre total de lignes lues. */
  nbLignes: number;
}

export interface ObjetCandidat {
  /** Numéro hiérarchique (ex: "1.2"). */
  numero: string;
  nom: string;
  description: string | null;
  quantite: number;
  /** Heures par métier (déjà multipliées par la quantité). */
  heures: HeuresParMetier;
  /** Total heures atelier (somme). */
  totalHeures: number;
  /** Budget matières cumulé (€ HT). */
  budgetMateriaux: number;
  /** Type de finition détecté. */
  typeFinition: TypeFinition;
  /** Flags d'applicabilité dérivés des heures. */
  flags: ApplicabilityFlags;
  /** Confiance dans l'extraction. */
  confidence: Confidence;
  /** Avertissements (matières non chiffrées, métier ambigu, etc.). */
  warnings: string[];
  /** Index Excel des lignes feuilles agrégées (debug). */
  rowIndices: number[];
}

export interface HeuresChantier {
  /** Heures Montage (somme des lots Montage/Pose/Permanence/Day X). */
  montage: number;
  /** Heures Démontage (somme des lots Démontage/Dépose). */
  demontage: number;
  /** Total HT chantier (info). */
  totalHt: number;
}

export interface RenvoiExterne {
  /** Numéro du devis cité (ex: "1586"). */
  numeroDevis: string;
  /** Libellé brut où le renvoi a été détecté. */
  contexte: string;
  rowIndex: number;
}

export interface ParseResult {
  meta: DevisMetadata;
  devisType: DevisType;
  objetsCandidats: ObjetCandidat[];
  heuresChantier: HeuresChantier;
  renvoisExternes: RenvoiExterne[];
  warnings: string[];
  errors: string[];
}

export type { FabMetier };
