/**
 * Lisibilité du Kanban opportunités (module pur) : date utile, urgence, tri des cartes
 * et repli des colonnes. Testable sans interface.
 */
import { aFaireBadge } from "@/lib/opportunite-a-faire";

export type DateUtile = { libelle: "Montage" | "Événement" | "Visite"; date: string; jours: number; proche: boolean };
export const DATE_UTILE_PROCHE_JOURS = 15;

type Datable = { date_montage?: string | null; date_evenement_debut?: string | null; date_visite_technique?: string | null };

function jour(d: string) { return new Date(d.slice(0, 10) + "T00:00:00"); }
function debutJour(now: Date) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }

/** Montage, sinon début d'événement, sinon visite technique ; « proche » à moins de 15 jours (dates passées comprises). */
export function dateUtile(o: Datable, now = new Date()): DateUtile | null {
  const [libelle, date] = o.date_montage ? ["Montage", o.date_montage] as const
    : o.date_evenement_debut ? ["Événement", o.date_evenement_debut] as const
    : o.date_visite_technique ? ["Visite", o.date_visite_technique] as const : [null, null];
  if (!libelle || !date) return null;
  const jours = Math.round((jour(date).getTime() - debutJour(now).getTime()) / 86_400_000);
  return { libelle, date, jours, proche: jours < DATE_UTILE_PROCHE_JOURS };
}

export function fmtDateCourte(d: string) {
  return jour(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

type Carte = Datable & {
  id: string; statut_opportunite: string; next_action_due_le?: string | null;
  statut_opportunite_depuis?: string | null; created_at?: string | null; date_opportunite?: string | null;
};

/** En retard : action due dépassée, ou « À faire » trop ancienne. */
export function estEnRetard(o: Carte, now = new Date()) {
  if (o.next_action_due_le && jour(o.next_action_due_le) < debutJour(now)) return true;
  return o.statut_opportunite === "a_faire" && aFaireBadge(o, now)?.kind === "retard";
}

export type TriCartes = "urgence" | "montant" | "creation";
export const TRI_LABEL: Record<TriCartes, string> = { urgence: "Urgence", montant: "Montant décroissant", creation: "Date de création" };

function creation(o: Carte) { return new Date(o.created_at ?? o.date_opportunite ?? 0).getTime(); }

/** Urgence : en retard d'abord, puis date utile la plus proche (sans date en dernier). */
export function trierCartes<T extends Carte>(items: T[], tri: TriCartes, montant: (id: string) => number | null, now = new Date()): T[] {
  const arr = [...items];
  if (tri === "creation") return arr.sort((a, b) => creation(b) - creation(a));
  if (tri === "montant") return arr.sort((a, b) => (montant(b.id) ?? -1) - (montant(a.id) ?? -1));
  return arr.sort((a, b) => {
    const r = Number(estEnRetard(b, now)) - Number(estEnRetard(a, now));
    if (r) return r;
    const da = dateUtile(a, now)?.jours ?? Infinity, db = dateUtile(b, now)?.jours ?? Infinity;
    return da === db ? creation(a) - creation(b) : da - db;
  });
}

/** Gagné et Perdu repliés par défaut ; Presque gagné replié quand vide. Le choix de l'utilisateur prime. */
export function colonneRepliee(statut: string, nb: number, choix: Record<string, boolean>) {
  if (statut in choix) return choix[statut];
  return statut === "gagne" || statut === "perdu" || (statut === "presque_gagne" && nb === 0);
}

/** Brouillon Claude à relire : dernier devis créé par Claude, brouillon ou à valider, jamais repris par un humain. */
export function estBrouillonClaude(d: { cree_par_mcp: boolean; statut_redaction: string; modifie_par_humain_le: string | null } | null | undefined) {
  return !!d && d.cree_par_mcp && (d.statut_redaction === "brouillon" || d.statut_redaction === "a_valider") && !d.modifie_par_humain_le;
}
