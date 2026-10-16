import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Sparkles } from "lucide-react";
import { JalonnementDialog } from "@/components/logistique/JalonnementDialog";
import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ETAPE_CLASSES, ETAPE_LABELS, conflitsVehicules, heureCourte, nbPersonnesCourt } from "@/lib/logistique/etapes";
import { useEtapesAffaire, type EtapeLogistique } from "@/hooks/use-etapes-logistiques";
import { EtapeDialog } from "@/components/logistique/EtapeDialog";

export const Route = createFileRoute("/_app/affaires/$affaireId/logistique")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({ meta: [{ title: "Logistique — Affaire — Setup Paris" }] }),
  component: AffaireLogistiquePage,
});

const d = (s: string) => format(parseISO(s), "EEE d MMM", { locale: fr });

function AffaireLogistiquePage() {
  const { affaireId } = Route.useParams();
  const canEdit = useCapability("logistique.etape.edit");
  const { data: etapes = [], isLoading } = useEtapesAffaire(affaireId);
  const conflits = useMemo(() => conflitsVehicules(etapes), [etapes]);
  const [jal, setJal] = useState(false);
  const canIA = useCapability("logistique.proposition.validate");
  const [dlg, setDlg] = useState<{ open: boolean; etape?: EtapeLogistique | null }>({ open: false });

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Planning logistique du chantier</h2>
        <div className="flex gap-2">{canIA && <Button size="sm" variant="outline" onClick={() => setJal(true)}><Sparkles className="mr-1 h-4 w-4" />Déposer un jalonnement</Button>}{canEdit && <Button size="sm" onClick={() => setDlg({ open: true })}><Plus className="mr-1 h-4 w-4" />Étape</Button>}</div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : etapes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune étape logistique pour ce chantier.</p>
      ) : (
        <ul className="divide-y divide-border">
          {etapes.map((e) => {
            const veh = e.vehicule?.immatriculation ?? e.vehicule?.nom ?? e.immatriculation_libre;
            const h = [heureCourte(e.heure_debut), heureCourte(e.heure_fin)].filter(Boolean).join("–");
            return (
              <li key={e.id}>
                <button type="button" disabled={!canEdit} onClick={() => setDlg({ open: true, etape: e })}
                  className="flex w-full flex-wrap items-center gap-3 py-2 text-left text-sm hover:bg-muted/50 disabled:cursor-default">
                  <span className={cn("w-32 shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold", ETAPE_CLASSES[e.type])}>
                    {ETAPE_LABELS[e.type]}{e.sens ? ` ${e.sens}` : ""}
                  </span>
                  <span className="w-48 capitalize">{d(e.date_debut)}{e.date_fin && e.date_fin !== e.date_debut ? ` → ${d(e.date_fin)}` : ""}</span>
                  {h && <span className="tabular-nums text-muted-foreground">{h}</span>}
                  {nbPersonnesCourt(e.nb_personnes) && <span className="rounded bg-muted px-1.5 text-xs font-semibold tabular-nums">{nbPersonnesCourt(e.nb_personnes)}</span>}
                  {veh && <span className={cn(conflits.has(e.id) && "font-semibold text-destructive")}>🚚 {veh}{conflits.has(e.id) ? " (conflit)" : ""}</span>}
                  {e.lieu_libre && <span className="text-muted-foreground">{e.lieu_libre}</span>}
                  {e.note && <span className="truncate text-muted-foreground">{e.note}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <JalonnementDialog open={jal} onOpenChange={setJal} affaireId={affaireId} />
      <EtapeDialog open={dlg.open} onOpenChange={(o) => setDlg((p) => ({ ...p, open: o }))} etape={dlg.etape} defaultAffaireId={affaireId} />
    </div>
  );
}
