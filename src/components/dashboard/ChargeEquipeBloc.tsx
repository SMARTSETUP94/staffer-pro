import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMetiers } from "@/hooks/use-metiers";

interface Props {
  weekStart: string;
  weekEnd: string;
}

interface Row {
  metierId: number;
  libelle: string;
  couleur: string;
  capaciteH: number;
  assigneesH: number;
  pct: number;
}

// Capacité = nb employés actifs (non_staffing=false) ayant ce métier principal × 5j × 8h
export function ChargeEquipeBloc({ weekStart, weekEnd }: Props) {
  const { metiers } = useMetiers();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (metiers.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [empRes, assRes] = await Promise.all([
        supabase
          .from("employes")
          .select("metier_principal_id")
          .eq("actif", true)
          .eq("non_staffing", false),
        supabase
          .from("assignations")
          .select("metier_id, heures")
          .gte("date", weekStart)
          .lte("date", weekEnd),
      ]);
      if (cancelled) return;

      const capByMetier = new Map<number, number>();
      for (const e of empRes.data ?? []) {
        const id = e.metier_principal_id as number;
        capByMetier.set(id, (capByMetier.get(id) ?? 0) + 1);
      }
      const assByMetier = new Map<number, number>();
      for (const a of assRes.data ?? []) {
        const id = a.metier_id as number;
        assByMetier.set(id, (assByMetier.get(id) ?? 0) + Number(a.heures ?? 0));
      }

      const r: Row[] = metiers
        .map((m) => {
          const nbEmp = capByMetier.get(m.id) ?? 0;
          const cap = nbEmp * 5 * 8; // capa hebdo théorique
          const ass = assByMetier.get(m.id) ?? 0;
          return {
            metierId: m.id,
            libelle: m.libelle,
            couleur: m.couleur,
            capaciteH: cap,
            assigneesH: ass,
            pct: cap > 0 ? Math.round((ass / cap) * 100) : ass > 0 ? 999 : 0,
          };
        })
        .filter((r) => r.capaciteH > 0 || r.assigneesH > 0)
        .sort((a, b) => b.pct - a.pct);

      setRows(r);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [metiers, weekStart, weekEnd]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Charge équipe — semaine en cours
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/planning">
            Planning <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune donnée de capacité cette semaine
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const pctDisplay = Math.min(r.pct, 120);
              const tone =
                r.pct >= 100
                  ? "text-destructive"
                  : r.pct >= 85
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground";
              return (
                <li key={r.metierId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: r.couleur }}
                        aria-hidden
                      />
                      <span className="font-medium truncate">{r.libelle}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground tabular-nums">
                        {r.assigneesH}/{r.capaciteH}h
                      </span>
                      <span className={`font-semibold tabular-nums ${tone}`}>
                        {r.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pctDisplay}%`,
                        backgroundColor:
                          r.pct >= 100
                            ? "hsl(var(--destructive))"
                            : r.couleur,
                      }}
                    />
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
