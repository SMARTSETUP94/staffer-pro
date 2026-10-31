import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { DevisEditeur } from "@/components/devis/editeur/DevisEditeur";

export const Route = createFileRoute("/_app/affaires/$affaireId/devis-staffing/$devisId")({
  head: () => ({ meta: [{ title: "Éditeur de devis" }] }),
  component: DevisEditeurPage,
});



function DevisEditeurPage() {
  const { affaireId, devisId } = Route.useParams();
  const on = useFeatureFlag("devis_staffing_v1");
  if (!on) return <p className="p-6 text-sm text-muted-foreground">Fonction non activée.</p>;
  return <DevisEditeur affaireId={affaireId} devisId={devisId} />;
}
