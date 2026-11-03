/**
 * Indicateurs du pipeline opportunités (module pur). Les montants viennent de la RPC pipeline_indicateurs :
 * un seul devis par opportunité (dernière version), CA estimé seulement sans devis et toujours compté à part.
 */
export type IndicateurAffaire = {
  affaire_id: string; statut: string; devis_id: string | null; version: number | null; numero_progbat: string | null;
  net_ht: number | null; estime: number | null; a_relancer: boolean; heures: number; heures_be: number; supplement?: boolean;
};
/** Devis de supplément d'un chantier 6XXX (non signé ni refusé, dernière version). */
export type SupplementChantier = IndicateurAffaire & { statut_redaction: string; numero: string; devis_numero: string; libelle: string | null; client: string | null };
export type PipelineIndicateurs = {
  probabilites: Record<string, number>; heures_par_jour_be: number;
  totaux: { nb: number; chiffre: number; estime: number; pondere: number; heures: number; heures_be: number; jours_be: number; relance_nb: number; relance_montant: number; supplements: number; supplements_nb: number };
  heures_metier: { metier_id: string; libelle: string; heures: number }[];
  affaires: IndicateurAffaire[];
  supplements: SupplementChantier[];
};

/** « 184 k€ » : arrondi au millier ; sous 1 000 €, une décimale (« 0,5 k€ »). */
export function kEur(v: number | null | undefined) {
  const n = Number(v ?? 0);
  const k = n / 1000;
  const txt = Math.abs(k) < 1 && n !== 0 ? k.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : Math.round(k).toLocaleString("fr-FR");
  return `${txt} k€`;
}
/** « 9 511 € » (sans centimes). */
export function eurEntier(v: number | null | undefined) {
  return `${Math.round(Number(v ?? 0)).toLocaleString("fr-FR")} €`;
}

/** Totaux d'une colonne à partir des opportunités affichées : chiffré et estimé séparés. */
export function totauxColonne(ids: string[], parAffaire: Map<string, IndicateurAffaire>) {
  let chiffre = 0, estime = 0;
  for (const id of ids) {
    const a = parAffaire.get(id);
    if (!a) continue;
    if (a.net_ht != null) chiffre += Number(a.net_ht);
    else if (a.estime != null) estime += Number(a.estime);
  }
  return { nb: ids.length, chiffre: Math.round(chiffre * 100) / 100, estime: Math.round(estime * 100) / 100 };
}
