import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { OpportuniteFicheContent } from "@/components/opportunites/fiche/OpportuniteFicheContent";

export const Route = createFileRoute("/_app/affaires/$affaireId/opportunite")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({ meta: [
    { title: "Suivi opportunité du chantier — Setup Paris" },
    { name: "description", content: "Brief client, suivi commercial et emails d’origine liés aux documents de la même affaire." },
    { property: "og:title", content: "Suivi opportunité du chantier — Setup Paris" },
    { property: "og:description", content: "Brief client, jalons et pièces jointes réunis dans la fiche chantier." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OpportuniteTab,
});

function OpportuniteTab() {
  const { affaireId } = Route.useParams();
  return <OpportuniteFicheContent affaireId={affaireId} />;
}
