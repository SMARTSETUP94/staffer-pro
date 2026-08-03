/**
 * LOT 7 — Planning par personne (« Qui est où »).
 *
 * Helpers purs de la vue symétrique de la charge atelier :
 *  - lignes = personnes, colonnes = jours (grille principale)
 *  - lignes = chantiers, colonnes = jours (vue inversée)
 *
 * Source du nommage nominatif : `assignations` (reliées à `atelier_planning`
 * par `atelier_planning_id`, mais aussi au chantier directement).
 * Source des indisponibilités : `absences` validées.
 */

export type Slot = "AM" | "PM" | "JOURNEE";

export interface QuiPersonne {
  id: string;
  nom: string;
  prenom: string;
  metier_principal_id: number | null;
}

export interface QuiMetier {
  id: number;
  libelle: string;
  couleur: string;
  ordre: number;
}

export interface QuiAffaire {
  id: string;
  numero: string;
  nom: string;
}

export interface QuiAffectation {
  id: string;
  employe_id: string;
  affaire_id: string;
  date: string;
  demi_journee: Slot;
}

export interface QuiAbsence {
  id: string;
  employe_id: string;
  date_debut: string;
  date_fin: string;
  demi_journee: Slot | null;
  type: "conges" | "formation" | "arret_maladie" | "rtt" | "autre";
}

/** Libellé court affiché dans la cellule d'absence. */
export const ABSENCE_CELL_LABEL: Record<QuiAbsence["type"], string> = {
  conges: "congé",
  formation: "formation",
  arret_maladie: "maladie",
  rtt: "RTT",
  autre: "absent",
};

/* ------------------------------------------------------------------ slots */

/** Deux créneaux se recouvrent-ils ? JOURNEE recouvre tout. */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  if (a === "JOURNEE" || b === "JOURNEE") return true;
  return a === b;
}

/** Poids d'un créneau en jours-personne (JOURNEE = 1, AM/PM = 0,5). */
export function slotWeight(slot: Slot): number {
  return slot === "JOURNEE" ? 1 : 0.5;
}

/* ------------------------------------------------------------- indexation */

export function cellKey(employeId: string, date: string): string {
  return `${employeId}::${date}`;
}

/** Index des affectations par (personne, jour). */
export function buildAffectationIndex(
  affectations: QuiAffectation[],
): Map<string, QuiAffectation[]> {
  const map = new Map<string, QuiAffectation[]>();
  for (const a of affectations) {
    const k = cellKey(a.employe_id, a.date);
    const list = map.get(k);
    if (list) list.push(a);
    else map.set(k, [a]);
  }
  return map;
}

/** Absences validées couvrant (personne, jour). */
export function absencesForCell(
  absences: QuiAbsence[],
  employeId: string,
  date: string,
): QuiAbsence[] {
  return absences.filter(
    (a) => a.employe_id === employeId && date >= a.date_debut && date <= a.date_fin,
  );
}

/* -------------------------------------------------------------- anomalies */

/**
 * Double affectation : deux chantiers DIFFÉRENTS sur des créneaux qui se
 * recouvrent le même jour. Deux lignes du même chantier ne sont pas une
 * anomalie (AM + PM, ou deux objets du même chantier).
 */
export function hasDoubleAffectation(cell: QuiAffectation[]): boolean {
  for (let i = 0; i < cell.length; i++) {
    for (let j = i + 1; j < cell.length; j++) {
      const a = cell[i]!;
      const b = cell[j]!;
      if (a.affaire_id !== b.affaire_id && slotsOverlap(a.demi_journee, b.demi_journee)) {
        return true;
      }
    }
  }
  return false;
}

/** Affecté alors qu'absent : une assignation recouvre une absence validée. */
export function hasAffecteAbsent(cell: QuiAffectation[], absences: QuiAbsence[]): boolean {
  return cell.some((a) =>
    absences.some((abs) => slotsOverlap(a.demi_journee, abs.demi_journee ?? "JOURNEE")),
  );
}

export interface QuiAnomalie {
  employe_id: string;
  date: string;
  type: "double" | "absent";
}

