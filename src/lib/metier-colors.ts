/**
 * Palette métier du planning atelier / bureau d'étude.
 * Une seule teinte par métier, utilisée à la fois pour le nom dans la colonne
 * de gauche et pour la barre correspondante, afin de relier les deux vues.
 *
 * Les classes sont écrites en toutes lettres : Tailwind v4 les détecte dans le
 * source, aucune safelist n'est nécessaire.
 */

/**Classes du nom de métier (colonne de gauche). */
const TEXTE: Record<number, string> = {
  1: "text-metier-menuiserie",
  2: "text-metier-metallerie",
  3: "text-metier-peinture",
  4: "text-metier-numerique",
  5: "text-metier-tapisserie",
  6: "text-metier-machiniste",
  7: "text-metier-logistique",
  8: "text-metier-be",
  9: "text-metier-impression-uv",
};

/**Classes de la barre : aplat teinté + bordure de la même teinte. */
const BARRE: Record<number, string> = {
  1: "bg-metier-menuiserie/18 text-foreground border-metier-menuiserie",
  2: "bg-metier-metallerie/18 text-foreground border-metier-metallerie",
  3: "bg-metier-peinture/18 text-foreground border-metier-peinture",
  4: "bg-metier-numerique/18 text-foreground border-metier-numerique",
  5: "bg-metier-tapisserie/18 text-foreground border-metier-tapisserie",
  6: "bg-metier-machiniste/18 text-foreground border-metier-machiniste",
  7: "bg-metier-logistique/18 text-foreground border-metier-logistique",
  8: "bg-metier-be/18 text-foreground border-metier-be",
  9: "bg-metier-impression-uv/18 text-foreground border-metier-impression-uv",
};

/** Pastille de couleur placée devant le nom du métier. */
const PASTILLE: Record<number, string> = {
  1: "bg-metier-menuiserie",
  2: "bg-metier-metallerie",
  3: "bg-metier-peinture",
  4: "bg-metier-numerique",
  5: "bg-metier-tapisserie",
  6: "bg-metier-machiniste",
  7: "bg-metier-logistique",
  8: "bg-metier-be",
  9: "bg-metier-impression-uv",
};

/** Classe de texte du nom de métier (fallback : encre). */
export function metierTexte(id?: number | null): string {
  return (id != null && TEXTE[id]) || "text-foreground";
}

/** Classe de barre pour un métier (null = pas de métier connu). */
export function metierBarre(id?: number | null): string | null {
  return (id != null && BARRE[id]) || null;
}

/** Classe de pastille pour un métier (null = pas de métier connu). */
export function metierPastille(id?: number | null): string | null {
  return (id != null && PASTILLE[id]) || null;
}
