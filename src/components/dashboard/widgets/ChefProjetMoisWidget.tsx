/**
 * v0.40.x — Widget "Chef projet du mois".
 * Pour chaque profil chef projet ayant des objets dont l'étape "respo_fab" a été
 * marquée "termine" ce mois, calcule un ratio :
 *   ratio = #livrés à temps (etape.date_fin <= affaire.date_demontage) / #livrés au total
 * Garde celui avec le meilleur ratio (ties: plus de livraisons).
 */
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getFirstOfMonth, toIsoDate } from "@/lib/dashboard-fun-helpers";

interface TopRow {
  prenom: string;
  ratio: number;
  total: number;
  avatar_url: string | null;
  is_self: boolean;
}

export function ChefProjetMoisWidget() {
  const { user } = useAuth();
  const [top, setTop] = useState<TopRow | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const firstOfMonth = getFirstOfMonth(new Date());
      // Étapes "respo_fab" terminées ce mois, avec objet → respo_fab_id, et affaire date_demontage
      const { data } = await supabase
        .from("fabrication_etapes")
        .select(`
          id, date_fin, statut, type_etape,
          objet:objet_id(
            respo_fab_id,
            affaire:affaire_id(date_demontage)
          )
        `)
        .eq("type_etape", "respo_fab")
        .eq("statut", "termine")
        .gte("date_fin", toIsoDate(firstOfMonth));
      if (cancelled) return;
      const stats = new Map<string, { ok: number; total: number }>();
      const respoIds = new Set<string>();
      for (const e of (data ?? []) as any[]) {
        const respoId = e.objet?.respo_fab_id;
        if (!respoId) continue;
        respoIds.add(respoId);
        const dateDem = e.objet?.affaire?.date_demontage;
        const ok = dateDem && e.date_fin && new Date(e.date_fin) <= new Date(dateDem);
        const cur = stats.get(respoId) ?? { ok: 0, total: 0 };
        cur.total += 1;
        if (ok) cur.ok += 1;
        stats.set(respoId, cur);
      }
      if (respoIds.size === 0) {
        setTop(null);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", Array.from(respoIds));
      let best: TopRow | null = null;
      for (const [pid, s] of stats.entries()) {
        const prof = (profs ?? []).find((p) => p.id === pid);
        if (!prof) continue;
        const ratio = s.total > 0 ? s.ok / s.total : 0;
        const prenom = (prof.full_name ?? "").split(" ")[0] || "—";
        const candidate: TopRow = {
          prenom,
          ratio,
          total: s.total,
          avatar_url: prof.avatar_url ?? null,
          is_self: !!user && pid === user.id,
        };
        if (!best || candidate.ratio > best.ratio || (candidate.ratio === best.ratio && candidate.total > best.total)) {
          best = candidate;
        }
      }
      setTop(best);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (top === undefined || top === null) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Chef projet du mois
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {top.avatar_url ? <AvatarImage src={top.avatar_url} alt={top.prenom} /> : null}
          <AvatarFallback>{top.prenom.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {top.is_self ? `Bravo ${top.prenom}, top du mois ! 🏆` : `${top.prenom} 🏆`}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{Math.round(top.ratio * 100)}% à temps</Badge>
            <span className="text-xs text-muted-foreground">
              {top.total} livraison{top.total > 1 ? "s" : ""} ce mois
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
