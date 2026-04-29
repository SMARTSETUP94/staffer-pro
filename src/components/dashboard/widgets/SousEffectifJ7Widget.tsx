/**
 * v0.26.0 — Widget "Sous-effectif J+7" : alerte si demande > capacité sur 7 jours.
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SousEffectifJ7Widget() {
  const [data, setData] = useState<{ demande: number; capacite: number; gap: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const j7 = new Date(today);
      j7.setDate(j7.getDate() + 7);
      const j7Str = j7.toISOString().slice(0, 10);

      const [empRes, assRes] = await Promise.all([
        supabase.from("employes").select("id, type_contrat").eq("actif", true).eq("non_staffing", false),
        supabase.from("assignations").select("heures").gte("date", todayStr).lte("date", j7Str),
      ]);
      if (cancelled) return;

      // Capacité approx : CDI = 7h × 5 jours ouvrés sur les 7 prochains jours
      const cdis = (empRes.data ?? []).filter((e) => e.type_contrat === "CDI").length;
      let workdays = 0;
      const cur = new Date(today);
      while (cur <= j7) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) workdays += 1;
        cur.setDate(cur.getDate() + 1);
      }
      const capacite = cdis * 7 * workdays;
      const demande = (assRes.data ?? []).reduce((acc, r) => acc + Number(r.heures ?? 0), 0);
      const gap = demande - capacite;
      setData({ demande: Math.round(demande), capacite, gap: Math.round(gap) });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const tone = data && data.gap > 0 ? "border-destructive/40 bg-destructive/5" : "border-border";
  return (
    <Card className={tone}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${data && data.gap > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          Sous-effectif J+7
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <p className="py-3 text-center text-xs text-muted-foreground">Chargement…</p>
        ) : data.gap > 0 ? (
          <div className="space-y-1">
            <p className="text-2xl font-bold tabular-nums text-destructive">+{data.gap}h manquantes</p>
            <p className="text-xs text-muted-foreground">
              Demande {data.demande}h vs capacité {data.capacite}h sur les 7 prochains jours.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-2xl font-bold tabular-nums text-emerald-600">OK</p>
            <p className="text-xs text-muted-foreground">
              Capacité {data.capacite}h ≥ demande {data.demande}h sur les 7 prochains jours.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
