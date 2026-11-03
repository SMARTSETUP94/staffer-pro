import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { pointsNote, pointsRestants } from "@/lib/devis/editeur-lisibilite";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export type InfoClaude = { id: string; cree_par_mcp: boolean; note_mcp: string | null; modifie_par_humain_le: string | null; note_mcp_coches?: string[] | null };

/** Devis rédigés par Claude parmi les identifiants donnés (une seule requête par liste). */
export function useDevisClaude(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["devis-claude", key],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("devis").select("id,cree_par_mcp,note_mcp,modifie_par_humain_le,note_mcp_coches").in("id", ids).eq("cree_par_mcp", true);
      if (error) throw error;
      return new Map(((data ?? []) as InfoClaude[]).map((d) => [d.id, d]));
    },
  });
}

export function BadgeClaude() {
  return <Badge variant="secondary" className="ml-1 gap-1 align-middle text-[10px]"><Bot className="h-3 w-3" />Rédigé par Claude</Badge>;
}

/** Note de Claude repliée par défaut : « n points à confirmer », chaque point se barre (enregistré sur le devis). */
export function NoteClaude({ info, peutCocher = false }: { info: InfoClaude; peutCocher?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [coches, setCoches] = useState<string[]>(Array.isArray(info.note_mcp_coches) ? info.note_mcp_coches : []);
  if (!info.note_mcp) return null;
  const points = pointsNote(info.note_mcp);
  const restants = pointsRestants(points, coches);
  const basculer = async (p: string) => {
    const next = coches.includes(p) ? coches.filter((x) => x !== p) : [...coches, p];
    setCoches(next);
    const { error } = await supabase.rpc("devis_note_mcp_cocher", { _devis_id: info.id, _coches: next });
    if (error) { setCoches(coches); return void toast.error("Enregistrement impossible", { description: error.message }); }
    void qc.invalidateQueries({ queryKey: ["devis-claude"] });
  };
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-foreground">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<Bot className="h-4 w-4" />
        Note de Claude · {restants === 0 ? "tous les points sont vus" : `${restants} point${restants > 1 ? "s" : ""} à confirmer`}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{open ? "Replier" : "Déplier"}</span>
      </button>
      {open && (
        <ul className="space-y-1 border-t border-primary/20 px-3 py-2">
          {points.map((p, i) => {
            const fait = coches.includes(p);
            return (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={fait} disabled={!peutCocher} onChange={() => void basculer(p)} />
                  <span className={fait ? "text-muted-foreground line-through" : "text-foreground"}>{p}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
