import { createFileRoute } from "@tanstack/react-router";
import { AffaireDocumentsGallery } from "@/components/affaire-documents/AffaireDocumentsGallery";
import { requireCapability } from "@/lib/capability-guard";

export const Route = createFileRoute("/_app/affaires/$affaireId/documents")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({ meta: [{ title: "Documents — Affaire — Setup Paris" }] }),
  component: AffaireDocumentsPage,
});

function AffaireDocumentsPage() {
  const { affaireId } = Route.useParams();
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <AffaireDocumentsGallery affaireId={affaireId} variant="desktop" />
    </div>
  );
}
