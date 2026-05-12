/**
 * v0.47.1 — Module unique pour résolution de la route post-login
 * et garde-fous mobile/admin/employé.
 *
 * Centralise la logique éparpillée auparavant dans :
 *  - src/routes/index.tsx (IndexRedirect)
 *  - src/routes/_app.tsx (AppGuard mobile redirect)
 *  - src/components/auth/RoleGuard.tsx (admin réel sur /mobile/chef)
 *
 * Règles (synthèse v0.27.5 + v0.46.2) :
 *  - pas de user                                → /login
 *  - admin réel + mobile + pas preview          → /dashboard (pas de version mobile admin)
 *  - mobile + chef                              → /mobile/chef/dashboard
 *  - mobile + employé                           → /mobile/aujourdhui
 *  - desktop + admin/chef                       → /dashboard
 *  - desktop + employé                          → /ma-semaine (anti-fuite RGPD)
 */

export interface PostLoginCtx {
  /** vrai admin (rôle DB), pas l'effectif preview */
  isAdmin: boolean;
  /** rôle effectif (admin OU chef) — peut être affecté par preview */
  isAdminOrChef: boolean;
  /** viewport mobile effectif (preview compris) */
  effIsMobile: boolean;
  /** rôle effectif admin/chef (preview compris) */
  effIsAdminOrChef: boolean;
  /** admin en mode preview (employé/chef/mobile) */
  isPreviewing: boolean;
}

/**
 * Renvoie la route cible post-login pour un user authentifié.
 * Caller responsable de gérer les cas user=null / loading / rolesLoaded.
 */
export function resolvePostLoginTarget(ctx: PostLoginCtx): string {
  // Mobile : on bascule vers une UI mobile SAUF pour un vrai admin (pas de version mobile admin)
  if (ctx.effIsMobile && (!ctx.isAdmin || ctx.isPreviewing)) {
    return ctx.effIsAdminOrChef ? "/mobile/chef/dashboard" : "/mobile/aujourdhui";
  }
  if (ctx.isAdminOrChef) return "/dashboard";
  // Employé desktop → /ma-semaine (jamais /dashboard pour anti-fuite RGPD)
  return "/ma-semaine";
}

/**
 * Garde-fou utilisé par RoleGuard pour les pages /mobile/chef/* :
 * si un vrai admin (pas en preview) tombe dessus, on le renvoie sur /dashboard.
 * Renvoie la cible de redirect, ou null si tout va bien.
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
    return "/dashboard";
  }
  return null;
}
