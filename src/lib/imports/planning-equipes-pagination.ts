/**
 * Découpage en pages du planning des équipes exporté en PDF.
 * Helpers purs, sans dépendance : testés et partagés par le module d'export.
 */

/** Bloc mesuré en pixels CSS : `top` depuis le haut de l'élément, `height` du bloc. */
export type Bloc = { top: number; height: number };
/** Tranche de contenu d'une page, en pixels CSS, bornes comprises. */
export type Page = { start: number; end: number };

/**
 * Répartition des blocs en pages : le premier bloc (bandeau du jour, ou ligne des
 * jours) est recopié en tête de chaque page, les blocs restent entiers, et un bloc
 * plus haut qu'une page est découpé.
 */
export function paginer(blocs: Bloc[], hauteurPx: number): { entete: Bloc; pages: Page[] } {
  const entete = blocs[0];
  const lignes = blocs.slice(1);
  const dispo = Math.max(10, hauteurPx - entete.height);
  const pages: Page[] = [];
  let start = entete.height;
  let used = 0;
  for (const b of lignes) {
    if (b.height > dispo) {
      if (used > 0) { pages.push({ start, end: b.top }); start = b.top; used = 0; }
      let y = b.top;
      while (y < b.top + b.height - 1) {
        const next = Math.min(y + dispo, b.top + b.height);
        pages.push({ start: y, end: next });
        y = next;
      }
      start = b.top + b.height;
      continue;
    }
    if (used + b.height > dispo) { pages.push({ start, end: b.top }); start = b.top; used = b.height; }
    else used += b.height;
  }
  const fin = lignes.length ? lignes[lignes.length - 1].top + lignes[lignes.length - 1].height : entete.height;
  if (fin > start) pages.push({ start, end: fin });
  return { entete, pages: pages.length ? pages : [{ start: entete.height, end: entete.height }] };
}

/** Découpe à hauteur de page constante, quand aucun bloc n'est mesurable. */
export function paginerHauteurFixe(totalPx: number, hauteurPx: number): Page[] {
  const pages: Page[] = [];
  for (let y = 0; y < totalPx; y += hauteurPx) pages.push({ start: y, end: Math.min(y + hauteurPx, totalPx) });
  return pages.length ? pages : [{ start: 0, end: totalPx }];
}
