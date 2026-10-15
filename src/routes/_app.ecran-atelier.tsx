import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { conflitsVehicules, joursIso } from "@/lib/logistique/etapes";
import { useEtapesLogistiques } from "@/hooks/use-etapes-logistiques";
import { LegendeEtapes, PlanningLogistiqueGrid } from "@/components/logistique/PlanningLogistiqueGrid";

export const Route = createFileRoute("/_app/ecran-atelier")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Écran atelier — Planning logistique" },
      { name: "description", content: "Affichage plein écran du planning logistique pour l'atelier." },
      { property: "og:title", content: "Écran atelier — Planning logistique" },
      { property: "og:description", content: "Planning logistique des 8 prochains jours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EcranAtelier,
});

function EcranAtelier() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const dayKey = format(now, "yyyy-MM-dd");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jours = useMemo(() => joursIso(new Date(dayKey), 8), [dayKey]);
  const { data: etapes = [] } = useEtapesLogistiques(jours[0], jours[7], undefined, 120_000);
  const conflits = useMemo(() => conflitsVehicules(etapes), [etapes]);

  return (
    <div className="min-h-screen space-y-4 bg-background p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/logistique" aria-label="Retour" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-6 w-6" /></Link>
          <h1 className="text-4xl font-bold">Planning logistique</h1>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums">{format(now, "HH:mm")}</div>
          <div className="text-lg capitalize text-muted-foreground">{format(now, "EEEE d MMMM", { locale: fr })}</div>
        </div>
      </div>
      <LegendeEtapes />
      <PlanningLogistiqueGrid jours={jours.slice(0, 4)} etapes={etapes} conflits={conflits} big />
      <PlanningLogistiqueGrid jours={jours.slice(4)} etapes={etapes} conflits={conflits} />
    </div>
  );
}
