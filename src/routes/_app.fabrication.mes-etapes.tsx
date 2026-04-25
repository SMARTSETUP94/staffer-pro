import { createFileRoute, Link } from "@tanstack/react-router";
import { Hammer, Loader2, Wrench, Brush, Box, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ETAPE_LABELS, STATUT_ICONS, STATUT_LABELS } from "@/hooks/use-fabrication";
import type { FabricationEtapeType } from "@/hooks/use-fabrication";
import { useMesEtapesFabrication } from "@/hooks/use-fabrication-dashboard";

export const Route = createFileRoute("/_app/fabrication/mes-etapes")({
  head: () => ({ meta: [{ title: "Mes étapes fabrication — Setup Paris" }] }),
  component: MesEtapesPage,
});

const ETAPE_ICONS: Record<FabricationEtapeType, typeof Hammer> = {
  be: Pencil,
  respo_fab: Wrench,
  finition: Brush,
  manutention: Box,
};

function MesEtapesPage() {
  const { etapes, loading } = useMesEtapesFabrication();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Mes étapes fabrication</h1>
          <p className="text-sm text-muted-foreground">
            Toutes vos étapes en cours ou à faire, triées par urgence.
          </p>
        </div>
        <Badge variant="outline" className="rounded-xl">
          {etapes.length} étape{etapes.length > 1 ? "s" : ""}
        </Badge>
      </header>

      {etapes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Hammer className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Vous n'avez aucune étape de fabrication assignée actuellement.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {etapes.map((e) => {
            const Icon = ETAPE_ICONS[e.type_etape];
            const urgent =
              e.date_demontage &&
              new Date(e.date_demontage).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
            return (
              <li key={e.etape_id}>
                <Link
                  to="/affaires/$affaireId/fabrication"
                  params={{ affaireId: e.affaire_id }}
                  className="flex min-h-[64px] items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {ETAPE_LABELS[e.type_etape]} · {e.objet_ref}
                      </p>
                      {urgent && (
                        <Badge variant="outline" className="text-[10px] text-amber-600">
                          Urgent
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.objet_nom} · Affaire {e.affaire_numero} — {e.affaire_nom}
                    </p>
                    {e.date_demontage && (
                      <p className="text-[11px] text-muted-foreground">
                        Démontage : {new Date(e.date_demontage).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-2xl"
                    aria-label={STATUT_LABELS[e.statut]}
                    title={STATUT_LABELS[e.statut]}
                  >
                    {STATUT_ICONS[e.statut]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
