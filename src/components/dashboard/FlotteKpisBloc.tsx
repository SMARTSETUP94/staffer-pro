import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, format, startOfWeek, endOfWeek } from "date-fns";
import { Truck, AlertTriangle, Calendar, Gauge, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { alerteDate } from "@/hooks/use-vehicules";
import type { Tables } from "@/integrations/supabase/types";

type Vehicule = Tables<"vehicules">;
type Trajet = Tables<"trajets">;

interface AlerteVehicule {
  id: string;
  nom: string;
  immatriculation: string | null;
  type: "controle_technique" | "revision" | "assurance";
  niveau: "warning" | "expired";
  date: string;
}

const TYPE_LABEL: Record<AlerteVehicule["type"], string> = {
  controle_technique: "CT",
  revision: "Révision",
  assurance: "Assurance",
};

export function FlotteKpisBloc() {
  const [loading, setLoading] = useState(true);
  const [vehiculesJ, setVehiculesJ] = useState(0);
  const [vehiculesJ1, setVehiculesJ1] = useState(0);
  const [kmSemaine, setKmSemaine] = useState(0);
  const [alertes, setAlertes] = useState<AlerteVehicule[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");
      const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const [vehRes, trajetsRes] = await Promise.all([
        supabase.from("vehicules").select("*").eq("actif", true),
        supabase
          .from("trajets")
          .select("vehicule_id, date, kilometrage")
          .gte("date", weekStart)
          .lte("date", weekEnd),
      ]);

      if (cancelled) return;

      const vehicules = (vehRes.data ?? []) as Vehicule[];
      const trajets = (trajetsRes.data ?? []) as Pick<Trajet, "vehicule_id" | "date" | "kilometrage">[];

      // Véhicules en service J et J+1 (distincts)
      const setJ = new Set<string>();
      const setJ1 = new Set<string>();
      let totalKm = 0;
      trajets.forEach((t) => {
        if (t.vehicule_id) {
          if (t.date === todayStr) setJ.add(t.vehicule_id);
          if (t.date === tomorrowStr) setJ1.add(t.vehicule_id);
        }
        totalKm += Number(t.kilometrage ?? 0);
      });
      setVehiculesJ(setJ.size);
      setVehiculesJ1(setJ1.size);
      setKmSemaine(Math.round(totalKm));

      // Alertes J-30 sur CT / révision / assurance
      const alertesArr: AlerteVehicule[] = [];
      vehicules.forEach((v) => {
        const checks: Array<[AlerteVehicule["type"], string | null]> = [
          ["controle_technique", v.date_controle_technique],
          ["revision", v.date_prochaine_revision],
          ["assurance", v.date_expiration_assurance],
        ];
        checks.forEach(([type, date]) => {
          if (!date) return;
          const niveau = alerteDate(date, 30);
          if (niveau === "warning" || niveau === "expired") {
            alertesArr.push({
              id: v.id,
              nom: v.nom,
              immatriculation: v.immatriculation,
              type,
              niveau,
              date,
            });
          }
        });
      });
      // Tri : expirés d'abord, puis par date croissante
      alertesArr.sort((a, b) => {
        if (a.niveau !== b.niveau) return a.niveau === "expired" ? -1 : 1;
        return a.date.localeCompare(b.date);
      });
      setAlertes(alertesArr);
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
          <Truck className="h-4 w-4 text-primary" />
          Flotte
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/flotte">
            Gérer <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini-KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <MiniKpi icon={Calendar} label="En service J" value={loading ? "—" : vehiculesJ} />
          <MiniKpi icon={Calendar} label="En service J+1" value={loading ? "—" : vehiculesJ1} />
          <MiniKpi icon={Gauge} label="km cette semaine" value={loading ? "—" : kmSemaine} />
        </div>

        {/* Alertes véhicules */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Alertes véhicules (J-30)
            </p>
            {alertes.length > 0 && (
              <Badge
                variant={alertes.some((a) => a.niveau === "expired") ? "destructive" : "outline"}
                className="text-[10px]"
              >
                {alertes.length}
              </Badge>
            )}
          </div>
          {loading ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Chargement…</p>
          ) : alertes.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Aucune alerte ✓
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {alertes.slice(0, 5).map((a, idx) => (
                <li
                  key={`${a.id}-${a.type}-${idx}`}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <AlertTriangle
                      className={`h-3.5 w-3.5 shrink-0 ${a.niveau === "expired" ? "text-destructive" : "text-warning"}`}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {a.nom}
                        {a.immatriculation ? (
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                            {a.immatriculation}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {TYPE_LABEL[a.type]} ·{" "}
                        {format(new Date(a.date + "T00:00:00"), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={a.niveau === "expired" ? "destructive" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {a.niveau === "expired" ? "Expiré" : "Bientôt"}
                  </Badge>
                </li>
              ))}
              {alertes.length > 5 && (
                <li className="px-3 py-2 text-center text-[11px] italic text-muted-foreground">
                  + {alertes.length - 5} autre{alertes.length - 5 > 1 ? "s" : ""}…
                </li>
              )}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniKpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
