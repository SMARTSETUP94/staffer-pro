/** Source unique des statuts de devis : un libellé distinct par valeur, pour filtres, badges et Claude. */
export const STATUTS_DEVIS_VISIBLES = ["brouillon", "a_valider", "valide", "transfere", "signe", "refuse", "remplace"] as const;
export type StatutDevisVisible = (typeof STATUTS_DEVIS_VISIBLES)[number];
export const STATUT_DEVIS_LABEL: Record<StatutDevisVisible, string> = {
  brouillon: "Brouillon", a_valider: "À valider", valide: "Finalisé", transfere: "Transféré",
  signe: "Signé", refuse: "Refusé", remplace: "Remplacé",
};
export const libelleStatut = (statut: string | null | undefined) =>
  statut ? STATUT_DEVIS_LABEL[statut as StatutDevisVisible] ?? statut : "—";
/** Conservé pour les appels existants : chaque statut reste désormais distinct. */
export const statutDevisVisible = (statut: string) => statut;

/** Quote events advance the pipeline; later commercial decisions are never downgraded. Unchanged rule: à valider counts like a draft. */
export function ciblePipelineDevis(statut: string): "a_faire" | "a_l_etude" | "envoye" | null {
  switch (statut) {
    case "brouillon": case "a_valider": return "a_faire";
    case "valide": return "a_l_etude";
    case "transfere": return "envoye";
    default: return null;
  }
}
