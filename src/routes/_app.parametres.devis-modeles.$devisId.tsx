import { createFileRoute, Link } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { DevisEditeur } from "@/components/devis/editeur/DevisEditeur";

export const Route = createFileRoute("/_app/parametres/devis-modeles/$devisId")({
  beforeLoad: () => requireCapability("devis.parametres"),
  head: () => ({ meta: [{ title: "Modèle de devis — Paramètres" }] }),
  component: ModelePage,
});

function ModelePage() {
  const { devisId } = Route.useParams();
  return (
    <div className="space-y-2 p-4 md:p-6">
      <Link to="/parametres/devis-modeles" className="text-xs text-muted-foreground hover:underline">← Modèles</Link>
      <DevisEditeur affaireId={null} devisId={devisId} />
    </div>
  );
}
