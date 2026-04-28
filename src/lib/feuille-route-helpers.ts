/**
 * v0.21.0 Bloc 5 — Helpers Feuille de route par jour.
 *
 * Logique de fallback du Responsable d'un chantier sur une journée :
 *   1. Chef du jour (assignation avec est_chef_jour=true sur l'affaire ce jour)
 *   2. Chef de projet (affaires.chef_projet_id)
 *   3. Manutention (employé staffé ce jour avec profiles.est_manutention=true)
 *   4. Chargé d'affaires (affaires.charge_affaires_id)
 *   5. null si aucun
 *
 * Renvoie l'id du PROFILE/EMPLOYE responsable + son type (pour badge).
 */

export type ResponsableSource =
  | "chef_du_jour"
  | "chef_projet"
  | "manutention"
  | "charge_affaires"
  | null;

export interface ResponsableResult {
  /** id employé OU profil selon la source. */
  id: string | null;
  source: ResponsableSource;
}

export interface AffaireForResponsable {
  id: string;
  chef_projet_id: string | null;
  charge_affaires_id: string | null;
}

export interface AssignationForResponsable {
  affaire_id: string;
  date: string; // yyyy-MM-dd
  employe_id: string;
  est_chef_jour: boolean;
}

export interface EmployeForResponsable {
  id: string;
  profile_id: string | null;
  est_manutention: boolean;
}

/**
 * Calcule le responsable d'une affaire pour une date donnée.
 * @param affaire affaire concernée
 * @param dateISO date au format yyyy-MM-dd
 * @param assignationsJour assignations de la journée pour CETTE affaire
 * @param employesParId map employés (avec flag est_manutention résolu depuis le profil)
 */
export function resolveResponsable(
  affaire: AffaireForResponsable,
  dateISO: string,
  assignationsJour: AssignationForResponsable[],
  employesParId: Map<string, EmployeForResponsable>,
): ResponsableResult {
  // 1) Chef du jour
  const chefJour = assignationsJour.find(
    (a) => a.affaire_id === affaire.id && a.date === dateISO && a.est_chef_jour,
  );
  if (chefJour) {
    return { id: chefJour.employe_id, source: "chef_du_jour" };
  }

  // 2) Chef de projet
  if (affaire.chef_projet_id) {
    return { id: affaire.chef_projet_id, source: "chef_projet" };
  }

  // 3) Manutention parmi les staffés du jour
  const staffes = assignationsJour.filter(
    (a) => a.affaire_id === affaire.id && a.date === dateISO,
  );
  for (const a of staffes) {
    const e = employesParId.get(a.employe_id);
    if (e && e.est_manutention) {
      return { id: a.employe_id, source: "manutention" };
    }
  }

  // 4) Chargé d'affaires
  if (affaire.charge_affaires_id) {
    return { id: affaire.charge_affaires_id, source: "charge_affaires" };
  }

  return { id: null, source: null };
}

export const TYPE_OPERATION_OPTIONS = [
  "Montage",
  "Démontage",
  "Rotation",
  "Permanence",
  "Finition",
  "Chargement",
  "Déchargement",
  "Traçage",
] as const;

export type TypeOperation = (typeof TYPE_OPERATION_OPTIONS)[number];
