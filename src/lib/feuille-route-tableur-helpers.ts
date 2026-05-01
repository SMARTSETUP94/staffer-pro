/**
 * v0.33 — Helpers pour la Vue Tableur Feuille de Route.
 *
 * Patterns réutilisés depuis opportunites-tableur-helpers.ts :
 *   - mergeRowOverlay : overlay optimistic UI (debounce 800ms)
 *   - applyTableurFilters : filtre client + recherche fuzzy
 *
 * Sources de données combinées par ligne (date × affaire) :
 *   - affaires : code, nom, lieu (statut filtré "actif")
 *   - feuille_route_lignes : overrides planificateur
 *   - assignations : staffés ce jour (au moins 1 → la ligne existe)
 *   - trajets : véhicules réels ce jour (pour badge discordance)
 *   - resolveResponsable : responsable calculé (helper v0.21)
 *
 * MVP véhicules :
 *   - vehicules_ids[] est write-only depuis le tableur (ligne plan)
 *   - badge ⚠️ si discordance avec trajets réels (lecture seule depuis trajets)
 *   - PAS de création/suppression auto de trajets
 */

import { addDays, format } from "date-fns";
import type {
  AffaireForResponsable,
  AssignationForResponsable,
  EmployeForResponsable,
  ResponsableSource,
} from "@/lib/feuille-route-helpers";
import { resolveResponsable } from "@/lib/feuille-route-helpers";
import { normalizeName } from "@/lib/string-normalize";
import {
  getAffaireTypologie,
  type AffaireTypologie,
} from "@/lib/affaire-typologie";

/** Types d'opération métier (cf. TYPE_OPERATION_OPTIONS dans feuille-route-helpers.ts).
 *  Liste figée v0.33 spec — 8 valeurs pour le select inline. */
export const TYPE_OPERATION_OPTIONS = [
  "Montage",
  "Démontage",
  "Rotation",
  "Traçage",
  "Finition",
  "Chargement",
  "Déchargement",
  "Permanence",
] as const;
export type TypeOperationFR = (typeof TYPE_OPERATION_OPTIONS)[number];

/** Colonnes du tableur Feuille de Route, dans l'ordre Tab. */
export const FR_TABLEUR_COLUMNS = [
  "date", // lecture seule
  "code", // lecture seule (lien vers affaire)
  "typologie_future", // éditable (TypologieFutureSelect)
  "nom_chantier", // lecture seule (depuis affaires.nom)
  "adresse_override", // éditable texte libre
  "responsable", // lecture seule (resolveResponsable)
  "type_operation", // éditable select
  "horaire_rdv", // éditable HH:MM
  "vehicules", // éditable multi-select (write-only)
  "commentaires", // éditable textarea
] as const;
export type FRTableurColumnKey = (typeof FR_TABLEUR_COLUMNS)[number];

/** Source de données minimale par ligne (jour × affaire). */
export interface FRLigneOverride {
  id: string;
  date: string; // yyyy-MM-dd
  affaire_id: string;
  type_operation: string | null;
  horaire_rdv: string | null; // HH:MM:SS ou HH:MM
  adresse_override: string | null;
  commentaires: string | null;
  vehicules_ids: string[];
}

/** Affaire enrichie pour le tableur (subset). */
export interface FRTableurAffaire extends AffaireForResponsable {
  numero: string;
  nom: string;
  lieu: string | null;
  statut: "prospect" | "en_cours" | "termine" | "annule";
  typologie_future: AffaireTypologie | null;
}

/** Trajet enrichi (subset utile pour la vue). */
export interface FRTableurTrajet {
  date: string;
  affaire_id: string | null;
  vehicule_id: string | null;
}

/** Ligne finale affichée dans le tableau (1 ligne par date×affaire). */
export interface FRTableurRow {
  /** id stable pour key React : `${date}|${affaire_id}` */
  id: string;
  /** id BDD de l'override si la ligne a déjà été modifiée, sinon null */
  overrideId: string | null;
  date: string;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  affaire_lieu: string | null;
  /** Typologie courante calculée depuis numero (lecture). */
  typologie_courante: AffaireTypologie | null;
  /** Typologie future éditable (champ affaires.typologie_future). */
  typologie_future: AffaireTypologie | null;
  type_operation: string | null;
  horaire_rdv: string | null;
  adresse_override: string | null;
  /** Adresse affichée = override ?? affaire.lieu */
  adresse_affichee: string | null;
  commentaires: string | null;
  vehicules_ids: string[];
  /** Véhicules réellement utilisés ce jour (depuis trajets). */
  vehicules_reels_ids: string[];
  /** True si vehicules_ids != vehicules_reels_ids (badge ⚠️). */
  vehicules_discordance: boolean;
  /** Responsable calculé. */
  responsable_id: string | null;
  responsable_label: string;
  responsable_source: ResponsableSource;
  /** Au moins 1 assignation ce jour (sinon ligne "fantôme" si override existe). */
  staffe: boolean;
}

