import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { DemandesLogistiqueHub } from "@/components/logistique/DemandesLogistiqueHub";

export const Route = createFileRoute("/_app/demandes-logistique")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Demandes logistiques — Staffing Setup Paris" },
      { name: "description", content: "Emails log@ analysés par l'IA : échéances détectées et suggestions d'étapes logistiques." },
      { property: "og:title", content: "Demandes logistiques — Staffing Setup Paris" },
      { property: "og:description", content: "Emails log@ analysés par l'IA avec suggestions de planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DemandesLogistiqueRoute,
});

function DemandesLogistiqueRoute() {
  return <DemandesLogistiqueHub onglet="demandes" />;
}
