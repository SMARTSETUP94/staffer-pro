// Lot 8.2 — Matrice d'édition par champ pour la Fiche Objet.
// Source unique : `getEditableFields(roles)` renvoie l'ensemble des champs
// que l'utilisateur peut éditer en fonction de ses rôles.
//
// Décision Lot 8.2 (arbitrée par le PO) :
//   - commercial = LECTURE SEULE sur la fab (description + commentaire OK).
//   - bureau_etude = description + commentaire + plans CAD (futur).
//   - atelier_chef = lit tout, édite responsable + description + commentaire.
//   - chef_chantier / admin = édite tout sauf plans CAD (admin override).
//   - Tous les autres rôles : lecture seule.
//
// L'enum DB `app_role` contient :
//   admin | chef_chantier | chef_metier_scoped | employe | rh
//   | commercial | bureau_etude | atelier_chef | atelier_metier
//   | logistique | poseur

export type ObjetEditableField =
  | "nom"
  | "quantite"
  | "commentaire"
  | "heures_prevues"
  | "respo_fab_id"
  | "plans_url"; // futur — déjà dans la matrice pour cohérence

const MATRIX: Record<string, ObjetEditableField[]> = {
  admin: [
    "nom",
    "quantite",
    "commentaire",
    "heures_prevues",
    "respo_fab_id",
    "plans_url",
  ],
  chef_chantier: [
    "nom",
    "quantite",
    "commentaire",
    "heures_prevues",
    "respo_fab_id",
  ],
  atelier_chef: ["nom", "commentaire", "respo_fab_id"],
  bureau_etude: ["commentaire", "plans_url"],
  commercial: ["commentaire"],
  // chef_metier_scoped, atelier_metier, logistique, poseur, employe, rh :
  // lecture seule (aucun champ éditable depuis la fiche)
};

export function getEditableFields(roles: readonly string[]): Set<ObjetEditableField> {
  const set = new Set<ObjetEditableField>();
  for (const role of roles) {
    const fields = MATRIX[role];
    if (fields) for (const f of fields) set.add(f);
  }
  return set;
}

export function canEditAnyField(roles: readonly string[]): boolean {
  return getEditableFields(roles).size > 0;
}