/** Filtres haut de tableau. */
export interface FRTableurFilters {
  search: string;
  typologies: AffaireTypologie[];
  /** Si non-null, restreint aux affaires de cet ensemble. */
  affaireIds: Set<string> | null;
}

/* ============================================================
 * Construction des lignes
 * ============================================================ */

/** Génère la liste des dates yyyy-MM-dd pour la fenêtre [start, start + nbDays). */
export function buildDateWindow(start: Date, nbDays: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < nbDays; i++) {
    out.push(format(addDays(start, i), "yyyy-MM-dd"));
  }
  return out;
}

/** Vérifie si une affaire est "active" (en_cours ou prospect, hors terminé/annulé). */
export function isAffaireActive(statut: FRTableurAffaire["statut"]): boolean {
  return statut === "en_cours" || statut === "prospect";
}

/** Calcule label responsable depuis resolveResponsable. */
export function buildResponsableLabel(
  responsableId: string | null,
  source: ResponsableSource,
  employes: Array<{ id: string; prenom: string; nom: string }>,
  profiles: Map<string, { full_name: string | null }>,
): string {
  if (!responsableId) return "—";
  if (source === "chef_du_jour" || source === "manutention") {
    const e = employes.find((x) => x.id === responsableId);
    return e ? `${e.prenom} ${e.nom}` : "—";
  }
  // chef_projet / charge_affaires : id = profile_id
  const p = profiles.get(responsableId);
  return p?.full_name ?? "—";
}

export interface BuildRowsParams {
  dates: string[];
  affaires: FRTableurAffaire[];
  assignations: AssignationForResponsable[];
  overrides: FRLigneOverride[];
  trajets: FRTableurTrajet[];
  employes: Array<{ id: string; prenom: string; nom: string }>;
  employesParId: Map<string, EmployeForResponsable>;
  profiles: Map<string, { full_name: string | null }>;
}

/**
 * Construit les lignes du tableur.
 * Règle d'inclusion : on affiche une ligne (date × affaire) si :
 *   - l'affaire est ACTIVE (en_cours OU prospect)
 *   - ET (au moins 1 assignation ce jour OU un override existe)
 *
 * Trié par date ASC, puis par numero ASC (numérique).
 */
export function buildFRTableurRows(params: BuildRowsParams): FRTableurRow[] {
  const {
    dates,
    affaires,
    assignations,
    overrides,
    trajets,
    employes,
    employesParId,
    profiles,
  } = params;

  const dateSet = new Set(dates);
  const activeAffaires = affaires.filter((a) => isAffaireActive(a.statut));
  const affaireById = new Map(activeAffaires.map((a) => [a.id, a]));

  // Index : (date|affaire) -> override
  const overrideIndex = new Map<string, FRLigneOverride>();
  for (const o of overrides) {
    if (!dateSet.has(o.date)) continue;
    overrideIndex.set(`${o.date}|${o.affaire_id}`, o);
  }

  // Index : (date|affaire) -> assignations[]
  const asgIndex = new Map<string, AssignationForResponsable[]>();
  for (const a of assignations) {
    if (!dateSet.has(a.date)) continue;
    if (!affaireById.has(a.affaire_id)) continue;
    const k = `${a.date}|${a.affaire_id}`;
    const arr = asgIndex.get(k) ?? [];
    arr.push(a);
    asgIndex.set(k, arr);
  }

  // Index : (date|affaire) -> vehicules_reels[]
  const trajetIndex = new Map<string, Set<string>>();
  for (const t of trajets) {
    if (!t.affaire_id || !t.vehicule_id) continue;
    if (!dateSet.has(t.date)) continue;
    const k = `${t.date}|${t.affaire_id}`;
    const set = trajetIndex.get(k) ?? new Set<string>();
    set.add(t.vehicule_id);
    trajetIndex.set(k, set);
  }

  // Génération des lignes
  const rows: FRTableurRow[] = [];
  const seenKeys = new Set<string>();

  for (const date of dates) {
    for (const aff of activeAffaires) {
      const key = `${date}|${aff.id}`;
      const asgs = asgIndex.get(key) ?? [];
      const ov = overrideIndex.get(key) ?? null;
      if (asgs.length === 0 && !ov) continue; // ni staffé ni override → pas de ligne
      seenKeys.add(key);

      const resp = resolveResponsable(aff, date, asgs, employesParId);
      const respLabel = buildResponsableLabel(
        resp.id,
        resp.source,
        employes,
        profiles,
      );
      const vehiclesReels = trajetIndex.get(key) ?? new Set<string>();
      const vehiclesPlan = ov?.vehicules_ids ?? [];
      const discordance = !sameSet(vehiclesPlan, vehiclesReels);

      rows.push({
        id: key,
        overrideId: ov?.id ?? null,
        date,
        affaire_id: aff.id,
        affaire_numero: aff.numero,
        affaire_nom: aff.nom,
        affaire_lieu: aff.lieu,
        typologie_courante: getAffaireTypologie(aff.numero),
        typologie_future: aff.typologie_future ?? null,
        type_operation: ov?.type_operation ?? null,
        horaire_rdv: normalizeHoraire(ov?.horaire_rdv ?? null),
        adresse_override: ov?.adresse_override ?? null,
        adresse_affichee: ov?.adresse_override ?? aff.lieu,
        commentaires: ov?.commentaires ?? null,
        vehicules_ids: vehiclesPlan,
        vehicules_reels_ids: Array.from(vehiclesReels),
        vehicules_discordance: discordance,
        responsable_id: resp.id,
        responsable_label: respLabel,
        responsable_source: resp.source,
        staffe: asgs.length > 0,
      });
    }
  }

  // Tri : date ASC, puis numero (numérique localisé)
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.affaire_numero.localeCompare(b.affaire_numero, "fr", {
      numeric: true,
    });
  });

  return rows;
}

