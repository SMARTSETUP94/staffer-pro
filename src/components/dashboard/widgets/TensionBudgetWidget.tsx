/**
 * v0.26.0 — Widget "Top affaires en tension budget (≥80%)".
 * Extrait du dashboard.tsx d'origine.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Dep {
  affaire_id: string;
  numero: string;
  nom: string;
  total_prevues: number;
  total_assignees: number;
  total_validees: number;
  pct: number;
  pct_valide: number;
}

export function TensionBudgetWidget() {
  const [deps, setDeps] = useState<Dep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("v_affaire_consommation")
        .select(
          "affaire_id, numero, nom, total_heures_prevues, total_heures_assignees, total_heures_reelles_validees, affaires!inner(statut)",
        )
        .in("affaires.statut", ["en_cours", "prospect"]);
      if (cancelled) return;
      const dep = (data ?? [])
        .filter((r) => Number(r.total_heures_prevues ?? 0) > 0)
        .map((r) => {
          const prev = Number(r.total_heures_prevues ?? 0);
          const ass = Number(r.total_heures_assignees ?? 0);
          const val = Number(r.total_heures_reelles_validees ?? 0);
          return {
            affaire_id: r.affaire_id as string,
            numero: r.numero as string,
            nom: r.nom as string,
            total_prevues: prev,
            total_assignees: ass,
            total_validees: val,
            pct: prev > 0 ? Math.round((ass / prev) * 100) : 0,
            pct_valide: prev > 0 ? Math.round((val / prev) * 100) : 0,
          };
        })
        .filter((r) => Math.max(r.pct, r.pct_valide) >= 80)
        .sort((a, b) => Math.max(b.pct, b.pct_valide) - Math.max(a.pct, a.pct_valide))
        .slice(0, 5);
      setDeps(dep);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Top affaires en tension budget
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/affaires">Voir tout <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : deps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune affaire en tension (≥80% consommé)</p>
        ) : (
          <ul className="space-y-3">
            {deps.map((d) => {
              const pctMax = Math.max(d.pct, d.pct_valide);
              const tone = pctMax >= 100 ? "destructive" : pctMax >= 90 ? "default" : "secondary";
              const barColor = pctMax >= 100 ? "bg-destructive" : pctMax >= 90 ? "bg-primary" : "bg-warning";
              return (
                <li key={d.affaire_id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/affaires/$affaireId" params={{ affaireId: d.affaire_id }} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">
                      <span className="font-mono text-xs text-primary">{d.numero}</span>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <span>{d.nom}</span>
                    </Link>
                    <Badge variant={tone} className="shrink-0 text-xs tabular-nums">{pctMax}%</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, pctMax)}%` }} aria-hidden />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      Staffé {d.total_assignees}h · Validé {d.total_validees}h / {d.total_prevues}h
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
