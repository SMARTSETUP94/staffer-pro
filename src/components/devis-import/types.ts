export interface AffaireOption {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  lieu: string | null;
}

export interface PosteRow {
  key: string;
  metierId: number | null;
  heures: number;
  montantHt: number;
  libellesSources: string[];
  manuel: boolean;
}

export const NEW_AFFAIRE = "__new__";
