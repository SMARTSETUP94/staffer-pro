import { supabase } from "@/integrations/supabase/client";

/**
 * Retourne true si l'erreur correspond à un 401 / Unauthorized renvoyé par
 * un createServerFn (Response throwée par le middleware d'auth) ou par
 * Supabase directement.
 */
export function isUnauthorizedError(e: unknown): boolean {
  if (e instanceof Response) {
    if (e.status === 401 || e.status === 403) return true;
  }
  if (e && typeof e === "object") {
    const anyE = e as { status?: number; statusCode?: number; message?: string };
    if (anyE.status === 401 || anyE.statusCode === 401) return true;
    const msg = (anyE.message || "").toLowerCase();
    if (
      msg.includes("unauthorized") ||
      msg.includes("jwt expired") ||
      msg.includes("invalid token") ||
      msg.includes("no authorization header") ||
      msg.includes("not authenticated")
    ) {
      return true;
    }
  }
  if (typeof e === "string") {
    const m = e.toLowerCase();
    if (m.includes("unauthorized") || m.includes("jwt expired")) return true;
  }
  return false;
}

/**
 * Force un refresh de la session Supabase puis attend que onAuthStateChange
 * propage le nouvel access_token. Renvoie true si la session a été renouvelée.
 */
async function refreshSupabaseSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      // Refresh token invalide / expiré → on déconnecte proprement
      await supabase.auth.signOut().catch(() => {});
      return false;
    }
    return Boolean(data.session?.access_token);
  } catch {
    return false;
  }
}

interface WithAuthRetryOptions {
  /** Nombre maximum de retries après un 401. Par défaut 1. */
  maxRetries?: number;
  /** Callback déclenché quand le refresh échoue (session perdue). */
  onSessionLost?: () => void;
}

/**
 * Exécute un appel (typiquement un createServerFn) et, en cas de 401,
 * tente un `supabase.auth.refreshSession()` puis rejoue l'appel.
 *
 * Si le refresh échoue, la session est invalidée et l'erreur est propagée :
 * c'est au caller (ou au composant racine) de rediriger vers /login.
 */
export async function withAuthRetry<T>(
  call: () => Promise<T>,
  options: WithAuthRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= maxRetries) {
    try {
      return await call();
    } catch (e) {
      lastErr = e;
      if (!isUnauthorizedError(e) || attempt === maxRetries) {
        throw e;
      }
      // 401 détecté → tentative de refresh
      const refreshed = await refreshSupabaseSession();
      if (!refreshed) {
        options.onSessionLost?.();
        throw e;
      }
      attempt += 1;
      // petite attente pour laisser le client appliquer le nouveau token
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastErr;
}
