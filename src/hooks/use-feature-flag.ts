/**
 * useFeatureFlag — Hook React pour lire l'état d'un feature flag.
 *
 * Source de vérité : table `public.feature_flags` + fonction SQL
 * `is_feature_flag_enabled(_flag_key)` (SECURITY DEFINER).
 *
 * Logique RPC (côté DB) :
 *  - enabled_globally = true → true
 *  - sinon, true si auth.uid() ∈ enabled_for_user_ids
 *  - sinon, true si l'un des rôles de l'utilisateur ∈ enabled_for_roles
 *  - sinon false (et false aussi si le flag n'existe pas → fail-closed)
 *
 * Usage :
 *   const enabled = useFeatureFlag("new_planning_hub");
 *   if (!enabled) return null;
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export function useFeatureFlag(flagKey: string): boolean {
  const { user, loading } = useAuth();

  const { data } = useQuery({
    queryKey: ["feature-flag", flagKey, user?.id ?? null],
    enabled: !loading && !!user,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_feature_flag_enabled", {
        _flag_key: flagKey,
      });
      if (error) {
        console.warn(`[useFeatureFlag] ${flagKey}:`, error.message);
        return false;
      }
      return Boolean(data);
    },
  });

  return Boolean(data);
}
