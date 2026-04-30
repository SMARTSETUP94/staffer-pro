/**
 * v0.28.0 — Helpers pour la vue Tableur opportunités.
 * - Validation code 9XXX
 * - Recherche fuzzy multi-champs (client/chantier/code)
 * - Navigation Tab/Enter entre cellules
 * - Filtres dates preset
 * - Détection ligne "vide" (à créer)
 */
import { normalize } from "@/lib/string-normalize";
import type { OpportuniteStatut, OpportuniteTaille } from "@/lib/opportunites";

export const CODE_9XXX_REGEX = /^9\d{3}$/;

export function isValidCode9XXX(code: string): boolean {
  return CODE_9XXX_REGEX.test(code.trim());
}

/** Colonnes éditables dans l'ordre Tab. */
export const TABLEUR_COLUMNS = [
  "code",
  "client",
  "deviseur",
  "date_opportunite",
  "taille",
  "statut",
  "date_pat",
  "date_montage",
  "date_demontage",
  "commentaires",
] as const;

export type TableurColumnKey = (typeof TABLEUR_COLUMNS)[number];

export interface TableurRow {
  /** id local (uuid affaire si persistée, sinon "draft-N") */
  id: string;
  /** vraie id BDD si persistée */
  affaireId: string | null;
  numero: string;
  client: string;
  nom: string;
  charge_affaires_id: string | null;
  date_opportunite: string | null;
  taille: OpportuniteTaille | null;
  statut_opportunite: OpportuniteStatut | null;
  code_opportunite: string | null;
  signed_affaire_numero: string | null;
  signed_affaire_id: string | null;
  date_pat: string | null;
  date_montage: string | null;
  date_demontage: string | null;
  notes: string | null;
}

/** Calcule la cellule cible pour Tab (right-then-down) ou Enter (down). */
export function nextCell(
  row: number,
  col: TableurColumnKey,
  direction: "tab" | "shift-tab" | "enter" | "shift-enter",
  rowCount: number,
): { row: number; col: TableurColumnKey } | null {
  const idx = TABLEUR_COLUMNS.indexOf(col);
  if (idx === -1) return null;
  if (direction === "tab") {
    if (idx < TABLEUR_COLUMNS.length - 1) return { row, col: TABLEUR_COLUMNS[idx + 1] };
    if (row < rowCount - 1) return { row: row + 1, col: TABLEUR_COLUMNS[0] };
    return null;
  }
  if (direction === "shift-tab") {
    if (idx > 0) return { row, col: TABLEUR_COLUMNS[idx - 1] };
    if (row > 0) return { row: row - 1, col: TABLEUR_COLUMNS[TABLEUR_COLUMNS.length - 1] };
    return null;
  }
  if (direction === "enter") {
    if (row < rowCount - 1) return { row: row + 1, col };
    return null;
  }
  // shift-enter
  if (row > 0) return { row: row - 1, col };
  return null;
}

/** Recherche fuzzy maison sur client + nom + numéro. */
export function fuzzySearchRow(row: TableurRow, query: string): boolean {
  if (!query.trim()) return true;
  const q = normalize(query);
  const haystack = normalize(
    [row.numero, row.client, row.nom, row.notes ?? ""].join(" "),
  );
  // Tous les tokens doivent matcher (AND)
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export type DatePreset = "all" | "7d" | "30d" | "current_month" | "custom";

export function dateRangeForPreset(
  preset: DatePreset,
  ref: Date = new Date(),
): { from: string | null; to: string | null } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "all") return { from: null, to: null };
  if (preset === "7d") {
    const from = new Date(ref);
    from.setDate(from.getDate() - 7);
    return { from: fmt(from), to: fmt(ref) };
  }
  if (preset === "30d") {
    const from = new Date(ref);
    from.setDate(from.getDate() - 30);
    return { from: fmt(from), to: fmt(ref) };
  }
  if (preset === "current_month") {
    const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { from: fmt(from), to: fmt(to) };
  }
  return { from: null, to: null };
}

/** Filtre les lignes selon les filtres haut de page. */
export interface TableurFilters {
  statuts: OpportuniteStatut[];
  tailles: OpportuniteTaille[];
  deviseurs: string[];
  dateFrom: string | null;
  dateTo: string | null;
  search: string;
}

export function applyTableurFilters(
  rows: TableurRow[],
  filters: TableurFilters,
): TableurRow[] {
  return rows.filter((r) => {
    if (filters.statuts.length > 0) {
      if (!r.statut_opportunite || !filters.statuts.includes(r.statut_opportunite))
        return false;
    }
    if (filters.tailles.length > 0) {
      if (!r.taille || !filters.tailles.includes(r.taille)) return false;
    }
    if (filters.deviseurs.length > 0) {
      if (!r.charge_affaires_id || !filters.deviseurs.includes(r.charge_affaires_id))
        return false;
    }
    if (filters.dateFrom && (!r.date_opportunite || r.date_opportunite < filters.dateFrom))
      return false;
    if (filters.dateTo && (!r.date_opportunite || r.date_opportunite > filters.dateTo))
      return false;
    if (!fuzzySearchRow(r, filters.search)) return false;
    return true;
  });
}

/**
 * Détecte si une ligne brouillon (sans affaireId) est "vide" : aucun champ saisi
 * autre que le code suggéré. Utilisé pour ne pas créer d'affaire fantôme.
 */
export function isDraftRowEmpty(row: TableurRow): boolean {
  if (row.affaireId) return false;
  return (
    !row.client.trim() &&
    !row.nom.trim() &&
    !row.charge_affaires_id &&
    !row.date_opportunite &&
    !row.taille &&
    !row.notes &&
    !row.date_pat &&
    !row.date_montage &&
    !row.date_demontage
  );
}

/** Couleurs background subtil par statut (Tailwind tokens neutres). */
export const STATUT_ROW_BG: Record<OpportuniteStatut, string> = {
  a_faire: "bg-muted/30",
  envoye: "bg-blue-50/60 dark:bg-blue-950/20",
  gagne: "bg-emerald-50/60 dark:bg-emerald-950/20",
  perdu: "bg-rose-50/60 dark:bg-rose-950/20",
  termine: "bg-slate-50/60 dark:bg-slate-900/20",
};
