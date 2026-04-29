import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import type { OpportuniteStatut, OpportuniteTaille } from "@/lib/opportunites";

export interface OppRow {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  charge_affaires_id: string | null;
  taille: OpportuniteTaille | null;
  statut_opportunite: OpportuniteStatut | null;
  date_opportunite: string | null;
  signed_at: string | null;
  code_opportunite: string | null;
  updated_at: string;
}

interface PipelineData {
  opps: OppRow[];
  loading: boolean;
  scope: "mine" | "all";
  setScope: (s: "mine" | "all") => void;
  chargesById: Map<string, { name: string }>;
  filtered: OppRow[];
  isAdmin: boolean;
  userId: string | null;
}

/**
 * Hook partagé entre tous les widgets commerce — évite 5 fetches doublons.
 * v0.26.0
 */
export function useOpportunitesPipeline(): PipelineData {
  const { user, isAdmin } = useAuth();
  const { data: charges } = useChargesAffaires();
  const [scope, setScope] = useState<"mine" | "all">(isAdmin ? "all" : "mine");
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("affaires")
        .select(
          "id, numero, nom, client, charge_affaires_id, taille, statut_opportunite, date_opportunite, signed_at, code_opportunite, updated_at",
        )
        .or("phase.eq.opportunite,code_opportunite.not.is.null");
      if (cancelled) return;
      if (error) setOpps([]);
      else setOpps((data ?? []) as unknown as OppRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chargesById = new Map<string, { name: string }>();
  charges.forEach((c) => chargesById.set(c.id, { name: c.full_name ?? c.email }));

  const filtered =
    scope === "mine" && user?.id
      ? opps.filter((o) => o.charge_affaires_id === user.id)
      : opps;

  return {
    opps,
    loading,
    scope,
    setScope,
    chargesById,
    filtered,
    isAdmin,
    userId: user?.id ?? null,
  };
}
