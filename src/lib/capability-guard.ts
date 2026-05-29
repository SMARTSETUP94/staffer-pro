/**
 * Lot 7.0b — Garde capability pour routes (beforeLoad) et logique partagée.
 *
 * `requireCapability(capKey)` :
 *   - À utiliser dans `beforeLoad` d'une route TanStack (createFileRoute).
 *   - Bloque le mount si l'utilisateur n'a pas la cap → redirect("/") avec
 *     un flag sessionStorage que `_app.tsx` consomme pour afficher un toast
 *     "Accès refusé" sur la destination.
 *
 * Pour les rendus partiels (cacher un bouton, désactiver une zone),
 * utiliser le composant `<CapabilityGuard>` (src/components/auth/CapabilityGuard.tsx)
 * basé sur le hook `useCapability` (déjà existant).
 *
 * Cache module-level (5 min TTL) sur l'ensemble des caps d'un user, identique
 * à la stratégie de `useCapability` côté React Query, pour éviter un round-trip
 * sur chaque navigation.
 */
import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const CAP_DENIED_KEY = "lovable_cap_denied";
const TTL_MS = 5 * 60_000;

type CacheEntry = { caps: Set<string>; ts: number };
const cache = new Map<string, CacheEntry>();

export function clearCapabilityCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
async function loadCaps(userId: string): Promise<Set<string> | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.caps;

  const { data: roles, error: rolesErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  // En cas d'erreur infra (lock gotrue, RLS race au mount), on ne cache pas
  // et on renvoie null → requireCapability laisse passer (fail-open côté
  // routing ; la RLS reste la source de vérité côté data).
  if (rolesErr) {
    console.warn("[capability-guard] roles error:", rolesErr.message);
    return null;
  }

  const roleList = (roles ?? []).map((r) => r.role);
  if (roleList.length === 0) {
    const empty = new Set<string>();
    cache.set(userId, { caps: empty, ts: Date.now() });
    return empty;
  }

  const { data: caps, error: capsErr } = await supabase
    .from("role_capabilities")
    .select("capability")
    .in("role", roleList)
    .eq("granted", true);

  if (capsErr) {
    console.warn("[capability-guard] caps error:", capsErr.message);
    return null;
  }

  const set = new Set((caps ?? []).map((c) => c.capability));
  cache.set(userId, { caps: set, ts: Date.now() });
  return set;
}

/**
 * À utiliser dans `beforeLoad` d'une route.
 * Lance un redirect vers `/` (avec toast "Accès refusé" sur la destination)
 * si l'utilisateur n'a pas la capability requise.
 *
 * Fail-open : si la résolution des caps échoue (erreur réseau, lock gotrue,
 * race au mount), on laisse passer pour éviter des faux redirects ; RLS
 * reste la garde finale côté données.
 */
export async function requireCapability(capKey: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    // Pas connecté — laisser _app/AppGuard / _authenticated gérer la redirection login.
    return;
  }
  const caps = await loadCaps(session.user.id);
  if (caps === null) return; // fail-open
  if (!caps.has(capKey)) {
    if (typeof window !== "undefined") {
      try { sessionStorage.setItem(CAP_DENIED_KEY, capKey); } catch { /* ignore */ }
    }
    throw redirect({ to: "/" });
  }
}

/**
 * Consommé par `_app.tsx` (AppGuard) au mount/changement de route.
 * Retourne la cap refusée si présente, puis nettoie le flag.
 */

export function consumeCapDenied(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(CAP_DENIED_KEY);
    if (v) sessionStorage.removeItem(CAP_DENIED_KEY);
    return v;
  } catch {
    return null;
  }
}
