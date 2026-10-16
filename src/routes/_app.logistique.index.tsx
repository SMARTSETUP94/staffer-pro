import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Monitor, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { conflitsVehicules, decalerEtape, joursIso } from "@/lib/logistique/etapes";
import { useEtapesLogistiques, useInvalidateEtapes, type EtapeLogistique } from "@/hooks/use-etapes-logistiques";
import { LegendeEtapes, PlanningLogistiqueGrid } from "@/components/logistique/PlanningLogistiqueGrid";
import { EtapeDialog } from "@/components/logistique/EtapeDialog";

export const Route = createFileRoute("/_app/logistique/")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Planning logistique — Setup Paris" },
      { name: "description", content: "Planning logistique général : livraisons, chargements, montages, démontages." },
      { property: "og:title", content: "Planning logistique — Setup Paris" },
      { property: "og:description", content: "Planning logistique général des chantiers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningLogistiquePage,
});

function PlanningLogistiquePage() {
  const [start, setStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [semaines, setSemaines] = useState<1 | 2 | 4>(2);
  const canEdit = useCapability("logistique.etape.edit");
  const jours = useMemo(() => joursIso(start, semaines * 7), [start, semaines]);
  const { data: etapes = [], isLoading } = useEtapesLogistiques(jours[0], jours[jours.length - 1]);
  const conflits = useMemo(() => conflitsVehicules(etapes), [etapes]);
  const invalidate = useInvalidateEtapes();
  const [dlg, setDlg] = useState<{ open: boolean; etape?: EtapeLogistique | null; date?: string }>({ open: false });

  async function move(e: EtapeLogistique, delta: number) {
    const { error } = await supabase.from("affaire_etapes_logistiques").update(decalerEtape(e, delta)).eq("id", e.id);
    if (error) toast.error("Déplacement impossible", { description: error.message });
    else toast.success("Étape déplacée");
    invalidate();
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Planning logistique</h1>
          <p className="text-sm text-muted-foreground">
            Semaine du {format(start, "d MMMM yyyy", { locale: fr })}
            {conflits.size > 0 && <span className="ml-2 font-medium text-destructive">· {conflits.size} étape(s) en conflit de véhicule</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Aujourd'hui</Button>
          <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={() => setStart(addDays(start, 7))}><ChevronRight className="h-4 w-4" /></Button>
          {([1, 2, 4] as const).map((n) => (
            <Button key={n} variant={semaines === n ? "default" : "outline"} size="sm" onClick={() => setSemaines(n)}>{n} sem.</Button>
          ))}
          <Button variant="outline" asChild><Link to="/logistique/imprimer"><Printer className="mr-1 h-4 w-4" />Imprimer la semaine</Link></Button>
          <Button variant="outline" asChild><Link to="/ecran-atelier"><Monitor className="mr-1 h-4 w-4" />Écran atelier</Link></Button>
          {canEdit && <Button onClick={() => setDlg({ open: true })}><Plus className="mr-1 h-4 w-4" />Étape</Button>}
        </div>
      </div>
      <LegendeEtapes />
      {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
        <>
          <PlanningLogistiqueGrid
            jours={jours}
            etapes={etapes}
            conflits={conflits}
            onCardClick={canEdit ? (e) => setDlg({ open: true, etape: e }) : undefined}
            onDayClick={canEdit ? (d) => setDlg({ open: true, date: d }) : undefined}
            onMove={canEdit ? move : undefined}
          />
          {etapes.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Aucune étape sur cette période.{canEdit && " Cliquez sur un jour pour en ajouter une."}
            </p>
          )}
        </>
      )}
      <EtapeDialog open={dlg.open} onOpenChange={(o) => setDlg((p) => ({ ...p, open: o }))} etape={dlg.etape} defaultDate={dlg.date} />
    </div>
  );
}
