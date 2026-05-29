// Lot 8.2 / 8.2c — Matrice d'édition par champ pour la Fiche Objet.
// Source unique : `getEditableFields(roles)` renvoie l'ensemble des champs
// que l'utilisateur peut éditer en fonction de ses rôles.
//
// Lot 8.2c (mai 2026) :
//   - SUPPRESSION de `heures_prevues` (source unique = ObjetHeuresTable + réimport
//     devis + cell-edit planning ; plus de saisie manuelle depuis la fiche).
//   - AJOUT de 5 nouveaux champs : largeur_mm, longueur_mm, hauteur_mm,
//     materiaux, finition_detail.
//
// Conventions de rôles (cf enum DB `app_role`) :
//   admin | chef_chantier | chef_metier_scoped | employe | rh
//   | commercial | bureau_etude | atelier_chef | atelier_metier
//   | logistique | poseur
//
// Décisions Lot 8.2c (arbitrées par le PO) :
//   - commercial = lecture seule sur la fab, sauf `commentaire`.
//   - bureau_etude = commentaire + plans CAD (futur) + dimensions + matériaux + finition détaillée.
//   - atelier_chef = nom + commentaire + responsable + finition détaillée.
//   - chef_chantier / admin = édite tout sauf plans CAD (admin override sur plans).

export type ObjetEditableField =
  | "nom"
  | "quantite"
  | "commentaire"
  | "respo_fab_id"
  | "plans_url" // futur — déjà dans la matrice pour cohérence
  | "largeur_mm"
  | "longueur_mm"
  | "hauteur_mm"
  | "materiaux"
  | "finition_detail";

const MATRIX: Record<string, ObjetEditableField[]> = {
  admin: [
    "nom",
    "quantite",
    "commentaire",
    "respo_fab_id",
    "plans_url",
    "largeur_mm",
    "longueur_mm",
    "hauteur_mm",
    "materiaux",
    "finition_detail",
  ],
  chef_chantier: [
    "nom",
    "quantite",
    "commentaire",
    "respo_fab_id",
    "largeur_mm",
    "longueur_mm",
    "hauteur_mm",
    "materiaux",
    "finition_detail",
  ],
  atelier_chef: ["nom", "commentaire", "respo_fab_id", "finition_detail"],
  bureau_etude: [
    "commentaire",
    "plans_url",
    "largeur_mm",
    "longueur_mm",
    "hauteur_mm",
    "materiaux",
    "finition_detail",
  ],
  commercial: ["commentaire"],
  // Lot 3 P2 (mai 2026) : `atelier_metier` (menuisier, métallier, peintre,
  // numérique, tapissier, manutention, BE atelier) peut commenter la fiche
  // d'un objet de son métier (RLS Lot 1 restreint déjà la visibilité).
  atelier_metier: ["commentaire"],
  // logistique, poseur, employe, rh : lecture seule (aucun champ éditable).
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
