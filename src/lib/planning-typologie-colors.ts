/**
 * Code couleur unifié des cellules planning, calé sur la typologie d'affaire
 * dérivée du 1er chiffre du numéro (cohérent avec les chips de filtre).
 *
 *  - gris   : 1XXX / 3XXX  (Non opérationnel)
 *  - bleu   : 2XXX         (Stockage)
 *  - vert   : 4XXX / 5XXX  (Montage/Démontage + Fabrication)
 *  - orange : 9XXX         (Prototype)
 *  - neutre : tout le reste (fallback)
 */
export type TypologieColor = "gris" | "bleu" | "vert" | "orange" | "neutre";

export const TYPO_COLOR_CLASSES: Record<TypologieColor, string> = {
  gris: "bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
  bleu: "bg-sky-200 text-sky-900 hover:bg-sky-300 dark:bg-sky-900/50 dark:text-sky-100 dark:hover:bg-sky-900/70",
  vert: "bg-emerald-200 text-emerald-900 hover:bg-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-100 dark:hover:bg-emerald-900/70",
  orange:
    "bg-orange-200 text-orange-900 hover:bg-orange-300 dark:bg-orange-900/50 dark:text-orange-100 dark:hover:bg-orange-900/70",
  neutre: "bg-muted text-muted-foreground hover:bg-muted/70",
};

/** Hex utilisé pour les fonds inline (badges AssignationCell). */
export const TYPO_COLOR_HEX: Record<TypologieColor, string> = {
  gris: "#E2E8F0", // slate-200
  bleu: "#BAE6FD", // sky-200
  vert: "#A7F3D0", // emerald-200
  orange: "#FED7AA", // orange-200
  neutre: "#F1F5F9", // slate-100
};

/** Texte foncé fixe pour rester lisible sur fond pastel. */
export const TYPO_TEXT_HEX = "#1F2937"; // gray-800

/** Détermine la couleur typologique à partir du numéro d'affaire. */
export function typologieColorFromNumero(numero: string | null | undefined): TypologieColor {
  const first = numero?.[0];
  if (first === "1" || first === "3") return "gris";
  if (first === "2") return "bleu";
  if (first === "4" || first === "5") return "vert";
  if (first === "9") return "orange";
  return "neutre";
}

/** Items de légende, ordonnés pour affichage. */
export const TYPO_LEGEND: Array<{ t: TypologieColor; label: string }> = [
  { t: "gris", label: "1XXX / 3XXX · Non opérationnel" },
  { t: "bleu", label: "2XXX · Stockage" },
  { t: "vert", label: "4XXX / 5XXX · Montage-Démontage / Fabrication" },
  { t: "orange", label: "9XXX · Prototype" },
];
