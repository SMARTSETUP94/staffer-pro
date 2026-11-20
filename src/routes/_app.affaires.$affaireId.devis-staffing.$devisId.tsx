import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { DevisEditeur } from "@/components/devis/editeur/DevisEditeur";

export const Route = createFileRoute("/_app/affaires/$affaireId/devis-staffing/$devisId")({
  head: () => ({ meta: [{ title: "Consultation et rédaction du devis — Staffing Setup Paris" }, { name: "description", content: "Devis Staffing, détails et versions conservées en lecture seule après remplacement." }, { property: "og:title", content: "Consultation et rédaction du devis — Staffing Setup Paris" }, { property: "og:description", content: "Détails, montants et historique des versions du devis." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DevisEditeurPage,
});



function DevisEditeurPage() {
  const { affaireId, devisId } = Route.useParams();
  const on = useFeatureFlag("devis_staffing_v1");
  if (!on) return <p className="p-6 text-sm text-muted-foreground">Fonction non activée.</p>;
  return <DevisEditeur affaireId={affaireId} devisId={devisId} />;
}
