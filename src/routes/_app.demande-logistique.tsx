import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { DemandeLogistiqueForm } from "@/components/logistique/DemandeLogistiqueForm";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/demande-logistique")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Nouvelle demande logistique" },
      { name: "description", content: "Formulaire de demande logistique : appro, livraison, montage, véhicule et équipe, validé par la logistique avant ajout au planning." },
      { property: "og:title", content: "Nouvelle demande logistique" },
      { property: "og:description", content: "Formulaire de demande logistique, validé par la logistique avant ajout au planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DemandeLogistiquePage,
});

function DemandeLogistiquePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-6">
      <PageHeader
        title="Nouvelle demande logistique"
        description="La demande arrive dans « Demandes logistique » (onglet À traiter) ; elle n'est pas ajoutée directement au planning."
      />
      <DemandeLogistiqueForm />
    </div>
  );
}
