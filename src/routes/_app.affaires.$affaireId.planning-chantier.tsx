/**
 * Sprint D / Batch 3 — Route /affaires/$id/planning-chantier
 * Vue macro 7 phases du chantier (SVG Gantt) + jalons + sous-blocs fab.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getPlanningChantierMacro } from "@/server/planning-chantier-macro.functions";
import { PlanningChantierGantt } from "@/components/planning/PlanningChantierGantt";

export const Route = createFileRoute("/_app/affaires/$affaireId/planning-chantier")({
  beforeLoad: () => requireCapability("section.affaires"),
  component: PlanningChantierPage,
});

function PlanningChantierPage() {
  const { affaireId } = Route.useParams();
  const fetchFn = useServerFn(getPlanningChantierMacro);
  const { data, isLoading, error } = useQuery({
    queryKey: ["planning-chantier-macro", affaireId],
    queryFn: () => fetchFn({ data: { affaireId } }),
  });

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erreur de chargement du planning chantier.
      </div>
    );
  }

  const datesIncomplete =
    !data.dates_source.signed_at ||
    !data.dates_source.date_montage ||
    !data.dates_source.date_evenement_debut ||
    !data.dates_source.date_evenement_fin ||
    !data.dates_source.date_demontage;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Planning chantier</h2>
        <p className="text-xs text-muted-foreground">
          Vue macro : 7 phases du cycle de vie ({data.window_start} → {data.window_end}).
        </p>
      </div>

      {datesIncomplete && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Certaines dates clés ne sont pas renseignées. Complétez-les dans l'onglet{" "}
          <strong>Synthèse</strong> pour un planning précis.
        </div>
      )}

      <PlanningChantierGantt data={data} />

      {/* Sous-blocs fab — toujours afficher les 7 blocs (même à 0h) */}
      {data.fab_sous_blocs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold mb-3">Répartition fabrication</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            {data.fab_sous_blocs.map((b) => (
              <div key={b.key} className={`rounded-lg border p-2 text-center ${b.heures_prevues > 0 ? "border-border bg-background" : "border-dashed border-muted-foreground/30 bg-muted/30"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{b.label}</p>
                <p className="mt-1 text-base font-bold">
                  {b.heures_prevues > 0 ? (
                    <>{Math.round(b.heures_prevues)}<span className="text-xs font-normal text-muted-foreground"> h</span></>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
