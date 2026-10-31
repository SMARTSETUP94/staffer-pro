/** Charge bureau d'étude issue du devis : proposition de période et alerte (fonctions pures). */
import { isJourNonOuvreFR } from "@/lib/jours-feries";

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Nombre de jours ouvrés (FR) entre deux dates incluses. */
export function joursOuvres(debut: string, fin: string): number {
  let n = 0;
  for (let d = debut; d <= fin; d = addDays(d, 1)) if (!isJourNonOuvreFR(d)) n++;
  return n;
}

/**
 * Propose N jours ouvrés (N arrondi au jour supérieur) se terminant la veille de la date butoir
 * (début de fabrication, sinon montage). Sans butoir, la période commence au premier jour ouvré dès aujourd'hui.
 */
export function proposerPeriodeBe(jours: number, butoir: string | null, aujourdhui: string): { debut: string; fin: string } {
  const n = Math.max(1, Math.ceil(jours));
  if (butoir) {
    let fin = addDays(butoir, -1);
    while (isJourNonOuvreFR(fin)) fin = addDays(fin, -1);
    let debut = fin, c = 1;
    while (c < n) { debut = addDays(debut, -1); if (!isJourNonOuvreFR(debut)) c++; }
    return { debut, fin };
  }
  let debut = aujourdhui;
  while (isJourNonOuvreFR(debut)) debut = addDays(debut, 1);
  let fin = debut, c = 1;
  while (c < n) { fin = addDays(fin, 1); if (!isJourNonOuvreFR(fin)) c++; }
  return { debut, fin };
}

/** Alerte si aucune période concepteur, ou si les jours ouvrés planifiés sont inférieurs à la charge. */
export function alerteChargeBe(joursBe: number, periodes: { date_debut: string | null; date_fin: string | null }[]): "aucune_periode" | "trop_courte" | null {
  const valides = periodes.filter((p) => p.date_debut);
  if (valides.length === 0) return "aucune_periode";
  const planifie = valides.reduce((s, p) => s + joursOuvres(p.date_debut!, p.date_fin ?? p.date_debut!), 0);
  return planifie < joursBe ? "trop_courte" : null;
}
