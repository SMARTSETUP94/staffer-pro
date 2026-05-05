import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ObjetLight {
  id: string;
  reference: string;
  nom: string;
}

/**
 * v0.20.1 Phase 3 — React Query partagée :
 * tous les composants qui appellent useObjetsAffaireLight(affaireId) sur la
 * même page partagent la même cache (queryKey ['objets-affaire-light', id]).
 * staleTime 30s pour limiter les refetchs entre sidebar/main/header.
 */
export function useObjetsAffaireLight(affaireId: string | null | undefined) {
  const { data, isLoading } = useQuery<ObjetLight[]>({
    queryKey: ["objets-affaire-light", affaireId ?? null],
    queryFn: async () => {
      if (!affaireId) return [];
      const { data, error } = await supabase
        .from("fabrication_objets")
        .select("id, reference, nom")
        .eq("affaire_id", affaireId)
        .eq("archive", false)
        .order("ordre", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ObjetLight[];
    },
    enabled: !!affaireId,
    staleTime: 30_000,
  });

  return { objets: data ?? [], loading: isLoading };
}

/**
 * Hook : flags rôle fabrication du profil connecté (pour filtrer le dropdown étape).
 */
export interface FabRolesFlags {
  est_bureau_etude: boolean;
  est_usinage_numerique?: boolean;
  est_respo_fab: boolean;
  est_finition: boolean;
  est_manutention: boolean;
}

export function useMyFabricationRoles() {
  const [flags, setFlags] = useState<FabRolesFlags>({
    est_bureau_etude: false,
    est_usinage_numerique: false,
    est_respo_fab: false,
    est_finition: false,
    est_manutention: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("est_bureau_etude, est_usinage_numerique, est_respo_fab, est_finition, est_manutention")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setFlags({
          est_bureau_etude: !!data.est_bureau_etude,
          est_usinage_numerique: !!data.est_usinage_numerique,
          est_respo_fab: !!data.est_respo_fab,
          est_finition: !!data.est_finition,
          est_manutention: !!data.est_manutention,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { flags, loading };
}

export type EligibleEtape = "be" | "usinage" | "respo_fab" | "finition" | "manutention";

/** Pure : étapes éligibles selon les flags rôle (utilisé en tests). */
export function getEligibleEtapesForRoles(flags: FabRolesFlags): EligibleEtape[] {
  const out: EligibleEtape[] = [];
  if (flags.est_bureau_etude) out.push("be");
  if (flags.est_usinage_numerique) out.push("usinage");
  if (flags.est_respo_fab) out.push("respo_fab");
  if (flags.est_finition) out.push("finition");
  if (flags.est_manutention) out.push("manutention");
  return out;
}
