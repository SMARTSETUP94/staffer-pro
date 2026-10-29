import { etapeCouvreJour } from "./etapes";

/** Champs minimaux nécessaires au regroupement des étapes d'un même chantier. */
export interface EtapeGroupable {
  id: string;
  affaire_id: string;
  date_debut: string;
  date_fin: string | null;
  statut: string;
  heure_debut?: string | null;
  heure_fin?: string | null;
  responsable?: string | null;
}

/** Au-delà de ce nombre d'étapes, l'encart est replié par défaut. */
export const REGROUPEMENT_SEUIL_REPLI = 3;

export type BlocJour<T> =
  | { kind: "seule"; etape: T }
  | {
      kind: "groupe";
      key: string;
      affaireId: string;
      etapes: T[];
      plage: string | null;
      responsables: string[];
      conflit: boolean;
      propose: boolean;
      annule: boolean;
    };

const hm = (h: string | null | undefined) => (h ? h.slice(0, 5) : null);

/** "06:00" → "06h", "06:45" → "06h45". */
export function heurePlage(h: string | null | undefined): string | null {
  const v = hm(h);
  if (!v) return null;
  const [H, M] = v.split(":");
  return M === "00" ? `${H}h` : `${H}h${M}`;
}

/** Tri par heure de début, étapes sans heure en dernier. */
export function trierEtapesJour<T extends EtapeGroupable>(etapes: T[]): T[] {
  return [...etapes].sort((a, b) => {
    const ha = hm(a.heure_debut), hb = hm(b.heure_debut);
    if (ha && hb) return ha.localeCompare(hb);
    if (ha) return -1;
    if (hb) return 1;
    return 0;
  });
}

/** Plage de la première heure de début à la dernière heure connue (début ou fin). */
export function plageHoraire(etapes: EtapeGroupable[]): string | null {
  const debuts = etapes.map((e) => hm(e.heure_debut)).filter((x): x is string => !!x).sort();
  const toutes = etapes.flatMap((e) => [hm(e.heure_debut), hm(e.heure_fin)]).filter((x): x is string => !!x).sort();
  if (!debuts.length) return null;
  const deb = heurePlage(debuts[0]);
  const fin = heurePlage(toutes[toutes.length - 1]);
  return deb === fin ? deb : `${deb}–${fin}`;
}

/**
 * Blocs à afficher pour un jour : les étapes d'un même chantier (≥ 2) sont réunies
 * dans un groupe ; jamais deux chantiers différents dans le même groupe.
 * L'ordre suit la première étape de chaque chantier.
 */
export function regrouperEtapesJour<T extends EtapeGroupable>(
  etapes: T[],
  day: string,
  conflits: Set<string>,
  actif = true,
): BlocJour<T>[] {
  const duJour = trierEtapesJour(etapes.filter((e) => etapeCouvreJour(e, day)));
  if (!actif) return duJour.map((etape) => ({ kind: "seule", etape }));
  const parAffaire = new Map<string, T[]>();
  for (const e of duJour) {
    const list = parAffaire.get(e.affaire_id) ?? [];
    list.push(e);
    parAffaire.set(e.affaire_id, list);
  }
  return [...parAffaire].map(([affaireId, list]): BlocJour<T> => {
    if (list.length === 1) return { kind: "seule", etape: list[0] };
    return {
      kind: "groupe",
      key: `${affaireId}|${day}`,
      affaireId,
      etapes: list,
      plage: plageHoraire(list),
      responsables: [...new Set(list.map((e) => e.responsable?.trim()).filter((r): r is string => !!r))],
      conflit: list.some((e) => conflits.has(e.id)),
      propose: list.some((e) => e.statut === "propose"),
      annule: list.some((e) => e.statut === "annule"),
    };
  });
}

/** Replié par défaut au-delà du seuil. */
export function groupeDeplieParDefaut(nbEtapes: number): boolean {
  return nbEtapes <= REGROUPEMENT_SEUIL_REPLI;
}
