/**
 * v0.26.0 — Widget "Heures à valider".
 * Liste les saisies en statut "soumis" en attente.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HS {
  id: string;
  date: string;
  employe?: { prenom: string; nom: string };
  affaire?: { numero: string; nom: string };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

export function HeuresAValiderWidget() {
  const [items, setItems] = useState<HS[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("heures_saisies")
        .select("id, date, employes:employe_id(prenom, nom), affaires:affaire_id(numero, nom)")
        .eq("statut", "soumis")
        .order("date", { ascending: false })
        .limit(8);
      if (cancelled) return;
      setItems((data ?? []).map((h: any) => ({
        id: h.id, date: h.date, employe: h.employes, affaire: h.affaires,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Heures à valider
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/validation-heures">Valider <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Tout est validé 🎉</p>
        ) : (
          <ul className="divide-y">
            {items.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.employe?.prenom} {h.employe?.nom}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono text-primary">{h.affaire?.numero ?? "—"}</span>
                    {h.affaire?.nom ? <span> · {h.affaire.nom}</span> : null}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[11px] tabular-nums">{fmtDate(h.date)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
