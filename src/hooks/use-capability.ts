/**
 * useCapability — Hook React pour vérifier une capability de l'utilisateur courant.
 *
 * Source de vérité : table `public.role_capabilities` croisée avec
 * `public.user_roles` via la fonction SQL `current_user_has_capability(_cap_key)`
 * (SECURITY DEFINER).
 *
 * Stratégie : un seul appel batch `useCapabilities()` charge toutes les caps
 * accordées de l'utilisateur (jointure user_roles × role_capabilities) en
 * une requête, puis on lit en O(1) via `useCapability("planning.edit")`.
 *
 * L'admin garde le bypass implicite via la matrice (admin a tout granted=true).
 *
 * Usage :
 *   const canEdit = useCapability("planning.edit");
 *   if (!canEdit) return null;
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export function useCapabilitiesSet(): { data: Set<string>; isLoading: boolean } {
  const { user, loading, roles } = useAuth();
  // Inclure les rôles dans la queryKey : si l'admin modifie le rôle d'un
  // utilisateur en cours de session, le cache React Query s'invalide
  // automatiquement et le sidebar / les gardes capability se mettent à jour.
  const rolesKey = [...roles].sort().join(",");

  const query = useQuery({
    queryKey: ["capabilities", user?.id ?? null, rolesKey],
    enabled: !loading && !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return new Set<string>();

      // Récupère les rôles, puis les capabilities accordées.
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesErr) {
        console.warn("[useCapability] roles error:", rolesErr.message);
        return new Set<string>();
      }

      const roleList = (roles ?? []).map((r) => r.role);
      if (roleList.length === 0) return new Set<string>();

      const { data: caps, error: capsErr } = await supabase
        .from("role_capabilities")
        .select("capability, granted, role")
        .in("role", roleList)
        .eq("granted", true);

      if (capsErr) {
        console.warn("[useCapability] caps error:", capsErr.message);
        return new Set<string>();
      }

      return new Set((caps ?? []).map((c) => c.capability));
    },
  });

  return {
    data: query.data ?? new Set<string>(),
    isLoading: query.isLoading,
  };
}

export function useCapability(capKey: string): boolean {
  const { data } = useCapabilitiesSet();
  return data.has(capKey);
}

export function useCapabilities(capKeys: string[]): Record<string, boolean> {
  const { data } = useCapabilitiesSet();
  return Object.fromEntries(capKeys.map((k) => [k, data.has(k)]));
}

/**
 * L3b1 — Scope effectif d'une capability pour l'utilisateur courant.
 *
 * Résultat : `'all' | 'team' | 'metier' | 'own' | 'none'`.
 * Multi-rôles : le RPC `user_cap_scope` retourne le scope MAX accordé
 * (admin all > chef team > metier > own > none).
 *
 * Usage typique :
 *   const scope = useCapabilityScope("action.casting.manage");
 *   if (scope === 'none') return null;
 *   if (scope !== 'all') query.eq('owner_id', userId);
 */
export type CapabilityScope = "all" | "team" | "metier" | "own" | "none";

export function useCapabilityScope(capKey: string): CapabilityScope {
  const { user, loading } = useAuth();
  const query = useQuery({
    queryKey: ["capability-scope", user?.id ?? null, capKey],
    enabled: !loading && !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async (): Promise<CapabilityScope> => {
      const { data, error } = await supabase.rpc("user_cap_scope", { _cap: capKey });
      if (error) {
        console.warn("[useCapabilityScope] error:", error.message);
        return "none";
      }
      return ((data as CapabilityScope | null) ?? "none");
    },
  });
  return query.data ?? "none";
}