/** Normalise un horaire BDD (HH:MM:SS ou HH:MM) → HH:MM pour input type="time". */
export function normalizeHoraire(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{2}):(\d{2})/.exec(raw);
  return m ? `${m[1]}:${m[2]}` : raw;
}

/** True si deux ensembles d'IDs (array vs Set) contiennent les mêmes éléments. */
export function sameSet(a: string[], b: Set<string>): boolean {
  if (a.length !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/* ============================================================
 * Filtres + recherche
 * ============================================================ */

export function applyFRTableurFilters(
  rows: FRTableurRow[],
  filters: FRTableurFilters,
): FRTableurRow[] {
  return rows.filter((r) => {
    if (filters.affaireIds && !filters.affaireIds.has(r.affaire_id)) {
      return false;
    }
    if (filters.typologies.length > 0) {
      // Match sur typologie_future si défini, sinon typologie_courante
      const t = r.typologie_future ?? r.typologie_courante;
      if (!t || !filters.typologies.includes(t)) return false;
    }
    if (!fuzzySearchFR(r, filters.search)) return false;
    return true;
  });
}

export function fuzzySearchFR(row: FRTableurRow, query: string): boolean {
  if (!query.trim()) return true;
  const q = normalizeName(query);
  const haystack = normalizeName(
    [
      row.affaire_numero,
      row.affaire_nom,
      row.affaire_lieu ?? "",
      row.adresse_override ?? "",
      row.responsable_label,
      row.commentaires ?? "",
      row.type_operation ?? "",
    ].join(" "),
  );
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((token: string) => haystack.includes(token));
}

/* ============================================================
 * Overlay optimistic (calque opportunites-tableur-helpers)
 * ============================================================ */

/** Patch partiel sur une ligne (clé = id `${date}|${affaire_id}`). */
export type FROverlayPatch = Partial<
  Pick<
    FRTableurRow,
    | "type_operation"
    | "horaire_rdv"
    | "adresse_override"
    | "commentaires"
    | "vehicules_ids"
    | "typologie_future"
  >
>;

export function mergeFRRowOverlay(
  serverRow: FRTableurRow,
  overlay: FROverlayPatch | undefined,
): FRTableurRow {
  if (!overlay || Object.keys(overlay).length === 0) return serverRow;
  const merged = { ...serverRow, ...overlay };
  // Recalcule adresse_affichee si adresse_override patchée
  if ("adresse_override" in overlay) {
    merged.adresse_affichee = overlay.adresse_override ?? serverRow.affaire_lieu;
  }
  return merged;
}

/** Validation HH:MM (vide accepté = effacement). */
export function isValidHoraire(value: string): boolean {
  if (value === "") return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Construit un patch JSON pour l'RPC upsert_feuille_route_ligne. */
export function buildUpsertPatch(overlay: FROverlayPatch): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ("type_operation" in overlay) patch.type_operation = overlay.type_operation ?? "";
  if ("horaire_rdv" in overlay) patch.horaire_rdv = overlay.horaire_rdv ?? "";
  if ("adresse_override" in overlay)
    patch.adresse_override = overlay.adresse_override ?? "";
  if ("commentaires" in overlay) patch.commentaires = overlay.commentaires ?? "";
  if ("vehicules_ids" in overlay) patch.vehicules_ids = overlay.vehicules_ids ?? [];
  return patch;
}
