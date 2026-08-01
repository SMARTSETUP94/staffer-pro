/**
 * LOT 4 — Helpers purs de la grille de fabrication.
 *
 * Source de vérité des heures : table `objet_heures_metier` (LOT 3).
 * Les colonnes `fabrication_objets.heures_prevues_*` sont un cache maintenu
 * par le trigger SQL `sync_objet_heures_colonnes()` — on ne les écrit jamais ici.
 *
 * Règle : les heures vivent TOUJOURS sur l'objet, jamais sur le lot.
 */

export type OrigineHeure = "devis" | "ajout";

export interface GrilleMetier {
  id: number;
  code: string;
  libelle: string;
  ordre: number;
  couleur: string | null;
}

export interface GrilleObjet {
  id: string;
  reference: string;
  nom: string;
  ordre: number;
  lot_id: string | null;
}

export interface GrilleLot {
  id: string;
  nom: string;
  ordre: number;
  couleur: string | null;
}

export interface GrilleCell {
  id: string;
  objet_id: string;
  metier_id: number;
  heures_prevues: number;
  origine: OrigineHeure;
  note: string | null;
  sous_traitance: boolean;
}

/** Clé d'indexation d'une cellule (objet × métier). */
export function cellKey(objetId: string, metierId: number): string {
  return `${objetId}::${metierId}`;
}

/** Index cellule par (objet, métier) pour un accès O(1) au rendu. */
export function buildCellIndex(cells: GrilleCell[]): Map<string, GrilleCell> {
  const map = new Map<string, GrilleCell>();
  for (const c of cells) map.set(cellKey(c.objet_id, c.metier_id), c);
  return map;
}

/** Total des heures prévues d'un objet, tous métiers confondus. */
export function totalObjet(cells: GrilleCell[], objetId: string): number {
  return round2(
    cells.reduce((acc, c) => (c.objet_id === objetId ? acc + c.heures_prevues : acc), 0),
  );
}

/** Total des heures prévues par métier : { metier_id: heures }. */
export function totauxParMetier(cells: GrilleCell[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const c of cells) out[c.metier_id] = round2((out[c.metier_id] ?? 0) + c.heures_prevues);
  return out;
}

/** Total général de la grille. */
export function totalGeneral(cells: GrilleCell[]): number {
  return round2(cells.reduce((acc, c) => acc + c.heures_prevues, 0));
}

/**
 * Écart vs devis, par métier : prévu - devis.
 * Positif = on dépasse le devis. Couvre les métiers présents des deux côtés.
 */
export function ecartVsDevis(
  totauxPrevus: Record<number, number>,
  totauxDevis: Record<number, number>,
): Record<number, number> {
  const out: Record<number, number> = {};
  const ids = new Set<number>([
    ...Object.keys(totauxPrevus).map(Number),
    ...Object.keys(totauxDevis).map(Number),
  ]);
  for (const id of ids) out[id] = round2((totauxPrevus[id] ?? 0) - (totauxDevis[id] ?? 0));
  return out;
}

/** Ids des objets sans aucune heure sur aucun métier → badge « À compléter ». */
export function objetsACompleter(objets: GrilleObjet[], cells: GrilleCell[]): string[] {
  const withHours = new Set<string>();
  for (const c of cells) if (c.heures_prevues > 0) withHours.add(c.objet_id);
  return objets.filter((o) => !withHours.has(o.id)).map((o) => o.id);
}

/** Somme des heures hors devis (origine = 'ajout') — chiffrable en supplément. */
export function totalHorsDevis(cells: GrilleCell[]): number {
  return round2(
    cells.reduce((acc, c) => (c.origine === "ajout" ? acc + c.heures_prevues : acc), 0),
  );
}

/**
 * Origine consolidée d'un objet : « ajout » si au moins une cellule est un ajout,
 * « devis » s'il a des cellules toutes issues du devis, null s'il n'a aucune ligne.
 */
export function objetOrigine(cells: GrilleCell[], objetId: string): OrigineHeure | null {
  const own = cells.filter((c) => c.objet_id === objetId);
  if (own.length === 0) return null;
  return own.some((c) => c.origine === "ajout") ? "ajout" : "devis";
}

/** true si au moins une cellule de l'objet est en sous-traitance. */
export function objetSousTraitance(cells: GrilleCell[], objetId: string): boolean {
  return cells.some((c) => c.objet_id === objetId && c.sous_traitance);
}

/**
 * Métiers à afficher en colonnes : ceux ayant au moins une ligne sur l'affaire,
 * triés par `metiers.ordre`. `showAll` renvoie tous les métiers.
 */
export function metiersVisibles(
  metiers: GrilleMetier[],
  cells: GrilleCell[],
  showAll = false,
): GrilleMetier[] {
  const sorted = [...metiers].sort((a, b) => a.ordre - b.ordre);
  if (showAll) return sorted;
  const actifs = new Set(cells.map((c) => c.metier_id));
  return sorted.filter((m) => actifs.has(m.id));
}

export interface LotGroup {
  lot: GrilleLot | null;
  objets: GrilleObjet[];
}

/** Groupe les objets par lot (lots triés par `ordre`, puis les objets sans lot). */
export function groupObjetsByLot(objets: GrilleObjet[], lots: GrilleLot[]): LotGroup[] {
  const byOrdre = (a: GrilleObjet, b: GrilleObjet) =>
    a.ordre - b.ordre || a.nom.localeCompare(b.nom);
  const groups: LotGroup[] = [];
  for (const lot of [...lots].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom))) {
    const items = objets.filter((o) => o.lot_id === lot.id).sort(byOrdre);
    if (items.length > 0) groups.push({ lot, objets: items });
  }
  const orphelins = objets.filter((o) => !o.lot_id || !lots.some((l) => l.id === o.lot_id));
  if (orphelins.length > 0) groups.push({ lot: null, objets: orphelins.sort(byOrdre) });
  return groups;
}

/**
 * Pré-remplissage non destructif depuis le devis : ne renvoie que les couples
 * (objet, métier) sans ligne existante, en répartissant les heures du devis
 * à parts égales entre les objets du devis concerné.
 */
export interface PrefillLine {
  objet_id: string;
  metier_id: number;
  heures_prevues: number;
}

export function computePrefillLines(
  objets: GrilleObjet[],
  cells: GrilleCell[],
  devisTotaux: Record<number, number>,
): PrefillLine[] {
  if (objets.length === 0) return [];
  const index = buildCellIndex(cells);
  const out: PrefillLine[] = [];
  for (const [metierIdRaw, total] of Object.entries(devisTotaux)) {
    const metierId = Number(metierIdRaw);
    if (!(total > 0)) continue;
    const cibles = objets.filter((o) => !index.has(cellKey(o.id, metierId)));
    if (cibles.length === 0) continue;
    const part = round2(total / objets.length);
    for (const o of cibles) out.push({ objet_id: o.id, metier_id: metierId, heures_prevues: part });
  }
  return out;
}

/** Arrondi 2 décimales, sans notation exponentielle parasite. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Formate des heures pour l'affichage : « 12 h », « 12,5 h », « · » si 0. */
export function formatHeures(n: number | null | undefined): string {
  if (n == null || n === 0) return "·";
  const r = round2(n);
  return `${Number.isInteger(r) ? r : r.toString().replace(".", ",")} h`;
}

/** Parse une saisie utilisateur d'heures (« 12,5 », « 12.5 »), null si invalide. */
export function parseHeures(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".").replace(/\s/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}
