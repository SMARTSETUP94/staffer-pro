/**
 * Planning logistique — types, libellés, couleurs et helpers purs.
 * Les couleurs sont des tokens CSS (`--log-*`) définis dans styles.css.
 */
import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";

export const ETAPE_TYPES = [
  "appro", "emballage", "chargement", "livraison", "tracage", "montage",
  "finitions", "permanence", "rotation", "demontage", "dechargement",
] as const;
export type EtapeType = (typeof ETAPE_TYPES)[number];

export const ETAPE_LABELS: Record<EtapeType, string> = {
  appro: "Appro",
  emballage: "Emballage",
  chargement: "Chargement",
  livraison: "Livraison",
  tracage: "Traçage",
  montage: "Montage",
  finitions: "Finitions",
  permanence: "Permanence",
  rotation: "Rotation",
  demontage: "Démontage",
  dechargement: "Déchargement",
};

/** Classe Tailwind (fond + texte) par type, adossée aux tokens `--log-*`. */
export const ETAPE_CLASSES: Record<EtapeType, string> = {
  appro: "bg-log-appro text-log-foreground",
  emballage: "bg-log-emballage text-log-foreground",
  chargement: "bg-log-chargement text-log-foreground",
  livraison: "bg-log-livraison text-log-foreground",
  tracage: "bg-log-tracage text-log-foreground",
  montage: "bg-log-montage text-log-foreground",
  finitions: "bg-log-finitions text-log-foreground",
  permanence: "bg-log-permanence text-log-foreground",
  rotation: "bg-log-rotation text-log-foreground",
  demontage: "bg-log-demontage text-log-foreground",
  dechargement: "bg-log-dechargement text-log-foreground",
};

export interface EtapeLite {
  id: string;
  affaire_id: string;
  type: EtapeType;
  date_debut: string;
  date_fin: string | null;
  vehicule_id: string | null;
  statut: string;
  heure_debut?: string | null;
  heure_fin?: string | null;
}

/** Vrai si l'étape couvre le jour ISO `day` (AAAA-MM-JJ). */
export function etapeCouvreJour(e: Pick<EtapeLite, "date_debut" | "date_fin">, day: string): boolean {
  const fin = e.date_fin ?? e.date_debut;
  return e.date_debut <= day && day <= fin;
}

/** Liste des jours ISO de `start` sur `n` jours. */
export function joursIso(start: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"));
}

/** Calendrier d'un chantier : uniquement les dates couvertes, sans étapes annulées. */
export function calendrierChantier<T extends Pick<EtapeLite, "affaire_id" | "date_debut" | "date_fin" | "statut"> & { heure_debut?: string | null }>(etapes: T[], affaireId: string): { date: string; etapes: T[] }[] {
  const jours = new Map<string, T[]>();
  for (const e of etapes) {
    if (e.affaire_id !== affaireId || e.statut === "annule") continue;
    const fin = e.date_fin && e.date_fin >= e.date_debut ? e.date_fin : e.date_debut;
    for (const date of eachDayOfInterval({ start: parseISO(e.date_debut), end: parseISO(fin) })) {
      const key = format(date, "yyyy-MM-dd");
      const list = jours.get(key) ?? [];
      list.push(e);
      jours.set(key, list);
    }
  }
  return [...jours].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
    date,
    etapes: rows.sort((a, b) => (a.heure_debut ?? "").localeCompare(b.heure_debut ?? "")),
  }));
}

/**
 * Conflits véhicule : deux étapes non annulées de chantiers DIFFÉRENTS utilisant
 * le même véhicule sur des créneaux qui se chevauchent réellement.
 * - Deux étapes d'un même chantier ne sont jamais en conflit entre elles.
 * - Sans heure de début : début de journée ; sans heure de fin : fin de journée.
 * - Des créneaux qui se touchent (fin = début) ne se chevauchent pas.
 * Règle unique partagée par le planning logistique et le connecteur Claude.
 */
export function creneauEtape(e: Pick<EtapeLite, "date_debut" | "date_fin" | "heure_debut" | "heure_fin">): [string, string] {
  const hm = (h: string | null | undefined, fallback: string) => (h ? h.slice(0, 5) : fallback);
  const fin = e.date_fin && e.date_fin >= e.date_debut ? e.date_fin : e.date_debut;
  return [`${e.date_debut}T${hm(e.heure_debut, "00:00")}`, `${fin}T${hm(e.heure_fin, "24:00")}`];
}

export function conflitsVehicules(etapes: EtapeLite[]): Set<string> {
  const out = new Set<string>();
  const actives = etapes.filter((e) => e.vehicule_id && e.statut !== "annule");
  for (let i = 0; i < actives.length; i++) {
    for (let j = i + 1; j < actives.length; j++) {
      const a = actives[i], b = actives[j];
      if (a.vehicule_id !== b.vehicule_id || a.affaire_id === b.affaire_id) continue;
      const [aDeb, aFin] = creneauEtape(a);
      const [bDeb, bFin] = creneauEtape(b);
      if (aDeb < bFin && bDeb < aFin) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}

/** Décale une étape de `deltaJours` en conservant sa durée. */
export function decalerEtape(
  e: Pick<EtapeLite, "date_debut" | "date_fin">,
  deltaJours: number,
): { date_debut: string; date_fin: string | null } {
  const d = (s: string) => format(addDays(parseISO(s), deltaJours), "yyyy-MM-dd");
  return { date_debut: d(e.date_debut), date_fin: e.date_fin ? d(e.date_fin) : null };
}

export function heureCourte(h: string | null | undefined): string | null {
  if (!h) return null;
  return h.slice(0, 5).replace(":", "h");
}

/** Affichage court du nombre de personnes : 4 → "4p". */
export function nbPersonnesCourt(n: number | null | undefined): string | null {
  return n && n > 0 ? `${n}p` : null;
}
