/** Ordre d'affichage d'un devis : parcours en profondeur, frères triés par `ordre` (zones, objets, chapitres, commentaires à leur place). */
export function ordreArbre<T extends { id: string; parent_id: string | null; ordre: number }>(lignes: T[]): (T & { profondeur: number })[] {
  const out: (T & { profondeur: number })[] = [];
  const ids = new Set(lignes.map((l) => l.id));
  const visit = (p: string | null, depth: number) => {
    for (const l of enfants(lignes, p, ids)) { out.push({ ...l, profondeur: depth }); visit(l.id, depth + 1); }
  };
  visit(null, 0);
  return out;
}

/** Enfants directs triés ; une ligne dont le parent n'existe pas est traitée comme racine. */
export function enfants<T extends { id: string; parent_id: string | null; ordre: number }>(lignes: T[], p: string | null, ids?: Set<string>): T[] {
  const known = ids ?? new Set(lignes.map((l) => l.id));
  return lignes
    .filter((l) => (p === null ? l.parent_id === null || !known.has(l.parent_id) : l.parent_id === p))
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
}
