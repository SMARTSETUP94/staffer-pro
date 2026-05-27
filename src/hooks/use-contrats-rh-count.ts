import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";

/** Compte les contrats signés employé qui attendent une contre-signature RH. */
export function useContratsRhCount(): number {
  const { user } = useAuth();
  const canSignEmployeur = useCapability("contrats.sign_employeur");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canSignEmployeur || !user) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("contrats_intermittents")
        .select("id", { count: "exact", head: true })
        .eq("statut", "a_signer_employeur");
      if (!cancelled) setCount(c ?? 0);
    };

    fetchCount();
    const channel = supabase
      .channel("contrats-rh-count")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contrats_signatures" },
        () => fetchCount(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [canSignEmployeur, user]);

  return count;
}
