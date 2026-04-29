/**
 * v0.26.0 — Widget "Absences cette semaine".
 * Extrait du dashboard.tsx d'origine.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarOff, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ABSENCE_ICON, ABSENCE_LABEL } from "@/lib/absence-helpers";

interface Abs {
  id: string;
  type: string;
  date_debut: string;
  date_fin: string;
  valide: boolean;
  employe?: { prenom: string; nom: string };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 6);
  s.setHours(23, 59, 59, 999);
  return s;
}

export function AbsencesSemaineWidget() {
  const [abs, setAbs] = useState<Abs[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const ws = startOfWeek(today).toISOString().slice(0, 10);
      const we = endOfWeek(today).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("absences")
        .select("id, employe_id, type, date_debut, date_fin, valide, employes:employe_id(prenom, nom)")
        .or(`and(date_debut.lte.${we},date_fin.gte.${ws})`)
        .order("date_debut", { ascending: true })
        .limit(20);
      if (cancelled) return;
      setAbs((data ?? []).map((a: any) => ({
        id: a.id, type: a.type, date_debut: a.date_debut, date_fin: a.date_fin, valide: a.valide, employe: a.employes,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-primary" />
          Absences cette semaine
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/absences">Gérer <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : abs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune absence cette semaine</p>
        ) : (
          <ul className="divide-y">
            {abs.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span aria-hidden>{ABSENCE_ICON[a.type as keyof typeof ABSENCE_ICON] ?? "📌"}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.employe?.prenom} {a.employe?.nom}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ABSENCE_LABEL[a.type as keyof typeof ABSENCE_LABEL] ?? a.type} ·{" "}
                      {a.date_debut === a.date_fin ? fmtDate(a.date_debut) : `${fmtDate(a.date_debut)} → ${fmtDate(a.date_fin)}`}
                    </p>
                  </div>
                </div>
                {!a.valide && <Badge variant="outline" className="text-[11px] shrink-0">À valider</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
