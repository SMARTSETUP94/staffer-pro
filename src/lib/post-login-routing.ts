/**
 * v0.51 (L6-A) — Page d'accueil unique `/` capability-driven.
 *
 * Tous les rôles atterrissent sur `/`, qui filtre ses widgets selon les
 * capabilities accordées. Plus de dualité mobile/desktop, plus de
 * `/aujourdhui` séparée.
 */

/** Renvoie la route cible post-login pour un user authentifié. */
export function resolvePostLoginTarget(): string {
  return "/";
}
