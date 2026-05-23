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

function useCapabilitiesSet(): { data: Set<string>; isLoading: boolean } {
  const { user, loading } = useAuth();

  const query = useQuery({
    queryKey: ["capabilities", user?.id ?? null],
    enabled: !loading && !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
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
