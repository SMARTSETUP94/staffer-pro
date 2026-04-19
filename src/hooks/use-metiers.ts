import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Metier {
  id: number;
  code: string;
  libelle: string;
  couleur: string;
  ordre: number;
}

let cache: Metier[] | null = null;
let pending: Promise<Metier[]> | null = null;

async function loadMetiers(): Promise<Metier[]> {
  if (cache) return cache;
  if (pending) return pending;
  pending = supabase
    .from("metiers")
    .select("*")
    .order("ordre", { ascending: true })
    .then(({ data, error }) => {
      pending = null;
      if (error || !data) return [];
      cache = data as Metier[];
      return cache;
    });
  return pending;
}

/**
 * Hook simple pour récupérer la table `metiers` (peu volumineuse, mise en cache).
 */
export function useMetiers() {
  const [metiers, setMetiers] = useState<Metier[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    loadMetiers().then((m) => {
      setMetiers(m);
      setLoading(false);
    });
  }, []);

  const byId = (id: number | null | undefined) =>
    id == null ? undefined : metiers.find((m) => m.id === id);

  return { metiers, loading, byId };
}
