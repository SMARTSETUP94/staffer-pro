// Sprint 3b.2 — Hook carnet sous-traitants
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SousTraitant, SousTraitantType } from "@/lib/sous-traitants";

interface Options {
  type?: SousTraitantType;
  actifOnly?: boolean;
}

export function useSousTraitants(opts: Options = {}) {
  const { type, actifOnly = true } = opts;
  const [data, setData] = useState<SousTraitant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase.from("sous_traitants").select("*").order("nom");
    if (type) q = q.eq("type", type);
    if (actifOnly) q = q.eq("actif", true);
    const { data: rows, error: err } = await q;
    if (err) setError(err.message);
    else setData((rows ?? []) as unknown as SousTraitant[]);
    setLoading(false);
  }, [type, actifOnly]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
