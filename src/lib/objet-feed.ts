/**
 * LOT A — Fil chronologique unique de la fiche objet.
 *
 * Fusionne trois sources (événements auto-loggés `objet_journal_events`,
 * commentaires `objet_commentaires`, photos `fabrication_objets_photos`)
 * en une seule timeline triée du plus récent au plus ancien.
 *
 * Helpers purs : testés dans `src/lib/__tests__/objet-feed.test.ts`.
 */

export type ObjetFeedKind = "event" | "commentaire" | "photo";

export interface RawJournalEvent {
  id: string;
  event_type: string;
  occurred_at: string;
  actor_id: string | null;
  actor_label: string | null;
  metier_id: number | null;
  etape_id: string | null;
  payload: unknown;
}

export interface RawCommentaire {
  id: string;
  content: string;
  author_id: string | null;
  author_label?: string | null;
  etape_id: string | null;
  created_at: string;
}

export interface RawPhoto {
  id: string;
  storage_path: string;
  thumb_path: string | null;
  commentaire: string | null;
  etape_id: string | null;
  uploaded_by: string | null;
  uploader_label?: string | null;
  uploaded_at: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  signed_url?: string | null;
  thumb_url?: string | null;
}

export interface ObjetFeedEntry {
  /** Clé unique dans le fil (préfixée par le type de source). */
  key: string;
  id: string;
  kind: ObjetFeedKind;
  /** Date ISO utilisée pour le tri. */
  at: string;
  actorLabel: string | null;
  /** Type d'événement (`etape_validee`, `plan_publie`, …) ou `commentaire` / `photo`. */
  eventType: string;
  etapeId: string | null;
  content: string | null;
  photo: RawPhoto | null;
  payload: unknown;
}

/** Catégories de filtre proposées au-dessus du fil. */
export type ObjetFeedFilter =
  | "all"
  | "etapes"
  | "photos"
  | "commentaires"
  | "plan"
  | "equipe";

export const OBJET_FEED_FILTER_LABELS: Record<ObjetFeedFilter, string> = {
  all: "Tout",
  etapes: "Étapes",
  photos: "Photos",
  commentaires: "Commentaires",
  plan: "Plan",
  equipe: "Équipe",
};

const FILTER_EVENT_TYPES: Record<Exclude<ObjetFeedFilter, "all">, string[]> = {
  etapes: ["etape_validee", "etape_invalidee", "etape_statut_change"],
  photos: ["photo", "photo_uploaded", "photo_supprimee"],
  commentaires: ["commentaire", "commentaire_supprime"],
  plan: ["plan_publie", "plan_republie", "identite_modifiee"],
  equipe: ["personne_assignee", "personne_retiree", "presence_modifiee"],
};

export function mergeObjetFeed(args: {
  events: RawJournalEvent[];
  commentaires: RawCommentaire[];
  photos: RawPhoto[];
}): ObjetFeedEntry[] {
  const entries: ObjetFeedEntry[] = [];

  for (const e of args.events) {
    entries.push({
      key: `event:${e.id}`,
      id: e.id,
      kind: "event",
      at: e.occurred_at,
      actorLabel: e.actor_label ?? null,
      eventType: e.event_type,
      etapeId: e.etape_id ?? null,
      content: null,
      photo: null,
      payload: e.payload ?? null,
    });
  }

  for (const c of args.commentaires) {
    entries.push({
      key: `commentaire:${c.id}`,
      id: c.id,
      kind: "commentaire",
      at: c.created_at,
      actorLabel: c.author_label ?? null,
      eventType: "commentaire",
      etapeId: c.etape_id ?? null,
      content: c.content,
      photo: null,
      payload: null,
    });
  }

  for (const p of args.photos) {
    entries.push({
      key: `photo:${p.id}`,
      id: p.id,
      kind: "photo",
      at: p.uploaded_at,
      actorLabel: p.uploader_label ?? null,
      eventType: "photo",
      etapeId: p.etape_id ?? null,
      content: p.commentaire ?? null,
      photo: p,
      payload: null,
    });
  }

  return entries.sort((a, b) => {
    const d = safeTime(b.at) - safeTime(a.at);
    return d !== 0 ? d : a.key.localeCompare(b.key);
  });
}

function safeTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Les événements auto-loggés `commentaire` / `photo_uploaded` doublonnent
 * l'entrée portée par le contenu lui-même : on masque l'événement quand la
 * ressource correspondante est déjà présente dans le fil.
 */
export function dedupeObjetFeed(entries: ObjetFeedEntry[]): ObjetFeedEntry[] {
  const hasCommentaires = entries.some((e) => e.kind === "commentaire");
  const hasPhotos = entries.some((e) => e.kind === "photo");
  return entries.filter((e) => {
    if (e.kind !== "event") return true;
    if (hasCommentaires && e.eventType === "commentaire") return false;
    if (hasPhotos && e.eventType === "photo_uploaded") return false;
    return true;
  });
}

export function filterObjetFeed(
  entries: ObjetFeedEntry[],
  filter: ObjetFeedFilter,
): ObjetFeedEntry[] {
  if (filter === "all") return entries;
  const allowed = FILTER_EVENT_TYPES[filter];
  return entries.filter((e) => allowed.includes(e.eventType));
}

/** Regroupe les photos par étape (clé `null` = « Sans étape »). */
export function groupPhotosByEtape(
  photos: RawPhoto[],
): { etapeId: string | null; photos: RawPhoto[] }[] {
  const map = new Map<string, RawPhoto[]>();
  for (const p of photos) {
    const k = p.etape_id ?? "";
    const arr = map.get(k) ?? [];
    arr.push(p);
    map.set(k, arr);
  }
  return [...map.entries()]
    .map(([k, list]) => ({
      etapeId: k === "" ? null : k,
      photos: list.sort((a, b) => safeTime(b.uploaded_at) - safeTime(a.uploaded_at)),
    }))
    .sort((a, b) => {
      if (a.etapeId === null) return 1;
      if (b.etapeId === null) return -1;
      return a.etapeId.localeCompare(b.etapeId);
    });
}

export interface PlanTechniqueState {
  plan_url: string | null;
  plan_publie_le: string | null;
  plan_publie_par: string | null;
}

/** Statut lisible du plan technique — jamais bloquant, purement informatif. */
export function planTechniqueStatut(
  state: PlanTechniqueState | null | undefined,
  hasDocument: boolean,
): { publie: boolean; mode: "lien" | "document" | null; label: string } {
  if (state?.plan_url) {
    return { publie: true, mode: "lien", label: "Plan publié (lien externe)" };
  }
  if (hasDocument) {
    return { publie: true, mode: "document", label: "Plan publié (PDF déposé)" };
  }
  return { publie: false, mode: null, label: "Plan non publié" };
}

/** Normalise et valide un lien externe collé par le bureau d'étude. */
export function normalizePlanUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
