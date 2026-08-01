export const HEURES_STATUTS = ["brouillon", "soumis", "valide", "rejete"] as const;

export type HeuresStatut = (typeof HEURES_STATUTS)[number];