/**
 * Sprint C / C2 — résolution de la stratégie de republication par défaut.
 *
 * Règle (validée user, V1) :
 *   - overrides = 0  → "auto"   (resync silencieux)
 *   - 0 < ratio ≤ 30 → "merge"  (fusion : on garde les overrides utilisateur,
 *                                  on applique les changements du plan en plus)
 *   - ratio > 30     → "manual" (on ne touche pas au casting, l'utilisateur
 *                                  décide manuellement)
 *
 * `ratio` = (n2_added + n2_removed + n3_added + n3_removed) / total_slots × 100.
 */
export type RepublishStrategy = "auto" | "merge" | "manual";

export interface OverridesShape {
  overrides: number;
  ratio: number;
}

export const REPUBLISH_THRESHOLD = 30;

export function resolveRepublishStrategy(r: OverridesShape): RepublishStrategy {
  if ((r.overrides ?? 0) === 0) return "auto";
  if (Number(r.ratio ?? 0) <= REPUBLISH_THRESHOLD) return "merge";
  return "manual";
}
