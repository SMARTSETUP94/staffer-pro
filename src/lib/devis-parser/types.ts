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

/**
 * v0.31.4b — Poste individuel (ligne N.M.K) exposé pour la modale UI :
 * permet l'override de métier, le toggle Matériel/Heures et le drag&drop
 * d'un poste vers un autre objet sans repasser par le parser.
 */
export interface PosteCandidat {
  /** Identifiant stable (numéro hiérarchique, fallback sur rowIndex). */
  id: string;
  /** Numéro hiérarchique brut tel que lu (ex: "1.2.3"). */
  numero: string;
  /** Index Excel 1-based pour traçabilité. */
  rowIndex: number;
  /** Désignation Excel telle que lue. */
  designation: string;
  /** Métier détecté automatiquement (null si ambigu). */
  metierAuto: FabMetier | null;
  /** Métier après override utilisateur (= metierAuto par défaut). */
  metier: FabMetier | null;
  /** Heures par UNITÉ telles que lues dans l'Excel (avant × quantité objet). */
  heuresUnitaires: number;
  /** Quantité affichée sur la ligne poste (souvent 1). */
  quantite: number | null;
  /** Total HT de la ligne (informatif, peut alimenter budget si Matériel). */
  totalHt: number | null;
  /** Le poste est-il une ligne matériel (m², kg, ml, "matière"…) ? */
  isMatiere: boolean;
  /** Override utilisateur du toggle matière/heures. */
  isMatiereOverride: boolean | null;
  /** Régul (heures à 0 mais total préservé). */
  isRegul: boolean;
  /** Le poste est-il intégré au calcul des heures objet ? (false = à mapper). */
  autoMapped: boolean;
}

export interface ObjetCandidat {
  /** Numéro hiérarchique (ex: "1.2"). */
  numero: string;
  /** Numéro de la Section parent (ex: "1"). Vide si objet implicite/manuel. */
  sectionNumero: string;
  /** Libellé de la Section parent (info UI). */
  sectionNom: string;
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
  /** v0.31.4b — Postes individuels (N.M.K) exposés pour la modale UI. */
  postes: PosteCandidat[];
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

/**
 * Cross-check intégrité Section vs Σ(Objets) :
 * compare le Temps prévu affiché au niveau de la Section (N)
 * à la somme des heures objets (N.M) après multiplication par leur quantité.
 */
export interface IntegrityCheck {
  /** Numéro hiérarchique de la section (ex: "1"). */
  sectionNumero: string;
  /** Nom de la section. */
  sectionNom: string;
  /** Heures déclarées sur la ligne Section (Temps prévu colonne). */
  heuresDeclarees: number;
  /** Heures calculées = Σ(objets enfants × quantité). */
  heuresCalculees: number;
  /** Écart = calculées - déclarées. Tolérance ±0.5h. */
  ecart: number;
  /** Niveau d'alerte. */
  severite: "ok" | "warning" | "error";
}

export interface ParseResult {
  meta: DevisMetadata;
  devisType: DevisType;
  objetsCandidats: ObjetCandidat[];
  heuresChantier: HeuresChantier;
  renvoisExternes: RenvoiExterne[];
  /** Cross-checks par section (anti-bug critique). */
  integrityChecks: IntegrityCheck[];
  warnings: string[];
  errors: string[];
}

export type { FabMetier };
