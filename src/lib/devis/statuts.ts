/** The retired submission state stays readable as a draft for historical quotes. */
export const STATUTS_DEVIS_VISIBLES = ["brouillon", "valide", "transfere", "signe", "refuse", "remplace"] as const;
export const statutDevisVisible = (statut: string) => statut === "a_valider" ? "brouillon" : statut;

/** Quote events advance the pipeline; later commercial decisions are never downgraded. */
export function ciblePipelineDevis(statut: string): "a_faire" | "a_l_etude" | "envoye" | null {
  switch (statutDevisVisible(statut)) {
    case "brouillon": return "a_faire";
    case "valide": return "a_l_etude";
    case "transfere": return "envoye";
    default: return null;
  }
}