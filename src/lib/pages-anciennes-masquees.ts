/** Anciennes pages planning masquées du menu en mode « suivi des affaires » : bloquées aussi par URL (mobile, liens, favoris). */
export const PAGES_ANCIENNES_MASQUEES = ["/planning", "/planning-general", "/atelier", "/charge", "/charge-atelier", "/qui-est-ou", "/fabrication"];

export function estPageAncienneMasquee(path: string): boolean {
  return PAGES_ANCIENNES_MASQUEES.some((p) => path === p || path.startsWith(`${p}/`));
}
