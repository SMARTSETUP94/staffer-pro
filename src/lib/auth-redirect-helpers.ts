/**
 * Helpers purs (testables) pour décider la redirection AppGuard d'un user
 * fraîchement authentifié. Extraits de _app.tsx pour testabilité.
 */

export interface GuardInputs {
  isChefOrAdmin: boolean;
  passwordSetDone: boolean | null;
  passwordSetAt: string | null;
  isInviteStatus: boolean;
  profileCompleted: boolean;
}

/**
 * Doit-on forcer l'utilisateur sur /auth/set-password ?
 *
 * Cas 1 (legacy) : chef/admin sans password → bloquant.
 * Cas 2 (v0.26.1) : INVITÉ (status=invite) sans password ET sans password_set_at,
 *   peu importe le rôle. Évite que le hash du lien d'invitation soit consommé sur /
 *   et que le user file droit en /onboarding sans avoir défini de password.
 */
export function shouldForceSetPassword(g: GuardInputs): boolean {
  // Cas 1
  if (g.passwordSetDone === false && g.isChefOrAdmin) return true;
  // Cas 2 : invité fraîchement créé
  if (g.isInviteStatus && g.passwordSetDone !== true && g.passwordSetAt === null) {
    return true;
  }
  return false;
}

export function isOnboardingPath(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

export function shouldRedirectToOnboarding(g: {
  profileCompleted: boolean;
  currentPath: string;
}): boolean {
  return !g.profileCompleted && !isOnboardingPath(g.currentPath);
}

export function shouldIgnoreTokenRefreshForSameUser(g: {
  event: string;
  newUserId: string | null;
  lastUserId: string | null;
}): boolean {
  return g.event === "TOKEN_REFRESHED" && Boolean(g.newUserId) && g.newUserId === g.lastUserId;
}

/**
 * Détecte un hash Supabase contenant un access_token (lien d'invitation/recovery).
 * Utilisé par routes/index.tsx pour rediriger vers /auth/set-password en
 * préservant le hash AVANT que detectSessionInUrl ne consomme la session
 * sur la mauvaise route.
 */
export function isAuthHashPresent(hash: string | null | undefined): boolean {
  if (!hash) return false;
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!h) return false;
  return /(?:^|&)access_token=/.test(h) || /(?:^|&)type=(invite|recovery|signup|magiclink)/.test(h);
}
