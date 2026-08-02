/**
 * LOT B3 — Helpers purs du tableau d'atelier.
 *
 * Aucune règle de complétude ici : la source unique est la fonction SQL
 * `public.etape_prete()` (LOT B1). Ce module ne fait que de la mise en forme :
 * colonne courante, agrégats d'en-tête, tri des cartes, tampons de progression.
 */

export type EtapeType = "be" | "usinage" | "respo_fab" | "finition" | "manutention";
export type EtapeStatut =
  | "a_faire"
  | "en_cours"
  | "en_attente_validation"
  | "termine"
  | "non_applicable";

/** Colonnes du tableau, dans l'ordre d'affichage imposé. */
export const ATELIER_COLONNES: { type: EtapeType; label: string; tampon: string }[] = [
  { type: "be", label: "Bureau d'étude", tampon: "BE" },
  { type: "usinage", label: "Numérique", tampon: "NUM" },
  { type: "respo_fab", label: "Fabrication", tampon: "FAB" },
  { type: "finition", label: "Finition", tampon: "FIN" },
  { type: "manutention", label: "Manutention", tampon: "MAN" },
];

export const ATELIER_ORDRE: EtapeType[] = ATELIER_COLONNES.map((c) => c.type);

/**
 * Métier (code de `public.metiers`) → étape de fabrication.
 * Miroir de `public.etape_for_metier`, étendu aux codes métiers réels de la
 * base (`suivi_projet` = Bureau d'étude, `impression_uv` rattaché au
 * Numérique, `logistique`/`machiniste` à la Manutention).
 */
export const METIER_CODE_TO_ETAPE: Record<string, EtapeType> = {
  suivi_projet: "be",
  numerique: "usinage",
  impression_uv: "usinage",
  construction: "respo_fab",
  metallerie: "respo_fab",
  peinture: "finition",
  tapisserie: "finition",
  logistique: "manutention",
  machiniste: "manutention",
};

export interface EtapeLite {
  id: string;
  objet_id: string;
  type_etape: EtapeType;
  statut: EtapeStatut;
  prete: boolean;
  manques: string[];
}

export interface ObjetCarte {
  objet_id: string;
  reference: string;
  nom: string;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  /** Date de montage ISO (`yyyy-mm-dd`) ou null. */
  date_montage: string | null;
  /** Étape courante = première étape applicable non validée. */
  etape: EtapeLite;
  /** Responsable fabrication de l'objet (validateur légitime). */
  respo_fab_id: string | null;
  /** Heures prévues du poste courant (source : `objet_heures_metier`). */
  heures: number;
  /** Une entrée par colonne, dans l'ordre de `ATELIER_COLONNES`. */
  tampons: TamponEtat[];
}

export type TamponEtat = "valide" | "non_applicable" | "courant" | "a_venir" | "absent";

/** Une étape est considérée close (donc « dépassée ») quand elle est validée. */
export function estValidee(statut: EtapeStatut): boolean {
  return statut === "termine";
}

/**
 * Étape courante d'un objet : première étape, dans l'ordre canonique, qui est
 * applicable (≠ `non_applicable`) et pas encore validée. `null` si l'objet est
 * entièrement soldé ou n'a aucune étape applicable.
 */
export function etapeCourante(etapes: EtapeLite[]): EtapeLite | null {
  for (const type of ATELIER_ORDRE) {
    const e = etapes.find((x) => x.type_etape === type);
    if (!e) continue;
    if (e.statut === "non_applicable") continue;
    if (estValidee(e.statut)) continue;
    return e;
  }
  return null;
}

/** Bande de tampons : état de chaque colonne pour un objet. */
export function tamponsPour(etapes: EtapeLite[], couranteId: string | null): TamponEtat[] {
  return ATELIER_ORDRE.map((type) => {
    const e = etapes.find((x) => x.type_etape === type);
    if (!e) return "absent";
    if (e.id === couranteId) return "courant";
    if (e.statut === "non_applicable") return "non_applicable";
    if (estValidee(e.statut)) return "valide";
    return "a_venir";
  });
}

/**
 * Tri des cartes : par date de montage croissante, les affaires sans date en
 * dernier, puis par numéro d'affaire et référence d'objet pour rester stable.
 */
export function trierCartes(cartes: ObjetCarte[]): ObjetCarte[] {
  return [...cartes].sort((a, b) => {
    const da = a.date_montage ?? "";
    const db = b.date_montage ?? "";
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    }
    if (a.affaire_numero !== b.affaire_numero) {
      return a.affaire_numero.localeCompare(b.affaire_numero);
    }
    return a.reference.localeCompare(b.reference);
  });
}

/** Regroupe les cartes par colonne, triées. */
export function grouperParColonne(cartes: ObjetCarte[]): Record<EtapeType, ObjetCarte[]> {
  const out = {} as Record<EtapeType, ObjetCarte[]>;
  for (const type of ATELIER_ORDRE) {
    out[type] = trierCartes(cartes.filter((c) => c.etape.type_etape === type));
  }
  return out;
}

/** En-tête de colonne : nombre d'objets + total d'heures. */
export function totauxColonne(cartes: ObjetCarte[]): { objets: number; heures: number } {
  return {
    objets: cartes.length,
    heures: Math.round(cartes.reduce((s, c) => s + (c.heures || 0), 0) * 10) / 10,
  };
}

/** Date de montage en français court : « 15 août ». */
export function formatDateMontage(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** Heures au format français : « 38,4 h » (sans décimale inutile). */
export function formatHeures(h: number): string {
  return `${(Math.round(h * 10) / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`;
}

/** Libellé accessible d'un tampon de progression. */
export const TAMPON_LABEL: Record<TamponEtat, string> = {
  valide: "validé",
  non_applicable: "non applicable",
  courant: "poste courant",
  a_venir: "à venir",
  absent: "non renseigné",
};

/** Pastille d'état d'une carte. */
export type PastilleEtat = { ton: "ok" | "manque" | "neutre"; label: string };

export function pastille(etape: EtapeLite): PastilleEtat {
  if (etape.statut === "non_applicable") return { ton: "neutre", label: "Non applicable" };
  if (etape.prete || etape.manques.length === 0) return { ton: "ok", label: "Prêt" };
  return { ton: "manque", label: etape.manques[0]! };
}

/** Somme des heures d'un objet pour l'étape donnée. */
export function heuresPourEtape(
  lignes: { metier_code: string; heures: number }[],
  type: EtapeType,
): number {
  const total = lignes
    .filter((l) => METIER_CODE_TO_ETAPE[l.metier_code] === type)
    .reduce((s, l) => s + (l.heures || 0), 0);
  return Math.round(total * 10) / 10;
}

/**
 * B-bis — Action attendue sur la carte selon le statut de l'étape courante.
 * `a_faire`/`en_cours` → l'opérateur déclare la fin ; `en_attente_validation`
 * → le responsable fabrication (ou un admin) valide. Sur l'étape `respo_fab`,
 * terminer vaut validation : une seule action.
 */
export function actionCarte(
  etape: EtapeLite,
  opts: { isAdmin: boolean; isRespoFab: boolean },
): { kind: "terminer" | "valider" | "aucune"; label: string } {
  if (etape.statut === "en_attente_validation") {
    return opts.isAdmin || opts.isRespoFab
      ? { kind: "valider", label: "Valider" }
      : { kind: "aucune", label: "En attente de validation" };
  }
  return { kind: "terminer", label: etape.type_etape === "respo_fab" ? "Valider" : "Terminer" };
}