/** Liste complète des anomalies sur la fenêtre affichée. */
export function detectAnomalies(
  personnes: QuiPersonne[],
  dates: string[],
  index: Map<string, QuiAffectation[]>,
  absences: QuiAbsence[],
): QuiAnomalie[] {
  const out: QuiAnomalie[] = [];
  for (const p of personnes) {
    for (const date of dates) {
      const cell = index.get(cellKey(p.id, date));
      if (!cell || cell.length === 0) continue;
      const abs = absencesForCell(absences, p.id, date);
      if (abs.length > 0 && hasAffecteAbsent(cell, abs)) {
        out.push({ employe_id: p.id, date, type: "absent" });
        continue;
      }
      if (hasDoubleAffectation(cell)) {
        out.push({ employe_id: p.id, date, type: "double" });
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- occupation */

export interface OccupationKpis {
  /** Jours-personne ouvrables, absences déduites. */
  joursOuvrables: number;
  /** Jours-personne effectivement affectés (plafonnés à 1 par jour). */
  joursAffectes: number;
  /** Jours-personne disponibles (ouvrables − affectés, jamais négatif). */
  joursDisponibles: number;
  /** Ratio 0 → 1. */
  tauxOccupation: number;
  /** Nombre de personnes ayant au moins une absence sur la fenêtre. */
  personnesEnAbsence: number;
}

/**
 * Taux d'occupation : jours-personne affectés / jours-personne ouvrables.
 * Une journée déjà couverte par une absence ne compte pas comme ouvrable.
 * `dates` ne doit contenir que des jours ouvrés (week-ends/fériés exclus).
 */
export function computeOccupation(
  personnes: QuiPersonne[],
  dates: string[],
  index: Map<string, QuiAffectation[]>,
  absences: QuiAbsence[],
): OccupationKpis {
  let joursOuvrables = 0;
  let joursAffectes = 0;
  const enAbsence = new Set<string>();

  for (const p of personnes) {
    for (const date of dates) {
      const abs = absencesForCell(absences, p.id, date);
      let dispo = 1;
      for (const a of abs) {
        enAbsence.add(p.id);
        dispo -= slotWeight(a.demi_journee ?? "JOURNEE");
      }
      dispo = Math.max(0, dispo);
      joursOuvrables += dispo;

      const cell = index.get(cellKey(p.id, date)) ?? [];
      if (cell.length > 0) {
        const covered = cell.some((a) => a.demi_journee === "JOURNEE")
          ? 1
          : new Set(cell.map((a) => a.demi_journee)).size * 0.5;
        joursAffectes += Math.min(covered, dispo || covered);
      }
    }
  }

  const joursDisponibles = Math.max(0, joursOuvrables - joursAffectes);
  return {
    joursOuvrables: round1(joursOuvrables),
    joursAffectes: round1(joursAffectes),
    joursDisponibles: round1(joursDisponibles),
    tauxOccupation: joursOuvrables > 0 ? joursAffectes / joursOuvrables : 0,
    personnesEnAbsence: enAbsence.size,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ écarts */

export interface EcartEffectifRow {
  metier_id: number;
  libelle: string;
  prevues: number;
  nommees: number;
  aPourvoir: number;
}

/**
 * Écart entre l'effectif prévisionnel anonyme (`atelier_planning.nb_pers`) et
 * le nombre de personnes réellement nommées, par métier, sur la fenêtre.
 */
export function computeEcartEffectif(
  prevu: { metier_id: number; date: string; nb_pers: number }[],
  personnes: QuiPersonne[],
  affectations: QuiAffectation[],
  metiers: QuiMetier[],
): EcartEffectifRow[] {
  const metierOf = new Map(personnes.map((p) => [p.id, p.metier_principal_id]));
  const prevues = new Map<number, number>();
  for (const r of prevu) {
    prevues.set(r.metier_id, (prevues.get(r.metier_id) ?? 0) + (Number(r.nb_pers) || 0));
  }

  const nommeesSet = new Map<number, Set<string>>();
  for (const a of affectations) {
    const mid = metierOf.get(a.employe_id);
    if (mid == null) continue;
    const set = nommeesSet.get(mid) ?? new Set<string>();
    set.add(`${a.employe_id}|${a.date}`);
    nommeesSet.set(mid, set);
  }

  const ids = new Set<number>([...prevues.keys(), ...nommeesSet.keys()]);
  return [...ids]
    .map((id) => {
      const p = prevues.get(id) ?? 0;
      const n = nommeesSet.get(id)?.size ?? 0;
      return {
        metier_id: id,
        libelle: metiers.find((m) => m.id === id)?.libelle ?? `Métier ${id}`,
        prevues: p,
        nommees: n,
        aPourvoir: Math.max(0, p - n),
      };
    })
    .sort((a, b) => b.aPourvoir - a.aPourvoir || a.libelle.localeCompare(b.libelle));
}

/* ------------------------------------------------------------------ filtres */

export interface QuiFilters {
  metierIds: number[];
  affaireIds: string[];
  recherche: string;
  masquerSansAffectation: boolean;
  anomaliesSeulement: boolean;
}

export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Filtrage des personnes affichées dans la grille. */
export function filterPersonnes(
  personnes: QuiPersonne[],
  filters: QuiFilters,
  index: Map<string, QuiAffectation[]>,
  dates: string[],
  anomalieIds: Set<string>,
): QuiPersonne[] {
  const q = normalizeSearch(filters.recherche);
  return personnes.filter((p) => {
    if (filters.metierIds.length > 0 && !filters.metierIds.includes(p.metier_principal_id ?? -1)) {
      return false;
    }
    if (q && !normalizeSearch(`${p.prenom} ${p.nom}`).includes(q)) return false;

    if (filters.anomaliesSeulement && !anomalieIds.has(p.id)) return false;

    if (filters.masquerSansAffectation || filters.affaireIds.length > 0) {
      const affs = dates.flatMap((d) => index.get(cellKey(p.id, d)) ?? []);
      if (filters.masquerSansAffectation && affs.length === 0) return false;
      if (
        filters.affaireIds.length > 0 &&
        !affs.some((a) => filters.affaireIds.includes(a.affaire_id))
      ) {
        return false;
      }
    }
    return true;
  });
}

/* ------------------------------------------------------------------ visuel */

const BAR_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#14b8a6", "#f97316", "#ec4899", "#84cc16",
];

/** Couleur stable d'un chantier (barre de gauche dans la cellule). */
export function affaireColor(affaireId: string): string {
  let h = 0;
  for (let i = 0; i < affaireId.length; i++) h = (h * 31 + affaireId.charCodeAt(i)) >>> 0;
  return BAR_COLORS[h % BAR_COLORS.length]!;
}

/** Nom court d'un chantier pour tenir dans une cellule. */
export function affaireShortLabel(a: QuiAffaire | undefined): string {
  if (!a) return "Chantier";
  const nom = (a.nom ?? "").trim();
  return nom.length > 22 ? `${nom.slice(0, 21)}…` : nom || a.numero;
}

/** Regroupe les personnes par métier principal, dans l'ordre des métiers. */
export function groupByMetier(
  personnes: QuiPersonne[],
  metiers: QuiMetier[],
): { metier: QuiMetier | null; personnes: QuiPersonne[] }[] {
  const groups = new Map<number, QuiPersonne[]>();
  const sansMetier: QuiPersonne[] = [];
  for (const p of personnes) {
    if (p.metier_principal_id == null) sansMetier.push(p);
    else {
      const list = groups.get(p.metier_principal_id) ?? [];
      list.push(p);
      groups.set(p.metier_principal_id, list);
    }
  }
  const out: { metier: QuiMetier | null; personnes: QuiPersonne[] }[] = metiers
    .filter((m) => groups.has(m.id))
    .map((m) => ({
      metier: m as QuiMetier | null,
      personnes: (groups.get(m.id) ?? []).sort((a, b) => a.nom.localeCompare(b.nom)),
    }));
  if (sansMetier.length > 0) out.push({ metier: null, personnes: sansMetier });
  return out;
}

/** Vue inversée : index des personnes présentes par (chantier, jour). */
export function buildAffaireIndex(
  affectations: QuiAffectation[],
): Map<string, QuiAffectation[]> {
  const map = new Map<string, QuiAffectation[]>();
  for (const a of affectations) {
    const k = `${a.affaire_id}::${a.date}`;
    const list = map.get(k);
    if (list) list.push(a);
    else map.set(k, [a]);
  }
  return map;
}

export function formatTaux(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

export function formatJoursPersonne(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
