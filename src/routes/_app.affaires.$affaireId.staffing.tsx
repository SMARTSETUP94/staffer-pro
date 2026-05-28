import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, ArrowRight, Users, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMetiers } from "@/hooks/use-metiers";
import { MetierBadge } from "@/components/MetierBadge";
import { Button } from "@/components/ui/button";
import { requireCapability } from "@/lib/capability-guard";

export const Route = createFileRoute("/_app/affaires/$affaireId/staffing")({
  beforeLoad: () => requireCapability("section.affaires"),
  component: StaffingPage,
});

interface AssignRow {
  id: string;
  date: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  heures: number;
  metier_id: number;
  employe: { id: string; prenom: string; nom: string; type_contrat: string } | null;
}

function StaffingPage() {
  const { affaireId } = Route.useParams();
  const { byId } = useMetiers();
  const [rows, setRows] = useState<AssignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("assignations")
      .select(
        "id, date, demi_journee, heures, metier_id, employe:employes(id, prenom, nom, type_contrat)",
      )
      .eq("affaire_id", affaireId)
      .order("date", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data ?? []) as unknown as AssignRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

  // Regroupement par employé
  const groupes = useMemo(() => {
    const map = new Map<
      string,
      {
        employe: { id: string; prenom: string; nom: string; type_contrat: string };
        rows: AssignRow[];
        totalHeures: number;
        totalDemis: number;
      }
    >();
    for (const r of rows) {
      if (!r.employe) continue;
      const k = r.employe.id;
      if (!map.has(k)) {
        map.set(k, { employe: r.employe, rows: [], totalHeures: 0, totalDemis: 0 });
      }
      const g = map.get(k)!;
      g.rows.push(r);
      g.totalHeures += Number(r.heures || 0);
      g.totalDemis += r.demi_journee === "JOURNEE" ? 1 : 0.5;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.employe.nom.localeCompare(b.employe.nom),
    );
  }, [rows]);

  const totals = useMemo(
    () => ({
      employes: groupes.length,
      heures: groupes.reduce((s, g) => s + g.totalHeures, 0),
      demis: groupes.reduce((s, g) => s + g.totalDemis, 0),
    }),
    [groupes],
  );

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="overline">— Staffing affaire</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals.employes} employé(s) · {totals.heures.toFixed(1)} h · {totals.demis.toFixed(1)}{" "}
            demi-journée(s)
          </p>
        </div>
        <Button asChild className="rounded-xl">
          <Link to="/planning">
            <Calendar className="mr-2 h-4 w-4" />
            Modifier dans le planning
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      {groupes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Aucune assignation</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoutez des employés sur cette affaire depuis le planning hebdomadaire.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-xl">
            <Link to="/planning">
              Ouvrir le planning <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {groupes.map((g) => (
            <div
              key={g.employe.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {g.employe.prenom} {g.employe.nom.toUpperCase()}
                  </p>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {g.employe.type_contrat}
                  </span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {g.totalHeures.toFixed(1)} h · {g.totalDemis.toFixed(1)} demi-jours
                </span>
              </div>
              <ul className="divide-y divide-border text-sm">
                {g.rows
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((r) => {
                    const m = byId(r.metier_id);
                    return (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {format(parseISO(r.date), "EEE d MMM", { locale: fr })}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            {r.demi_journee}
                          </span>
                          {m && <MetierBadge libelle={m.libelle} couleur={m.couleur} />}
                        </div>
                        <span className="font-mono text-xs">{Number(r.heures).toFixed(1)} h</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
