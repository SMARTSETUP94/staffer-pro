/**
 * Rétroplanning logistique en jours ouvrés FR (week-ends + fériés exclus).
 * Complète une liste d'étapes extraites d'un jalonnement avec les étapes
 * amont (appro, emballage, chargement) et aval (déchargement) manquantes.
 */
import { addDays, format, parseISO } from "date-fns";
import { isJourNonOuvreFR } from "@/lib/jours-feries";
import type { EtapeType } from "./etapes";

export interface Delais {
  delai_appro: number;
  delai_emballage: number;
  delai_chargement: number;
  delai_dechargement: number;
}

export const DELAIS_DEFAUT: Delais = { delai_appro: 3, delai_emballage: 2, delai_chargement: 1, delai_dechargement: 1 };

export interface EtapeProposee {
  type: EtapeType;
  date_debut: string;
  date_fin: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  note: string | null;
  origine: "jalonnement" | "retroplanning";
}

/** Décale de `n` jours ouvrés (n négatif = en arrière). n=0 renvoie la date telle quelle. */
export function decalerJoursOuvres(iso: string, n: number): string {
  let d = parseISO(iso);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    d = addDays(d, step);
    if (!isJourNonOuvreFR(format(d, "yyyy-MM-dd"))) left--;
  }
  return format(d, "yyyy-MM-dd");
}

function vide(type: EtapeType, date: string, note: string): EtapeProposee {
  return { type, date_debut: date, date_fin: null, heure_debut: null, heure_fin: null, lieu: null, note, origine: "retroplanning" };
}

/**
 * Règles : chargement = livraison − délai chargement ; emballage = chargement − délai emballage ;
 * appro = emballage − délai appro ; déchargement = démontage (fin) + délai déchargement.
 * La référence aval est la livraison, à défaut le montage.
 */
export function completerRetroplanning(etapes: EtapeProposee[], delais: Delais = DELAIS_DEFAUT): EtapeProposee[] {
  const out = [...etapes];
  const has = (t: EtapeType) => out.some((e) => e.type === t);
  const first = (t: EtapeType) => out.filter((e) => e.type === t).sort((a, b) => a.date_debut.localeCompare(b.date_debut))[0];
  const ref = first("livraison") ?? first("montage");
  if (ref) {
    let base = ref.date_debut;
    if (!has("chargement")) {
      base = decalerJoursOuvres(base, -delais.delai_chargement);
      out.push(vide("chargement", base, `Calculé : livraison − ${delais.delai_chargement} j ouvré`));
    } else base = first("chargement")!.date_debut;
    if (!has("emballage")) {
      base = decalerJoursOuvres(base, -delais.delai_emballage);
      out.push(vide("emballage", base, `Calculé : chargement − ${delais.delai_emballage} j ouvrés`));
    } else base = first("emballage")!.date_debut;
    if (!has("appro")) {
      out.push(vide("appro", decalerJoursOuvres(base, -delais.delai_appro), `Calculé : emballage − ${delais.delai_appro} j ouvrés`));
    }
  }
  const dem = out.filter((e) => e.type === "demontage").sort((a, b) => (b.date_fin ?? b.date_debut).localeCompare(a.date_fin ?? a.date_debut))[0];
  if (dem && !has("dechargement")) {
    out.push(vide("dechargement", decalerJoursOuvres(dem.date_fin ?? dem.date_debut, delais.delai_dechargement), `Calculé : démontage + ${delais.delai_dechargement} j ouvré`));
  }
  return out.sort((a, b) => a.date_debut.localeCompare(b.date_debut));
}
