// Sprint 3b.1 — Hook autorisations véhicules
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AutorisationVehicule } from "@/lib/autorisations-vehicules";

export function useAutorisationsVehicules(employeId?: string) {
  const [data, setData] = useState<AutorisationVehicule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from("employes_autorisations_vehicules")
      .select("*")
      .order("type_autorisation");
    if (employeId) q = q.eq("employe_id", employeId);
    const { data: rows, error: err } = await q;
    if (err) setError(err.message);
    else setData((rows ?? []) as unknown as AutorisationVehicule[]);
    setLoading(false);
  }, [employeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
