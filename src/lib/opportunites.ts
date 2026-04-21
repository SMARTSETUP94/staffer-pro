/**
 * v0.17 — Helpers pour le module CRM Opportunités.
 * Centralise les enums, libellés FR et constantes UI partagées entre Kanban,
 * Dashboard pipeline et Import.
 */

export type OpportuniteStatut = "a_faire" | "envoye" | "gagne" | "perdu" | "termine";
export type OpportuniteTaille = "tres_petit" | "petit" | "moyen" | "gros" | "tres_gros";

export const STATUT_ORDER: OpportuniteStatut[] = [
  "a_faire",
  "envoye",
  "gagne",
  "perdu",
  "termine",
];

export const STATUT_LABEL: Record<OpportuniteStatut, string> = {
  a_faire: "À faire",
  envoye: "Envoyé",
  gagne: "Gagné",
  perdu: "Perdu",
  termine: "Terminé",
};

/** Classes Tailwind pour fond de colonne / badge de statut (tokens design system). */
export const STATUT_TONE: Record<
  OpportuniteStatut,
  { col: string; chip: string; dot: string }
> = {
  a_faire: {
    col: "bg-muted/40 border-muted",
    chip: "bg-muted text-foreground",
    dot: "bg-muted-foreground",
  },
  envoye: {
    col: "bg-[var(--indigo-soft)]/40 border-primary/20",
    chip: "bg-[var(--indigo-soft)] text-primary",
    dot: "bg-primary",
  },
  gagne: {
    col: "bg-emerald-50 border-emerald-200",
    chip: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  perdu: {
    col: "bg-rose-50 border-rose-200",
    chip: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
  },
  termine: {
    col: "bg-slate-50 border-slate-200",
    chip: "bg-slate-100 text-slate-700",
    dot: "bg-slate-500",
  },
};

export const TAILLE_ORDER: OpportuniteTaille[] = [
  "tres_petit",
  "petit",
  "moyen",
  "gros",
  "tres_gros",
];

export const TAILLE_LABEL: Record<OpportuniteTaille, string> = {
  tres_petit: "Très petit",
  petit: "Petit",
  moyen: "Moyen",
  gros: "Gros",
  tres_gros: "Très gros",
};

/** Fourchettes affichées en tooltip / légende (€ HT). */
export const TAILLE_RANGE: Record<OpportuniteTaille, string> = {
  tres_petit: "< 1 k€",
  petit: "< 10 k€",
  moyen: "< 25 k€",
  gros: "< 50 k€",
  tres_gros: "+ 50 k€",
};

/** Couleurs déterministes (tokens neutres, lisibles dark/light) pour les badges taille. */
export const TAILLE_TONE: Record<OpportuniteTaille, string> = {
  tres_petit: "bg-slate-100 text-slate-700",
  petit: "bg-sky-100 text-sky-700",
  moyen: "bg-indigo-100 text-indigo-700",
  gros: "bg-amber-100 text-amber-700",
  tres_gros: "bg-rose-100 text-rose-700",
};
