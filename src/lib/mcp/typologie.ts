/**
 * Vocabulaire MCP des typologies : la valeur interne `prototype` (9XXX) est
 * exposée et acceptée sous le nom « opportunite ». La base reste inchangée.
 */
export const MCP_TYPOLOGIES = ["fabrication", "montage_demontage", "stockage", "opportunite", "non_operationnel"] as const;

export function typologieFromMcp<T>(value: T): T | "prototype" {
  return value === "opportunite" ? "prototype" : value;
}
export function typologieToMcp<T>(value: T): T | "opportunite" {
  return value === "prototype" ? "opportunite" : value;
}

/** Remplace les valeurs internes dans les champs typologie d'une ligne de sortie. */
export function mapTypologieRow<R extends Record<string, unknown>>(row: R): R {
  const out: Record<string, unknown> = { ...row };
  for (const key of ["typologie", "typologie_future"]) if (key in out) out[key] = typologieToMcp(out[key]);
  return out as R;
}

/** Normalise les arguments d'écriture (`typologie_future` direct ou dans `champs`). */
export function normalizeTypologieArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  if ("typologie_future" in out) out.typologie_future = typologieFromMcp(out.typologie_future);
  if (out.champs && typeof out.champs === "object") {
    const champs = { ...(out.champs as Record<string, unknown>) };
    if ("typologie_future" in champs) champs.typologie_future = typologieFromMcp(champs.typologie_future);
    out.champs = champs;
  }
  return out;
}

/** Filtre texte du pipeline : code, intitulé ou client, insensible à la casse et aux accents. */
export function matchPipelineFiltre(row: { numero?: unknown; nom?: unknown; client?: unknown }, filtre: string): boolean {
  const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const q = norm(filtre).trim();
  if (!q) return true;
  return [row.numero, row.nom, row.client].some(v => norm(v).includes(q));
}
