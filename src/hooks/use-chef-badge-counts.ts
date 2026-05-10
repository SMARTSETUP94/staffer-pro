import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Compteurs pour les badges du bottom nav chef :
 * - heuresAValider : heures saisies en attente de validation (statut 'soumis')
 *   sur les chantiers où l'utilisateur est chef OU toutes les heures soumises (admin/chef voient tout)
 * - contratsAttente : contrats déclenchés par moi en attente côté employé/employeur
 */
export function useChefBadgeCounts() {
  const { user, isAdminOrChef } = useAuth();

  const heuresQ = useQuery({
    queryKey: ["chef-badge-heures", user?.id],
    enabled: isAdminOrChef && !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("heures_saisies")
        .select("id", { count: "exact", head: true })
        .eq("statut", "soumis");
      return count ?? 0;
    },
  });

  const contratsQ = useQuery({
    queryKey: ["chef-badge-contrats", user?.id],
    enabled: isAdminOrChef && !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("contrats_intermittents")
        .select("id", { count: "exact", head: true })
        .eq("created_by", user!.id)
        .in("statut", ["a_signer_employe", "a_signer_employeur"]);
      return count ?? 0;
    },
  });

  return {
    heuresAValider: heuresQ.data ?? 0,
    contratsAttente: contratsQ.data ?? 0,
  };
}
