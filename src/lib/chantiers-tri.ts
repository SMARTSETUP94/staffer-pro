/** Tri de la liste des chantiers (/affaires). Source unique de la règle de tri. */

export type ChantierTriStatut = "prospect" | "en_cours" | "termine" | "annule";
export type ChantierTriKey = "numero" | "nom" | "client" | "montage" | "demontage" | "statut";
export type ChantierTriSens = "asc" | "desc";

/** Sens d'ouverture de la liste : du plus récent au plus ancien. */
export const CHANTIER_TRI_DEFAUT: ChantierTriKey = "montage";
export const CHANTIER_SENS_DEFAUT: ChantierTriSens = "desc";

export interface ChantierTriRow {
  numero: string;
  nom: string;
  client: string | null;
  statut: ChantierTriStatut;
  date_montage: string | null;
  date_demontage: string | null;
}

export const STATUT_ORDER: Record<ChantierTriStatut, number> = {
  en_cours: 0, prospect: 1, termine: 2, annule: 3,
};

const cmpText = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });

/** Les dates absentes restent toujours en dernier, quel que soit le sens. */
const cmpDate = (a: string | null, b: string | null, dir: number): number => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return (a < b ? -1 : a > b ? 1 : 0) * dir;
};

export function compareChantiers(a: ChantierTriRow, b: ChantierTriRow, tri: ChantierTriKey, sens: ChantierTriSens): number {
  const dir = sens === "asc" ? 1 : -1;
  switch (tri) {
    case "numero": return cmpText(a.numero, b.numero) * dir;
    case "nom": return cmpText(a.nom, b.nom) * dir;
    case "client": return cmpText(a.client ?? "", b.client ?? "") * dir;
    case "demontage": return cmpDate(a.date_demontage, b.date_demontage, dir);
    case "statut": return (STATUT_ORDER[a.statut] - STATUT_ORDER[b.statut]) * dir;
    case "montage":
    default: return cmpDate(a.date_montage, b.date_montage, dir);
  }
}

export function sortChantiers<T extends ChantierTriRow>(rows: readonly T[], tri: ChantierTriKey, sens: ChantierTriSens): T[] {
  return [...rows].sort((a, b) => compareChantiers(a, b, tri, sens));
}
