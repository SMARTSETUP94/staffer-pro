/**
 * v0.26.0 — Widget "Prochains montages & démontages (J+7)".
 * Extrait du dashboard.tsx d'origine, no-regression.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Calendar, ArrowRight, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Evt {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  date: string;
  lieu: string | null;
  type: "montage" | "demontage";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short", day: "2-digit", month: "short",
  });
}

export function MontagesJ7Widget() {
  const [events, setEvents] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const j7 = new Date(today);
      j7.setDate(j7.getDate() + 7);
      const j7Str = j7.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("affaires")
        .select("id, numero, nom, client, date_montage, date_demontage, lieu")
        .or(`and(date_montage.gte.${todayStr},date_montage.lte.${j7Str}),and(date_demontage.gte.${todayStr},date_demontage.lte.${j7Str})`)
        .limit(20);
      if (cancelled) return;
      const evts: Evt[] = [];
      for (const a of data ?? []) {
        if (a.date_montage && a.date_montage >= todayStr && a.date_montage <= j7Str) {
          evts.push({ id: a.id, numero: a.numero, nom: a.nom, client: a.client, lieu: a.lieu, date: a.date_montage, type: "montage" });
        }
        if (a.date_demontage && a.date_demontage >= todayStr && a.date_demontage <= j7Str) {
          evts.push({ id: a.id, numero: a.numero, nom: a.nom, client: a.client, lieu: a.lieu, date: a.date_demontage, type: "demontage" });
        }
      }
      evts.sort((x, y) => x.date.localeCompare(y.date));
      setEvents(evts);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Prochains montages & démontages (J+7)
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/planning">Planning <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun événement prévu dans les 7 jours</p>
        ) : (
          <ul className="divide-y">
            {events.map((e) => {
              const isMontage = e.type === "montage";
              const Icon = isMontage ? ArrowUpCircle : ArrowDownCircle;
              return (
                <li key={`${e.id}-${e.type}`} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${isMontage ? "text-success" : "text-warning"}`} aria-hidden />
                    <div className="min-w-0">
                      <Link to="/affaires/$affaireId" params={{ affaireId: e.id }} className="text-sm font-medium hover:text-primary truncate block">
                        {e.numero} — {e.nom}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">
                        {isMontage ? "Montage" : "Démontage"}
                        {e.client ? ` · ${e.client}` : ""}
                        {e.lieu ? ` · ${e.lieu}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">{fmtDate(e.date)}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
