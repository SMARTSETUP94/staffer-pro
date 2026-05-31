import { createFileRoute } from "@tanstack/react-router";
import { MesContratsList } from "@/components/contrats/MesContratsList";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/mes-contrats")({
  head: () => ({ meta: [{ title: "Mes contrats — Setup Paris" }] }),
  component: MesContratsPage,
});

function MesContratsPage() {
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <PageHeader
        title="Mes contrats"
        description="Vos contrats intermittents : lecture, téléchargement et signature."
      />
      <MesContratsList />
    </div>
  );
}
