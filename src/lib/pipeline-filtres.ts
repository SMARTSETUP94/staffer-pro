/**
 * Filtres avancés du pipeline opportunités (module pur, testable).
 * Tous les filtres sont regroupés dans la fenêtre « Filtres » ; mémorisés par utilisateur.
 */
import { dateUtile, estEnRetard } from "@/lib/pipeline-kanban";

export type StatutDevisFiltre = "sans_devis" | "brouillon" | "a_valider" | "valide" | "transfere" | "envoye";
export const STATUT_DEVIS_FILTRE_LABEL: Record<StatutDevisFiltre, string> = {
  sans_devis: "Sans devis", brouillon: "Brouillon", a_valider: "À valider", valide: "Validé", transfere: "Transféré ProGBat", envoye: "Envoyé",
};
export type PeriodeFiltre = "" | "ce_mois" | "mois_prochain" | "3_mois" | "libre";
export const PERIODE_LABEL: Record<Exclude<PeriodeFiltre, "">, string> = {
  ce_mois: "Ce mois-ci", mois_prochain: "Mois prochain", "3_mois": "3 prochains mois", libre: "Dates libres",
};

export type FiltresAvances = {
  statutsDevis: StatutDevisFiltre[];
  typologies: string[];
  tailles: string[];
  periode: PeriodeFiltre;
  du: string; // AAAA-MM-JJ (période libre)
  au: string;
  sansDateMontage: boolean;
  enRetard: boolean;
  montantMin: number | null;
  montantMax: number | null;
  supplements: boolean; // n'afficher que les suppléments chantiers 6XXX
  client: string;
};
export const FILTRES_VIDES: FiltresAvances = {
  statutsDevis: [], typologies: [], tailles: [], periode: "", du: "", au: "", sansDateMontage: false,
  enRetard: false, montantMin: null, montantMax: null, supplements: false, client: "",
};

export type OppFiltrable = {
  client?: string | null; taille?: string | null; typologie_future?: string | null;
  date_montage?: string | null; date_evenement_debut?: string | null; date_visite_technique?: string | null;
  next_action_due_le?: string | null; statut_opportunite: string; statut_opportunite_depuis?: string | null; created_at?: string | null;
};
export type InfoDevis = { statut_redaction: string | null; montant: number | null } | undefined;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Bornes [du, au] incluses de la période, ou null si aucune. */
export function bornesPeriode(f: Pick<FiltresAvances, "periode" | "du" | "au">, now = new Date()): [string, string] | null {
  const y = now.getFullYear(), m = now.getMonth();
  switch (f.periode) {
    case "ce_mois": return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case "mois_prochain": return [iso(new Date(y, m + 1, 1)), iso(new Date(y, m + 2, 0))];
    case "3_mois": return [iso(new Date(y, m, now.getDate())), iso(new Date(y, m + 3, now.getDate()))];
    case "libre": return f.du || f.au ? [f.du || "0000-01-01", f.au || "9999-12-31"] : null;
    default: return null;
  }
}

export function statutDevisFiltre(d: InfoDevis): StatutDevisFiltre {
  if (!d || !d.statut_redaction) return "sans_devis";
  return (d.statut_redaction in STATUT_DEVIS_FILTRE_LABEL ? d.statut_redaction : "brouillon") as StatutDevisFiltre;
}

/** Vrai si l'opportunité passe les filtres avancés. Le filtre « suppléments » masque toutes les opportunités. */
export function passeFiltres(o: OppFiltrable, d: InfoDevis, f: FiltresAvances, now = new Date()): boolean {
  if (f.supplements) return false;
  if (f.statutsDevis.length && !f.statutsDevis.includes(statutDevisFiltre(d))) return false;
  if (f.typologies.length && !f.typologies.includes(o.typologie_future ?? "")) return false;
  if (f.tailles.length && !f.tailles.includes(o.taille ?? "")) return false;
  if (f.sansDateMontage && o.date_montage) return false;
  if (f.enRetard && !estEnRetard(o as Parameters<typeof estEnRetard>[0], now)) return false;
  const b = bornesPeriode(f, now);
  if (b) {
    const date = o.date_montage ?? o.date_evenement_debut;
    if (!date) return false;
    const j = date.slice(0, 10);
    if (j < b[0] || j > b[1]) return false;
  }
  const montant = d?.montant ?? null;
  if (f.montantMin != null && (montant == null || montant < f.montantMin)) return false;
  if (f.montantMax != null && (montant == null || montant > f.montantMax)) return false;
  if (f.client.trim() && !(o.client ?? "").toLowerCase().includes(f.client.trim().toLowerCase())) return false;
  return true;
}

/** Nombre de filtres avancés actifs (pour la pastille du bouton). */
export function nbFiltresAvances(f: FiltresAvances): number {
  return [f.statutsDevis.length > 0, f.typologies.length > 0, f.tailles.length > 0, !!bornesPeriode(f),
    f.sansDateMontage, f.enRetard, f.montantMin != null, f.montantMax != null, f.supplements, !!f.client.trim()].filter(Boolean).length;
}

export function lireFiltres(v: unknown): FiltresAvances {
  const o = (v && typeof v === "object" ? v : {}) as Partial<FiltresAvances>;
  return { ...FILTRES_VIDES, ...o, statutsDevis: Array.isArray(o.statutsDevis) ? o.statutsDevis : [], typologies: Array.isArray(o.typologies) ? o.typologies : [], tailles: Array.isArray(o.tailles) ? o.tailles : [] };
}

export { dateUtile };
