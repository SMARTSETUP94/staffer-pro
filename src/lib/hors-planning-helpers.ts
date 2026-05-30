/**
 * v0.32.3 — Helpers saisie d'heures hors planning.
 *
 * Une saisie "hors planning" = `heures_saisies` sans `assignation_id` : l'employé
 * a travaillé sur un chantier où il n'était pas planifié (dépannage, renfort,
 * imprévu…). Il déclare l'affaire + le métier réellement effectué + les heures.
 *
 * Le chef valide ces saisies dans l'onglet "Hors planning" de /validation-heures.
 */

export interface HorsPlanningInput {
  affaire_id: string;
  metier_id: number;
  date: string; // YYYY-MM-DD
  heures_reelles: number;
  commentaire: string | null;
  /** v0.49 — alignement avec les autres modules de saisie d'heures. */
  heure_debut?: string | null; // "HH:mm"
  heure_fin?: string | null; // "HH:mm"
  duree_pause_minutes?: number | null;
  heures_nuit?: number | null;
}

export interface HorsPlanningInsertPayload {
  employe_id: string;
  assignation_id: null;
  affaire_id: string;
  metier_id: number;
  date: string;
  heures_reelles: number;
  commentaire: string | null;
  statut: "brouillon";
  heure_debut: string | null;
  heure_fin: string | null;
  duree_pause_minutes: number;
  heures_nuit: number;
}

export type HorsPlanningValidationError =
  | "AFFAIRE_REQUISE"
  | "METIER_REQUIS"
  | "DATE_REQUISE"
  | "DATE_INVALIDE"
  | "DATE_FUTURE"
  | "HEURES_INVALIDE"
  | "HEURES_HORS_BORNES";

export interface HorsPlanningValidationResult {
  ok: boolean;
  errors: HorsPlanningValidationError[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validation pure de l'input avant insert. Retourne la liste des erreurs ;
 * vide = OK.
 */
export function validateHorsPlanningInput(input: Partial<HorsPlanningInput>): HorsPlanningValidationResult {
  const errors: HorsPlanningValidationError[] = [];

  if (!input.affaire_id || input.affaire_id.trim() === "") {
    errors.push("AFFAIRE_REQUISE");
  }

  if (input.metier_id === undefined || input.metier_id === null || !Number.isFinite(input.metier_id)) {
    errors.push("METIER_REQUIS");
  }

  if (!input.date) {
    errors.push("DATE_REQUISE");
  } else if (!ISO_DATE_RE.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    errors.push("DATE_INVALIDE");
  } else {
    // v0.32.4 — Garde-fou date future : une saisie hors-planning est rétroactive
    // par nature (l'employé déclare ce qu'il a fait, pas ce qu'il fera).
    const todayISO = new Date().toISOString().slice(0, 10);
    if (input.date > todayISO) errors.push("DATE_FUTURE");
  }

  const h = input.heures_reelles;
  if (h === undefined || h === null || Number.isNaN(Number(h))) {
    errors.push("HEURES_INVALIDE");
  } else if (Number(h) <= 0 || Number(h) > 24) {
    errors.push("HEURES_HORS_BORNES");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Construit le payload d'insertion pour une saisie hors planning.
 *
 * @throws si l'input n'est pas valide. Toujours appeler `validateHorsPlanningInput`
 * d'abord côté UI pour afficher l'erreur à l'utilisateur.
 */
export function buildHorsPlanningInsert(
  employeId: string,
  input: HorsPlanningInput,
): HorsPlanningInsertPayload {
  const validation = validateHorsPlanningInput(input);
  if (!validation.ok) {
    throw new Error(`Input invalide: ${validation.errors.join(", ")}`);
  }
  if (!employeId || employeId.trim() === "") {
    throw new Error("employeId requis");
  }
  const commentaire = input.commentaire && input.commentaire.trim() !== ""
    ? input.commentaire.trim()
    : null;
  const heureDebut = input.heure_debut && input.heure_debut.trim() !== "" ? input.heure_debut : null;
  const heureFin = input.heure_fin && input.heure_fin.trim() !== "" ? input.heure_fin : null;
  const pauseMin = input.duree_pause_minutes != null && Number.isFinite(Number(input.duree_pause_minutes))
    ? Number(input.duree_pause_minutes)
    : 0;
  const heuresNuit = input.heures_nuit != null && Number.isFinite(Number(input.heures_nuit))
    ? Number(input.heures_nuit)
    : 0;
  return {
    employe_id: employeId,
    assignation_id: null,
    affaire_id: input.affaire_id,
    metier_id: input.metier_id,
    date: input.date,
    heures_reelles: Number(input.heures_reelles),
    commentaire,
    statut: "brouillon",
    heure_debut: heureDebut,
    heure_fin: heureFin,
    duree_pause_minutes: pauseMin,
    heures_nuit: heuresNuit,
  };
}

/**
 * Détermine si une saisie peut être supprimée par l'employé propriétaire.
 *
 * Règles (alignées sur la RPC `delete_my_hors_planning_saisie`) :
 * - assignation_id IS NULL (sinon supprimer = casser le planning)
 * - statut = 'brouillon' (validée/soumise/rejetée → seul un chef peut intervenir)
 */
export function canEmployeDeleteSaisie(saisie: {
  assignation_id: string | null;
  statut: string;
}): boolean {
  return saisie.assignation_id === null && saisie.statut === "brouillon";
}

export const HORS_PLANNING_ERROR_LABELS: Record<HorsPlanningValidationError, string> = {
  AFFAIRE_REQUISE: "Sélectionne une affaire.",
  METIER_REQUIS: "Sélectionne le métier réellement effectué.",
  DATE_REQUISE: "Renseigne la date.",
  DATE_INVALIDE: "Date invalide.",
  DATE_FUTURE: "La date ne peut pas être dans le futur.",
  HEURES_INVALIDE: "Renseigne le nombre d'heures.",
  HEURES_HORS_BORNES: "Le nombre d'heures doit être > 0 et ≤ 24.",
};
