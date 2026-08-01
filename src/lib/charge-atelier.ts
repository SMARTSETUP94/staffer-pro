/**
 * LOT 6 — Helpers purs de la charge atelier (matrice métiers × jours).
 *
 * Source de vérité : `atelier_planning` (effectif prévisionnel ANONYME du
 * LOT 3/5), et **non** les plans de staffing publiés — voir
 * `mem://features/charge-atelier-atelier-planning`.
 *
 * La vue `v_atelier_charge_jour` agrège déjà `SUM(nb_pers)` par métier/jour,
 * mais sans le détail affaire/objet nécessaire aux filtres et au drill-down :
 * on agrège donc ici les lignes détaillées côté client.
 */

export interface ChargeDetailRow {
  plan_id: string;
  date: string;
  metier_id: number;
  nb_pers: number;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  /** Affaire en phase `opportunite` ou statut `prospect`. */
  prospect: boolean;
  objet_id: string | null;
  objet_label: string | null;
  lot_id: string | null;
  lot_label: string | null;
  /** Ligne `objet_heures_metier` marquée sous-traitance pour ce métier. */
  sous_traitance: boolean;
  /** Personnes déjà nommées sur cette ligne de planning. */
  nommes: { id: string; nom: string }[];
}

export interface ChargeMetier {
  id: number;
  libelle: string;
  couleur: string | null;
  ordre: number;
  capacite_jour: number | null;
}

export type ChargeNiveau = "vide" | "sous" | "plein" | "surcharge" | "neutre";

/**
 * Seuils de couleur relatifs à la capacité réelle du métier.
 * Un métier sans capacité renseignée reste neutre (aucune coloration).
 */
export function chargeNiveau(nbPers: number, capacite: number | null): ChargeNiveau {
  if (!nbPers || nbPers <= 0) return "vide";
  if (capacite === null || capacite === undefined || capacite <= 0) return "neutre";
  if (nbPers < capacite) return "sous";
  if (nbPers === capacite) return "plein";
  return "surcharge";
}

/** Classes Tailwind (tokens sémantiques) associées à un niveau de charge. */
export const NIVEAU_CLASS: Record<ChargeNiveau, string> = {
  vide: "text-muted-foreground/30",
  neutre: "bg-muted/40 text-foreground",
  sous: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  plein: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  surcharge: "bg-destructive/20 font-bold text-destructive",
};

export interface ChargeFilters {
  metierIds: number[];
  affaireIds: string[];
  inclureProspects: boolean;
  exclureSousTraitance: boolean;
}

export function filterChargeRows(
  rows: ChargeDetailRow[],
  filters: ChargeFilters,
): ChargeDetailRow[] {
  return rows.filter((r) => {
    if (filters.exclureSousTraitance && r.sous_traitance) return false;
    if (!filters.inclureProspects && r.prospect) return false;
    if (filters.metierIds.length > 0 && !filters.metierIds.includes(r.metier_id)) return false;
    if (filters.affaireIds.length > 0 && !filters.affaireIds.includes(r.affaire_id)) return false;
    return true;
  });
}

export const chargeKey = (metierId: number, date: string) => `${metierId}|${date}`;

export interface ChargeCell {
  nbPers: number;
  nbNommes: number;
  rows: ChargeDetailRow[];
}

/** Agrège les lignes détaillées en cellules `métier|jour`. */
export function buildChargeMatrix(rows: ChargeDetailRow[]): Map<string, ChargeCell> {
  const out = new Map<string, ChargeCell>();
  for (const r of rows) {
    const k = chargeKey(r.metier_id, r.date);
    const cell = out.get(k) ?? { nbPers: 0, nbNommes: 0, rows: [] };
    cell.nbPers += r.nb_pers;
    cell.nbNommes += r.nommes.length;
    cell.rows.push(r);
    out.set(k, cell);
  }
  return out;
}

export function totalLigne(
  matrix: Map<string, ChargeCell>,
  metierId: number,
  dates: string[],
): number {
  return dates.reduce((acc, d) => acc + (matrix.get(chargeKey(metierId, d))?.nbPers ?? 0), 0);
}

export function totalColonne(
  matrix: Map<string, ChargeCell>,
  metierIds: number[],
  date: string,
): number {
  return metierIds.reduce((acc, m) => acc + (matrix.get(chargeKey(m, date))?.nbPers ?? 0), 0);
}

export interface ChargeKpis {
  /** Jours comptant au moins un métier au-dessus de sa capacité. */
  joursSurcharge: number;
  /** Métier au plus fort cumul de dépassement sur la fenêtre. */
  metierTendu: { id: number; libelle: string; depassement: number } | null;
  persJoursPlanifiees: number;
  persJoursNommees: number;
}

export function computeChargeKpis(
  matrix: Map<string, ChargeCell>,
  metiers: ChargeMetier[],
  dates: string[],
): ChargeKpis {
  let joursSurcharge = 0;
  let persJoursPlanifiees = 0;
  let persJoursNommees = 0;
  const depassementParMetier = new Map<number, number>();

  for (const d of dates) {
    let surcharge = false;
    for (const m of metiers) {
      const cell = matrix.get(chargeKey(m.id, d));
      if (!cell) continue;
      persJoursPlanifiees += cell.nbPers;
      persJoursNommees += cell.nbNommes;
      if (chargeNiveau(cell.nbPers, m.capacite_jour) === "surcharge") {
        surcharge = true;
        const over = cell.nbPers - (m.capacite_jour ?? 0);
        depassementParMetier.set(m.id, (depassementParMetier.get(m.id) ?? 0) + over);
      }
    }
    if (surcharge) joursSurcharge += 1;
  }

  let metierTendu: ChargeKpis["metierTendu"] = null;
  for (const [id, depassement] of depassementParMetier) {
    if (!metierTendu || depassement > metierTendu.depassement) {
      const m = metiers.find((x) => x.id === id);
      metierTendu = { id, libelle: m?.libelle ?? String(id), depassement };
    }
  }

  return { joursSurcharge, metierTendu, persJoursPlanifiees, persJoursNommees };
}

/** Regroupe les lignes d'une cellule par affaire, pour le drill-down. */
export interface ChargeDrillAffaire {
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  prospect: boolean;
  nbPers: number;
  nommes: { id: string; nom: string }[];
  cibles: string[];
}

export function groupCellByAffaire(cell: ChargeCell | undefined): ChargeDrillAffaire[] {
  if (!cell) return [];
  const map = new Map<string, ChargeDrillAffaire>();
  for (const r of cell.rows) {
    const g = map.get(r.affaire_id) ?? {
      affaire_id: r.affaire_id,
      affaire_numero: r.affaire_numero,
      affaire_nom: r.affaire_nom,
      prospect: r.prospect,
      nbPers: 0,
      nommes: [],
      cibles: [],
    };
    g.nbPers += r.nb_pers;
    g.nommes.push(...r.nommes);
    const cible = r.lot_label ? `Lot ${r.lot_label}` : r.objet_label;
    if (cible && !g.cibles.includes(cible)) g.cibles.push(cible);
    map.set(r.affaire_id, g);
  }
  return [...map.values()].sort((a, b) => b.nbPers - a.nbPers);
}

/** Libellé de mois pour les bandeaux d'en-tête (« janv. 2026 »). */
export function moisLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Découpe une liste de jours en segments de mois consécutifs. */
export function segmentsParMois(dates: string[]): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = [];
  for (const d of dates) {
    const label = moisLabel(d);
    const last = out[out.length - 1];
    if (last && last.label === label) last.span += 1;
    else out.push({ label, span: 1 });
  }
  return out;
}
