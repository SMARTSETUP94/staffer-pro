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
export function enfants<T extends { id: string; parent_id: string | null; ordre: number; type?: string }>(lignes: T[], p: string | null, ids?: Set<string>): T[] {
  const known = ids ?? new Set(lignes.map((l) => l.id));
  const res = lignes
    .filter((l) => (p === null ? l.parent_id === null || !known.has(l.parent_id) : l.parent_id === p))
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
  return p === null ? trierRacines(res) : res;
}

const RANG_CHAPITRE: Record<string, number> = { chapitre_suivi: 1, chapitre_pose: 2, chapitre_depose: 3 };
/** Ordre racine client : zones/objets/commentaires par `ordre`, puis chapitres suivi → pose → dépose. */
export function trierRacines<T extends { id: string; type?: string; ordre: number }>(racines: T[]): T[] {
  return [...racines].sort((a, b) => (RANG_CHAPITRE[a.type ?? ""] ?? 0) - (RANG_CHAPITRE[b.type ?? ""] ?? 0) || a.ordre - b.ordre || a.id.localeCompare(b.id));
}
/** Retire un numéro saisi en tête de libellé (« 2 – CORRIDOR » → « CORRIDOR ») : la numérotation est automatique. */
export const sansNumeroSaisi = (lib: string) => lib.replace(/^\s*\d+(?:\.\d+)*\s*[–—-]\s*/, "").trim();
