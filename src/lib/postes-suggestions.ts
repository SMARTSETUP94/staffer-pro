/**
 * Liste des postes pré-suggérés dans les datalists (fiche employé,
 * page admin /admin/employes-poste-principal). Le free text reste autorisé
 * pour les cas spécifiques (Cintrier, Chef machiniste, etc.).
 */
export const POSTES_SUGGESTIONS: readonly string[] = [
  "Technicien de plateau",
  "Machiniste",
  "Constructeur",
  "Peintre décorateur",
  "Régisseur",
  "Éclairagiste",
  "Sonorisateur",
  "Opérateur caméra",
];

export const POSTE_FALLBACK = "Technicien de plateau";
