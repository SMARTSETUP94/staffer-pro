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
  /** v0.31.4c — Quantité de la Section parent (déjà appliquée aux heures). */
  sectionQuantite: number;
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

/**
 * v0.31.6 — Diagnostic "Pourquoi c'est exclu" : trace toutes les lignes
 * écartées par le parser et la règle qui a déclenché l'exclusion.
 *
 * `kind` = règle appliquée :
 *   - "exclude_regex" : libellé matché par EXCLUDE_REGEX (mappings.ts)
 *   - "empty_poste" : qty/total/temps tous nuls (skip silencieux)
 *   - "lot_chantier_in_objet" : Montage/Démontage sans métier dans un objet
 *   - "metier_unknown" : heures > 0 mais aucun pattern métier
 *   - "niveau2_excluded_no_children" : N.M exclu et sans enfant atelier/matière
 *   - "matiere_no_montant" : ligne matière sans Total HT
 *   - "regul_with_hours" : Régul avec heures > 0 (à valider manuellement)
 *   - "section_skipped" : Section niveau 1 ignorée (chantier pur sans métier)
 *   - "comment" : ligne sans numéro (commentaire / description)
 */
export type ExclusionKind =
  | "exclude_regex"
  | "empty_poste"
  | "lot_chantier_in_objet"
  | "metier_unknown"
  | "niveau2_excluded_no_children"
  | "matiere_no_montant"
  | "regul_with_hours"
  | "section_skipped"
  | "comment";

export interface ExclusionEntry {
  /** Numéro de ligne Excel (1-based, tel qu'il apparaît dans le fichier source). */
  rowIndex: number;
  /** Numéro hiérarchique brut de la ligne (ex: "1.2.3"), ou "" si absent. */
  numero: string;
  /** Désignation Excel telle que lue. */
  designation: string;
  /** Section parente (ex: "1") si identifiable, sinon vide. */
  sectionNumero: string;
  /** Type de règle appliquée par le parser. */
  kind: ExclusionKind;
  /** Phrase humaine prête à l'affichage ("Pourquoi c'est exclu"). */
  reason: string;
  /** Pattern technique qui a matché (regex source) si applicable. */
  rule: string | null;
  /** Heures/total/qty associés (debug). */
  tempsPrevu: number | null;
  totalHt: number | null;
  quantite: number | null;
  /** Si true, la ligne aurait pu être mappée mais a été désactivée. */
  isRecoverable: boolean;
}

export interface ParseResult {
  meta: DevisMetadata;
  devisType: DevisType;
  objetsCandidats: ObjetCandidat[];
  heuresChantier: HeuresChantier;
  renvoisExternes: RenvoiExterne[];
  /** Cross-checks par section (anti-bug critique). */
  integrityChecks: IntegrityCheck[];
  /** v0.31.6 — Trace des exclusions parser pour la modale "Pourquoi c'est exclu". */
  exclusions: ExclusionEntry[];
  warnings: string[];
  errors: string[];
}

export type { FabMetier };
