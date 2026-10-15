/**
 * Planning logistique — types, libellés, couleurs et helpers purs.
 * Les couleurs sont des tokens CSS (`--log-*`) définis dans styles.css.
 */
import { addDays, format, parseISO } from "date-fns";

export const ETAPE_TYPES = [
  "appro", "emballage", "chargement", "livraison", "montage",
  "finitions", "permanence", "demontage", "dechargement",
] as const;
export type EtapeType = (typeof ETAPE_TYPES)[number];

export const ETAPE_LABELS: Record<EtapeType, string> = {
  appro: "Appro",
  emballage: "Emballage",
  chargement: "Chargement",
  livraison: "Livraison",
  montage: "Montage",
  finitions: "Finitions",
  permanence: "Permanence",
  demontage: "Démontage",
  dechargement: "Déchargement",
};

/** Classe Tailwind (fond + texte) par type, adossée aux tokens `--log-*`. */
export const ETAPE_CLASSES: Record<EtapeType, string> = {
  appro: "bg-log-appro text-log-foreground",
  emballage: "bg-log-emballage text-log-foreground",
  chargement: "bg-log-chargement text-log-foreground",
  livraison: "bg-log-livraison text-log-foreground",
  montage: "bg-log-montage text-log-foreground",
  finitions: "bg-log-finitions text-log-foreground",
  permanence: "bg-log-permanence text-log-foreground",
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

/**
 * Conflits véhicule : deux étapes non annulées utilisant le même véhicule
 * sur des périodes qui se chevauchent. Retourne l'ensemble des ids en conflit.
 */
export function conflitsVehicules(etapes: EtapeLite[]): Set<string> {
  const out = new Set<string>();
  const actives = etapes.filter((e) => e.vehicule_id && e.statut !== "annule");
  for (let i = 0; i < actives.length; i++) {
    for (let j = i + 1; j < actives.length; j++) {
      const a = actives[i], b = actives[j];
      if (a.vehicule_id !== b.vehicule_id) continue;
      const aFin = a.date_fin ?? a.date_debut;
      const bFin = b.date_fin ?? b.date_debut;
      if (a.date_debut <= bFin && b.date_debut <= aFin) {
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
