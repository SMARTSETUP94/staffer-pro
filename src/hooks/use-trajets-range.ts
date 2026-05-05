/**
 * v0.41.0b — Sprint 3b.3 : hook fetch trajets avec range date.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Trajet } from "@/lib/trajets-stats";

export function useTrajetsRange(dateFrom: string | null, dateTo: string | null) {
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    let q = supabase.from("trajets").select("*").order("date", { ascending: false });
    if (dateFrom) q = q.gte("date", dateFrom);
    if (dateTo) q = q.lte("date", dateTo);
    const { data, error } = await q.limit(2000);
    if (!error) setTrajets((data as Trajet[]) ?? []);
    setIsLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { trajets, isLoading, refetch };
}

export interface AffaireLite {
  id: string;
  numero: string;
  nom: string;
}

export function useAffairesLite() {
  const [affaires, setAffaires] = useState<AffaireLite[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("affaires")
        .select("id, numero, nom")
        .order("numero", { ascending: false })
        .limit(500);
      setAffaires((data as AffaireLite[]) ?? []);
    })();
  }, []);
  return affaires;
}
