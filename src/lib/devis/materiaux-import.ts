/** Helpers purs de l'import catalogue matériaux (découpage en paquets, détection du fournisseur). */
export const IMPORT_CHUNK_SIZE = 2000;

export function chunk<T>(rows: T[], size = IMPORT_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** « foussier.json » / « Foussier_2026.json » → slug connu, sinon null. */
export function slugFromFilename(name: string, known: string[]): string | null {
  const base = name.toLowerCase().replace(/\.(json|csv)$/i, "").replace(/[_\s]+/g, "-");
  if (known.includes(base)) return base;
  const hit = known.filter((s) => base.startsWith(s)).sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
}

/** Accepte un tableau JSON ou un objet { lignes: [...] } / { items: [...] }. */
export function extractRows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const k of ["lignes", "items", "rows", "data"]) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  }
  throw new Error("Format JSON non reconnu : un tableau de lignes est attendu");
}
