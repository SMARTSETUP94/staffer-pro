/**
 * Onglets de la fiche chantier non déployés à ce stade.
 *
 * Un suffixe listé ici est :
 *  - masqué dans la barre d'onglets de `_app.affaires.$affaireId.tsx`
 *  - inaccessible par URL directe (redirection vers la synthèse)
 *
 * Le code des pages est conservé : pour redéployer un onglet, il suffit de
 * retirer son suffixe de cette liste.
 */
export const AFFAIRE_HIDDEN_TAB_SUFFIXES = [
  "planning-chantier",
  "devis",
  "grille",
  "planning-atelier",
  "staffing",
  "equipe",
  "casting",
] as const;

/**
 * L'onglet « Synthèse » (route index de la fiche) est masqué pour l'instant :
 * il agrège d'anciennes données. La fiche s'ouvre alors sur le premier onglet
 * visible (Opportunité si présente, sinon Logistique, etc.).
 */
export const AFFAIRE_SYNTHESE_HIDDEN = true;

/** L'onglet Synthèse (route index) est-il volontairement masqué ? */
export function isAffaireSyntheseHidden(): boolean {
  return AFFAIRE_SYNTHESE_HIDDEN;
}

/** Segment d'onglet porté par une URL de fiche chantier (`null` pour la synthèse). */
export function affaireTabSuffix(pathname: string): string | null {
  const match = pathname.match(/\/affaires\/[^/]+\/([^/]+)/);
  return match ? match[1] : null;
}

/** L'URL courante vise-t-elle un onglet volontairement masqué ? */
export function isAffaireTabHidden(pathname: string): boolean {
  const suffix = affaireTabSuffix(pathname);
  if (!suffix) return false;
  return (AFFAIRE_HIDDEN_TAB_SUFFIXES as readonly string[]).includes(suffix);
}
