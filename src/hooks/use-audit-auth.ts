/**
 * v0.26.2 — Hooks Audit Auth (admin only).
 *
 * L3b1 — Migré sur `useCapability("admin.audit")` au lieu de `useAuth().isAdmin`.
 * Les RPC `admin_get_*` restent gatées côté SQL (SECURITY DEFINER + check admin),
 * on désactive aussi les hooks côté front quand la cap manque pour éviter un
 * appel réseau inutile.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import type { DatePreset } from "@/lib/audit-auth-helpers";
import { presetRange } from "@/lib/audit-auth-helpers";


export interface AuthEventRow {
  id: string;
  created_at: string;
  action: string | null;
  log_type: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  ip_address: string | null;
  raw_payload: Record<string, unknown> | null;
}

export interface ConnectionStatRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  status: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  created_at: string | null;
  sessions_30d: number;
}

export interface InvitationRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  invited_at: string | null;
  invited_by: string | null;
  invited_by_name: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  statut: "envoye" | "accepte" | "expire";
}

export function useAuthEvents(filters: {
  types?: string[];
  preset?: DatePreset;
  limit?: number;
}) {
  const { isAdmin } = useAuth();
  const { types, preset = "7d", limit = 500 } = filters;
  const range = presetRange(preset);

  return useQuery({
    queryKey: ["admin", "auth-events", types ?? "all", preset, limit],
    enabled: isAdmin,
    queryFn: async (): Promise<AuthEventRow[]> => {
      const { data, error } = await supabase.rpc("admin_get_auth_events", {
        p_types: types && types.length > 0 ? types : undefined,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AuthEventRow[];
    },
    staleTime: 30_000,
  });
}

export function useUserConnectionStats() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ["admin", "auth-connection-stats"],
    enabled: isAdmin,
    queryFn: async (): Promise<ConnectionStatRow[]> => {
      const { data, error } = await supabase.rpc("admin_get_user_connection_stats");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConnectionStatRow[];
    },
    staleTime: 30_000,
  });
}

export function useInvitationsList() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ["admin", "auth-invitations"],
    enabled: isAdmin,
    queryFn: async (): Promise<InvitationRow[]> => {
      const { data, error } = await supabase.rpc("admin_get_invitations");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as InvitationRow[];
    },
    staleTime: 30_000,
  });
}
