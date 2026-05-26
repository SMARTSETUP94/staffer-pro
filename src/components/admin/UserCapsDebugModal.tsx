/**
 * L3a — Panneau debug "Caps effectives".
 *
 * Affiche pour un user donné l'union résolue de ses capabilities :
 *  - une chip par cap (vert si granted, gris sinon)
 *  - le scope résolu (all / team / metier / own)
 *  - la liste des rôles qui contribuent
 *
 * Source : RPC `get_user_effective_caps(uuid)` (SECURITY DEFINER).
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { roleLabel } from "@/lib/labels";

interface CapRow {
  capability: string;
  granted: boolean;
  scope_resolved: string;
  source_roles: string[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string | null;
  targetLabel: string;
}

const SCOPE_COLOR: Record<string, string> = {
  all: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  team: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  metier: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  own: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  none: "bg-muted text-muted-foreground border-border",
};

export function UserCapsDebugModal({ open, onOpenChange, targetUserId, targetLabel }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["user-effective-caps", targetUserId],
    enabled: !!targetUserId && open,
    queryFn: async (): Promise<CapRow[]> => {
      if (!targetUserId) return [];
      const { data, error } = await supabase.rpc("get_user_effective_caps", {
        _user_id: targetUserId,
      });
      if (error) {
        console.warn("[UserCapsDebugModal]", error.message);
        return [];
      }
      return (data ?? []) as CapRow[];
    },
  });

  const granted = (data ?? []).filter((c) => c.granted);
  const sourceRoles = Array.from(
    new Set(granted.flatMap((c) => c.source_roles ?? [])),
  );

  // Regroupement par catégorie (préfixe avant le point)
  const groups = granted.reduce<Record<string, CapRow[]>>((acc, c) => {
    const cat = c.capability.split(".")[0] ?? "autre";
    (acc[cat] ??= []).push(c);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Caps effectives — {targetLabel}</DialogTitle>
          <DialogDescription>
            Union résolue des permissions accordées par les rôles de l'utilisateur.
            Scope agrégé selon la priorité <code>all &gt; team &gt; metier &gt; own</code>.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : granted.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Aucune capability accordée. L'utilisateur n'a peut-être aucun rôle attribué.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-semibold">
                  Union résolue de {sourceRoles.length} rôle(s) :
                </span>{" "}
                {sourceRoles.map((r) => roleLabel(r)).join(" + ")}
              </div>

              {Object.entries(groups)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, caps]) => (
                  <div key={cat}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat} ({caps.length})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {caps.map((c) => (
                        <Badge
                          key={c.capability}
                          variant="outline"
                          className={`gap-1 ${SCOPE_COLOR[c.scope_resolved] ?? SCOPE_COLOR.none}`}
                          title={`scope: ${c.scope_resolved} · roles: ${(c.source_roles ?? []).join(", ")}`}
                        >
                          <span className="font-mono text-[10px]">{c.capability}</span>
                          <span className="text-[9px] opacity-70">{c.scope_resolved}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
