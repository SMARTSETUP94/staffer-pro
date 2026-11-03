import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export type InfoClaude = { id: string; cree_par_mcp: boolean; note_mcp: string | null; modifie_par_humain_le: string | null };

/** Devis rédigés par Claude parmi les identifiants donnés (une seule requête par liste). */
export function useDevisClaude(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["devis-claude", key],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("devis").select("id,cree_par_mcp,note_mcp,modifie_par_humain_le").in("id", ids).eq("cree_par_mcp", true);
      if (error) throw error;
      return new Map(((data ?? []) as InfoClaude[]).map((d) => [d.id, d]));
    },
  });
}

export function BadgeClaude() {
  return <Badge variant="secondary" className="ml-1 gap-1 align-middle text-[10px]"><Bot className="h-3 w-3" />Rédigé par Claude</Badge>;
}

export function NoteClaude({ info }: { info: InfoClaude }) {
  if (!info.note_mcp) return null;
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <p className="mb-1 flex items-center gap-1 font-medium"><Bot className="h-4 w-4" />Note de Claude — hypothèses à confirmer</p>
      <p className="whitespace-pre-wrap text-muted-foreground">{info.note_mcp}</p>
    </div>
  );
}
