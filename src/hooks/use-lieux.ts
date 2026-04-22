import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Lieu = Tables<"lieux">;
export type LieuType = Lieu["type"]; // "atelier" | "stockage"

/**
 * v0.18.1 — Hook lieux entreprise (ATELIER unique + STOCKAGE 1..N).
 * Utilisé pour :
 *  - la page /parametres/lieux (admin)
 *  - les suggestions automatiques de trajets (montage/démontage chantier)
 */
export function useLieux() {
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lieux")
      .select("*")
      .order("type")
      .order("label");
    if (error) setError(error.message);
    else setLieux((data ?? []) as Lieu[]);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    lieux,
    atelier: lieux.find((l) => l.type === "atelier" && l.actif) ?? null,
    stockages: lieux.filter((l) => l.type === "stockage" && l.actif),
    loading,
    error,
    refresh,
  };
}
