import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";

/**
 * Compte les heures soumises en attente de validation (statut="soumis").
 * Utilisé pour afficher un badge dans la sidebar Équipes → Validation heures.
 */
export function useValidationCount(): number {
  const { user } = useAuth();
  const canValider = useCapability("heures.valider");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canValider || !user) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("heures_saisies")
        .select("id", { count: "exact", head: true })
        .eq("statut", "soumis");
      if (!cancelled) setCount(c ?? 0);
    };
    fetchCount();

    // Realtime : recompter à chaque changement
    const channel = supabase
      .channel("validation-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "heures_saisies" },
        () => fetchCount(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [canValider, user]);

  return count;
}
