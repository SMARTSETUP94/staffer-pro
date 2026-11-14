import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { DemandesLogistiqueHub } from "@/components/logistique/DemandesLogistiqueHub";

export const Route = createFileRoute("/_app/jalonnements")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Jalonnements — plannings déposés et analysés" },
      { name: "description", content: "Déposez les plannings et jalonnements d'événement : l'IA les lit, les rattache à un chantier et propose les étapes logistiques." },
      { property: "og:title", content: "Jalonnements — plannings déposés et analysés" },
      { property: "og:description", content: "Plannings et jalonnements analysés par l'IA et rattachés aux chantiers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JalonnementsRoute,
});

function JalonnementsRoute() {
  return <DemandesLogistiqueHub onglet="jalonnements" />;
}
