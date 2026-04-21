import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChargeAffaires {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * v0.17 — Charge tous les "chargés d'affaires" potentiels (admins + chefs de chantier
 * actifs). Réutilisé dans le Kanban opportunités (sélecteur CA) et le dashboard pipeline.
 */
export function useChargesAffaires() {
  const [data, setData] = useState<ChargeAffaires[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id, role, status")
        .in("role", ["admin", "chef_chantier"])
        .eq("status", "actif");

      if (rolesErr) {
        if (!cancelled) {
          setError(rolesErr.message);
          setLoading(false);
        }
        return;
      }

      const userIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (userIds.length === 0) {
        if (!cancelled) {
          setData([]);
          setLoading(false);
        }
        return;
      }

      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
        .order("full_name", { ascending: true, nullsFirst: false });

      if (cancelled) return;
      if (profilesErr) {
        setError(profilesErr.message);
        setLoading(false);
        return;
      }
      setData((profiles ?? []) as ChargeAffaires[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
