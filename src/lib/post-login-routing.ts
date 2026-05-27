/**
 * v0.50 (L4d) — Routing post-login simplifié au maximum.
 *
 * Décision Gabin 26 mai 2026 : suppression totale de la dualité
 * mobile/desktop. Tous les rôles atterrissent sur `/aujourdhui`
 * (page d'accueil unique capability-driven).
 */

/** Renvoie la route cible post-login pour un user authentifié. */
export function resolvePostLoginTarget(): string {
  return "/aujourdhui";
}
