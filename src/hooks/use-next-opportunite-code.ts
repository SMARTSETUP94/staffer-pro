import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * v0.28.0 — Hook utilitaire pour suggérer le prochain code 9XXX libre.
 * Utilisé par la vue Tableur opportunités lors de l'ajout d'une nouvelle ligne.
 *
 * Wrap autour de la RPC `next_affaire_numero(_prefix=9)`.
 */
export function useNextOpportuniteCode() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNext = useCallback(async (): Promise<string | null> => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("next_affaire_numero", {
      _prefix: 9,
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return null;
    }
    return data ? String(data) : null;
  }, []);

  return { fetchNext, loading, error };
}
