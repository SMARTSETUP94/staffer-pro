/**
 * v0.40.x — Widget "Top constructeur de la semaine".
 * Somme des heures validées (statut='valide') depuis lundi courant pour les
 * métiers atelier (pas BE / pas Machiniste).
 * Reset auto chaque lundi par calcul. Cellule vide si 0 h validées.
 */
import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ATELIER_METIER_CODES, getMondayOfWeek, toIsoDate } from "@/lib/dashboard-fun-helpers";

interface TopRow {
  prenom: string;
  total: number;
  avatar_url: string | null;
  is_self: boolean;
}

export function TopConstructeurWidget() {
  const { user } = useAuth();
  const [top, setTop] = useState<TopRow | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const monday = getMondayOfWeek(new Date());
      // Métiers atelier
      const { data: metiers } = await supabase.from("metiers").select("id, code");
      const atelierIds = new Set(
        (metiers ?? []).filter((m) => ATELIER_METIER_CODES.has(m.code)).map((m) => m.id),
      );
      const { data } = await supabase
        .from("heures_saisies")
        .select("heures_reelles, employe_id, metier_id, employes:employe_id(prenom, profile_id, metier_principal_id, profiles:profile_id(avatar_url))")
        .eq("statut", "valide")
        .gte("date", toIsoDate(monday));
      if (cancelled) return;
      const totals = new Map<string, { prenom: string; total: number; avatar_url: string | null; profile_id: string | null }>();
      for (const r of (data ?? []) as any[]) {
        const metierId = r.metier_id ?? r.employes?.metier_principal_id;
        if (!metierId || !atelierIds.has(metierId)) continue;
        const h = Number(r.heures_reelles ?? 0);
        if (!h || !r.employes) continue;
        const cur = totals.get(r.employe_id) ?? {
          prenom: r.employes.prenom,
          total: 0,
          avatar_url: r.employes.profiles?.avatar_url ?? null,
          profile_id: r.employes.profile_id ?? null,
        };
        cur.total += h;
        totals.set(r.employe_id, cur);
      }
      let best: TopRow | null = null;
      for (const v of totals.values()) {
        if (!best || v.total > best.total) {
          best = {
            prenom: v.prenom,
            total: v.total,
            avatar_url: v.avatar_url,
            is_self: !!user && v.profile_id === user.id,
          };
        }
      }
      if (!best || best.total <= 0) setTop(null);
      else setTop(best);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (top === undefined || top === null) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Top constructeur de la semaine
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {top.avatar_url ? <AvatarImage src={top.avatar_url} alt={top.prenom} /> : null}
          <AvatarFallback>{top.prenom.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold">
            {top.is_self ? `Cette semaine, c'est toi le top, ${top.prenom} ! 🔥` : `${top.prenom} 🔥`}
          </p>
          <p className="text-xs text-muted-foreground">
            {top.total.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h validées cette semaine
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
