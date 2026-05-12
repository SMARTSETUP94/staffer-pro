/**
 * v0.47.0 — Widget "Mon équipe type" (teaser).
 * Affiche les 3 coéquipiers les plus fréquents + 1 KPI agrégé.
 * Filtres typologie / période + drilldown sont sur la page /mon-equipe-type.
 * Réservé chef_chantier / chef_metier_scoped (whitelist).
 */
import { useEffect, useState } from "react";
import { Users, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Row {
  employe_id: string;
  prenom: string;
  nom: string;
  type_contrat: string;
  poste_principal: string | null;
  nb_chantiers: number;
  total_demi_jours: number;
  presence_pct_moyen: number;
  derniere_collab: string | null;
  score: number;
}

export function MonEquipeTypeWidget() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totalCoequipiers, setTotalCoequipiers] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Top 3 pour le teaser
      const { data: top, error: e1 } = await supabase.rpc("get_mon_equipe_type", {
        _typologie: undefined,
        _limit: 3,
        _months: 12,
      });
      // KPI agrégé : nb total de coéquipiers fréquents (>= 2 chantiers)
      const { data: full, error: e2 } = await supabase.rpc("get_mon_equipe_type", {
        _typologie: undefined,
        _limit: 50,
        _months: 12,
      });
      if (cancelled) return;
      if (!e1 && top) setRows(top as Row[]);
      else setRows([]);
      if (!e2 && full) {
        const freq = (full as Row[]).filter((r) => r.nb_chantiers >= 2).length;
        setTotalCoequipiers(freq);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Mon équipe type
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Pas encore d'historique d'équipe.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {totalCoequipiers}
              </span>{" "}
              coéquipier{totalCoequipiers > 1 ? "s" : ""} fréquent{totalCoequipiers > 1 ? "s" : ""}{" "}
              sur 12 mois · top 3
            </p>
            <ul className="divide-y">
              {rows.map((r, idx) => (
                <li
                  key={r.employe_id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.prenom} {r.nom}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.poste_principal ?? r.type_contrat}
                        <span className="mx-1">·</span>
                        <span className="tabular-nums">
                          {r.nb_chantiers} chantier{r.nb_chantiers > 1 ? "s" : ""}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[11px] tabular-nums">
                    {r.total_demi_jours} ½j
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-between"
        >
          <Link to="/mon-equipe-type">
            Voir mon équipe type
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
