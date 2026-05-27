/**
 * v0.49 (L4a) — Routing post-login simplifié.
 *
 * Décision Gabin 26 mai 2026 : suppression totale de la dualité
 * mobile/desktop. Tous les rôles atterrissent sur la même page d'accueil
 * `/aujourdhui` (capability-driven). Les cartes rendues sont filtrées
 * selon les capabilities de l'utilisateur.
 *
 * La signature `PostLoginCtx` est volontairement préservée pour ne pas
 * casser les call-sites (`_app.tsx`, `index.tsx`) dans le scope L4a.
 * Suppression complète des champs inutiles en L4d.
 */

export interface PostLoginCtx {
  /** vrai admin (rôle DB), pas l'effectif preview — conservé pour L4d */
  isAdmin: boolean;
  /** rôle effectif (admin OU chef) — conservé pour L4d */
  isAdminOrChef?: boolean;
  /** viewport mobile effectif — conservé pour L4d */
  effIsMobile?: boolean;
  /** rôle effectif admin/chef (preview compris) — conservé pour L4d */
  effIsAdminOrChef?: boolean;
  /** admin en mode preview — conservé pour L4d */
  isPreviewing?: boolean;
}

/**
 * Renvoie la route cible post-login pour un user authentifié.
 * Tous les rôles → `/aujourdhui` (page d'accueil unique).
 */
export function resolvePostLoginTarget(_ctx: PostLoginCtx): string {
  return "/aujourdhui";
}

/**
 * v0.49 (L4a) — Garde-fou legacy conservé pour RoleGuard. Comme `/mobile/chef/*`
 * va devenir un ensemble de stubs redirect en L4c, cette fonction renvoie
 * désormais `/aujourdhui` plutôt que `/dashboard`. Sera supprimée en L4d.
 */
export function checkMobileChefAccessForAdmin(opts: {
  isAdmin: boolean;
  isPreviewing: boolean;
  currentPath: string;
}): string | null {
  if (
    opts.isAdmin &&
    !opts.isPreviewing &&
    opts.currentPath.startsWith("/mobile/chef")
  ) {
    return "/aujourdhui";
  }
  return null;
}
