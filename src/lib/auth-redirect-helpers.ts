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

/**
 * Clé sessionStorage : marque que l'utilisateur a cliqué "Compléter plus tard"
 * sur /onboarding. Le guard cesse alors de forcer la redirection vers /onboarding
 * pour la session courante. Le bandeau ProfileIncompleteBanner reste affiché
 * tant que profile_completed_at IS NULL. Reset au prochain login (sessionStorage
 * est nettoyé à la fermeture de l'onglet ; on le purge aussi côté auth-context
 * sur SIGNED_IN avec changement d'utilisateur).
 */
export const ONBOARDING_SKIPPED_KEY = "onboarding_skipped_v1";

export function isOnboardingSkipped(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ONBOARDING_SKIPPED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSkipped(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ONBOARDING_SKIPPED_KEY, "1");
  } catch {
    /* noop */
  }
}

export function clearOnboardingSkipped(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ONBOARDING_SKIPPED_KEY);
  } catch {
    /* noop */
  }
}

export function shouldRedirectToOnboarding(g: {
  profileCompleted: boolean;
  currentPath: string;
  skipped?: boolean;
}): boolean {
  if (g.profileCompleted) return false;
  if (isOnboardingPath(g.currentPath)) return false;
  if (g.skipped) return false;
  return true;
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
