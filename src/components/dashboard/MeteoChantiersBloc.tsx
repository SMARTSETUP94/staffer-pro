import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, ArrowRight, HardHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AffaireRow {
  id: string;
  numero: string;
  nom: string;
  lieu: string | null;
  chef?: { prenom: string; nom: string } | null;
}

interface DayBucket {
  date: string;
  label: string;
  affaires: Array<AffaireRow & { effectif: number }>;
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date, offset: number) {
  if (offset === 0) return "Aujourd'hui";
  if (offset === 1) return "Demain";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "short" });
}

export function MeteoChantiersBloc() {
  const [buckets, setBuckets] = useState<DayBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days: Date[] = [0, 1, 2].map((i) => {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        return d;
      });
      const dayKeys = days.map(dayKey);
      const startStr = dayKeys[0];
      const endStr = dayKeys[2];

      const { data: assData } = await supabase
        .from("assignations")
        .select(
          "date, affaire_id, employe_id, affaires:affaire_id(id, numero, nom, lieu, chef_chantier_id, employes:chef_chantier_id(prenom, nom))",
        )
        .gte("date", startStr)
        .lte("date", endStr);

      if (cancelled) return;

      const map = new Map<string, Map<string, AffaireRow & { employes: Set<string> }>>();
      for (const k of dayKeys) map.set(k, new Map());

      for (const row of (assData ?? []) as any[]) {
        const dayMap = map.get(row.date);
        if (!dayMap) continue;
        const aff = row.affaires;
        if (!aff) continue;
        const existing = dayMap.get(aff.id);
        if (existing) {
          existing.employes.add(row.employe_id);
        } else {
          dayMap.set(aff.id, {
            id: aff.id,
            numero: aff.numero,
            nom: aff.nom,
            lieu: aff.lieu,
            chef: aff.employes ?? null,
            employes: new Set([row.employe_id]),
          });
        }
      }

      const result: DayBucket[] = days.map((d, i) => {
        const dayMap = map.get(dayKeys[i])!;
        const affaires = Array.from(dayMap.values())
          .map((a) => ({
            id: a.id,
            numero: a.numero,
            nom: a.nom,
            lieu: a.lieu,
            chef: a.chef,
            effectif: a.employes.size,
          }))
          .sort((a, b) => b.effectif - a.effectif);
        return { date: dayKeys[i], label: dayLabel(d, i), affaires };
      });

      setBuckets(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Météo chantiers (J / J+1 / J+2)
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
        ) : buckets.every((b) => b.affaires.length === 0) ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun chantier staffé sur les 3 prochains jours
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {buckets.map((b) => (
              <div key={b.date} className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 capitalize">
                  {b.label}
                </p>
                {b.affaires.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Rien de prévu</p>
                ) : (
                  <ul className="space-y-2">
                    {b.affaires.slice(0, 4).map((a) => (
                      <li key={a.id} className="rounded-md bg-card p-2 border">
                        <Link
                          to="/affaires/$affaireId"
                          params={{ affaireId: a.id }}
                          className="block hover:text-primary"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium truncate flex-1">
                              {a.numero}
                            </p>
                            <Badge variant="secondary" className="text-[10px] shrink-0 px-1.5 py-0">
                              {a.effectif}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{a.nom}</p>
                          {a.lieu && (
                            <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              {a.lieu}
                            </p>
                          )}
                          {a.chef && (
                            <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                              <HardHat className="h-2.5 w-2.5 shrink-0" />
                              {a.chef.prenom} {a.chef.nom}
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                    {b.affaires.length > 4 && (
                      <li className="text-[10px] text-muted-foreground text-center pt-1">
                        +{b.affaires.length - 4} autre{b.affaires.length - 4 > 1 ? "s" : ""}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
